/** GRIDA-SEC-016 — browser tools address only Main-admitted guest contents. */
import { randomUUID } from "node:crypto";
import { nativeImage, type WebContents } from "electron";
import type {
  BrowserAutomationPage,
  BrowserAutomationScope,
  BrowserAutomationTarget,
  DesktopBrowserHost,
} from "./browser-host";
import { BrowserAutomationArguments as Arguments } from "./browser-automation-arguments";
import { BrowserAutomationGuest as Guest } from "./browser-automation-guest";

export type BrowserAutomationResult = Readonly<{
  disposition: "not_dispatched" | "dispatched_verified" | "unknown";
  data?: Record<string, unknown>;
  error?: string;
  image?: { mimeType: "image/jpeg"; base64: string };
}>;

type Host = Pick<
  DesktopBrowserHost,
  "openAutomationPage" | "resolveAutomationPage" | "revokeAutomation"
>;

const MAX_REFS = 400;
const MAX_NAVIGATIONS = 24;
const MAX_IMAGE_BYTES = 256 * 1024;
const MAX_IMAGE_EDGE = 1024;

export class BrowserAutomation {
  readonly #guests = new WeakMap<WebContents, Guest>();
  readonly #scopes = new Map<string, ScopeState>();
  readonly #effects = new WeakMap<WebContents, Promise<unknown>>();
  #inputReady: Promise<unknown> = Promise.resolve();

  constructor(readonly host: Host) {}

  closeScope(scopeId: string): void {
    const state = this.#scopes.get(scopeId);
    this.#scopes.delete(scopeId);
    if (state) {
      state.abort.abort();
      for (const target of state.targets.values())
        for (const navigation of target.navigations.values())
          navigation.unwatch?.();
    }
    this.host.revokeAutomation(scopeId);
  }

  registerOpen(scope: BrowserAutomationScope, page: BrowserAutomationPage) {
    this.#scope(scope);
    if (!page.current()) fail("target_missing");
    return this.#navigation(
      this.#state(scope, page),
      page,
      page.snapshot().url ?? undefined
    );
  }

  async invoke(
    scope: BrowserAutomationScope,
    tool: string,
    input: unknown,
    signal?: AbortSignal
  ): Promise<BrowserAutomationResult> {
    let request: Request | undefined;
    try {
      const operation = Arguments.parse(tool, input);
      const owner = this.#scope(scope);
      const timeout = "timeoutMs" in operation ? operation.timeoutMs : 8000;
      request = new Request(
        () => {
          if (!scope.live() || this.#scopes.get(scope.id) !== owner)
            fail("owner_revoked");
        },
        owner.abort.signal,
        timeout,
        signal
      );
      request.guard();
      const result = await this.#invoke(scope, request, operation);
      request.guard();
      return {
        disposition: request.dispatched
          ? "dispatched_verified"
          : "not_dispatched",
        ...result,
      };
    } catch (error) {
      const code = errorCode(error);
      return {
        disposition: request?.dispatched ? "unknown" : "not_dispatched",
        error: code,
      };
    }
  }

  async #invoke(
    scope: BrowserAutomationScope,
    request: Request,
    operation: Arguments.Operation
  ): Promise<Pick<BrowserAutomationResult, "data" | "image">> {
    if (operation.tool === "browser_help")
      return { data: this.#help(operation.topic) };
    if (operation.tool === "browser_open") {
      let tracker: Guest | undefined;
      const page = await request.wait(
        this.host.openAutomationPage(
          scope,
          operation.url,
          request.signal,
          (contents) => {
            request.dispatch();
            tracker = this.#guest(contents, true);
          }
        )
      );
      const state = this.#state(scope, page);
      const readiness = tracker
        ? this.#navigation(state, page, operation.url, tracker, 0)
        : this.#navigation(state, page, operation.url);
      request.guard();
      return { data: { target: page.target, readiness } };
    }
    const page = this.host.resolveAutomationPage(scope, operation.target);
    const state = this.#state(scope, page);
    const guardPage = () => {
      if (!page.current()) fail("target_missing");
    };
    request.bind(guardPage);
    request.guard();
    if (operation.tool === "browser_close") {
      request.dispatch();
      // A successful close deliberately invalidates this target's guard.
      request.bind(undefined);
      const closed = await request.wait(page.close());
      if (closed) this.#deleteTarget(scope, page.target);
      return { data: { closed, target: page.target } };
    }
    if (operation.tool === "browser_wait") {
      return { data: await this.#wait(page, state, request, operation) };
    }
    const contents = page.contents();
    if (!contents || contents.isDestroyed()) {
      if (operation.tool === "browser_snapshot" && !operation.documentId)
        return { data: this.#pending(page) };
      fail("not_ready");
    }
    const guest = this.#guest(contents, page.target.kind === "background");
    request.bind(() => {
      guardPage();
      if (page.contents() !== contents || contents.isDestroyed())
        fail("stale_document");
    });
    if (operation.tool === "browser_diagnostics" && !operation.documentId)
      return {
        data: this.#diagnostics(
          guest,
          state,
          operation.cursor,
          operation.limit
        ),
      };
    if (
      operation.tool === "browser_action" ||
      operation.tool === "browser_capture"
    )
      this.#requireVisible(page, guest);
    if (
      operation.tool === "browser_snapshot" &&
      !operation.documentId &&
      (guest.changingDocument || !contents.getURL())
    )
      return { data: this.#pending(page) };
    switch (operation.tool) {
      case "browser_snapshot": {
        await guest.attach(request);
        const document = await this.#document(
          guest,
          request,
          operation.documentId
        );
        return {
          data: await this.#snapshot(page, guest, state, request, document),
        };
      }
      case "browser_diagnostics": {
        await guest.attach(request);
        const document = await this.#document(
          guest,
          request,
          operation.documentId
        );
        return {
          data: this.#diagnostics(
            guest,
            state,
            operation.cursor,
            operation.limit,
            document
          ),
        };
      }
      case "browser_capture": {
        await guest.attach(request);
        const document = await this.#document(
          guest,
          request,
          operation.documentId
        );
        return await this.#capture(page, guest, state, request, document);
      }
      case "browser_navigate":
        return this.#effect(guest, request, async () => {
          const kind = operation.action.kind;
          if (operation.documentId !== undefined) {
            await guest.attach(request);
            await this.#document(guest, request, operation.documentId);
          }
          if (
            (kind === "back" && !page.snapshot().canGoBack) ||
            (kind === "forward" && !page.snapshot().canGoForward)
          )
            return { data: { navigated: false } };
          const url =
            operation.action.kind === "goto" ? operation.action.url : undefined;
          const readiness =
            kind === "stop"
              ? undefined
              : this.#navigation(state, page, url, guest);
          request.dispatch();
          page.navigate(kind, url);
          return { data: { navigated: kind !== "stop", readiness } };
        });
      case "browser_action":
        return this.#effect(guest, request, async () => {
          await guest.attach(request);
          return this.#input(request, async () => {
            const document = await this.#document(
              guest,
              request,
              operation.documentId
            );
            try {
              return {
                data: await this.#action(
                  page,
                  guest,
                  state,
                  request,
                  document,
                  operation.action
                ),
              };
            } finally {
              request.releaseAutomation();
            }
          });
        });
      case "browser_evaluate":
        return this.#effect(guest, request, async () => {
          await guest.attach(request);
          const document = await this.#document(
            guest,
            request,
            operation.documentId
          );
          this.#requireUnblocked(page, guest);
          guest.assertDocument(document);
          request.dispatch();
          request.markAutomation(page);
          try {
            const arg = JSON.stringify(JSON.stringify(operation.arg));
            const script = `(async () => {
            const value = await (${operation.functionText}\n)(JSON.parse(${arg}));
            const json = JSON.stringify(value);
            if (typeof json !== "string") return { serialized: false };
            if (json.length > 65536) return { oversized: true };
            return { json };
          })()`;
            const reply = await guest.evaluate<{
              json?: string;
              oversized?: boolean;
            }>(request, document.frame, script, operation.timeoutMs);
            if (reply.exceptionDetails) fail("evaluation_failed");
            const result = reply.result.value;
            if (
              result?.oversized ||
              (result?.json !== undefined &&
                Buffer.byteLength(result.json) > 65536)
            )
              fail("output_limit");
            if (result?.json === undefined) fail("result_not_serializable");
            guest.assertDocument(document);
            return {
              data: { documentId: document.id, value: JSON.parse(result.json) },
            };
          } finally {
            request.releaseAutomation();
          }
        });
    }
  }

  #scope(scope: BrowserAutomationScope): ScopeState {
    if (!scope.live()) fail("owner_revoked");
    const state = this.#scopes.get(scope.id);
    if (state) {
      if (state.sender !== scope.sender || state.frame !== scope.frame)
        fail("owner_revoked");
      return state;
    }
    const next: ScopeState = {
      abort: new AbortController(),
      sender: scope.sender,
      frame: scope.frame,
      targets: new Map(),
    };
    this.#scopes.set(scope.id, next);
    return next;
  }

  #state(
    scope: BrowserAutomationScope,
    page: BrowserAutomationPage
  ): TargetState {
    const targets = this.#scope(scope).targets;
    const key = targetKey(page.target);
    for (const [priorKey, prior] of targets) {
      if (priorKey !== key && !prior.current()) {
        for (const nav of prior.navigations.values()) nav.unwatch?.();
        targets.delete(priorKey);
      }
    }
    let state = targets.get(key);
    if (!state) {
      state = {
        current: () => page.current(),
        refs: new Map(),
        cursors: new Map(),
        navigations: new Map(),
      };
      targets.set(key, state);
    }
    return state;
  }

  #deleteTarget(
    scope: BrowserAutomationScope,
    target: BrowserAutomationTarget
  ): void {
    const targets = this.#scopes.get(scope.id)?.targets;
    const key = targetKey(target);
    for (const nav of targets?.get(key)?.navigations.values() ?? [])
      nav.unwatch?.();
    targets?.delete(key);
  }

  #guest(contents: WebContents, background: boolean): Guest {
    let guest = this.#guests.get(contents);
    if (!guest) {
      guest = new Guest(contents, background);
      this.#guests.set(contents, guest);
    }
    return guest;
  }

  #navigation(
    state: TargetState,
    page: BrowserAutomationPage,
    expectedUrl?: string,
    guest?: Guest,
    baseline = guest?.navigationSequence ?? 0
  ): { kind: "navigation"; navigationId: string } {
    const navigationId = randomUUID();
    const navigation: Navigation = { guest, baseline, expectedUrl };
    if (!guest) {
      navigation.unwatch = page.watchGuest((contents) => {
        if (navigation.guest) return;
        navigation.guest = this.#guest(
          contents,
          page.target.kind === "background"
        );
        navigation.baseline = navigation.guest.navigationSequence;
      });
    }
    state.navigations.set(navigationId, navigation);
    if (state.navigations.size > MAX_NAVIGATIONS) {
      const eldest = state.navigations.keys().next().value!;
      state.navigations.get(eldest)?.unwatch?.();
      state.navigations.delete(eldest);
    }
    return { kind: "navigation", navigationId };
  }

  async #document(
    guest: Guest,
    request: Request,
    expected?: string
  ): Promise<Guest.Document> {
    if (guest.changingDocument && expected) fail("stale_document");
    const current = await guest.root(request);
    if (expected !== undefined && current.id !== expected)
      fail("stale_document");
    return current;
  }

  #pending(page: BrowserAutomationPage): Record<string, unknown> {
    const snapshot = page.snapshot();
    return {
      target: page.target,
      state: snapshot.failure ? "failed" : "pending",
      title: snapshot.title,
      url: snapshot.url,
      failure: snapshot.failure,
      documentId: null,
    };
  }

  async #viewport(
    guest: Guest,
    state: TargetState,
    request: Request,
    document: Guest.Document
  ): Promise<Viewport> {
    const { cssVisualViewport } = await guest.send<{
      cssVisualViewport: ViewMetrics;
    }>(request, "Page.getLayoutMetrics");
    guest.assertDocument(document);
    const v = cssVisualViewport;
    if (!v || !(v.clientWidth > 0 && v.clientHeight > 0)) fail("not_ready");
    const signature = JSON.stringify([
      document.id,
      v.clientWidth,
      v.clientHeight,
      v.pageX,
      v.pageY,
      v.offsetX,
      v.offsetY,
      v.scale,
      v.zoom,
      guest.contents.getZoomFactor(),
    ]);
    if (state.viewport?.signature !== signature) {
      state.viewport = {
        id: randomUUID(),
        signature,
        width: v.clientWidth,
        height: v.clientHeight,
        pageX: v.pageX,
        pageY: v.pageY,
      };
    }
    return state.viewport;
  }

  async #snapshot(
    page: BrowserAutomationPage,
    guest: Guest,
    state: TargetState,
    request: Request,
    document: Guest.Document
  ): Promise<Record<string, unknown>> {
    const snapshotId = randomUUID();
    const frames = await guest.frames(request);
    const nodes: Record<string, unknown>[] = [];
    const refs: [string, ElementRef][] = [];
    const frameIds = new Map<string, string>();
    let truncated = false;
    for (const frame of frames) {
      const frameId = randomUUID();
      frameIds.set(frame.id, frameId);
      const reply = await guest
        .send<{ nodes: AXNode[] }>(
          request,
          "Accessibility.getFullAXTree",
          { frameId: frame.id, depth: 12 },
          frame.sessionId
        )
        .catch((error) => {
          request.guard();
          if (frame.id === document.frame.id) throw error;
          truncated = true;
          return { nodes: [] };
        });
      const useful = reply.nodes.filter(
        (node) => !node.ignored && node.role?.value !== "none"
      );
      const axIds = new Map(useful.map((node, i) => [node.nodeId, i + 1]));
      for (const node of useful) {
        if (nodes.length >= 180) {
          truncated = true;
          break;
        }
        const role = axText(node.role);
        const ref =
          node.backendDOMNodeId &&
          role !== "StaticText" &&
          role !== "InlineTextBox"
            ? randomUUID()
            : undefined;
        if (ref)
          refs.push([
            ref,
            {
              documentId: document.id,
              frame,
              backendNodeId: node.backendDOMNodeId!,
            },
          ]);
        nodes.push({
          id: axIds.get(node.nodeId),
          parent: node.parentId ? axIds.get(node.parentId) : undefined,
          frameId,
          role,
          name: axText(node.name),
          value: axText(node.value),
          ref,
        });
      }
    }
    const viewport = await this.#viewport(guest, state, request, document);
    await this.#document(guest, request, document.id);
    for (const [ref, element] of refs) state.refs.set(ref, element);
    while (state.refs.size > MAX_REFS)
      state.refs.delete(state.refs.keys().next().value!);
    return {
      target: page.target,
      state: "ready",
      title: page.snapshot().title,
      url: guest.contents.getURL(),
      documentId: document.id,
      snapshotId,
      viewport: viewportData(viewport),
      viewportId: viewport.id,
      frames: frames.map((frame) => ({
        id: frameIds.get(frame.id),
        url: frame.url.slice(0, 4096),
      })),
      nodes,
      dialog: guest.dialog ?? page.blocker(),
      truncated,
    };
  }

  async #capture(
    page: BrowserAutomationPage,
    guest: Guest,
    state: TargetState,
    request: Request,
    document: Guest.Document
  ): Promise<Pick<BrowserAutomationResult, "data" | "image">> {
    this.#requireVisible(page, guest);
    const before = await this.#viewport(guest, state, request, document);
    this.#requireVisible(page, guest);
    const { data } = await guest.send<{ data: string }>(
      request,
      "Page.captureScreenshot",
      { format: "jpeg", quality: 82, fromSurface: true }
    );
    await this.#document(guest, request, document.id);
    const after = await this.#viewport(guest, state, request, document);
    if (before.id !== after.id) fail("stale_viewport");
    this.#requireVisible(page, guest);
    const encoded = nativeImage.createFromBuffer(Buffer.from(data, "base64"));
    if (encoded.isEmpty()) fail("capture_unavailable");
    const size = encoded.getSize();
    const max = Math.max(size.width, size.height);
    let image =
      max > MAX_IMAGE_EDGE ? resize(encoded, MAX_IMAGE_EDGE) : encoded;
    let jpeg: Buffer = image.toJPEG(82);
    for (const quality of [72, 62, 52]) {
      if (jpeg.length <= MAX_IMAGE_BYTES) break;
      jpeg = image.toJPEG(quality);
    }
    for (const edge of [850, 700, 550]) {
      if (jpeg.length <= MAX_IMAGE_BYTES) break;
      image = resize(image, edge);
      jpeg = image.toJPEG(52);
    }
    if (!jpeg.length || jpeg.length > MAX_IMAGE_BYTES) fail("output_limit");
    const output = image.getSize();
    return {
      data: {
        target: page.target,
        documentId: document.id,
        viewport: viewportData(before),
        viewportId: before.id,
        imageWidth: output.width,
        imageHeight: output.height,
        reduced: output.width !== size.width || output.height !== size.height,
      },
      image: { mimeType: "image/jpeg", base64: jpeg.toString("base64") },
    };
  }

  async #action(
    page: BrowserAutomationPage,
    guest: Guest,
    state: TargetState,
    request: Request,
    document: Guest.Document,
    action: Arguments.Action
  ): Promise<Record<string, unknown>> {
    this.#requireVisible(page, guest);
    this.#requireUnblocked(page, guest);
    const ready = () => {
      guest.assertDocument(document);
      request.guard();
      this.#requireVisible(page, guest);
      this.#requireUnblocked(page, guest);
    };
    let prepared = false;
    const input = async (
      method: string,
      params: Record<string, unknown>,
      sessionId?: string
    ) => {
      ready();
      if (!prepared) {
        request.markAutomation(page);
        request.dispatch();
        await request.wait(page.prepareInput());
        prepared = true;
        ready();
      }
      request.markAutomation(page);
      request.dispatch();
      await guest.send(request, method, params, sessionId);
    };
    if (
      action.kind === "fill" ||
      action.kind === "select" ||
      (action.kind === "press" && action.ref)
    ) {
      const ref = action.ref!;
      const node = await this.#resolve(guest, state, request, document, ref);
      try {
        if (
          action.kind === "press" &&
          !(await guest.isSessionRoot(request, node.frame))
        )
          fail("frame_key_unavailable");
        if (action.kind === "select") {
          const options = await this.#nodeCall<{ exists: boolean }>(
            guest,
            request,
            node,
            `function(value) {
            return { exists: this instanceof HTMLSelectElement && !this.multiple && !this.disabled &&
              Array.from(this.options).some(option => !option.disabled && option.value === value) };
          }`,
            [action.value]
          );
          if (!options?.exists) fail("option_unavailable");
          ready();
          request.markAutomation(page);
          request.dispatch();
          const value = await this.#nodeCall<string>(
            guest,
            request,
            node,
            `function(value) {
            if (!this.isConnected) return undefined;
            this.value = value;
            this.dispatchEvent(new Event("input", { bubbles: true }));
            this.dispatchEvent(new Event("change", { bubbles: true }));
            return this.value;
          }`,
            [action.value]
          );
          if (value !== action.value) fail("action_unverified");
          return { documentId: document.id, trustedInput: false };
        }
        if (action.kind === "fill") {
          const editable = await this.#nodeCall<boolean>(
            guest,
            request,
            node,
            `function() {
            const editableInput = this instanceof HTMLInputElement &&
              ["text", "search", "tel", "url", "password", "email", "number"].includes(this.type);
            return !this.disabled && !this.readOnly &&
              (editableInput || this instanceof HTMLTextAreaElement || this.isContentEditable);
          }`
          );
          if (!editable) fail("target_not_editable");
        }
        ready();
        request.markAutomation(page);
        request.dispatch();
        const focused = await this.#nodeCall<boolean>(
          guest,
          request,
          node,
          `function(selectText) {
          if (!this.isConnected) return false;
          this.focus();
          if (this.ownerDocument.activeElement !== this && !this.matches(":focus"))
            return false;
          if (selectText) {
            if (typeof this.select === "function") this.select();
            else {
              const range = this.ownerDocument.createRange();
              range.selectNodeContents(this);
              const selection = this.ownerDocument.getSelection();
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
          return true;
        }`,
          [action.kind === "fill"]
        );
        if (!focused) fail("needs_focus");
        if (action.kind === "fill") {
          if (action.value.length)
            await input(
              "Input.insertText",
              { text: action.value },
              node.sessionId
            );
          else await pressKey(input, "Backspace", [], node.sessionId);
          const value = await this.#nodeCall<string>(
            guest,
            request,
            node,
            'function() { return this.isConnected ? ("value" in this ? this.value : this.innerText) : undefined; }'
          );
          if (value !== action.value) fail("action_unverified");
        } else
          await pressKey(input, action.key, action.modifiers, node.sessionId);
        return { documentId: document.id, trustedInput: true };
      } finally {
        this.#release(guest, node);
      }
    }
    if (action.kind === "press") {
      await pressKey(input, action.key, action.modifiers);
      return { documentId: document.id, trustedInput: true };
    }
    let point: { x: number; y: number; sessionId?: string };
    if ("ref" in action) {
      const node = await this.#resolve(
        guest,
        state,
        request,
        document,
        action.ref
      );
      try {
        point = await this.#elementPoint(guest, request, node);
      } finally {
        this.#release(guest, node);
      }
    } else {
      const viewport = await this.#viewport(guest, state, request, document);
      if (action.point && action.point.viewportId !== viewport.id)
        fail("stale_viewport");
      point = action.point ?? { x: viewport.width / 2, y: viewport.height / 2 };
      if (point.x >= viewport.width || point.y >= viewport.height)
        fail("invalid_arguments");
    }
    const { x, y, sessionId } = point;
    if (action.kind === "scroll") {
      await input(
        "Input.dispatchMouseEvent",
        {
          type: "mouseWheel",
          x,
          y,
          deltaX: action.deltaX,
          deltaY: action.deltaY,
        },
        sessionId
      );
    } else if (action.kind === "hover") {
      await input(
        "Input.dispatchMouseEvent",
        { type: "mouseMoved", x, y },
        sessionId
      );
    } else {
      await input(
        "Input.dispatchMouseEvent",
        {
          type: "mousePressed",
          x,
          y,
          button: "left",
          buttons: 1,
          clickCount: 1,
        },
        sessionId
      );
      await input(
        "Input.dispatchMouseEvent",
        {
          type: "mouseReleased",
          x,
          y,
          button: "left",
          buttons: 0,
          clickCount: 1,
        },
        sessionId
      );
    }
    return { documentId: document.id, trustedInput: true };
  }

  async #elementPoint(
    guest: Guest,
    request: Request,
    node: ResolvedNode
  ): Promise<{ x: number; y: number; sessionId?: string }> {
    // A coordinate is relative to the CDP target's viewport. Same-process
    // child frames have no separately addressed input viewport. Chromium
    // acknowledged parent-routed pointer commands without delivering them
    // in hidden guests, so refuse before dispatch instead of guessing.
    if (!(await guest.isSessionRoot(request, node.frame)))
      fail("frame_pointer_unavailable");
    const point = await this.#nodeCall<ElementPoint>(
      guest,
      request,
      node,
      `function() {
        const rect = this.getBoundingClientRect();
        const document = this.ownerDocument;
        const width = document.defaultView.innerWidth, height = document.defaultView.innerHeight;
        const left = Math.max(0, rect.left), right = Math.min(width, rect.right);
        const top = Math.max(0, rect.top), bottom = Math.min(height, rect.bottom);
        if (right <= left || bottom <= top) return;
        const x = (left + right) / 2, y = (top + bottom) / 2;
        const hit = document.elementFromPoint(x, y);
        if (hit === this || (hit && this.contains(hit))) return { x, y };
      }`
    );
    if (!point) fail("element_not_visible");
    return { x: point.x, y: point.y, sessionId: node.sessionId };
  }

  async #resolve(
    guest: Guest,
    state: TargetState,
    request: Request,
    document: Guest.Document,
    ref: string
  ): Promise<ResolvedNode> {
    const entry = state.refs.get(ref);
    if (!entry || entry.documentId !== document.id) fail("stale_ref");
    const sessionId = entry.frame.sessionId;
    let node: ResolvedNode | undefined;
    try {
      const frame = await guest.frame(request, entry.frame.id, sessionId);
      if (!frame || frame.loaderId !== entry.frame.loaderId) fail("stale_ref");
      const { object } = await guest.send<{ object: { objectId?: string } }>(
        request,
        "DOM.resolveNode",
        { backendNodeId: entry.backendNodeId },
        sessionId,
        {
          discard: ({ object }) => {
            if (object.objectId)
              guest.releaseObject(
                object.objectId,
                sessionId,
                document.generation
              );
          },
        }
      );
      if (!object.objectId) fail("stale_ref");
      node = {
        objectId: object.objectId,
        sessionId,
        frame: entry.frame,
        generation: document.generation,
      };
      const connected = await this.#nodeCall<boolean>(
        guest,
        request,
        node,
        "function() { return this.isConnected; }"
      );
      if (!connected) fail("stale_ref");
      guest.assertDocument(document);
      return node;
    } catch (error) {
      if (node) this.#release(guest, node);
      request.guard();
      if (error instanceof Arguments.Error) throw error;
      fail("stale_ref");
    }
  }

  async #nodeCall<T>(
    guest: Guest,
    request: Request,
    node: ResolvedNode,
    functionDeclaration: string,
    args: unknown[] = []
  ): Promise<T | undefined> {
    const reply = await guest.send<Guest.Evaluation<T>>(
      request,
      "Runtime.callFunctionOn",
      {
        objectId: node.objectId,
        functionDeclaration,
        returnByValue: true,
        arguments: args.map((value) => ({ value })),
      },
      node.sessionId
    );
    if (reply.exceptionDetails) fail("element_unavailable");
    return reply.result.value;
  }

  #release(guest: Guest, node: ResolvedNode): void {
    guest.releaseObject(node.objectId, node.sessionId, node.generation);
  }

  #diagnostics(
    guest: Guest,
    state: TargetState,
    cursor: string | undefined,
    limit: number,
    document?: Guest.Document
  ): Record<string, unknown> {
    const prior = cursor === undefined ? undefined : state.cursors.get(cursor);
    const epoch = document?.epoch;
    if (
      cursor !== undefined &&
      (!prior || prior.guest !== guest || prior.epoch !== epoch)
    )
      fail("invalid_cursor");
    const oldest = guest.diagnostics[0]?.seq ?? 1;
    const after = prior?.seq ?? oldest - 1;
    const entries = guest.diagnostics
      .filter(
        (entry) =>
          entry.seq > after && (epoch === undefined || entry.epoch === epoch)
      )
      .slice(0, limit);
    const nextCursor = randomUUID();
    state.cursors.set(nextCursor, {
      guest,
      epoch,
      seq: entries.at(-1)?.seq ?? Math.max(after, oldest - 1),
    });
    if (state.cursors.size > 24)
      state.cursors.delete(state.cursors.keys().next().value!);
    return {
      documentId: document?.id ?? null,
      coverageStart: guest.coverageStart,
      dropped:
        cursor === undefined
          ? guest.droppedDiagnostics
          : Math.max(0, oldest - after - 1),
      nextCursor,
      entries: entries.map(
        ({ epoch: epochNumber, seq: sequenceNumber, ...entry }) => ({
          ...entry,
          documentId: document?.id ?? null,
          sequence: sequenceNumber,
          documentSequence: epochNumber,
        })
      ),
    };
  }

  async #wait(
    page: BrowserAutomationPage,
    state: TargetState,
    request: Request,
    operation: Extract<Arguments.Operation, { tool: "browser_wait" }>
  ): Promise<Record<string, unknown>> {
    const guard = operation.readiness;
    const navigation =
      guard?.kind === "navigation"
        ? state.navigations.get(guard.navigationId)
        : undefined;
    if (guard?.kind === "navigation" && !navigation)
      fail("navigation_superseded");
    while (true) {
      request.guard();
      const contents = page.contents();
      if (!contents || contents.isDestroyed()) {
        if (page.snapshot().failure) fail("navigation_failed");
        await request.pause();
        continue;
      }
      const guest = this.#guest(contents, page.target.kind === "background");
      if (navigation && !this.#navigationCommitted(page, guest, navigation)) {
        await request.pause();
        continue;
      }
      if (guest.changingDocument) {
        if (guard?.kind === "document") fail("stale_document");
        await request.pause();
        continue;
      }
      if (!contents.getURL() || page.snapshot().failure) {
        if (page.snapshot().failure) fail("navigation_failed");
        await request.pause();
        continue;
      }
      this.#requireUnblocked(page, guest);
      await guest.attach(request);
      if (navigation && !this.#navigationCommitted(page, guest, navigation))
        fail("navigation_superseded");
      const document = await this.#document(
        guest,
        request,
        guard?.kind === "document" ? guard.documentId : undefined
      );
      if (
        await this.#matches(
          guest,
          state,
          request,
          document,
          operation.condition
        )
      ) {
        request.guard();
        if (navigation && !this.#navigationCommitted(page, guest, navigation))
          fail("navigation_superseded");
        if (page.contents() !== contents) fail("stale_document");
        guest.assertDocument(document);
        return {
          matched: true,
          target: page.target,
          documentId: document.id,
          url: contents.getURL(),
        };
      }
      await request.pause();
    }
  }

  #navigationCommitted(
    page: BrowserAutomationPage,
    guest: Guest,
    navigation: Navigation
  ): boolean {
    const sequence = navigation.baseline + 1;
    const attempt = guest.navigation(sequence);
    if (
      page.contents() !== guest.contents ||
      (navigation.guest && navigation.guest !== guest) ||
      guest.navigationSequence > sequence ||
      (attempt &&
        navigation.expectedUrl &&
        attempt.initialUrl !== navigation.expectedUrl)
    )
      fail("navigation_superseded");
    if (attempt?.state === "failed" || page.snapshot().failure)
      fail("navigation_failed");
    return navigation.guest === guest && attempt?.state === "committed";
  }

  async #matches(
    guest: Guest,
    state: TargetState,
    request: Request,
    document: Guest.Document,
    condition: Arguments.Condition
  ): Promise<boolean> {
    switch (condition.kind) {
      case "url":
        return guest.contents.getURL() === condition.url;
      case "ready": {
        const { result } = await guest.evaluate<string>(
          request,
          document.frame,
          "document.readyState"
        );
        return (
          result.value === "complete" ||
          (condition.state === "dom-content-loaded" &&
            result.value === "interactive")
        );
      }
      case "text": {
        const { result } = await guest.evaluate<boolean>(
          request,
          document.frame,
          `(document.body?.innerText ?? "").slice(0, 131072).includes(${JSON.stringify(condition.text)})`
        );
        return result.value === true;
      }
      case "ref": {
        const entry = state.refs.get(condition.ref);
        if (!entry || entry.documentId !== document.id) fail("stale_ref");
        let node: ResolvedNode;
        try {
          node = await this.#resolve(
            guest,
            state,
            request,
            document,
            condition.ref
          );
        } catch (error) {
          if (error instanceof Arguments.Error && error.code === "stale_ref")
            return (
              condition.state === "detached" || condition.state === "hidden"
            );
          throw error;
        }
        try {
          if (condition.state === "attached") return true;
          if (condition.state === "detached") return false;
          const visible = await this.#nodeCall<boolean>(
            guest,
            request,
            node,
            `function() {
              const rect = this.getBoundingClientRect();
              const style = this.ownerDocument.defaultView.getComputedStyle(this);
              return rect.width > 0 && rect.height > 0 && style.visibility === "visible";
            }`
          );
          return visible === (condition.state === "visible");
        } finally {
          this.#release(guest, node);
        }
      }
    }
  }

  #requireUnblocked(page: BrowserAutomationPage, guest: Guest): void {
    if (guest.dialog || page.blocker()) fail("dialog_pending");
  }

  #requireVisible(page: BrowserAutomationPage, guest: Guest): void {
    this.#requireUnblocked(page, guest);
    if (page.target.kind === "workbench" && !page.visible())
      fail("target_not_visible");
  }

  async #effect<T>(
    guest: Guest,
    request: Request,
    effect: () => Promise<T>
  ): Promise<T> {
    const previous = this.#effects.get(guest.contents);
    const result = (previous ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        request.guard();
        return effect();
      });
    const drain = () => request.drainInput();
    const idle = result.then(drain, drain);
    this.#effects.set(guest.contents, idle);
    void idle.then(() => {
      if (this.#effects.get(guest.contents) === idle)
        this.#effects.delete(guest.contents);
    });
    return request.wait(result);
  }

  async #input<T>(request: Request, run: () => Promise<T>): Promise<T> {
    const result = this.#inputReady.then(async () => {
      request.guard();
      return run();
    });
    // Chromium routes focused keyboard input process-wide. Keep each action's
    // focus and input substeps together while observations remain independent.
    const drain = () => request.drainInput();
    this.#inputReady = result.then(drain, drain);
    return request.wait(result);
  }

  #help(topic?: Arguments.Topic): Record<string, unknown> {
    const topics: Record<Arguments.Topic, string> = {
      targets:
        "Use browser_open for a new background page. Use the exact workbench tab handle from surface_list_open for a request about an open tab.",
      actions:
        "Supply the documentId and a snapshot ref or viewport point. Click, fill, press, select, hover and scroll are available. Pointer and key actions using refs require an addressable input viewport. A same-process iframe can support fill even when pointer or key routing is unavailable.",
      wait: "Use a navigation readiness token for a requested load, or the observed documentId to wait on the same document.",
      capture:
        "Capture a bounded JPEG viewport from the exact document. Workbench pages must be displayed. Background pages remain hidden.",
      errors:
        "Check the dispatch disposition before retrying an effect. Observe the current target after an unknown result.",
    };
    return topic
      ? { topic, text: topics[topic] }
      : { topics: Object.keys(topics) };
  }
}

type ScopeState = {
  abort: AbortController;
  sender: WebContents;
  frame: BrowserAutomationScope["frame"];
  targets: Map<string, TargetState>;
};
type TargetState = {
  current(): boolean;
  refs: Map<string, ElementRef>;
  cursors: Map<string, { guest: Guest; seq: number; epoch?: number }>;
  navigations: Map<string, Navigation>;
  viewport?: Viewport;
};
type ElementRef = {
  documentId: string;
  frame: Guest.ElementFrame;
  backendNodeId: number;
};
type Navigation = {
  guest?: Guest;
  baseline: number;
  expectedUrl?: string;
  unwatch?: () => void;
};
type ResolvedNode = {
  objectId: string;
  frame: Guest.ElementFrame;
  sessionId?: string;
  generation: number;
};
type Viewport = {
  id: string;
  signature: string;
  width: number;
  height: number;
  pageX: number;
  pageY: number;
};
type ViewMetrics = {
  clientWidth: number;
  clientHeight: number;
  offsetX: number;
  offsetY: number;
  pageX: number;
  pageY: number;
  scale: number;
  zoom?: number;
};
type AXNode = {
  nodeId: string;
  parentId?: string;
  ignored?: boolean;
  backendDOMNodeId?: number;
  name?: AXValue;
  role?: AXValue;
  value?: AXValue;
};
type AXValue = { value: unknown };
type ElementPoint = { x: number; y: number };

class Request implements Guest.Request {
  readonly signal: AbortSignal;
  readonly #timer: AbortSignal;
  #target?: () => void;
  readonly #pendingInput = new Set<Promise<void>>();
  #unmark?: () => void;
  dispatched = false;

  constructor(
    readonly verifyScope: () => void,
    scope: AbortSignal,
    timeout: number,
    input?: AbortSignal
  ) {
    this.#timer = AbortSignal.timeout(timeout);
    this.signal = AbortSignal.any([
      scope,
      this.#timer,
      ...(input === undefined ? [] : [input]),
    ]);
  }

  bind(guard: (() => void) | undefined): void {
    this.#target = guard;
  }

  guard(): void {
    this.verifyScope();
    if (this.signal.aborted)
      fail(this.#timer.aborted ? "timeout" : "cancelled");
    this.#target?.();
  }

  dispatch(): void {
    this.guard();
    this.dispatched = true;
  }

  async wait<T>(promise: Promise<T>): Promise<T> {
    // Accept promises from Electron that may reject after the call has settled.
    void promise.catch(() => {});
    this.guard();
    let aborted: (() => void) | undefined;
    try {
      const stopped = new Promise<never>((_resolve, reject) => {
        aborted = () => {
          try {
            this.guard();
          } catch (error) {
            reject(error);
          }
        };
        this.signal.addEventListener("abort", aborted, { once: true });
      });
      const value = await Promise.race([promise, stopped]);
      this.guard();
      return value;
    } finally {
      if (aborted) this.signal.removeEventListener("abort", aborted);
    }
  }

  get trackBrowserEffects(): boolean {
    return this.#unmark !== undefined;
  }

  markAutomation(page: BrowserAutomationPage): void {
    this.#unmark ??= page.beginInput();
  }

  releaseAutomation(): void {
    const release = this.#unmark;
    if (release) void this.drainInput().then(release);
    this.#unmark = undefined;
  }

  trackInput(value: Promise<unknown>): void {
    const settled = value.then(
      () => {
        this.#pendingInput.delete(settled);
      },
      () => {
        this.#pendingInput.delete(settled);
      }
    );
    this.#pendingInput.add(settled);
  }

  async drainInput(): Promise<void> {
    // Each waiting caller still has its own bounded request. A new action
    // cannot follow a cancelled call until its raw commands have settled.
    await Promise.all(this.#pendingInput);
  }

  async pause(): Promise<void> {
    await this.wait(new Promise<void>((resolve) => setTimeout(resolve, 65)));
  }
}

function targetKey(target: BrowserAutomationTarget): string {
  return target.kind === "background"
    ? "p:" + target.pageId
    : "t:" + target.tabId;
}

function axText(value: AXValue | undefined): string | undefined {
  if (value?.value === undefined) return undefined;
  if (
    typeof value.value !== "string" &&
    typeof value.value !== "number" &&
    typeof value.value !== "boolean"
  )
    return undefined;
  return String(value.value).slice(0, 480);
}

function viewportData(viewport: Viewport): Omit<Viewport, "signature"> {
  return {
    id: viewport.id,
    width: viewport.width,
    height: viewport.height,
    pageX: viewport.pageX,
    pageY: viewport.pageY,
  };
}

function resize(
  image: Electron.NativeImage,
  edge: number
): Electron.NativeImage {
  const { width, height } = image.getSize();
  if (Math.max(width, height) <= edge) return image;
  return image.resize({
    ...(width >= height ? { width: edge } : { height: edge }),
    quality: "best",
  });
}

async function pressKey(
  send: (
    method: string,
    params: Record<string, unknown>,
    sessionId?: string
  ) => Promise<void>,
  key: string,
  modifiers: ("Alt" | "Control" | "Meta" | "Shift")[],
  sessionId?: string
): Promise<void> {
  const namedCodes: Record<string, number> = {
    Enter: 13,
    Tab: 9,
    Escape: 27,
    Backspace: 8,
    Delete: 46,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Home: 36,
    End: 35,
    PageUp: 33,
    PageDown: 34,
    Space: 32,
  };
  const named = Object.hasOwn(namedCodes, key) ? namedCodes[key] : undefined;
  const point = key.codePointAt(0) ?? 0;
  const printable = [...key].length === 1 && point >= 32 && point !== 127;
  if (!named && !printable) fail("unsupported_key");
  const value = key === "Space" ? " " : key;
  const bits = modifiers.reduce(
    (sum, modifier) =>
      sum + { Alt: 1, Control: 2, Meta: 4, Shift: 8 }[modifier],
    0
  );
  const code = named
    ? key
    : /^[a-z]$/i.test(key)
      ? "Key" + key.toUpperCase()
      : /^[0-9]$/.test(key)
        ? "Digit" + key
        : key === " "
          ? "Space"
          : "";
  const text =
    !(bits & 7) && (printable || key === "Space" || key === "Enter")
      ? key === "Enter"
        ? "\r"
        : value
      : undefined;
  const windowsVirtualKeyCode =
    named ?? (/^[a-z0-9 ]$/i.test(key) ? key.toUpperCase().charCodeAt(0) : 0);
  const params = { code, key: value, windowsVirtualKeyCode, modifiers: bits };
  await send(
    "Input.dispatchKeyEvent",
    {
      ...params,
      type: "keyDown",
      ...(text === undefined ? {} : { text }),
    },
    sessionId
  );
  await send("Input.dispatchKeyEvent", { ...params, type: "keyUp" }, sessionId);
}

function errorCode(error: unknown): string {
  if (error instanceof Arguments.Error) return error.code;
  if (error instanceof globalThis.Error) {
    if (error.name === "AbortError") return "cancelled";
    if (error.name === "TimeoutError") return "timeout";
    const message = error.message;
    if (
      message === "browser_owner_revoked" ||
      message === "browser_owner_invalid"
    )
      return "owner_revoked";
    if (
      message === "browser_page_missing" ||
      message === "browser_page_unavailable" ||
      message === "browser_automation_target_missing"
    )
      return "target_missing";
    if (message === "browser_session_busy") return "backend_busy";
    if (message === "browser_page_limit") return "resource_limit";
    if (message === "browser_target_not_visible") return "target_not_visible";
    if (message === "browser_input_focus_unavailable") return "needs_focus";
  }
  return "backend_unavailable";
}

function fail(code: string): never {
  throw new Arguments.Error(code);
}

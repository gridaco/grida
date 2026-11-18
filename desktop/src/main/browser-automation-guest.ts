/** GRIDA-SEC-016 — private observation of an already admitted browser guest. */
import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { BrowserAutomationArguments } from "./browser-automation-arguments";

const NAVIGATION_LIMIT = 32;
const DIAGNOSTIC_LIMIT = 128;
const MAX_FRAME_TARGETS = 8;

export class BrowserAutomationGuest {
  readonly coverageStart = new Date().toISOString();
  readonly diagnostics: BrowserAutomationGuest.Diagnostic[] = [];
  readonly #frames = new Map<string, string>();
  readonly #contexts = new Map<string, string>();
  readonly #navigations = new Map<number, BrowserAutomationGuest.Navigation>();
  navigationSequence = 0;
  rootEpoch = 0;
  changingDocument = false;
  droppedDiagnostics = 0;
  dialog: string | null = null;
  #diagnosticSequence = 0;
  #debuggerOwned = false;
  #debuggerGeneration = 0;
  #rootSignature = "";
  #documentId = randomUUID();
  #initialized?: Promise<void>;
  #frameInitializations = new Map<string, Promise<void>>();
  #discarded = false;

  constructor(
    readonly contents: WebContents,
    readonly background: boolean
  ) {
    this.changingDocument = contents.isLoadingMainFrame();
    contents.on("did-start-navigation", (details) => {
      if (
        !details.isMainFrame ||
        details.url.startsWith("about:blank#grida-browser-mount=")
      )
        return;
      if (!details.isSameDocument) {
        this.rootEpoch++;
        this.changingDocument = true;
        this.dialog = null;
      }
      const seq = ++this.navigationSequence;
      this.#navigations.set(seq, {
        seq,
        initialUrl: details.url,
        url: details.url,
        state: "started",
      });
      if (this.#navigations.size > NAVIGATION_LIMIT)
        this.#navigations.delete(seq - NAVIGATION_LIMIT);
    });
    contents.on("did-redirect-navigation", (details) => {
      const navigation = this.navigation(this.navigationSequence);
      if (details.isMainFrame && navigation?.state === "started")
        navigation.url = details.url;
    });
    contents.on("did-navigate", (_event, url) => this.#committed(url));
    contents.on("did-stop-loading", () => {
      const navigation = this.navigation(this.navigationSequence);
      if (navigation?.state === "started") navigation.state = "failed";
      this.changingDocument = false;
    });
    contents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
      if (isMainFrame) this.#committed(url);
    });
    contents.on(
      "did-fail-load",
      (_event, code, description, url, isMainFrame) => {
        if (!isMainFrame) return;
        const navigation = this.navigation(this.navigationSequence);
        if (navigation?.state === "started" && navigation.url === url) {
          navigation.state = "failed";
          this.changingDocument = false;
        }
        if (code !== -3) this.#diagnostic("load", "error", description, code);
      }
    );
    contents.on("console-message", (details) => {
      this.#diagnostic("console", details.level, details.message);
    });
    contents.on("render-process-gone", () => {
      this.changingDocument = true;
      this.rootEpoch++;
      this.#diagnostic("load", "error", "The page renderer stopped.");
    });
    contents.once("destroyed", () => {
      this.#discarded = true;
      this.#frames.clear();
      this.#contexts.clear();
      this.#navigations.clear();
      this.diagnostics.length = 0;
    });
  }

  navigation(seq: number): BrowserAutomationGuest.Navigation | undefined {
    return this.#navigations.get(seq);
  }

  async attach(request: BrowserAutomationGuest.Request): Promise<void> {
    request.guard();
    if (this.#discarded || this.contents.isDestroyed()) fail("target_missing");
    const debuggerApi = this.contents.debugger;
    if (debuggerApi.isAttached()) {
      if (!this.#debuggerOwned) fail("backend_busy");
      if (this.#initialized) await request.wait(this.#initialized);
      return;
    }

    try {
      debuggerApi.attach("1.3");
    } catch {
      fail("backend_busy");
    }
    this.#debuggerOwned = true;
    const generation = ++this.#debuggerGeneration;
    const onMessage = (
      _event: unknown,
      method: string,
      params: DebuggerParams,
      sessionId?: string
    ) => {
      if (generation === this.#debuggerGeneration)
        this.#message(method, params, sessionId === "" ? undefined : sessionId);
    };
    debuggerApi.on("message", onMessage);
    debuggerApi.once("detach", () => {
      debuggerApi.off("message", onMessage);
      this.#debuggerOwned = false;
      this.#initialized = undefined;
      this.#frames.clear();
      this.#frameInitializations.clear();
      this.#contexts.clear();
      this.#debuggerGeneration++;
      this.dialog = null;
    });
    const initialize = Promise.all([
      debuggerApi.sendCommand("Page.enable"),
      debuggerApi.sendCommand("Runtime.enable"),
      debuggerApi.sendCommand("Target.setAutoAttach", frameAttach),
      ...(this.background
        ? [
            debuggerApi.sendCommand("Page.setInterceptFileChooserDialog", {
              enabled: true,
            }),
          ]
        : []),
    ]).then(() => {});
    this.#initialized = initialize;
    try {
      await request.wait(initialize);
    } catch (error) {
      if (generation === this.#debuggerGeneration && debuggerApi.isAttached())
        debuggerApi.detach();
      throw error;
    }
  }

  async send<T>(
    request: BrowserAutomationGuest.Request,
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    options?: { detachOnAbort?: boolean; discard?: (result: T) => void }
  ): Promise<T> {
    request.guard();
    if (!this.#debuggerOwned || !this.contents.debugger.isAttached())
      fail("backend_busy");
    const command = this.contents.debugger.sendCommand(
      method,
      params,
      sessionId
    ) as Promise<T>;
    if (method.startsWith("Input.") || request.trackBrowserEffects)
      request.trackInput(command);
    if (!options) return request.wait(command);

    const generation = this.#debuggerGeneration;
    let pending = true;
    const settled = () => {
      pending = false;
    };
    void command.then(settled, settled);
    try {
      return await request.wait(command);
    } catch (error) {
      if (options.discard) {
        const discard = options.discard;
        void command
          .then((result) => {
            if (generation === this.#debuggerGeneration && this.#debuggerOwned)
              discard(result);
          })
          .catch(() => {});
      }
      // CDP's execution timeout does not bound waiting for a returned promise.
      // Detaching releases this pending reply. The script's effects may persist.
      if (
        options.detachOnAbort &&
        pending &&
        request.signal.aborted &&
        !this.contents.isDestroyed() &&
        generation === this.#debuggerGeneration &&
        this.#debuggerOwned &&
        this.contents.debugger.isAttached()
      )
        this.contents.debugger.detach();
      throw error;
    }
  }

  releaseObject(
    objectId: string,
    sessionId: string | undefined,
    generation: number
  ): void {
    if (
      generation === this.#debuggerGeneration &&
      this.#debuggerOwned &&
      !this.contents.isDestroyed() &&
      this.contents.debugger.isAttached()
    )
      void this.contents.debugger
        .sendCommand("Runtime.releaseObject", { objectId }, sessionId)
        .catch(() => {});
  }

  async root(
    request: BrowserAutomationGuest.Request
  ): Promise<BrowserAutomationGuest.Document> {
    if (this.changingDocument) fail("not_ready");
    const epoch = this.rootEpoch;
    const generation = this.#debuggerGeneration;
    const { frameTree } = await this.send<{ frameTree: FrameTree }>(
      request,
      "Page.getFrameTree"
    );
    if (
      this.changingDocument ||
      epoch !== this.rootEpoch ||
      generation !== this.#debuggerGeneration
    )
      fail("stale_document");
    const frame = frameTree.frame;
    if (!frame.loaderId || frame.unreachableUrl) fail("not_ready");
    const signature = JSON.stringify([
      epoch,
      generation,
      frame.id,
      frame.loaderId,
    ]);
    if (signature !== this.#rootSignature) {
      this.#rootSignature = signature;
      this.#documentId = randomUUID();
    }
    return { id: this.#documentId, epoch, generation, frame };
  }

  assertDocument(document: BrowserAutomationGuest.Document): void {
    if (
      this.changingDocument ||
      this.rootEpoch !== document.epoch ||
      this.#debuggerGeneration !== document.generation ||
      this.#documentId !== document.id ||
      !this.#debuggerOwned
    )
      fail("stale_document");
  }

  async frames(request: BrowserAutomationGuest.Request): Promise<Frame[]> {
    const { frameTree } = await this.send<{ frameTree: FrameTree }>(
      request,
      "Page.getFrameTree"
    );
    const byFrame = new Map<string, Frame>();
    this.#flattenFrames(byFrame, frameTree);
    const attached = [...this.#frames.values()].slice(0, MAX_FRAME_TARGETS - 1);
    await Promise.all(
      attached.map(async (sessionId) => {
        try {
          const pending = this.#frameInitializations.get(sessionId);
          if (pending) await request.wait(pending);
          const { frameTree: tree } = await this.send<{ frameTree: FrameTree }>(
            request,
            "Page.getFrameTree",
            {},
            sessionId
          );
          this.#flattenFrames(byFrame, tree, sessionId);
        } catch {
          request.guard();
          // A child may detach while the top document is still live.
        }
      })
    );
    return [...byFrame.values()].slice(0, MAX_FRAME_TARGETS);
  }

  async frame(
    request: BrowserAutomationGuest.Request,
    frameId: string,
    sessionId?: string
  ): Promise<Frame | undefined> {
    const { frameTree } = await this.send<{ frameTree: FrameTree }>(
      request,
      "Page.getFrameTree",
      {},
      sessionId
    );
    const frames = new Map<string, Frame>();
    this.#flattenFrames(frames, frameTree, sessionId);
    return frames.get(frameId);
  }

  async isSessionRoot(
    request: BrowserAutomationGuest.Request,
    frame: Frame
  ): Promise<boolean> {
    const { frameTree } = await this.send<{ frameTree: FrameTree }>(
      request,
      "Page.getFrameTree",
      {},
      frame.sessionId
    );
    return (
      frameTree.frame.id === frame.id &&
      frameTree.frame.loaderId === frame.loaderId
    );
  }

  async evaluate<T>(
    request: BrowserAutomationGuest.Request,
    frame: Frame,
    expression: string,
    timeout?: number
  ): Promise<BrowserAutomationGuest.Evaluation<T>> {
    const context = this.#contexts.get(
      this.#contextKey(frame.id, frame.sessionId)
    );
    if (!context) fail("not_ready");
    return this.send(
      request,
      "Runtime.evaluate",
      {
        expression,
        uniqueContextId: context,
        returnByValue: true,
        awaitPromise: true,
        ...(timeout === undefined ? {} : { timeout }),
      },
      frame.sessionId,
      timeout === undefined ? undefined : { detachOnAbort: true }
    );
  }

  #committed(url: string): void {
    const navigation = this.navigation(this.navigationSequence);
    if (navigation?.state === "started") {
      // Redirect events update the pending destination. A late commit for the
      // displaced location cannot settle the current attempt.
      if (navigation.url !== url) return;
      navigation.state = "committed";
    }
    this.changingDocument = false;
  }

  #message(method: string, params: DebuggerParams, sessionId?: string): void {
    switch (method) {
      case "Target.attachedToTarget": {
        if (
          params.targetInfo?.type !== "iframe" ||
          typeof params.sessionId !== "string" ||
          typeof params.targetInfo.targetId !== "string" ||
          this.#frames.size >= MAX_FRAME_TARGETS - 1
        )
          return;
        const child = params.sessionId as string;
        this.#frames.set(params.targetInfo.targetId, child);
        const api = this.contents.debugger;
        const initialize = Promise.all([
          api.sendCommand("Page.enable", {}, child),
          api.sendCommand("Runtime.enable", {}, child),
          api.sendCommand("Target.setAutoAttach", frameAttach, child),
          ...(this.background
            ? [
                api.sendCommand(
                  "Page.setInterceptFileChooserDialog",
                  { enabled: true },
                  child
                ),
              ]
            : []),
        ]).then(() => {});
        void initialize.catch(() => {});
        this.#frameInitializations.set(child, initialize);
        break;
      }
      case "Target.detachedFromTarget":
        if (!params.sessionId) break;
        for (const [key, value] of this.#frames)
          if (value === params.sessionId) this.#frames.delete(key);
        this.#frameInitializations.delete(params.sessionId);
        this.#clearContexts(params.sessionId);
        break;
      case "Runtime.executionContextCreated": {
        const context = params.context;
        if (
          context?.auxData?.isDefault &&
          typeof context.auxData.frameId === "string" &&
          typeof context.uniqueId === "string"
        )
          this.#contexts.set(
            this.#contextKey(context.auxData.frameId, sessionId),
            context.uniqueId
          );
        break;
      }
      case "Runtime.executionContextDestroyed":
        for (const [key, uniqueId] of this.#contexts)
          if (uniqueId === params.executionContextUniqueId)
            this.#contexts.delete(key);
        break;
      case "Runtime.executionContextsCleared":
        this.#clearContexts(sessionId);
        break;
      case "Runtime.exceptionThrown":
        this.#diagnostic(
          "exception",
          "error",
          String(
            params.exceptionDetails?.exception?.description ??
              params.exceptionDetails?.text ??
              "Uncaught page exception"
          )
        );
        break;
      case "Page.fileChooserOpened":
        this.dialog = "file-chooser";
        break;
      case "Page.javascriptDialogOpening":
        this.dialog = String(params.type ?? "unknown").slice(0, 32);
        break;
      case "Page.javascriptDialogClosed":
        this.dialog = null;
        break;
    }
  }

  #clearContexts(sessionId?: string): void {
    const prefix = this.#contextKey("", sessionId);
    for (const key of this.#contexts.keys())
      if (key.startsWith(prefix)) this.#contexts.delete(key);
  }

  #contextKey(frameId: string, sessionId?: string): string {
    return (sessionId ?? "") + ":" + frameId;
  }

  #flattenFrames(
    byFrame: Map<string, Frame>,
    tree: FrameTree,
    sessionId?: string
  ): void {
    byFrame.set(tree.frame.id, { ...tree.frame, sessionId });
    for (const child of tree.childFrames ?? []) {
      if (byFrame.size >= MAX_FRAME_TARGETS * 2) break;
      this.#flattenFrames(byFrame, child, sessionId);
    }
  }

  #diagnostic(
    kind: BrowserAutomationGuest.Diagnostic["kind"],
    level: string,
    message: string,
    code?: number
  ) {
    this.diagnostics.push({
      seq: ++this.#diagnosticSequence,
      epoch: this.rootEpoch,
      kind,
      level,
      message: message.slice(0, 1024),
      ...(code === undefined ? {} : { code }),
    });
    if (this.diagnostics.length > DIAGNOSTIC_LIMIT) {
      this.diagnostics.shift();
      this.droppedDiagnostics++;
    }
  }
}

export namespace BrowserAutomationGuest {
  export type Request = {
    readonly signal: AbortSignal;
    guard(): void;
    wait<T>(value: Promise<T>): Promise<T>;
    readonly trackBrowserEffects: boolean;
    trackInput(value: Promise<unknown>): void;
  };

  export type Document = {
    id: string;
    epoch: number;
    generation: number;
    frame: Frame;
  };

  export type ElementFrame = Frame;

  export type Navigation = {
    seq: number;
    initialUrl: string;
    url: string;
    state: "started" | "committed" | "failed";
  };

  export type Diagnostic = {
    seq: number;
    epoch: number;
    kind: "console" | "exception" | "load";
    level: string;
    message: string;
    code?: number;
  };

  export type Evaluation<T> = {
    result: { value?: T; type: string; unserializableValue?: string };
    exceptionDetails?: object;
  };
}

type Frame = {
  id: string;
  loaderId: string;
  url: string;
  unreachableUrl?: string;
  sessionId?: string;
};
type FrameTree = { frame: Frame; childFrames?: FrameTree[] };

type DebuggerParams = {
  sessionId?: string;
  targetInfo?: { type?: string; targetId?: string };
  context?: {
    auxData?: { isDefault?: boolean; frameId?: string };
    uniqueId?: string;
  };
  executionContextUniqueId?: string;
  exceptionDetails?: { exception?: { description?: string }; text?: string };
  type?: unknown;
};

const frameAttach = {
  autoAttach: true,
  waitForDebuggerOnStart: false,
  flatten: true,
  filter: [{ type: "iframe", exclude: false }, { exclude: true }],
};

function fail(code: string): never {
  throw new BrowserAutomationArguments.Error(code);
}

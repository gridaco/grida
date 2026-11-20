// GRIDA-SEC-004 — editor observations belong to one exact chat attachment.
import { createHash, randomUUID } from "node:crypto";
import {
  NativeEditorSurfaces,
  NativeEditorSvgText,
  type NativeEditorSurfaceOpen,
  type NativeEditorSurfaceSnapshot,
} from "@grida/desktop-bridge";
import { DesktopArtifactPresentation } from "./desktop-artifact-presentation";
import { DesktopBrowserMcp } from "./desktop-browser-mcp";
import type { DesktopBrowserToolLease } from "./desktop-browser-tools";
import { DesktopSelectedSvgSelection } from "./desktop-selected-svg-selection";
import { DesktopSelectedSvgText } from "./desktop-selected-svg-text";
import { DesktopWorkbenchInventory } from "./desktop-workbench-inventory";
import { NativeDesktopTools } from "./native-desktop-tools";

const MAX_ENDPOINTS = 32;
const MAX_PRESENTATION_CALLS = 64;
const MAX_EDITOR_TOOL_CONTEXTS = 1024;
const PRESENTATION_WINDOW_MS = 2000;
const SESSION_ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const ENDPOINT_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export type NativeEditorSurfaceLease = Readonly<{
  selection(
    editorSvgTargetId?: string,
    context?: { targetId: string; inputId: string }
  ): NativeEditorSurfaceSelection;
  update(snapshot: NativeEditorSurfaceSnapshot, revision?: number): void;
  close(): void;
}>;

export type NativeEditorSurfaceSelection = Readonly<{
  editorEndpointId: string;
  editorPresentation?: true;
  editorSvgTargetId?: string;
  editorToolContextId?: string;
  editorBrowserTools?: true;
}>;

export type NativeEditorSurfaceDelivery = (
  request: NativeEditorSurfaceOpen
) => void;
export type NativeEditorSvgTextDelivery = DesktopSelectedSvgText.Delivery;
export type NativeEditorSvgSelectionDelivery =
  DesktopSelectedSvgSelection.Delivery;

type Endpoint = {
  sessionId: string;
  snapshot: NativeEditorSurfaceSnapshot;
  requireCurrent(): void;
  revision?: number;
  deliver?: NativeEditorSurfaceDelivery;
  svgText?: NativeEditorSvgTextDelivery;
  svgSelection?: NativeEditorSvgSelectionDelivery;
  browser?: DesktopBrowserToolLease;
  lifetime: AbortController;
  calls: Map<string, { path: string; requested: boolean }>;
};

type BrowserResult = Awaited<ReturnType<DesktopBrowserToolLease["invoke"]>>;
export type NativeEditorBrowserReply = Readonly<{
  sessionId: string;
  endpointId: string;
  callId: string;
  result: BrowserResult;
}>;
export type NativeDesktopToolReply = Readonly<{
  sessionId: string;
  endpointId: string;
  message: NativeDesktopTools.Reply;
}>;

export class NativeEditorSurfaceEndpoints {
  static readonly capability = "co.grida/session/editor-surfaces";
  static readonly readMethod = "_co.grida/editor/surface-list-open";
  static readonly openCapability = "co.grida/session/editor-surface-open";
  static readonly openMethod = "_co.grida/editor/surface-open";
  static readonly svgTextCapability = "co.grida/session/editor-svg-text";
  static readonly svgTextMethod = "_co.grida/editor/svg-selected-text";
  static readonly toolContextCapability =
    "co.grida/session/editor-tool-context";
  static readonly browserCapability = "co.grida/session/browser-tools";
  static readonly browserMethod = "_co.grida/editor/browser-tool";

  private readonly endpoints = new Map<string, Endpoint>();
  private readonly contexts = new Map<
    string,
    { endpointId: string; targetId: string; path: string | null }
  >();
  private readonly targetContexts = new Map<string, string>();

  register(
    sessionId: string,
    snapshot: NativeEditorSurfaceSnapshot,
    requireCurrent: () => void,
    deliver?: NativeEditorSurfaceDelivery,
    revision?: number,
    svgText?: NativeEditorSvgTextDelivery,
    browser?: DesktopBrowserToolLease,
    svgSelection?: NativeEditorSvgSelectionDelivery
  ): NativeEditorSurfaceLease {
    requireCurrent();
    if (this.endpoints.size >= MAX_ENDPOINTS)
      throw new Error("native_chat_editor_surface_limit");
    const id = randomUUID();
    const endpoint: Endpoint = {
      sessionId,
      snapshot,
      requireCurrent,
      revision,
      deliver,
      svgText,
      svgSelection,
      browser,
      lifetime: new AbortController(),
      calls: new Map(),
    };
    this.endpoints.set(id, endpoint);
    return Object.freeze({
      selection: (
        editorSvgTargetId?: string,
        context?: { targetId: string; inputId: string }
      ) => {
        const current = this.endpoints.get(id) === endpoint;
        const contextId =
          context && endpoint.svgSelection
            ? this.bindContext(sessionId, id, context)
            : undefined;
        return {
          editorEndpointId: id,
          ...(current &&
            endpoint.deliver &&
            endpoint.revision !== undefined && {
              editorPresentation: true as const,
            }),
          ...(editorSvgTargetId &&
            current &&
            endpoint.svgText && {
              editorSvgTargetId,
            }),
          ...(contextId && { editorToolContextId: contextId }),
          ...(current &&
            endpoint.browser?.ready() && {
              editorBrowserTools: true as const,
            }),
        };
      },
      update: (next: NativeEditorSurfaceSnapshot, revision?: number) => {
        if (this.endpoints.get(id) !== endpoint) return;
        requireCurrent();
        if (
          revision !== undefined &&
          endpoint.revision !== undefined &&
          revision <= endpoint.revision
        )
          return;
        endpoint.snapshot = next;
        endpoint.revision = revision;
      },
      close: () => {
        this.release(id);
      },
    });
  }

  private bindContext(
    sessionId: string,
    endpointId: string,
    { targetId, inputId }: { targetId: string; inputId: string }
  ): string {
    // Keep retry identity stable across native process replacement. Only an
    // admitted endpoint has the mapping back to the editable renderer target.
    const contextId = createHash("sha256")
      .update(
        JSON.stringify([
          "desktop-editor-tool-context",
          sessionId,
          inputId,
          targetId,
        ])
      )
      .digest("hex")
      .slice(0, 32)
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
    const captured = this.targetContexts.get(targetId);
    if (captured && captured !== contextId)
      throw new Error("native_chat_editor_tool_context_unavailable");
    const previous = this.contexts.get(contextId);
    if (previous) {
      if (
        previous.endpointId !== endpointId &&
        this.endpoints.has(previous.endpointId)
      )
        throw new Error("native_chat_editor_tool_context_unavailable");
      // Keep the original binder even when its endpoint was retired.
      return contextId;
    }
    const endpoint = this.current(sessionId, endpointId);
    if (!endpoint) return contextId;
    if (this.contexts.size >= MAX_EDITOR_TOOL_CONTEXTS) {
      const oldest = this.contexts.entries().next().value;
      if (oldest) {
        this.contexts.delete(oldest[0]);
        this.targetContexts.delete(oldest[1].targetId);
      }
    }
    this.contexts.set(contextId, {
      endpointId,
      targetId,
      path: endpoint.snapshot.active,
    });
    this.targetContexts.set(targetId, contextId);
    return contextId;
  }

  browserBusy(value: unknown): NativeEditorBrowserReply | null {
    const request = this.browserRequest(value);
    if (!request) return null;
    const { sessionId, endpointId, callId } = request;
    return {
      sessionId,
      endpointId,
      callId,
      result: { disposition: "not_dispatched" as const, error: "backend_busy" },
    };
  }

  async browserTool(
    value: unknown,
    signal: AbortSignal
  ): Promise<NativeEditorBrowserReply | null> {
    const request = this.browserRequest(value);
    if (!request) return null;
    const { sessionId, endpointId, callId, operation, args, timeoutMs } =
      request;
    const endpoint = this.current(sessionId, endpointId);
    const denied = {
      disposition: "not_dispatched" as const,
      error: "owner_revoked",
    };
    const reply = (result: BrowserResult) => ({
      sessionId,
      endpointId,
      callId,
      result,
    });
    if (!endpoint?.browser?.ready()) return reply(denied);
    const deadline = AbortSignal.timeout(timeoutMs);
    const result = await endpoint.browser.invoke(
      operation,
      args,
      AbortSignal.any([signal, deadline])
    );
    const response = reply(result);
    if (
      this.current(sessionId, endpointId) !== endpoint ||
      !endpoint.browser.ready()
    )
      return this.revokedBrowserReply(response);
    return response;
  }

  browserReplyGuard(reply: NativeEditorBrowserReply) {
    const revoked = this.revokedBrowserReply(reply);
    const { sessionId, endpointId } = revoked;
    const endpoint = this.endpoints.get(endpointId);
    return () =>
      endpoint &&
      this.current(sessionId, endpointId) === endpoint &&
      endpoint.browser?.ready()
        ? undefined
        : revoked;
  }

  private revokedBrowserReply({
    sessionId,
    endpointId,
    callId,
    result,
  }: NativeEditorBrowserReply): NativeEditorBrowserReply {
    return {
      sessionId,
      endpointId,
      callId,
      result:
        result.disposition === "not_dispatched"
          ? { disposition: "not_dispatched", error: "owner_revoked" }
          : { disposition: "unknown", error: "outcome_unknown" },
    };
  }

  private browserRequest(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const {
      sessionId,
      endpointId,
      callId,
      operation,
      arguments: args,
      timeoutMs,
    } = value as Record<string, unknown>;
    if (
      Object.keys(value).length !== 6 ||
      !Object.hasOwn(value, "arguments") ||
      typeof sessionId !== "string" ||
      !SESSION_ID.test(sessionId) ||
      !NativeEditorSvgText.isId(endpointId) ||
      !NativeEditorSvgText.isId(callId) ||
      typeof operation !== "string" ||
      !/^[a-z_]{1,64}$/.test(operation) ||
      typeof timeoutMs !== "number" ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 120_000
    )
      return null;
    return { sessionId, endpointId, callId, operation, args, timeoutMs };
  }

  async svgText(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const { sessionId, endpointId, targetId, callId, operation, expiresAtMs } =
      value as Record<string, unknown>;
    const action = NativeEditorSvgText.operation(operation);
    if (
      Object.keys(value).length !== 6 ||
      typeof sessionId !== "string" ||
      !SESSION_ID.test(sessionId) ||
      !NativeEditorSvgText.isId(endpointId) ||
      !NativeEditorSvgText.isId(targetId) ||
      !NativeEditorSvgText.isId(callId) ||
      typeof expiresAtMs !== "number" ||
      !Number.isSafeInteger(expiresAtMs) ||
      !action
    )
      return null;
    const endpoint = this.current(sessionId, endpointId);
    const result = endpoint?.svgText
      ? await endpoint.svgText({
          callId,
          targetId,
          operation: action,
          expiresAtMs: Math.min(expiresAtMs, Date.now() + 1500),
        })
      : { kind: "unavailable" };
    if (endpoint?.svgText && this.current(sessionId, endpointId) !== endpoint)
      throw new Error("native_chat_svg_text_unverified");
    return { sessionId, endpointId, targetId, callId, result };
  }

  read(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const { sessionId, endpointId } = value as Record<string, unknown>;
    if (
      Object.keys(value).length !== 2 ||
      typeof sessionId !== "string" ||
      !SESSION_ID.test(sessionId) ||
      typeof endpointId !== "string" ||
      !ENDPOINT_ID.test(endpointId)
    )
      return null;
    const endpoint = this.current(sessionId, endpointId);
    if (endpoint)
      return { sessionId, endpointId, available: true, ...endpoint.snapshot };
    return {
      sessionId,
      endpointId,
      available: false,
      active: null,
      open: [],
      truncated: false,
    };
  }

  desktopToolsBusy(
    value: unknown,
    browserNegotiated = false
  ): NativeDesktopToolReply | null {
    const request = this.desktopToolRequest(value, browserNegotiated);
    if (!request) return null;
    const { sessionId, endpointId, message } = request;
    const reply = NativeDesktopTools.busy(message);
    return reply && { sessionId, endpointId, message: reply };
  }

  async desktopTools(
    value: unknown,
    signal: AbortSignal,
    browserNegotiated = false
  ): Promise<NativeDesktopToolReply | null> {
    const request = this.desktopToolRequest(value, browserNegotiated);
    if (!request) return null;
    const { sessionId, endpointId, scope, message, timeoutMs } = request;
    const now = Date.now();
    // Transit through the private pipe consumes the original tool deadline.
    const expiresAtMs = Math.min(request.expiresAtMs, now + timeoutMs);
    const deadline = AbortSignal.timeout(Math.max(0, expiresAtMs - now));
    const endpoint = this.current(sessionId, endpointId);
    const browser = endpoint?.browser;
    const tools =
      endpoint &&
      (scope?.browser
        ? browser?.ready() || NativeDesktopTools.isCall(message)
          ? DesktopBrowserMcp.bind(
              browser,
              scope.presentation === true &&
                endpoint.deliver !== undefined &&
                endpoint.revision !== undefined
            )
          : []
        : [DesktopWorkbenchInventory.bind(endpoint.snapshot)]);
    if (
      endpoint &&
      tools &&
      !scope?.browser &&
      scope?.presentation &&
      endpoint.deliver &&
      endpoint.revision !== undefined
    ) {
      tools.push(
        DesktopArtifactPresentation.bind((path, callId, expiresAtMs) =>
          this.requestPresentation(
            sessionId,
            endpointId,
            callId,
            path,
            expiresAtMs
          )
        )
      );
    }
    if (endpoint?.svgText && tools && scope?.svgTargetId)
      tools.push(
        ...DesktopSelectedSvgText.bind(scope.svgTargetId, endpoint.svgText)
      );
    const svgSelection = endpoint?.svgSelection;
    if (endpoint && svgSelection && tools && scope?.contextId) {
      const context = this.contexts.get(scope.contextId);
      if (context?.endpointId === endpointId)
        tools.push(
          ...DesktopSelectedSvgSelection.bind(
            context.targetId,
            async (request, signal) => {
              if (
                context.path === null ||
                endpoint.snapshot.active !== context.path
              )
                return { kind: "stale" };
              const result = await svgSelection(request, signal);
              if ("path" in result && result.path !== context.path)
                throw new Error("native_chat_svg_selection_unverified");
              return result;
            }
          )
        );
      else if (NativeDesktopTools.isCall(message))
        // A retained catalog may call after its live capture was retired.
        // Deny it through the domain result and keep it out of discovery.
        tools.push(
          ...DesktopSelectedSvgSelection.bind(scope.contextId, async () => ({
            kind: "stale",
          }))
        );
    }
    const reply = await NativeDesktopTools.reply(message, tools, {
      signal: AbortSignal.any(
        endpoint
          ? [signal, deadline, endpoint.lifetime.signal]
          : [signal, deadline]
      ),
      expiresAtMs,
    });
    return reply && { sessionId, endpointId, message: reply };
  }

  desktopToolsReplyGuard(
    reply: NativeDesktopToolReply,
    value?: unknown,
    browserNegotiated = false
  ) {
    const request = this.desktopToolRequest(value, browserNegotiated);
    const browserScope = request?.scope?.browser === true;
    const call = browserScope && NativeDesktopTools.isCall(request.message);
    const browserCall =
      call &&
      DesktopBrowserMcp.hasDefinition(
        NativeDesktopTools.toolName(request.message)
      );
    return () => {
      if (!("result" in reply.message)) return;
      const endpoint = this.current(reply.sessionId, reply.endpointId);
      if (browserCall) {
        const reason = !endpoint?.browser?.ready()
          ? "owner_revoked"
          : request.expiresAtMs <= Date.now()
            ? "canceled"
            : undefined;
        if (reason)
          return {
            ...reply,
            message: DesktopBrowserMcp.revokeReply(reply.message, reason),
          };
      }
      if (!endpoint || (browserScope && !call && !endpoint.browser?.ready()))
        return {
          ...reply,
          message: NativeDesktopTools.unverified(reply.message.id),
        };
    };
  }

  private desktopToolRequest(value: unknown, browserNegotiated: boolean) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const { sessionId, endpointId, message, scope, timeoutMs, expiresAtMs } =
      value as Record<string, unknown>;
    if (
      !Object.keys(value).every((key) =>
        [
          "sessionId",
          "endpointId",
          "message",
          "scope",
          "timeoutMs",
          "expiresAtMs",
        ].includes(key)
      ) ||
      typeof sessionId !== "string" ||
      !SESSION_ID.test(sessionId) ||
      typeof endpointId !== "string" ||
      !ENDPOINT_ID.test(endpointId) ||
      !Object.hasOwn(value, "message") ||
      typeof timeoutMs !== "number" ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 120_000 ||
      typeof expiresAtMs !== "number" ||
      !Number.isSafeInteger(expiresAtMs) ||
      expiresAtMs < 1
    )
      return null;
    const scoped = scope as Record<string, unknown> | undefined;
    if (
      scope !== undefined &&
      (!scoped ||
        typeof scoped !== "object" ||
        Array.isArray(scoped) ||
        !Object.keys(scoped).every(
          (key) =>
            key === "svgTargetId" ||
            key === "presentation" ||
            key === "contextId" ||
            key === "browser"
        ) ||
        (Object.hasOwn(scoped, "svgTargetId") &&
          !NativeEditorSvgText.isId(scoped.svgTargetId)) ||
        (Object.hasOwn(scoped, "contextId") &&
          !NativeEditorSvgText.isId(scoped.contextId)) ||
        (Object.hasOwn(scoped, "browser") &&
          (!browserNegotiated || scoped.browser !== true)) ||
        (Object.hasOwn(scoped, "presentation") && scoped.presentation !== true))
    )
      return null;
    return {
      sessionId,
      endpointId,
      message,
      timeoutMs,
      expiresAtMs,
      scope: scoped as
        | Readonly<{
            svgTargetId?: string;
            presentation?: true;
            contextId?: string;
            browser?: true;
          }>
        | undefined,
    };
  }

  open(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const { sessionId, endpointId, callId, path } = value as Record<
      string,
      unknown
    >;
    if (
      Object.keys(value).length !== 4 ||
      typeof sessionId !== "string" ||
      !SESSION_ID.test(sessionId) ||
      typeof endpointId !== "string" ||
      !ENDPOINT_ID.test(endpointId) ||
      typeof callId !== "string" ||
      !ENDPOINT_ID.test(callId) ||
      !NativeEditorSurfaces.isPath(path)
    )
      return null;
    return {
      sessionId,
      endpointId,
      callId,
      requested: this.requestPresentation(
        sessionId,
        endpointId,
        callId,
        path,
        Date.now() + PRESENTATION_WINDOW_MS
      ),
    };
  }

  private requestPresentation(
    sessionId: string,
    endpointId: string,
    callId: string,
    path: string,
    expiresAtMs: number
  ): boolean {
    const endpoint = this.current(sessionId, endpointId);
    if (!endpoint || expiresAtMs <= Date.now()) return false;
    const previous = endpoint.calls.get(callId);
    if (previous) return previous.path === path && previous.requested;
    if (endpoint.calls.size >= MAX_PRESENTATION_CALLS) return false;

    const receipt = { path, requested: false };
    endpoint.calls.set(callId, receipt);
    if (!endpoint.deliver || endpoint.revision === undefined) return false;
    try {
      endpoint.deliver({
        path,
        revision: endpoint.revision,
        expiresAtMs: Math.min(expiresAtMs, Date.now() + PRESENTATION_WINDOW_MS),
      });
      receipt.requested = true;
    } catch {
      // The exact frame can disappear before Electron accepts the send.
    }
    return receipt.requested;
  }

  private current(sessionId: string, endpointId: string): Endpoint | undefined {
    const endpoint = this.endpoints.get(endpointId);
    if (endpoint?.sessionId !== sessionId) return;
    try {
      endpoint.requireCurrent();
      return endpoint;
    } catch {
      this.release(endpointId);
    }
  }

  private release(endpointId: string): void {
    const endpoint = this.endpoints.get(endpointId);
    this.endpoints.delete(endpointId);
    endpoint?.lifetime.abort();
    endpoint?.browser?.close();
  }

  close(): void {
    for (const id of this.endpoints.keys()) this.release(id);
    this.contexts.clear();
    this.targetContexts.clear();
  }
}

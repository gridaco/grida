// GRIDA-SEC-004 — editor observations belong to one exact chat attachment.
import { randomUUID } from "node:crypto";
import {
  NativeEditorSurfaces,
  NativeEditorSvgText,
  type NativeEditorSurfaceOpen,
  type NativeEditorSurfaceSnapshot,
} from "@grida/desktop-bridge";
import { DesktopArtifactPresentation } from "./desktop-artifact-presentation";
import type { DesktopBrowserToolLease } from "./desktop-browser-tools";
import { DesktopSelectedSvgText } from "./desktop-selected-svg-text";
import { DesktopWorkbenchInventory } from "./desktop-workbench-inventory";
import { NativeDesktopTools } from "./native-desktop-tools";

const MAX_ENDPOINTS = 32;
const MAX_PRESENTATION_CALLS = 64;
const PRESENTATION_WINDOW_MS = 2000;
const SESSION_ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const ENDPOINT_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export type NativeEditorSurfaceLease = Readonly<{
  selection(editorSvgTargetId?: string): NativeEditorSurfaceSelection;
  update(snapshot: NativeEditorSurfaceSnapshot, revision?: number): void;
  close(): void;
}>;

export type NativeEditorSurfaceSelection = Readonly<{
  editorEndpointId: string;
  editorPresentation?: true;
  editorSvgTargetId?: string;
  editorBrowserTools?: true;
}>;

export type NativeEditorSurfaceDelivery = (
  request: NativeEditorSurfaceOpen
) => void;
export type NativeEditorSvgTextDelivery = DesktopSelectedSvgText.Delivery;

type Endpoint = {
  sessionId: string;
  snapshot: NativeEditorSurfaceSnapshot;
  requireCurrent(): void;
  revision?: number;
  deliver?: NativeEditorSurfaceDelivery;
  svgText?: NativeEditorSvgTextDelivery;
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
  static readonly browserCapability = "co.grida/session/browser-tools";
  static readonly browserMethod = "_co.grida/editor/browser-tool";

  private readonly endpoints = new Map<string, Endpoint>();

  register(
    sessionId: string,
    snapshot: NativeEditorSurfaceSnapshot,
    requireCurrent: () => void,
    deliver?: NativeEditorSurfaceDelivery,
    revision?: number,
    svgText?: NativeEditorSvgTextDelivery,
    browser?: DesktopBrowserToolLease
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
      browser,
      lifetime: new AbortController(),
      calls: new Map(),
    };
    this.endpoints.set(id, endpoint);
    return Object.freeze({
      selection: (editorSvgTargetId?: string) => ({
        editorEndpointId: id,
        ...(this.endpoints.get(id) === endpoint &&
          endpoint.deliver &&
          endpoint.revision !== undefined && {
            editorPresentation: true as const,
          }),
        ...(editorSvgTargetId &&
          this.endpoints.get(id) === endpoint &&
          endpoint.svgText && { editorSvgTargetId }),
        ...(this.endpoints.get(id) === endpoint &&
          endpoint.browser?.ready() && {
            editorBrowserTools: true as const,
          }),
      }),
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

  desktopToolsBusy(value: unknown): NativeDesktopToolReply | null {
    const request = this.desktopToolRequest(value);
    if (!request) return null;
    const { sessionId, endpointId, message } = request;
    const reply = NativeDesktopTools.busy(message);
    return reply && { sessionId, endpointId, message: reply };
  }

  async desktopTools(
    value: unknown,
    signal: AbortSignal
  ): Promise<NativeDesktopToolReply | null> {
    const request = this.desktopToolRequest(value);
    if (!request) return null;
    const { sessionId, endpointId, scope, message, timeoutMs } = request;
    const now = Date.now();
    // Transit through the private pipe consumes the original tool deadline.
    const expiresAtMs = Math.min(request.expiresAtMs, now + timeoutMs);
    const deadline = AbortSignal.timeout(Math.max(0, expiresAtMs - now));
    const endpoint = this.current(sessionId, endpointId);
    const tools = endpoint && [
      DesktopWorkbenchInventory.bind(endpoint.snapshot),
    ];
    if (
      endpoint &&
      tools &&
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

  desktopToolsReplyGuard(reply: NativeDesktopToolReply) {
    return () =>
      "result" in reply.message &&
      !this.current(reply.sessionId, reply.endpointId)
        ? { ...reply, message: NativeDesktopTools.unverified(reply.message.id) }
        : undefined;
  }

  private desktopToolRequest(value: unknown) {
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
          (key) => key === "svgTargetId" || key === "presentation"
        ) ||
        (Object.hasOwn(scoped, "svgTargetId") &&
          !NativeEditorSvgText.isId(scoped.svgTargetId)) ||
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
        | Readonly<{ svgTargetId?: string; presentation?: true }>
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
  }
}

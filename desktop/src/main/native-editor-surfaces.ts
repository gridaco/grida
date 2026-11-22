// GRIDA-SEC-004 — editor observations belong to one exact chat attachment.
import { createHash, randomUUID } from "node:crypto";
import {
  NativeEditorSelection,
  NativeEditorSurfaces,
  NativeEditorSvgSelection,
  NativeEditorSvgText,
  type NativeEditorSurfaceOpen,
  type NativeEditorSurfaceSnapshot,
} from "@grida/desktop-bridge";
import browserExtension from "../../../extensions/browser/extension.json";
import fxExtension from "../../../extensions/desktop-fx/extension.json";
import { DesktopArtifactPresentation } from "./desktop-artifact-presentation";
import { DesktopBrowserMcp } from "./desktop-browser-mcp";
import type { DesktopBrowserToolLease } from "./desktop-browser-tools";
import { DesktopSelectedSvgSelection } from "./desktop-selected-svg-selection";
import { DesktopSelectedSvgText } from "./desktop-selected-svg-text";
import { DesktopWorkbenchInventory } from "./desktop-workbench-inventory";
import { DesktopWorkbenchTools } from "./desktop-workbench-tools";
import {
  NativeDesktopToolSources,
  type DesktopToolSource,
} from "./native-desktop-tool-sources";
import { NativeDesktopTools } from "./native-desktop-tools";

const BUNDLED_EXTENSION_IDS = new Set([browserExtension.id, fxExtension.id]);
const MAX_ENDPOINTS = 32;
const MAX_PRESENTATION_CALLS = 64;
const MAX_EDITOR_TOOL_CONTEXTS = 1024;
const PRESENTATION_WINDOW_MS = 2000;
const SESSION_ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const ENDPOINT_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export type NativeEditorSurfaceLease = Readonly<{
  selection(
    editorSvgTargetId?: string,
    context?: EditorToolCapture
  ): NativeEditorSurfaceSelection;
  update(snapshot: NativeEditorSurfaceSnapshot, revision?: number): void;
  registerToolSource(source: DesktopToolSource): { close(): void };
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

type ToolScope = Readonly<{
  svgTargetId?: string;
  presentation?: true;
  contextId?: string;
  browser?: true;
  sources?: true;
  workbenchPaths?: true;
}>;

type ScopedTools = Readonly<{ scope?: ToolScope; call: boolean }>;

type EditorToolCapture = Readonly<{
  targetId: string;
  inputId: string;
  subject?: NativeEditorSelection.Subject;
}>;

type PresentationReceipt = {
  path: string;
  requested: boolean;
  explicitFocus: boolean;
  focused?: boolean;
};

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
  sources: NativeDesktopToolSources<ScopedTools>;
  workbench?: DesktopWorkbenchTools;
  calls: Map<string, PresentationReceipt>;
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
    {
      endpointId: string;
      targetId: string;
      tab: string | null;
      subject?: NativeEditorSelection.Subject;
      supportsText: boolean;
      staleAtAdmission: boolean;
    }
  >();
  private readonly targetContexts = new Map<string, string>();

  constructor(private readonly workspaceRoot?: string) {}

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
      sources: new NativeDesktopToolSources(BUNDLED_EXTENSION_IDS),
      workbench: this.workspaceRoot
        ? new DesktopWorkbenchTools(this.workspaceRoot, snapshot)
        : undefined,
      calls: new Map(),
    };
    endpoint.sources.registerBuiltin(
      "workbench",
      "List and show tabs or files in the attached Desktop workbench and operate on eligible editor selections.",
      (grant) => this.editorTools(id, endpoint, grant, "workbench")
    );
    endpoint.sources.registerBuiltin(
      browserExtension.id,
      browserExtension.description,
      (grant) => this.editorTools(id, endpoint, grant, "browser")
    );
    this.endpoints.set(id, endpoint);
    return Object.freeze({
      selection: (editorSvgTargetId?: string, context?: EditorToolCapture) => {
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
            endpoint.svgText &&
            !context?.subject &&
            endpoint.snapshot.selection?.kind !== "document" && {
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
        endpoint.workbench?.update(next);
        endpoint.revision = revision;
      },
      registerToolSource: (source: DesktopToolSource) => {
        if (!this.current(sessionId, id))
          throw new Error("editor_surface_endpoint_unavailable");
        return endpoint.sources.register(source);
      },
      close: () => {
        this.release(id);
      },
    });
  }

  private bindContext(
    sessionId: string,
    endpointId: string,
    { targetId, inputId, subject }: EditorToolCapture
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
        (previous.endpointId !== endpointId &&
          this.endpoints.has(previous.endpointId)) ||
        (subject &&
          !NativeEditorSelection.sameSubject(subject, previous.subject))
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
    const published = activeSelection(endpoint.snapshot);
    this.contexts.set(contextId, {
      endpointId,
      targetId,
      tab: endpoint.snapshot.active,
      subject: subject ?? published,
      supportsText:
        endpoint.snapshot.selection?.kind === "svg" ||
        endpoint.snapshot.activeSvg !== undefined,
      staleAtAdmission:
        subject !== undefined &&
        !NativeEditorSelection.sameSubject(subject, published),
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
    const result =
      endpoint?.svgText && endpoint.snapshot.selection?.kind !== "document"
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
      return {
        sessionId,
        endpointId,
        available: true,
        ...DesktopWorkbenchInventory.tabs(endpoint.snapshot),
      };
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
    browserNegotiated = false,
    sourcesNegotiated = false,
    workbenchPathsNegotiated = false
  ): NativeDesktopToolReply | null {
    const request = this.desktopToolRequest(
      value,
      browserNegotiated,
      sourcesNegotiated,
      workbenchPathsNegotiated
    );
    if (!request) return null;
    const { sessionId, endpointId, message, scope } = request;
    const reply = NativeDesktopTools.busy(message);
    if (!reply) return null;
    const binding = scope?.sources && NativeDesktopTools.toolSource(message);
    const unavailable =
      binding && !this.current(sessionId, endpointId)?.sources.current(binding);
    return {
      sessionId,
      endpointId,
      message: unavailable ? NativeDesktopTools.unavailable(reply.id) : reply,
    };
  }

  async desktopTools(
    value: unknown,
    signal: AbortSignal,
    browserNegotiated = false,
    sourcesNegotiated = false,
    workbenchPathsNegotiated = false
  ): Promise<NativeDesktopToolReply | null> {
    const request = this.desktopToolRequest(
      value,
      browserNegotiated,
      sourcesNegotiated,
      workbenchPathsNegotiated
    );
    if (!request) return null;
    const { sessionId, endpointId, scope, message, timeoutMs } = request;
    const now = Date.now();
    // Transit through the private pipe consumes the original tool deadline.
    const expiresAtMs = Math.min(request.expiresAtMs, now + timeoutMs);
    const deadline = AbortSignal.timeout(Math.max(0, expiresAtMs - now));
    const endpoint = this.current(sessionId, endpointId);
    const call = NativeDesktopTools.isCall(message);
    const grant = { scope, call };
    const binding = scope?.sources
      ? NativeDesktopTools.toolSource(message)
      : undefined;
    const tools =
      endpoint && (!binding || endpoint.sources.current(binding))
        ? scope?.sources
          ? {
              sources: true as const,
              tools: endpoint.sources.tools(grant, binding),
            }
          : this.editorTools(endpointId, endpoint, grant)
        : undefined;
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

  private editorTools(
    endpointId: string,
    endpoint: Endpoint,
    { scope, call }: ScopedTools,
    source?: DesktopBrowserMcp.Source
  ): NativeDesktopTools.Tool[] {
    const browser = scope?.browser ? endpoint.browser : undefined;
    const canPresent =
      scope?.presentation === true &&
      endpoint.deliver !== undefined &&
      endpoint.revision !== undefined;
    const browserTools = () =>
      scope?.browser && (browser?.ready() || call)
        ? DesktopBrowserMcp.bind(browser, canPresent, source)
        : [];
    if (source === "browser") return browserTools();
    const modern = scope?.workbenchPaths === true;
    let tools: NativeDesktopTools.Tool[];
    if (modern) {
      tools =
        endpoint.workbench?.bind(
          browser,
          scope.browser === true,
          canPresent ? () => endpoint.revision : undefined,
          (path, call, revision, focus) =>
            this.requestPresentation(
              endpoint.sessionId,
              endpointId,
              call.id,
              path,
              call.expiresAtMs,
              revision,
              focus
            ) ?? { requested: false }
        ) ?? [];
      if (scope.browser)
        tools.push(
          ...browserTools().filter(
            (tool) => tool.definition.name === DesktopBrowserMcp.closeTabName
          )
        );
    } else {
      tools = scope?.browser
        ? browserTools()
        : [DesktopWorkbenchInventory.bind(endpoint.snapshot)];
      if (!scope?.browser && canPresent)
        tools.push(
          DesktopArtifactPresentation.bind(
            (path, callId, expiresAtMs) =>
              this.requestPresentation(
                endpoint.sessionId,
                endpointId,
                callId,
                path,
                expiresAtMs
              )?.requested ?? false
          )
        );
    }
    const context = scope?.contextId
      ? this.contexts.get(scope.contextId)
      : undefined;
    if (
      endpoint.svgText &&
      scope?.svgTargetId &&
      endpoint.snapshot.selection?.kind !== "document" &&
      context?.subject?.kind !== "document" &&
      !context?.supportsText
    )
      tools.push(
        ...DesktopSelectedSvgText.bind(scope.svgTargetId, endpoint.svgText)
      );
    const svgSelection = endpoint.svgSelection;
    if (svgSelection && scope?.contextId) {
      if (context?.endpointId === endpointId && context.subject) {
        const { subject, tab, supportsText, targetId, staleAtAdmission } =
          context;
        const matchesView = () =>
          !staleAtAdmission &&
          endpoint.snapshot.active === tab &&
          NativeEditorSelection.sameSubject(
            activeSelection(endpoint.snapshot),
            subject
          );
        tools.push(
          ...DesktopSelectedSvgSelection.bind(
            targetId,
            async (request, signal) => {
              if (!matchesView()) return { kind: "stale" };
              const result = await svgSelection(
                { ...request, path: subject.path, subject },
                signal
              );
              if (
                "path" in result &&
                (result.path !== subject.path || !matchesView())
              )
                throw new Error("native_chat_svg_selection_unverified");
              return result;
            },
            { subject, supportsText }
          )
        );
      } else if (call)
        // A retained catalog may call after its live capture was retired.
        // Deny it through the domain result and keep it out of discovery.
        tools.push(
          ...DesktopSelectedSvgSelection.bind(
            context?.targetId ?? scope.contextId,
            async () => ({ kind: "stale" }),
            {
              subject: context?.subject,
              supportsText: context?.supportsText ?? !scope.svgTargetId,
            }
          )
        );
    }
    return scope?.sources && !scope.browser && !modern
      ? tools.map((tool) => {
          const name =
            tool.definition.name === "surface_list_open"
              ? "workbench_list_tabs"
              : tool.definition.name === "surface_open"
                ? "workbench_show"
                : tool.definition.name;
          return name === tool.definition.name
            ? tool
            : { ...tool, definition: { ...tool.definition, name } };
        })
      : tools;
  }

  desktopToolsReplyGuard(
    reply: NativeDesktopToolReply,
    value?: unknown,
    browserNegotiated = false,
    sourcesNegotiated = false,
    workbenchPathsNegotiated = false
  ) {
    const request = this.desktopToolRequest(
      value,
      browserNegotiated,
      sourcesNegotiated,
      workbenchPathsNegotiated
    );
    const browserScope = request?.scope?.browser === true;
    const call = NativeDesktopTools.isCall(request?.message);
    const binding =
      request?.scope?.sources && call
        ? NativeDesktopTools.toolSource(request.message)
        : undefined;
    let catalog = request?.scope?.sources && !call ? reply.message : undefined;
    const modern = request?.scope?.workbenchPaths === true;
    const name = NativeDesktopTools.toolName(request?.message);
    const args = NativeDesktopTools.toolArguments(request?.message);
    const target = args?.target as { kind?: unknown } | undefined;
    const data =
      "result" in reply.message
        ? (reply.message.result.structuredContent as
            | Record<string, unknown>
            | undefined)
        : undefined;
    const browserCall =
      browserScope &&
      call &&
      DesktopBrowserMcp.hasDefinition(name) &&
      (!modern ||
        (name !== DesktopWorkbenchTools.listName &&
          (name !== DesktopWorkbenchTools.showName ||
            args?.presentation === "focus" ||
            target?.kind === "url" ||
            (target?.kind === "tab" && typeof data?.path !== "string"))));
    const mixedList =
      modern &&
      name === DesktopWorkbenchTools.listName &&
      Array.isArray(data?.tabs) &&
      data.tabs.some((tab) => tab.kind === "browser");
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
      if (
        !endpoint ||
        (binding && !endpoint.sources.current(binding)) ||
        (!catalog && browserScope && !call && !endpoint.browser?.ready())
      )
        return {
          ...reply,
          message: NativeDesktopTools.unverified(reply.message.id),
        };
      if (mixedList && !endpoint.browser?.ready())
        return {
          ...reply,
          message: NativeDesktopTools.unverified(reply.message.id),
        };
      if (catalog) {
        const browserReady = !browserScope || endpoint.browser?.ready();
        catalog = NativeDesktopTools.filterCatalog(
          catalog,
          (name, source) =>
            endpoint.sources.current(source) &&
            (browserReady === true ||
              (modern &&
                (name === DesktopWorkbenchTools.listName ||
                  name === DesktopWorkbenchTools.showName)) ||
              !DesktopBrowserMcp.hasDefinition(name))
        );
        if (catalog !== reply.message) return { ...reply, message: catalog };
      }
    };
  }

  private desktopToolRequest(
    value: unknown,
    browserNegotiated: boolean,
    sourcesNegotiated: boolean,
    workbenchPathsNegotiated: boolean
  ) {
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
            key === "browser" ||
            key === "sources" ||
            key === "workbenchPaths"
        ) ||
        (Object.hasOwn(scoped, "svgTargetId") &&
          !NativeEditorSvgText.isId(scoped.svgTargetId)) ||
        (Object.hasOwn(scoped, "contextId") &&
          !NativeEditorSvgSelection.isId(scoped.contextId)) ||
        (Object.hasOwn(scoped, "browser") &&
          (!browserNegotiated || scoped.browser !== true)) ||
        (Object.hasOwn(scoped, "sources") &&
          (!sourcesNegotiated || scoped.sources !== true)) ||
        (Object.hasOwn(scoped, "workbenchPaths") &&
          (!workbenchPathsNegotiated ||
            scoped.workbenchPaths !== true ||
            scoped.sources !== true)) ||
        (Object.hasOwn(scoped, "presentation") && scoped.presentation !== true))
    )
      return null;
    return {
      sessionId,
      endpointId,
      message,
      timeoutMs,
      expiresAtMs,
      scope: scoped as ToolScope | undefined,
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
      requested:
        this.requestPresentation(
          sessionId,
          endpointId,
          callId,
          path,
          Date.now() + PRESENTATION_WINDOW_MS
        )?.requested ?? false,
    };
  }

  private requestPresentation(
    sessionId: string,
    endpointId: string,
    callId: string,
    path: string,
    expiresAtMs: number,
    revision?: number,
    focus?: () => boolean
  ): PresentationReceipt | undefined {
    const endpoint = this.current(sessionId, endpointId);
    if (!endpoint || expiresAtMs <= Date.now()) return;
    const previous = endpoint.calls.get(callId);
    if (previous)
      return previous.path === path && previous.explicitFocus === Boolean(focus)
        ? previous
        : undefined;
    if (endpoint.calls.size >= MAX_PRESENTATION_CALLS) return;

    const receipt: PresentationReceipt = {
      path,
      requested: false,
      explicitFocus: Boolean(focus),
    };
    // A refused call stays refused if presentation becomes available later.
    endpoint.calls.set(callId, receipt);
    if (
      !endpoint.deliver ||
      endpoint.revision === undefined ||
      (revision !== undefined && endpoint.revision !== revision)
    )
      return receipt;
    try {
      endpoint.deliver({
        path,
        revision: endpoint.revision,
        expiresAtMs: Math.min(expiresAtMs, Date.now() + PRESENTATION_WINDOW_MS),
      });
      receipt.requested = true;
      if (focus) receipt.focused = focus();
    } catch {
      // The exact frame can disappear before Electron accepts the send.
    }
    return receipt;
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
    endpoint?.sources.close();
    endpoint?.browser?.close();
  }

  close(): void {
    for (const id of this.endpoints.keys()) this.release(id);
    this.contexts.clear();
    this.targetContexts.clear();
  }
}

function activeSelection(
  snapshot: NativeEditorSurfaceSnapshot
): NativeEditorSelection.Subject | undefined {
  if (snapshot.selection) return snapshot.selection;
  // Earlier renderers published the SVG itself as the active tab.
  const path = snapshot.activeSvg ?? snapshot.active;
  if (NativeEditorSurfaces.isSvgPath(path)) return { kind: "svg", path };
}

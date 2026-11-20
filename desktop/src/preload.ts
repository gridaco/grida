// GRIDA-GG: desktop — install the `gg` bridge namespace (docs/wg/platform/hosted-ai.md)
// GRIDA-SEC-008 — expose only secret-free native-provider operations.
/**
 * GRIDA-SEC-004 — Desktop services-sidecar trust boundary (renderer side).
 *
 * Exposes `window.grida` via `contextBridge` **only when** the page
 * pathname is `/desktop` or starts with `/desktop/`. Without this scope, any XSS on
 * grida.co — a marketing page, a blog comment, a user-uploaded SVG
 * preview — that ends up rendered inside the Electron window would
 * see the bridge and reach the agent server.
 *
 * Path-check is fail-closed at preload-run time. `contextBridge.exposeInMainWorld`
 * has no revocation API, so navigation after exposure is guarded in
 * `desktop/src/window.ts`.
 *
 * See /SECURITY.md `GRIDA-SEC-004`.
 */

import { contextBridge, ipcRenderer, webUtils } from "electron";
import { MediaTransport } from "@grida/ai-host/media-transport";
import { FileReferenceRequest } from "./bridge/file-reference-request";
import { SelectedImageRequest } from "./bridge/selected-image-request";
import { NativeChatInvoke } from "./bridge/native-chat-invoke";
import { catalogWorkspaceId } from "./bridge/chat-catalog-route";
import {
  DesktopBrowser,
  NativeEditorSurfaces,
  NativeEditorSvgSelection,
  NativeEditorSvgText,
  type NativeEditorSurfaceOpen,
} from "@grida/desktop-bridge";
import {
  DESKTOP_BRIDGE_PROTOCOL,
  IPC_CHANNELS,
  NATIVE_DOCUMENT_ARGUMENT,
  NATIVE_DOCUMENT_CHAT_ARGUMENT,
  NATIVE_WORKSPACE_CHAT_ARGUMENT,
  type ConfirmOptions,
  type DesktopBridge,
  type DesktopHostAppInfo,
  type HandshakeResponse,
  type NavigationState,
  type NativeChatUpdate,
  type OpenDialogOptions,
  type SaveDialogOptions,
  type TerminalCreateOptions,
  type TerminalHandlers,
  type WorkspaceChangeEvent,
  type WorkspaceChangeHandler,
} from "./bridge/contract";

const DESKTOP_PATH_ROOT = "/desktop";
const DESKTOP_PATH_PREFIX = `${DESKTOP_PATH_ROOT}/`;

function getCliArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

const appVersion = getCliArg("grida-version") ?? "0.0.0";
const appPlatform = process.platform;
const nativeDocumentId = getCliArg(NATIVE_DOCUMENT_ARGUMENT);
const nativeDocumentChatId = getCliArg(NATIVE_DOCUMENT_CHAT_ARGUMENT);
const nativeWorkspaceChatOnly =
  getCliArg(NATIVE_WORKSPACE_CHAT_ARGUMENT) === "1";

function isDesktopPath(pathname: string): boolean {
  return (
    pathname === DESKTOP_PATH_ROOT || pathname.startsWith(DESKTOP_PATH_PREFIX)
  );
}

const mediaServiceFetch: MediaTransport.Fetcher = async (path, init) => {
  // GRIDA-SEC-004 — fetch fresh connection info for every request.
  // The sidecar can restart on a new port with a new password; caching
  // `{port,password}` in preload would make the next renderer call leak
  // stale Authorization to whatever process later binds the old port.
  const info = (await ipcRenderer.invoke(IPC_CHANNELS.AGENT_SERVER_INFO)) as {
    port: number;
    password: string;
  };
  const fetcher = MediaTransport.makeFetcher({
    port: info.port,
    password: info.password,
  });
  return await fetcher(path, init);
};

const mediaClient = new MediaTransport.Client({ fetcher: mediaServiceFetch });

const nativeChatInvoke = (channel: string, ...args: unknown[]) =>
  NativeChatInvoke.invoke(
    (name, ...input) => ipcRenderer.invoke(name, ...input),
    channel,
    ...args
  );

const nativeChatHandlers = new Map<
  string,
  {
    attachmentId: string;
    onUpdate: (update: NativeChatUpdate) => void;
  }
>();
const nativeEditorHandlers = new Map<
  string,
  {
    href: string;
    open(request: NativeEditorSurfaceOpen, isCurrent: () => boolean): void;
  }
>();
const nativeSvgTextHandlers = new Map<
  string,
  {
    href: string;
    invoke(request: NativeEditorSvgText.Request): NativeEditorSvgText.Result;
  }
>();
const nativeSvgSelectionHandlers = new Map<
  string,
  {
    href: string;
    invoke(
      request: NativeEditorSvgSelection.Request
    ): NativeEditorSvgSelection.Result;
  }
>();

function clearNativeChatDelivery(): void {
  nativeChatHandlers.clear();
  nativeEditorHandlers.clear();
  nativeSvgTextHandlers.clear();
  nativeSvgSelectionHandlers.clear();
}

/** Stop delivering anything for an attachment this frame is giving up. */
function forgetNativeChatAttachment(attachmentId: string): void {
  nativeEditorHandlers.delete(attachmentId);
  nativeSvgTextHandlers.delete(attachmentId);
  nativeSvgSelectionHandlers.delete(attachmentId);
  for (const [id, subscriber] of nativeChatHandlers) {
    if (subscriber.attachmentId === attachmentId) nativeChatHandlers.delete(id);
  }
}

async function observeChatCatalog(
  scope: { workspaceId?: string },
  onChanged: () => void
) {
  const token = crypto.randomUUID();
  const notify = (_event: Electron.IpcRendererEvent, id: unknown) => {
    if (id === token) onChanged();
  };
  ipcRenderer.on(IPC_CHANNELS.CHAT_CATALOG_CHANGED, notify);
  try {
    if (
      await ipcRenderer.invoke(IPC_CHANNELS.CHAT_CATALOG_OBSERVE, token, scope)
    ) {
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CHAT_CATALOG_CHANGED, notify);
        void ipcRenderer
          .invoke(IPC_CHANNELS.CHAT_CATALOG_UNOBSERVE, token)
          .catch(() => {});
      };
    }
    ipcRenderer.removeListener(IPC_CHANNELS.CHAT_CATALOG_CHANGED, notify);
    return null;
  } catch (error) {
    ipcRenderer.removeListener(IPC_CHANNELS.CHAT_CATALOG_CHANGED, notify);
    throw error;
  }
}

function selectedDocumentRoute(): boolean {
  const params = new URLSearchParams(location.search);
  return (
    nativeDocumentId !== undefined &&
    location.pathname === "/desktop/file" &&
    !location.hash &&
    params.size === 1 &&
    params.get("docId") === nativeDocumentId
  );
}

function selectedDocumentChatRoute(): boolean {
  return (
    nativeDocumentChatId !== undefined &&
    nativeDocumentChatId === nativeDocumentId &&
    selectedDocumentRoute()
  );
}

function liveSvgRoute(): boolean {
  if (location.pathname === "/desktop/workspace" || selectedDocumentChatRoute())
    return true;
  const params = new URLSearchParams(location.search);
  return (
    location.pathname === "/desktop/file" &&
    !location.hash &&
    /^[a-f0-9]{16}$/.test(params.get("id") ?? "") &&
    (params.size === 1 || (params.size === 2 && !!params.get("path")))
  );
}

listenForSvgCall(
  IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT,
  IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT_RESULT,
  nativeSvgTextHandlers,
  NativeEditorSvgText.operation,
  NativeEditorSvgText.result
);
listenForSvgCall(
  IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_SELECTION,
  IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_SELECTION_RESULT,
  nativeSvgSelectionHandlers,
  NativeEditorSvgSelection.operation,
  NativeEditorSvgSelection.result
);

function listenForSvgCall<Operation, Result>(
  channel: string,
  resultChannel: string,
  handlers: ReadonlyMap<
    string,
    {
      href: string;
      invoke(request: {
        targetId: string;
        expiresAtMs: number;
        operation: Operation;
      }): Result;
    }
  >,
  parseOperation: (value: unknown) => Operation | undefined,
  parseResult: (value: unknown) => Result | undefined
): void {
  ipcRenderer.on(channel, (_event, value: unknown) => {
    if (!liveSvgRoute() || !value || typeof value !== "object") return;
    const { attachmentId, callId, targetId, expiresAtMs, operation } =
      value as Record<string, unknown>;
    const action = parseOperation(operation);
    if (
      !NativeEditorSvgText.isId(attachmentId) ||
      !NativeEditorSvgText.isId(callId) ||
      !NativeEditorSvgText.isId(targetId) ||
      typeof expiresAtMs !== "number" ||
      !Number.isSafeInteger(expiresAtMs) ||
      !action
    )
      return;
    const handler = handlers.get(attachmentId);
    try {
      const result =
        handler?.href === location.href && Date.now() < expiresAtMs
          ? parseResult(
              handler.invoke({ targetId, expiresAtMs, operation: action })
            )
          : { kind: "unavailable" };
      if (result)
        void ipcRenderer
          .invoke(resultChannel, attachmentId, callId, result)
          .catch(() => {});
    } catch {
      // An exception after dispatch is unverified. Do not send a false receipt.
    }
  });
}

ipcRenderer.on(
  IPC_CHANNELS.NATIVE_CHAT_EDITOR_SURFACE_OPEN,
  (_event, value: unknown) => {
    if (
      location.pathname !== "/desktop/workspace" ||
      !value ||
      typeof value !== "object"
    )
      return;
    const { attachmentId, path, revision, expiresAtMs } = value as Record<
      string,
      unknown
    >;
    if (
      typeof attachmentId !== "string" ||
      !NativeEditorSurfaces.isPath(path) ||
      typeof revision !== "number" ||
      !Number.isSafeInteger(revision) ||
      revision < 1 ||
      typeof expiresAtMs !== "number" ||
      !Number.isSafeInteger(expiresAtMs) ||
      expiresAtMs <= Date.now()
    )
      return;
    const handler = nativeEditorHandlers.get(attachmentId);
    if (!handler || handler.href !== location.href) return;
    const isCurrent = () =>
      nativeEditorHandlers.get(attachmentId) === handler &&
      handler.href === location.href;
    try {
      handler.open({ path, revision, expiresAtMs }, isCurrent);
    } catch {
      // Presentation is auxiliary and belongs to the subscribed workbench.
    }
  }
);

ipcRenderer.on(
  IPC_CHANNELS.NATIVE_CHAT_UPDATE,
  (
    _event,
    payload: {
      subscriptionId: string;
      attachmentId: string;
      update: NativeChatUpdate;
    }
  ) => {
    if (
      location.pathname !== "/desktop/workspace" &&
      location.pathname !== "/desktop/file"
    )
      return;
    const subscriber = nativeChatHandlers.get(payload.subscriptionId);
    if (!subscriber || subscriber.attachmentId !== payload.attachmentId) return;
    if (payload.update.kind === "closed")
      nativeChatHandlers.delete(payload.subscriptionId);
    try {
      subscriber.onUpdate(payload.update);
    } catch {
      /* Consumers own their updates. */
    }
  }
);

async function handshake(): Promise<HandshakeResponse> {
  const response = await mediaClient.handshake();
  return {
    ...response,
    capabilities: {
      ...response.capabilities,
      files: response.capabilities.files || selectedDocumentRoute(),
      recent: true,
      workspaces: true,
    },
  };
}

/**
 * Per-window nav-history subscribers. The preload registers a single
 * `ipcRenderer.on` for `WINDOW_NAVIGATION_CHANGED` and fans out to
 * every React `useNavigationState()` consumer in this renderer.
 *
 * GRIDA-SEC-004 — the Electron event object is intentionally NOT
 * forwarded to subscribers; only the structured-clone-safe payload
 * crosses the contextBridge boundary (callbacks with `IpcRendererEvent`
 * arguments would leak Node primitives like `sender` into the renderer
 * realm, per Doyensec's preload analysis).
 */
const navigationListeners = new Set<(state: NavigationState) => void>();
ipcRenderer.on(
  IPC_CHANNELS.WINDOW_NAVIGATION_CHANGED,
  (_event, payload: NavigationState) => {
    for (const listener of navigationListeners) {
      try {
        listener(payload);
      } catch {
        // Defensive — a misbehaving consumer shouldn't break dispatch
        // for the rest. The error is intentionally swallowed; consumers
        // own their try/catch boundaries.
      }
    }
  }
);

ipcRenderer.on(IPC_CHANNELS.WORKSPACE_COMMAND, (_event, command: unknown) => {
  if (!isDesktopPath(location.pathname)) return;
  window.dispatchEvent(
    new CustomEvent(IPC_CHANNELS.WORKSPACE_COMMAND, { detail: command })
  );
});

// Main → renderer "bring this session into view" wake (RFC `events`
// §click-to-attend): a notification click focused this window; the agent
// pane takes the staged target through its guarded read. Nothing crosses,
// never the Electron event object (GRIDA-SEC-004).
ipcRenderer.on(IPC_CHANNELS.AGENT_FOCUS_SESSION, () => {
  if (!isDesktopPath(location.pathname)) return;
  window.dispatchEvent(new Event(IPC_CHANNELS.AGENT_FOCUS_SESSION));
});

/**
 * Per-terminal handler fanout for the PTY host's push channels. The
 * preload mints each terminal id and registers its handlers here
 * BEFORE invoking TERMINAL_CREATE, so the shell's first output frame
 * (emitted as soon as the PTY spawns) can never race the subscription.
 * Same payload-only discipline as the other `ipcRenderer.on` fanouts —
 * the Electron event object never crosses the contextBridge
 * (GRIDA-SEC-004).
 */
const terminalHandlers = new Map<string, TerminalHandlers>();
ipcRenderer.on(
  IPC_CHANNELS.TERMINAL_DATA,
  (_event, payload: { id: string; data: string }) => {
    terminalHandlers.get(payload.id)?.on_data(payload.data);
  }
);
ipcRenderer.on(
  IPC_CHANNELS.TERMINAL_EXIT,
  (_event, payload: { id: string; exit_code: number }) => {
    const handlers = terminalHandlers.get(payload.id);
    terminalHandlers.delete(payload.id);
    handlers?.on_exit({ exit_code: payload.exit_code });
  }
);

/**
 * Workspace file-change fanout. Same payload-only discipline
 * as the terminal fanout: one module-level `ipcRenderer.on` routes each
 * pushed batch to the renderer-supplied handler by subscription id; the
 * Electron event object never crosses the contextBridge (GRIDA-SEC-004).
 * The handler is registered under a preload-minted id BEFORE the
 * SUBSCRIBE_CHANGES invoke, so no early event can race the subscription.
 */
const workspaceChangeHandlers = new Map<string, WorkspaceChangeHandler>();
ipcRenderer.on(
  IPC_CHANNELS.WORKSPACE_CHANGE,
  (
    _event,
    payload: { subscription_id: string; events: WorkspaceChangeEvent[] }
  ) => {
    workspaceChangeHandlers.get(payload.subscription_id)?.(payload.events);
  }
);

function installDesktopNavigationGuard(): void {
  const assertAllowed = (url: string | URL | null | undefined) => {
    if (url === null || url === undefined) return;
    const next = new URL(String(url), window.location.href);
    if (
      next.origin === window.location.origin &&
      !isDesktopPath(next.pathname)
    ) {
      throw new Error(
        `[grida] blocked desktop bridge navigation to ${next.pathname}`
      );
    }
  };

  const pushState = window.history.pushState.bind(window.history);
  window.history.pushState = (data, unused, url) => {
    assertAllowed(url);
    const before = window.location.href;
    pushState(data, unused, url);
    if (window.location.href !== before) clearNativeChatDelivery();
  };

  const replaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data, unused, url) => {
    assertAllowed(url);
    const before = window.location.href;
    replaceState(data, unused, url);
    if (window.location.href !== before) clearNativeChatDelivery();
  };

  window.addEventListener("popstate", () => {
    clearNativeChatDelivery();
    if (!isDesktopPath(window.location.pathname)) {
      window.location.replace("/desktop/welcome");
    }
  });
  window.addEventListener("pagehide", clearNativeChatDelivery);
  window.addEventListener("hashchange", clearNativeChatDelivery);
}

// GRIDA-SEC-016 — only the shell preload exposes browser controls. Guest
// contents are constructed without any preload or additional native arguments.
const browserHandlers = new Set<(event: DesktopBrowser.Event) => void>();
ipcRenderer.on(IPC_CHANNELS.BROWSER_CHANGED, (_event, raw: unknown) => {
  const event = DesktopBrowser.parseEvent(raw);
  if (event) for (const handler of browserHandlers) handler(event);
});
window.addEventListener("pagehide", () => browserHandlers.clear());
const browserPresentationHandlers = new Set<
  (request: DesktopBrowser.Presentation) => void
>();
ipcRenderer.on(IPC_CHANNELS.BROWSER_PRESENT_PAGE, (_event, raw: unknown) => {
  const request = DesktopBrowser.parsePresentation(raw);
  if (request)
    for (const handler of browserPresentationHandlers) handler(request);
});
const automationFileHandlers = new Set<
  (request: { path: string; expiresAtMs: number }) => void
>();
ipcRenderer.on(
  IPC_CHANNELS.WORKSPACE_OPEN_AUTOMATION_FILE,
  (_event, raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const { path, expiresAtMs } = raw as Record<string, unknown>;
    if (
      Object.keys(raw).length !== 2 ||
      !NativeEditorSurfaces.isPath(path) ||
      typeof expiresAtMs !== "number" ||
      !Number.isSafeInteger(expiresAtMs) ||
      expiresAtMs <= Date.now()
    )
      return;
    for (const handler of automationFileHandlers)
      handler({ path, expiresAtMs });
  }
);
window.addEventListener("pagehide", () => {
  browserPresentationHandlers.clear();
  automationFileHandlers.clear();
});
const historyHandlers = new Set<
  (change: DesktopBrowser.History.Change) => void
>();
ipcRenderer.on(IPC_CHANNELS.BROWSER_HISTORY_CHANGED, (_event, raw: unknown) => {
  const change = DesktopBrowser.History.parseChange(raw);
  if (change) for (const handler of historyHandlers) handler(change);
});
window.addEventListener("pagehide", () => historyHandlers.clear());

const bridge: DesktopBridge = {
  protocol: DESKTOP_BRIDGE_PROTOCOL,
  app: { version: appVersion, platform: appPlatform },
  caps: {
    media: { tripo: true, rigging: true, tripo_gg: true, rigging_gg: true },
    native: {
      host_apps: true,
      // Native-OS surfaces — always present in a desktop build.
      window: true,
      dialog: true,
      // Native shell helpers only: external URLs, Finder/Explorer reveal,
      // and File -> path resolution. Command execution is agent-host-internal
      // for V1, not a public renderer bridge capability.
      shell: true,
      // Human-interactive terminal pane (GRIDA-SEC-004) — distinct from
      // `shell` above and from the agent's sandboxed `exec_command`.
      terminal: true,
      // Workspace file-change watcher.
      workspace_watch: true,
      browser: true,
    },
  },

  handshake,

  browser: {
    version: DesktopBrowser.VERSION,
    presentation: "webview",
    utilities: {
      version: DesktopBrowser.Utilities.VERSION,
      find: (request) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_FIND, request),
      stopFind: (request) =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_STOP_FIND, request),
      getZoom: (request) =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_GET_ZOOM, request),
      setZoom: (request) =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SET_ZOOM, request),
      print: (request) =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PRINT, request),
      inspect: (request) =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_INSPECT, request),
    },
    management: {
      version: DesktopBrowser.Management.VERSION,
      clearHistory: () =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CLEAR_HISTORY),
      clearCache: () => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CLEAR_CACHE),
      resetPermissions: () =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_RESET_PERMISSIONS),
      downloadPreferences: () =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_DOWNLOAD_PREFERENCES),
      setDownloadPrompt: (request) =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SET_DOWNLOAD_PROMPT, request),
      chooseDownloadDirectory: () =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CHOOSE_DOWNLOAD_DIRECTORY),
      openPage: (request) =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_OPEN_PAGE, request),
    },
    history: {
      version: DesktopBrowser.History.VERSION,
      query: (request) =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_HISTORY_QUERY, request),
      remove: (request) =>
        ipcRenderer.invoke(IPC_CHANNELS.BROWSER_HISTORY_REMOVE, request),
      subscribe: (handler) => {
        historyHandlers.add(handler);
        return () => {
          historyHandlers.delete(handler);
        };
      },
    },
    attach: (workspaceId) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_ATTACH, workspaceId),
    thumbnail: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_THUMBNAIL, request),
    favicon: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_FAVICON, request),
    snapshot: (attachmentId) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SNAPSHOT, attachmentId),
    detach: (attachmentId) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_DETACH, attachmentId),
    create: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CREATE, request),
    navigate: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_NAVIGATE, request),
    back: (request) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_BACK, request),
    forward: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_FORWARD, request),
    reload: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_RELOAD, request),
    stop: (request) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_STOP, request),
    focus: (request) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_FOCUS, request),
    reserveMount: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_RESERVE_MOUNT, request),
    setActive: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SET_ACTIVE, request),
    close: (request) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CLOSE, request),
    openExternal: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_OPEN_EXTERNAL, request),
    clearBrowsingData: () =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CLEAR_BROWSING_DATA),
    subscribe: (handler) => {
      browserHandlers.add(handler);
      return () => {
        browserHandlers.delete(handler);
      };
    },
    subscribePresentation: (handler) => {
      browserPresentationHandlers.add(handler);
      return () => {
        browserPresentationHandlers.delete(handler);
      };
    },
  },

  hooks: {
    inspect: () => ipcRenderer.invoke(IPC_CHANNELS.GLOBAL_HOOKS_INSPECT),
    reload: () => ipcRenderer.invoke(IPC_CHANNELS.GLOBAL_HOOKS_RELOAD),
    review: (id, revision) =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOBAL_HOOKS_REVIEW, id, revision),
    open_config: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOBAL_HOOKS_OPEN_CONFIG),
  },
  nativeExternalAgent: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.NATIVE_EXTERNAL_STATUS),
    start: (id, text) =>
      ipcRenderer.invoke(IPC_CHANNELS.NATIVE_EXTERNAL_START, id, text),
    stop: (id) => ipcRenderer.invoke(IPC_CHANNELS.NATIVE_EXTERNAL_STOP, id),
  },

  nativeChat: {
    deck: true,
    nestedDeck: true,
    deckSvgText: true,
    ...(selectedDocumentChatRoute()
      ? { document: true as const }
      : nativeWorkspaceChatOnly && { documentUnavailable: true as const }),
    status: (start) => nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_STATUS, start),
    startWorkspaceChat: (preferred) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_START_WORKSPACE, preferred),
    takeNotificationFocus: async () => {
      if (location.pathname !== "/desktop/workspace") return null;
      const href = location.href;
      const target = await nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_TAKE_NOTIFICATION_FOCUS
      );
      return location.href === href ? target : null;
    },
    list: (cursor) => nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_LIST, cursor),
    ...((location.pathname === "/desktop/workspace" ||
      location.pathname === "/desktop/welcome") && {
      acceptsAutomaticApprovalReview: () =>
        nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_AUTOMATIC_REVIEW),
    }),
    acceptsPermissionMode: () =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_PERMISSION_MODE),
    permissionMode: (attachmentId) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_PERMISSION_MODE, attachmentId),
    reviewPermissionMode: (attachmentId, revision, requestId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_REVIEW_PERMISSION_MODE,
        attachmentId,
        revision,
        requestId
      ),
    setPermissionMode: (attachmentId, revision, requestId, mode, review) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_SET_PERMISSION_MODE,
        attachmentId,
        revision,
        requestId,
        mode,
        review
      ),
    selection: (target) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_SELECTION, target),
    updateSelection: (target, revision, operationId, choice) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_UPDATE_SELECTION,
        target,
        revision,
        operationId,
        choice
      ),
    createFromDraft: (draftId) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_CREATE_FROM_DRAFT, draftId),
    ...(!selectedDocumentChatRoute() && {
      profiles: () => nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_PROFILES),
      welcomeProfiles: () =>
        nativeChatInvoke(IPC_CHANNELS.WELCOME_CHAT_PROFILES),
      welcomeFullAccessAcrossPresets: true as const,
      prepareWelcomeAutomaticReview: (workspaceId) =>
        nativeChatInvoke(
          IPC_CHANNELS.WELCOME_CHAT_PREPARE_AUTOMATIC_REVIEW,
          workspaceId
        ),
      prepareWelcomeFullAccess: (workspaceId) =>
        nativeChatInvoke(
          IPC_CHANNELS.WELCOME_CHAT_PREPARE_FULL_ACCESS,
          workspaceId
        ),
      answerWelcomeFullAccess: (reviewId, confirmed) =>
        nativeChatInvoke(
          IPC_CHANNELS.WELCOME_CHAT_ANSWER_FULL_ACCESS,
          reviewId,
          confirmed
        ),
      startWelcomeFullAccess: (reviewId, request) =>
        nativeChatInvoke(
          IPC_CHANNELS.WELCOME_CHAT_START_FULL_ACCESS,
          reviewId,
          request
        ),
      selectProfile: (selection) =>
        nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_SELECT_PROFILE, selection),
    }),
    observeCatalog: (onChanged) => {
      const workspaceId = catalogWorkspaceId(location);
      return workspaceId
        ? observeChatCatalog({ workspaceId }, onChanged)
        : Promise.resolve(null);
    },
    canSetReadState: () => catalogWorkspaceId(location) !== null,
    setReadState: async (id, change) => {
      if (!catalogWorkspaceId(location))
        throw new Error("chat_catalog_unavailable");
      await nativeChatInvoke(IPC_CHANNELS.CHAT_CATALOG_READ, id, change);
    },
    listArchived: (cursor) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_LIST_ARCHIVED, cursor),
    catalogEntry: (attachmentId) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_CATALOG_ENTRY, attachmentId),
    organize: (attachmentId, change) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_ORGANIZE, attachmentId, change),
    undoArchive: (receipt) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_UNDO_ARCHIVE, receipt),
    deleteSavedChat: (attachmentId, observationId, catalogRevision) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_DELETE,
        attachmentId,
        observationId,
        catalogRevision
      ),
    commands: (attachmentId) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_COMMANDS, attachmentId),
    runCommand: (attachmentId, command, requestId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_RUN_COMMAND,
        attachmentId,
        command,
        requestId
      ),
    prepareRevision: (attachmentId, observationId, messageId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_PREPARE_REVISION,
        attachmentId,
        observationId,
        messageId
      ),
    revise: (attachmentId, input) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_REVISE, attachmentId, input),
    subagentActivity: (attachmentId, afterChildId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_SUBAGENT_ACTIVITY,
        attachmentId,
        afterChildId
      ),
    subagentConversation: (attachmentId, childId, before) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_SUBAGENT_CONVERSATION,
        attachmentId,
        childId,
        before
      ),
    listSubagents: (attachmentId, afterChildId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_LIST_SUBAGENTS,
        attachmentId,
        afterChildId
      ),
    inspectSubagent: (attachmentId, childId, inputId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_INSPECT_SUBAGENT,
        attachmentId,
        childId,
        inputId
      ),
    createSubagent: (attachmentId, input) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_CREATE_SUBAGENT,
        attachmentId,
        input
      ),
    assignSubagent: (attachmentId, input) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_ASSIGN_SUBAGENT,
        attachmentId,
        input
      ),
    stopSubagent: (attachmentId, stopObservationId, requestId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_STOP_SUBAGENT,
        attachmentId,
        stopObservationId,
        requestId
      ),
    controlSubagentTurn: (attachmentId, observationId, requestId, control) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_CONTROL_SUBAGENT_TURN,
        attachmentId,
        observationId,
        requestId,
        control
      ),
    controlSubagentChild: (attachmentId, observationId, requestId, control) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_CONTROL_SUBAGENT_CHILD,
        attachmentId,
        observationId,
        requestId,
        control
      ),
    create: () => nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_CREATE),
    load: (sessionId) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_LOAD, sessionId),
    openSideChat: (attachmentId) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_OPEN_SIDE, attachmentId),
    closeSideChat: async (sideAttachmentId) => {
      forgetNativeChatAttachment(sideAttachmentId);
      await nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_CLOSE_SIDE,
        sideAttachmentId
      );
    },
    detach: async (attachmentId) => {
      forgetNativeChatAttachment(attachmentId);
      await nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_DETACH, attachmentId);
    },
    publishEditorSurfaces: (attachmentId, snapshot, revision) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_PUBLISH_EDITOR_SURFACES,
        attachmentId,
        snapshot,
        nativeEditorHandlers.get(attachmentId)?.href === location.href
          ? revision
          : undefined
      ),
    ...(!selectedDocumentChatRoute() && {
      onEditorSurfaceOpen: (attachmentId, open) => {
        if (
          location.pathname !== "/desktop/workspace" ||
          !/^[a-f0-9-]{36}$/.test(attachmentId) ||
          typeof open !== "function" ||
          nativeEditorHandlers.has(attachmentId) ||
          nativeEditorHandlers.size >= 16
        )
          throw new Error("native_chat_editor_presentation_unavailable");
        const handler = { href: location.href, open };
        nativeEditorHandlers.set(attachmentId, handler);
        return () => {
          if (nativeEditorHandlers.get(attachmentId) === handler)
            nativeEditorHandlers.delete(attachmentId);
        };
      },
    }),
    onEditorSvgText: (attachmentId, invoke) => {
      if (
        !NativeEditorSvgText.isId(attachmentId) ||
        typeof invoke !== "function" ||
        nativeSvgTextHandlers.has(attachmentId) ||
        nativeSvgTextHandlers.size >= 16 ||
        !liveSvgRoute()
      )
        throw new Error("native_chat_svg_text_unavailable");
      const handler = { href: location.href, invoke };
      nativeSvgTextHandlers.set(attachmentId, handler);
      return () => {
        if (nativeSvgTextHandlers.get(attachmentId) === handler)
          nativeSvgTextHandlers.delete(attachmentId);
      };
    },
    onEditorSvgSelection: (attachmentId, invoke) => {
      if (
        !NativeEditorSvgSelection.isId(attachmentId) ||
        typeof invoke !== "function" ||
        nativeSvgSelectionHandlers.has(attachmentId) ||
        nativeSvgSelectionHandlers.size >= 16 ||
        !liveSvgRoute()
      )
        throw new Error("native_chat_svg_selection_unavailable");
      const handler = { href: location.href, invoke };
      nativeSvgSelectionHandlers.set(attachmentId, handler);
      return () => {
        if (nativeSvgSelectionHandlers.get(attachmentId) === handler)
          nativeSvgSelectionHandlers.delete(attachmentId);
      };
    },
    submit: (attachmentId, inputId, text) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_SUBMIT,
        attachmentId,
        inputId,
        text
      ),
    captureEditorContext: () =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_CAPTURE_EDITOR_CONTEXT),
    submitMessage: (attachmentId, input) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_SUBMIT_MESSAGE,
        attachmentId,
        input
      ),
    submitInRegime: (
      action,
      attachmentId,
      inputId,
      text,
      operatingRegime,
      effort,
      editorSvgTargetId,
      selectionRevision,
      editorContextId,
      editorToolContextId
    ) =>
      nativeChatInvoke(
        action === "enqueue"
          ? IPC_CHANNELS.NATIVE_CHAT_ENQUEUE
          : IPC_CHANNELS.NATIVE_CHAT_SUBMIT,
        attachmentId,
        inputId,
        text,
        operatingRegime,
        ...(editorToolContextId !== undefined
          ? [
              effort,
              editorSvgTargetId,
              selectionRevision,
              editorContextId,
              editorToolContextId,
            ]
          : editorContextId !== undefined
            ? [effort, editorSvgTargetId, selectionRevision, editorContextId]
            : selectionRevision !== undefined
              ? [effort, editorSvgTargetId, selectionRevision]
              : editorSvgTargetId !== undefined
                ? [effort, editorSvgTargetId]
                : effort === undefined
                  ? []
                  : [effort])
      ),
    enqueue: (attachmentId, inputId, text) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_ENQUEUE,
        attachmentId,
        inputId,
        text
      ),
    inputReceipt: (attachmentId, inputId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_INPUT_RECEIPT,
        attachmentId,
        inputId
      ),
    observe: (attachmentId) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_OBSERVE, attachmentId),
    setPresented: (attachmentId, visible) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_SET_PRESENTED,
        attachmentId,
        visible
      ),
    acceptsEffort: () =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_EFFORT),
    acceptsGoalEffort: () =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_GOAL_EFFORT),
    acceptsBackgroundProcesses: () =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_BACKGROUND_PROCESSES),
    backgroundProcesses: (attachmentId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_BACKGROUND_PROCESSES,
        attachmentId
      ),
    stopBackgroundProcesses: (attachmentId, processIds) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_STOP_BACKGROUND_PROCESSES,
        attachmentId,
        ...(processIds === undefined ? [] : [[...processIds]])
      ),
    acceptsPng: (attachmentId) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_PNG, attachmentId),
    acceptsLibrarySelection: () =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_LIBRARY_SELECTION),
    submitWithLibrarySelection: (
      attachmentId,
      inputId,
      text,
      operatingRegime,
      effort,
      selectionRevision,
      editorContextId
    ) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_SUBMIT_LIBRARY_SELECTION,
        attachmentId,
        inputId,
        text,
        operatingRegime,
        effort,
        ...(editorContextId !== undefined
          ? [selectionRevision, editorContextId]
          : selectionRevision === undefined
            ? []
            : [selectionRevision])
      ),
    acceptsFile: () => nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_FILE),
    ...(!selectedDocumentChatRoute() && {
      inspectHooks: (attachmentId?: string) =>
        nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_HOOKS, attachmentId),
    }),
    submitImage: (attachmentId, input) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_SUBMIT_IMAGE,
        attachmentId,
        input
      ),
    acceptsSelectedImage: (attachmentId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_SELECTED_IMAGE,
        attachmentId
      ),
    submitSelectedImage: async (attachmentId, input) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_SUBMIT_SELECTED_IMAGE,
        attachmentId,
        await SelectedImageRequest.from(input, (file) =>
          webUtils.getPathForFile(file)
        )
      ),
    submitFile: (attachmentId, input) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_SUBMIT_FILE,
        attachmentId,
        input
      ),
    acceptsFileReference: () =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_FILE_REFERENCE),
    // Main in this binary accepts folders too; the worker uses the same
    // metadata-only reference contract. Older Main binaries omit this method.
    acceptsDirectoryReference: () =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_FILE_REFERENCE),
    // GRIDA-SEC-004 — the path is resolved here from the person's File and
    // never returned to the page; Main validates it again.
    canReferenceFile: (file) =>
      FileReferenceRequest.available(file, (each) =>
        webUtils.getPathForFile(each)
      ),
    submitFileReference: async (attachmentId, input) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_SUBMIT_FILE_REFERENCE,
        attachmentId,
        FileReferenceRequest.from(input, (each) =>
          webUtils.getPathForFile(each)
        )
      ),
    turnSummary: (
      attachmentId,
      observationId,
      refreshGatewayAttempt,
      childBillingAfter
    ) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_TURN_SUMMARY,
        attachmentId,
        observationId,
        refreshGatewayAttempt,
        childBillingAfter
      ),
    readAttachmentPreview: (attachmentId, previewId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_READ_ATTACHMENT_PREVIEW,
        attachmentId,
        previewId
      ),
    readToolImage: (attachmentId, previewId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_READ_TOOL_IMAGE,
        attachmentId,
        previewId
      ),
    readArtifact: (attachmentId, observationId, artifactId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_READ_ARTIFACT,
        attachmentId,
        observationId,
        artifactId
      ),
    saveArtifact: (attachmentId, observationId, artifactId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_SAVE_ARTIFACT,
        attachmentId,
        observationId,
        artifactId
      ),
    acceptsQueuedTextReplacement: () =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_QUEUED_TEXT_REPLACEMENT
      ),
    queue: (attachmentId, observationId, offset) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_QUEUE,
        attachmentId,
        observationId,
        offset
      ),
    queuedText: (attachmentId, observationId, inputId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_QUEUED_TEXT,
        attachmentId,
        observationId,
        inputId
      ),
    queuedMessage: (attachmentId, observationId, inputId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_QUEUED_MESSAGE,
        attachmentId,
        observationId,
        inputId
      ),
    readQueuedAttachmentPreview: (
      attachmentId,
      observationId,
      inputId,
      previewId
    ) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_READ_QUEUED_ATTACHMENT_PREVIEW,
        attachmentId,
        observationId,
        inputId,
        previewId
      ),
    editQueue: (attachmentId, change) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_EDIT_QUEUE,
        attachmentId,
        change
      ),
    steer: (attachmentId, input) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_STEER, attachmentId, input),
    goal: (attachmentId, observationId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_GOAL,
        attachmentId,
        observationId
      ),
    startGoal: (attachmentId, inputId, request) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_START_GOAL,
        attachmentId,
        inputId,
        request
      ),
    controlGoal: (attachmentId, change) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_CONTROL_GOAL,
        attachmentId,
        change
      ),
    approvals: (attachmentId, observationId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_APPROVALS,
        attachmentId,
        observationId
      ),
    answerApproval: (attachmentId, reviewId, decision) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_ANSWER_APPROVAL,
        attachmentId,
        reviewId,
        decision
      ),
    questions: (attachmentId, observationId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_QUESTIONS,
        attachmentId,
        observationId
      ),
    answerQuestion: (attachmentId, reviewId, answer) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_ANSWER_QUESTION,
        attachmentId,
        reviewId,
        answer
      ),
    librarySelections: (attachmentId, observationId) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_LIBRARY_SELECTIONS,
        attachmentId,
        observationId
      ),
    answerLibrarySelection: (attachmentId, reviewId, answer) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_ANSWER_LIBRARY_SELECTION,
        attachmentId,
        reviewId,
        answer
      ),
    transcript: (attachmentId) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_TRANSCRIPT, attachmentId),
    transcriptPage: (attachmentId, before) =>
      nativeChatInvoke(
        IPC_CHANNELS.NATIVE_CHAT_TRANSCRIPT_PAGE,
        attachmentId,
        before
      ),
    control: (attachmentId, control) =>
      nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_CONTROL, attachmentId, control),
    subscribe: async (attachmentId, onUpdate) => {
      if (nativeChatHandlers.size >= 8)
        throw new Error("native_chat_subscription_limit");
      const id = crypto.randomUUID();
      nativeChatHandlers.set(id, { attachmentId, onUpdate });
      try {
        await nativeChatInvoke(
          IPC_CHANNELS.NATIVE_CHAT_SUBSCRIBE,
          attachmentId,
          id
        );
        return id;
      } catch (error) {
        nativeChatHandlers.delete(id);
        throw error;
      }
    },
    unsubscribe: async (id) => {
      nativeChatHandlers.delete(id);
      await nativeChatInvoke(IPC_CHANNELS.NATIVE_CHAT_UNSUBSCRIBE, id);
    },
  },

  archives: {
    list: (cursor) =>
      ipcRenderer.invoke(IPC_CHANNELS.ARCHIVES_LIST, cursor ?? null),
    unarchive: (id, revision) =>
      ipcRenderer.invoke(IPC_CHANNELS.ARCHIVES_UNARCHIVE, id, revision),
    openRestored: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.ARCHIVES_OPEN_RESTORED, id),
  },

  chatCatalog: {
    observe: observeChatCatalog,
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_CATALOG_LIST, query),
  },

  account: {
    sign_out: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_SIGN_OUT),
  },

  // GRIDA-SEC-004 — onboarding gets two purpose-scoped main-process
  // operations, never the daemon connection tuple or a generic dialog.
  onboarding: {
    get_default_workspace: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_WORKSPACE_DEFAULT),
    choose_workspace: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_WORKSPACE_CHOOSE),
  },

  window: {
    set_document_edited: (edited) =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_DOCUMENT_EDITED, edited),
    set_represented_filename: (filePath) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WINDOW_SET_REPRESENTED_FILENAME,
        filePath
      ),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
    open_settings: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_OPEN_SETTINGS),
    complete_onboarding: (workspaceId) =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_COMPLETE_ONBOARDING, workspaceId),
    navigation: {
      state: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_NAVIGATION_STATE),
      subscribe: (cb) => {
        navigationListeners.add(cb);
        return () => {
          navigationListeners.delete(cb);
        };
      },
      back: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_NAVIGATION_BACK),
      forward: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_NAVIGATION_FORWARD),
    },
  },

  dialog: {
    confirm: (opts: ConfirmOptions) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_CONFIRM, opts),
    open: (opts: OpenDialogOptions) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN, opts),
    save_as: (opts: SaveDialogOptions) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SAVE_AS, opts),
  },

  shell: {
    open_external: (url) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url),
    show_item_in_folder: (filePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, filePath),
    // Synchronous — `webUtils.getPathForFile` is itself sync, and the
    // File object must reach this function with its internal path tag
    // intact. The proxy `contextBridge` builds preserves that for live
    // File refs (a structured-clone copy would lose it).
    get_path_for_file: (file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        // No resolvable path (in-memory Blob, etc).
        return "";
      }
    },
  },

  files: {
    read: (docId) =>
      nativeDocumentId !== undefined
        ? ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_READ, docId)
        : mediaClient.files.read(docId),
    write: (docId, content) =>
      nativeDocumentId !== undefined
        ? ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_WRITE, docId, content)
        : mediaClient.files.write(docId, content),
  },

  recent: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.RECENT_LIST),
    touch: (filePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.RECENT_TOUCH, filePath),
    pin: (filePath, pinned) =>
      ipcRenderer.invoke(IPC_CHANNELS.RECENT_PIN, filePath, pinned),
    forget: (filePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.RECENT_FORGET, filePath),
  },

  // GRIDA-SEC-004 — app-managed media stays behind purpose-scoped native IPC.
  // The renderer receives opaque ids, path-free descriptors, and bytes only;
  // unlike generation and workspace APIs, none of these calls use daemon HTTP.
  media: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_LIST),
    read: (id) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_READ, id),
    save_copy: (id) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_SAVE_COPY, id),
    reveal: async (id) => {
      await ipcRenderer.invoke(IPC_CHANNELS.MEDIA_REVEAL, id);
    },
    open_folder: async () => {
      await ipcRenderer.invoke(IPC_CHANNELS.MEDIA_OPEN_FOLDER);
    },
  },

  workspaces: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST),
    publish_editor_surfaces: (snapshot) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_PUBLISH_EDITOR_SURFACES,
        snapshot
      ),
    automation: {
      version: 1,
      publish: (snapshot, activePageId) =>
        ipcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_PUBLISH_AUTOMATION_SURFACES,
          snapshot,
          activePageId
        ),
      onOpenFile: (handler) => {
        automationFileHandlers.add(handler);
        return () => {
          automationFileHandlers.delete(handler);
        };
      },
    },
    prepareFxFile: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PREPARE_FX_FILE, request),
    resolveFxPreview: (entry) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER_RESOLVE_FX_PREVIEW, entry),
    choose: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CHOOSE),
    open: (rootPath) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REOPEN, rootPath),
    create: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, input?.name),
    pin: async (id, pinned) => {
      await ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_PIN, id, pinned);
    },
    forget: async (id) => {
      await ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_FORGET, id);
    },
    readdir: (workspaceId, relPath) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_READ,
        workspaceId,
        relPath ?? "",
        "directory"
      ),
    read_file: (workspaceId, relPath) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_READ,
        workspaceId,
        relPath,
        "text"
      ),
    read_svg_document: (workspaceId, relPath) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_READ,
        workspaceId,
        relPath,
        "svg-document"
      ),
    read_file_bytes: (workspaceId, relPath) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_READ,
        workspaceId,
        relPath,
        "bytes"
      ),
    // The streamable media `src` for the read-only viewer, so large media is
    // not inlined as base64. Pure string build: a `grida-workspace://` URL
    // the main-process protocol handler resolves by proxying to the
    // sidecar's streamed `/workspaces/file` route.
    // No credentials cross into the renderer (GRIDA-SEC-004). Constant host +
    // both ids in the path so host canonicalization can't lowercase the id;
    // keep in lockstep with `main/workspace-media-protocol.ts`.
    media_url: (workspaceId, relPath) =>
      `grida-workspace://workspace/${encodeURIComponent(workspaceId)}/${relPath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    write_file: (workspaceId, relPath, content, expectedMtime) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_WRITE,
        workspaceId,
        relPath,
        content,
        expectedMtime
      ),
    // Unlike its siblings, trash is a native host capability rather than
    // a services-sidecar operation: it routes to the main process (which
    // re-validates workspace containment) and calls `shell.trashItem`.
    trash_entry: (workspaceId, relPath) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_TRASH_ENTRY, {
        workspace_id: workspaceId,
        rel_path: relPath,
      }) as Promise<void>,
    subscribe_changes: async (workspaceId, onChange) => {
      // Caller-mints-id (cf. terminal.create): register the handler under
      // a preload-minted id before the invoke so no pushed event can land
      // before the subscription exists.
      const id = crypto.randomUUID();
      workspaceChangeHandlers.set(id, onChange);
      try {
        await ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SUBSCRIBE_CHANGES, {
          id,
          workspace_id: workspaceId,
        });
      } catch (err) {
        workspaceChangeHandlers.delete(id);
        throw err;
      }
      return { subscription_id: id };
    },
    unsubscribe_changes: async (subscriptionId) => {
      workspaceChangeHandlers.delete(subscriptionId);
      await ipcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_UNSUBSCRIBE_CHANGES,
        subscriptionId
      );
    },
  },

  terminal: {
    create: async (opts: TerminalCreateOptions, handlers: TerminalHandlers) => {
      // Caller-mints-id (cf. sessions.enqueue): registering the handlers
      // under a preload-minted id before the invoke means no PTY output
      // frame can be emitted before the subscription exists.
      const id = crypto.randomUUID();
      terminalHandlers.set(id, handlers);
      try {
        await ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CREATE, {
          id,
          workspace_id: opts.workspace_id,
          cols: opts.cols,
          rows: opts.rows,
        });
      } catch (err) {
        terminalHandlers.delete(id);
        throw err;
      }
      return { id };
    },
    write: (id: string, data: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_WRITE, { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESIZE, { id, cols, rows }),
    kill: async (id: string) => {
      terminalHandlers.delete(id);
      await ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_KILL, id);
    },
  },

  host_apps: {
    resolve_preferred: ({
      workspace_id: workspaceId,
      preferred_apps: preferredApps,
    }) =>
      ipcRenderer.invoke(IPC_CHANNELS.HOST_APPS_RESOLVE_PREFERRED, {
        workspace_id: workspaceId,
        preferred_apps: preferredApps,
      }) as Promise<DesktopHostAppInfo[]>,
    open_workspace: async ({ workspace_id: workspaceId, app_id: appId }) => {
      await ipcRenderer.invoke(IPC_CHANNELS.HOST_APPS_OPEN_WORKSPACE, {
        workspace_id: workspaceId,
        app_id: appId,
      });
    },
  },

  secrets: {
    has: (providerId) => mediaClient.secrets.has(providerId),
    set: async (providerId, key) => {
      await mediaClient.secrets.set(providerId, key);
    },
    delete: async (providerId) => {
      await mediaClient.secrets.delete(providerId);
    },
  },

  providers: {
    gg_models: () => mediaClient.providers.gg_models(),
    list_endpoints: () => mediaClient.providers.list_endpoints(),
    set_endpoint: async (config) => {
      await ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_ENDPOINT_SET, config);
    },
    endpoint_authorization: (id, baseUrl) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.PROVIDER_ENDPOINT_AUTHORIZATION,
        id,
        baseUrl
      ),
    update_endpoint_models: async (update) => {
      await ipcRenderer.invoke(
        IPC_CHANNELS.PROVIDER_ENDPOINT_UPDATE_MODELS,
        update
      );
    },
    delete_endpoint: async (id) => {
      await ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_ENDPOINT_DELETE, id);
    },
    info: () => mediaClient.providers.info(),
    probe_endpoint: (baseUrl) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_ENDPOINT_PROBE, baseUrl),
  },

  // GRIDA-SEC-006 — hosted-session custody push (renderer → sidecar).
  gg: {
    set_session: async (session) => {
      await mediaClient.gg.set_session(session);
    },
    clear_session: async () => {
      await mediaClient.gg.clear_session();
    },
    status: () => mediaClient.gg.status(),
  },

  // Native provider OAuth is main-owned. The renderer can start/cancel the
  // user gesture and read secret-free status, but never receives codes,
  // verifier/state values, or provider credentials.
  chatgpt: {
    connect: () => ipcRenderer.invoke(IPC_CHANNELS.CHATGPT_CONNECT),
    cancel: async () => {
      await ipcRenderer.invoke(IPC_CHANNELS.CHATGPT_CANCEL);
    },
    status: () => ipcRenderer.invoke(IPC_CHANNELS.CHATGPT_STATUS),
    sign_out: () => ipcRenderer.invoke(IPC_CHANNELS.CHATGPT_SIGN_OUT),
  },

  images: {
    generate: (req) => mediaClient.images.generate(req),
  },

  video: {
    generate: (req) => mediaClient.video.generate(req),
  },

  threeD: {
    generate: (req) => mediaClient.threeD.generate(req),
  },
  rigging: {
    check: (req) => mediaClient.rigging.check(req),
    generate: (req) => mediaClient.rigging.generate(req),
  },
  modelGeneration: {
    generate: (req) => mediaClient.modelGeneration.generate(req),
  },

  audio: {
    music: {
      generate: (req) => mediaClient.audio.music.generate(req),
    },
    soundEffects: {
      generate: (req) => mediaClient.audio.soundEffects.generate(req),
    },
    textToSpeech: {
      listVoices: () => mediaClient.audio.textToSpeech.listVoices(),
      generate: (req) => mediaClient.audio.textToSpeech.generate(req),
    },
  },
};

// On Electron 42+ `window.location` is populated at preload-run time;
// the bridge is installed synchronously when the URL is under
// `/desktop/*`. A pathname outside that prefix is the structural
// guarantee that XSS on the main grida.co marketing pages can't
// reach the agent server (`GRIDA-SEC-004`).
if (isDesktopPath(window.location.pathname)) {
  installDesktopNavigationGuard();
  contextBridge.exposeInMainWorld("grida", bridge);
}

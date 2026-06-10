/**
 * GRIDA-SEC-004 — Desktop agent-sidecar trust boundary (renderer side).
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
import { AgentTransport } from "@grida/agent/transport";
import type {
  AgentRunOptions,
  AgentUIMessageChunk,
  CreateSessionOptions,
  PatchSessionOptions,
  SessionListFilter,
} from "@grida/agent";
import {
  DESKTOP_BRIDGE_PROTOCOL,
  IPC_CHANNELS,
  type ConfirmOptions,
  type DesktopBridge,
  type DesktopHostAppInfo,
  type HandshakeResponse,
  type NavigationState,
  type OpenDialogOptions,
  type SaveDialogOptions,
  type TerminalCreateOptions,
  type TerminalHandlers,
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

function isDesktopPath(pathname: string): boolean {
  return (
    pathname === DESKTOP_PATH_ROOT || pathname.startsWith(DESKTOP_PATH_PREFIX)
  );
}

const agentServerFetch: AgentTransport.Fetcher = async (path, init) => {
  // GRIDA-SEC-004 — fetch fresh connection info for every request.
  // The sidecar can restart on a new port with a new password; caching
  // `{port,password}` in preload would make the next renderer call leak
  // stale Authorization to whatever process later binds the old port.
  const info = (await ipcRenderer.invoke(IPC_CHANNELS.AGENT_SERVER_INFO)) as {
    port: number;
    password: string;
  };
  const fetcher = AgentTransport.makeFetcher({
    port: info.port,
    password: info.password,
  });
  return await fetcher(path, init);
};

const agentClient = new AgentTransport.Client({ fetcher: agentServerFetch });

// One controller per active agent stream, keyed by sessionId. The
// AgentHost's StreamRegistry enforces one-run-per-session so a Map keyed
// by sessionId is enough — we don't need a separate streamId reverse-
// index. Fresh runs hold a UUID placeholder until the server's in-band
// `grida-session` frame yields the real id; the entry is then re-keyed.
const agentRuns = new Map<string, AbortController>();
// Long-lived session-status subscriptions, keyed by a per-subscription id so
// two subscribers to the same session never collide (cf. `agentRuns`, keyed by
// session). Each owns an AbortController that `unsubscribe_status` trips.
const statusSubs = new Map<string, AbortController>();

async function handshake(): Promise<HandshakeResponse> {
  return await agentClient.handshake();
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

// Main → renderer "bring this session into view" push (RFC `events`
// §click-to-attend): a notification click focused this window; the agent
// pane selects the named session. Same re-dispatch pattern as
// WORKSPACE_COMMAND — only the structured-clone payload crosses, never the
// Electron event object (GRIDA-SEC-004).
ipcRenderer.on(IPC_CHANNELS.AGENT_FOCUS_SESSION, (_event, payload: unknown) => {
  if (!isDesktopPath(location.pathname)) return;
  window.dispatchEvent(
    new CustomEvent(IPC_CHANNELS.AGENT_FOCUS_SESSION, { detail: payload })
  );
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
    return pushState(data, unused, url);
  };

  const replaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data, unused, url) => {
    assertAllowed(url);
    return replaceState(data, unused, url);
  };

  window.addEventListener("popstate", () => {
    if (!isDesktopPath(window.location.pathname)) {
      window.location.replace("/desktop/welcome");
    }
  });
}

/**
 * Open an agent SSE stream and fan out chunks to `onChunk`. Returns `null` only on the
 * reconnect path when the agent server has no in-flight run for the given
 * session — the caller falls back to DB hydration.
 *
 * Resolves with `{streamId, sessionId, done}`:
 *   - `streamId` is internal preload bookkeeping (today: equals the
 *     sessionId once the server echoes it; a UUID placeholder before
 *     that for fresh runs).
 *   - `done` resolves when upstream emits `[DONE]` or the socket
 *     closes cleanly; rejects on transport error; resolves on abort.
 *
 * **Why a hand-rolled SSE reader.** The browser's `EventSource` doesn't
 * support custom headers (we need `Authorization: Basic`) and can't
 * carry a request body. We use `fetch` + a manual line buffer on the
 * `ReadableStream<Uint8Array>` body. `TextDecoderStream` would be
 * cleaner but isn't reliably available across all Electron webContents.
 *
 * **Frame format**: standard AI SDK UI-message SSE —
 * `data: <UIMessageChunk JSON>\n\n`, then `data: [DONE]\n\n`.
 */
type AgentOpenSpec =
  | { kind: "run"; opts: AgentRunOptions }
  | { kind: "reconnect"; session_id: string; last_event_id: number };

async function openAgentStream(
  spec: AgentOpenSpec,
  onChunk: (chunk: AgentUIMessageChunk) => void
): Promise<{
  stream_id: string;
  session_id: string;
  done: Promise<void>;
} | null> {
  const placeholderKey =
    spec.kind === "reconnect" ? spec.session_id : crypto.randomUUID();
  const controller = new AbortController();
  agentRuns.set(placeholderKey, controller);

  let handle: AgentTransport.AgentStreamHandle | null;
  try {
    handle =
      spec.kind === "run"
        ? await agentClient.agent.run(spec.opts, onChunk, {
            signal: controller.signal,
          })
        : await agentClient.agent.reconnect(
            spec.session_id,
            spec.last_event_id,
            onChunk,
            { signal: controller.signal }
          );
  } catch (err) {
    agentRuns.delete(placeholderKey);
    throw err;
  }

  if (handle === null) {
    agentRuns.delete(placeholderKey);
    return null;
  }

  // Promote the registry key from the placeholder UUID to the real
  // session id once the server echoes it. `abort(sessionId)` can then
  // hit the controller in O(1) without scanning a reverse-index map.
  const sessionId =
    spec.kind === "reconnect" ? spec.session_id : handle.session_id;
  let runKey = placeholderKey;
  if (sessionId && sessionId !== placeholderKey) {
    agentRuns.delete(placeholderKey);
    agentRuns.set(sessionId, controller);
    runKey = sessionId;
  }

  const done = handle.done.finally(() => {
    agentRuns.delete(runKey);
  });

  return { stream_id: runKey, session_id: sessionId, done };
}

const bridge: DesktopBridge = {
  protocol: DESKTOP_BRIDGE_PROTOCOL,
  app: { version: appVersion, platform: appPlatform },
  caps: {
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
      // `shell` above and from the agent's sandboxed `run_command`.
      terminal: true,
    },
  },

  handshake,

  window: {
    set_document_edited: (edited) =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_DOCUMENT_EDITED, edited),
    set_represented_filename: (filePath) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WINDOW_SET_REPRESENTED_FILENAME,
        filePath
      ),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
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
    read: (docId) => agentClient.files.read(docId),
    write: (docId, content) => agentClient.files.write(docId, content),
  },

  recent: {
    list: () => agentClient.recent.list(),
    touch: async (filePath) => {
      await agentClient.recent.touch(filePath);
    },
    pin: async (filePath, pinned) => {
      await agentClient.recent.pin(filePath, pinned);
    },
    forget: async (filePath) => {
      await agentClient.recent.forget(filePath);
    },
  },

  workspaces: {
    list: () => agentClient.workspaces.list(),
    open: (rootPath) => agentClient.workspaces.open(rootPath),
    pin: async (id, pinned) => {
      await agentClient.workspaces.pin(id, pinned);
    },
    forget: async (id) => {
      await agentClient.workspaces.forget(id);
    },
    readdir: (workspaceId, relPath) =>
      agentClient.workspaces.readdir(workspaceId, relPath ?? ""),
    read_file: (workspaceId, relPath) =>
      agentClient.workspaces.read_file(workspaceId, relPath),
    read_file_bytes: (workspaceId, relPath) =>
      agentClient.workspaces.read_file_bytes(workspaceId, relPath),
    write_file: (workspaceId, relPath, content) =>
      agentClient.workspaces.write_file(workspaceId, relPath, content),
    // Unlike its siblings, trash is a native host capability rather than
    // an agent-sidecar operation: it routes to the main process (which
    // re-validates workspace containment) and calls `shell.trashItem`.
    trash_entry: (workspaceId, relPath) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_TRASH_ENTRY, {
        workspace_id: workspaceId,
        rel_path: relPath,
      }) as Promise<void>,
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
    has: (providerId) => agentClient.secrets.has(providerId),
    set: async (providerId, key) => {
      await agentClient.secrets.set(providerId, key);
    },
    delete: async (providerId) => {
      await agentClient.secrets.delete(providerId);
    },
  },

  agent: {
    run: (opts, onChunk) =>
      // Fresh runs always return a stream (only `reconnect` may return
      // null on 404); cast to the non-nullable shape DesktopBridge expects.
      openAgentStream({ kind: "run", opts }, onChunk) as Promise<{
        stream_id: string;
        session_id: string;
        done: Promise<void>;
      }>,
    abort: async (sessionId) => {
      await agentClient.agent.abort(sessionId);
      const controller = agentRuns.get(sessionId);
      if (controller) {
        agentRuns.delete(sessionId);
        controller.abort();
      }
    },
    reconnect: (sessionId, lastEventId, onChunk) =>
      openAgentStream(
        {
          kind: "reconnect",
          session_id: sessionId,
          last_event_id: lastEventId,
        },
        onChunk
      ),
  },

  sessions: {
    list: (filter?: SessionListFilter) => agentClient.sessions.list(filter),
    get: (id: string) => agentClient.sessions.get(id),
    create: (opts: CreateSessionOptions) => agentClient.sessions.create(opts),
    patch: (id: string, opts: PatchSessionOptions) =>
      agentClient.sessions.patch(id, opts),
    delete: (id: string) => agentClient.sessions.delete(id),
    list_messages: (id: string) => agentClient.sessions.list_messages(id),
    rewind: (id: string, fromMessageId: string, opts?: { restore?: boolean }) =>
      agentClient.sessions.rewind(id, fromMessageId, opts),
    fork: (
      id: string,
      fromMessageId: string,
      metadata?: Record<string, unknown>
    ) => agentClient.sessions.fork(id, fromMessageId, metadata),
    compact: (id: string) => agentClient.sessions.compact(id),
    enqueue: (id: string, message: { id?: string; text: string }) =>
      agentClient.sessions.enqueue(id, message),
    list_queued: (id: string) => agentClient.sessions.list_queued(id),
    cancel_queued: (id: string, messageId: string) =>
      agentClient.sessions.cancel_queued(id, messageId),
    subscribe_status: async (id, onStatus) => {
      const subscriptionId = crypto.randomUUID();
      const controller = new AbortController();
      statusSubs.set(subscriptionId, controller);
      const { done } = await agentClient.sessions.subscribe_status(
        id,
        onStatus,
        { signal: controller.signal }
      );
      return {
        subscription_id: subscriptionId,
        done: done.finally(() => {
          statusSubs.delete(subscriptionId);
        }),
      };
    },
    unsubscribe_status: async (subscriptionId) => {
      const controller = statusSubs.get(subscriptionId);
      if (controller) {
        statusSubs.delete(subscriptionId);
        controller.abort();
      }
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

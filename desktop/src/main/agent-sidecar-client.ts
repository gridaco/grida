/**
 * GRIDA-SEC-004 — main-process client for the agent sidecar.
 *
 * The renderer-side bridge (preload) is what the user-facing code calls.
 * This module is the **main process** equivalent — used by the open-file
 * flow (Finder double-click, deep-link, second-instance argv) to
 * register a path with the agent server BEFORE a BrowserWindow exists for it.
 *
 * Sequence for a Finder open:
 *
 *   1. Electron fires `open-file` (macOS) or argv contains the path
 *      (Win/Linux).
 *   2. Main process calls `agentSidecarClient.registerPath(path)` → agent server
 *      returns a `docId`.
 *   3. Main process calls `agentSidecarClient.touchRecent(path)` → agent server
 *      prepends it to `recent.json`.
 *   4. Main process spawns a BrowserWindow loading
 *      `${EDITOR_BASE_URL}/desktop/svg?docId=${docId}` (or similar).
 *   5. The renderer reads the docId from the URL and calls
 *      `bridge.files.read(docId)` to load content.
 *
 * Why this exists separately from the preload bridge: the main process
 * isn't a renderer — it's plain Node, no `window`, no `contextBridge`,
 * no preload closure. It needs to call the same `/files/register` and
 * `/recent/touch` endpoints, but with its own auth-and-origin
 * machinery. We deliberately pin to `127.0.0.1` and forge the
 * `Origin`/`Referer` headers to satisfy the agent server's `originGuard` —
 * the guard exists to keep browsers out, but it doesn't know that the
 * main process isn't a browser. The forged headers are not a security
 * weakness because the main process is on the same side of the trust
 * boundary as the sidecar (both subprocess of the same Electron
 * launch), and the sidecar's Basic Auth password is the actual gate.
 */

import {
  getAgentSidecarInfo,
  type AgentSidecarInfo,
} from "./agent-sidecar-supervisor";
import { EDITOR_BASE_URL } from "../env";
import { AgentTransport } from "@grida/agent/transport";
import type { AgentLifecycleEvent, ChatSessionRow } from "@grida/agent";

const EDITOR_ORIGIN = new URL(EDITOR_BASE_URL).origin;
const REFERER = `${EDITOR_ORIGIN}/desktop`;

export namespace agentSidecarClient {
  export class AgentSidecarNotReadyError extends Error {
    constructor() {
      super("agent sidecar info not available (not started yet)");
      this.name = "AgentSidecarNotReadyError";
    }
  }

  /**
   * Registers `path` with the agent server. Same path → same `docId` (the
   * server's normalized-path reverse map guarantees this), so calling
   * twice from a Finder re-open is safe and returns the existing docId
   * — main-process code can then look up the corresponding window and
   * focus it instead of opening a new one.
   */
  export async function registerPath(filePath: string): Promise<string> {
    const data = await client().files.register(filePath);
    return data.doc_id;
  }

  /**
   * Prepends `path` to `recent.json` with the current timestamp. Safe
   * to call on every open — the agent server dedupes by path.
   */
  export async function touchRecent(filePath: string): Promise<void> {
    await client().recent.touch(filePath);
  }

  /**
   * Register an opened directory as a workspace. Used by the "Open
   * Folder…" menu (main process drives the native folder picker, then
   * calls this) so the welcome window can `bridge.workspaces.list()` and
   * surface it without re-doing the dialog dance.
   *
   * Returns the resolved `Workspace` — `root` may differ from `rootPath`
   * if the agent server expanded to a containing git repo.
   */
  export async function openWorkspace(rootPath: string): Promise<{
    id: string;
    root: string;
    name: string;
    opened_at: number;
    pinned: boolean;
  }> {
    return await client().workspaces.open(rootPath);
  }

  export async function listWorkspaces(): Promise<
    Array<{
      id: string;
      root: string;
      name: string;
      opened_at: number;
      pinned: boolean;
    }>
  > {
    return await client().workspaces.list();
  }

  /**
   * Read one session row — the notification consumer resolves the
   * session's title (copy) and workspace binding (focus gate + click
   * routing) from it. Null when the session is unknown.
   */
  export async function getSession(id: string): Promise<ChatSessionRow | null> {
    return await client().sessions.get(id);
  }

  /**
   * Tail the host-wide lifecycle event stream (`GET /events`, RFC
   * `events.md`). Long-lived SSE; the returned `done` settles when the
   * subscription ends (caller aborts via `init.signal`, or the socket
   * drops — e.g. the supervisor restarted the agent sidecar). Throws
   * {@link AgentSidecarNotReadyError} before the sidecar is up; callers
   * own their reconnect loop.
   */
  export async function subscribeEvents(
    onEvent: (event: AgentLifecycleEvent) => void,
    init: { signal?: AbortSignal } = {}
  ): Promise<{ done: Promise<void> }> {
    return await client().events.subscribe(onEvent, init);
  }
}

// Per-launch Authorization header is fixed; cache it alongside the
// resolved base URL so we don't rebuild the base64 string on every
// agent server call from the main process. Invalidates if the supervisor
// re-spawns under a different password (defensive — never expected).
let cached: {
  info: AgentSidecarInfo;
  client: AgentTransport.Client;
} | null = null;
function client(): AgentTransport.Client {
  const live = getAgentSidecarInfo();
  if (!live) throw new agentSidecarClient.AgentSidecarNotReadyError();
  if (cached?.info !== live) {
    cached = {
      info: live,
      client: new AgentTransport.Client({
        base_url: AgentTransport.baseUrl(live.port),
        password: live.password,
        origin: EDITOR_ORIGIN,
        referer: REFERER,
      }),
    };
  }
  return cached.client;
}

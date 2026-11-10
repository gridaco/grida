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
 *   3. Main records the path through its selected recent-file owner.
 *   4. Main process spawns a BrowserWindow loading
 *      `${EDITOR_BASE_URL}/desktop/file?docId=${docId}` (or similar).
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
  nativeAgentByokSettings,
  nativeAgentEndpointNetwork,
  type AgentSidecarInfo,
} from "./agent-sidecar-supervisor";
import { app } from "electron";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { NativeProviderSelection } from "./native-provider-selection";
import type { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import { NativeWorkspaceReads } from "./native-workspace-reads";
import { NativeWorkspaceWrites } from "./native-workspace-writes";
import { nativeWorkspaceMedia } from "./workspace-media-access";
import { EDITOR_BASE_URL } from "../env";
import { AgentTransport } from "@grida/agent/transport";
import type { Workspace } from "@grida/daemon";
import type {
  AgentLifecycleEvent,
  ChatSessionRow,
  EndpointProviderConfig,
  ProbedEndpointModel,
} from "@grida/agent";

const EDITOR_ORIGIN = new URL(EDITOR_BASE_URL).origin;
const REFERER = `${EDITOR_ORIGIN}/desktop`;

export namespace agentSidecarClient {
  let catalog: NativeWorkspaceCatalog | undefined;
  let nativeReads: NativeWorkspaceReads | undefined;
  let nativeWrites: NativeWorkspaceWrites | undefined;

  export function setWorkspaceCatalog(owner: NativeWorkspaceCatalog): void {
    if (catalog) throw new Error("workspace_catalog_already_bound");
    catalog = owner;
  }
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
    if (
      NativeDesktopProfile.selected() &&
      catalog &&
      NativeDesktopProfile.legacyRoots(app).overlaps(filePath)
    )
      throw new Error("file-overlaps-protected-root");
    const data = await client().files.register(filePath);
    return data.doc_id;
  }

  export const recent = {
    list: () => client().recent.list(),
    touch: (filePath: string) => client().recent.touch(filePath),
    pin: (filePath: string, pinned: boolean) =>
      client().recent.pin(filePath, pinned),
    forget: (filePath: string) => client().recent.forget(filePath),
  };

  /**
   * Register an opened directory as a workspace. Used by the "Open
   * Folder…" menu (main process drives the native folder picker, then
   * calls this) so the welcome window can `bridge.workspaces.list()` and
   * surface it without re-doing the dialog dance.
   *
   * The native profile captures the exact directory selected by Main.
   */
  export async function openWorkspace(rootPath: string): Promise<Workspace> {
    return catalog
      ? await catalog.openSelected(rootPath)
      : await client().workspaces.open(rootPath);
  }

  export async function listWorkspaces(): Promise<Workspace[]> {
    return catalog ? await catalog.list() : await client().workspaces.list();
  }

  export async function findWorkspace(id: string): Promise<Workspace | null> {
    return catalog
      ? await catalog.find(id)
      : ((await listWorkspaces()).find((entry) => entry.id === id) ?? null);
  }

  export async function reopenWorkspace(root: string): Promise<Workspace> {
    return catalog ? await catalog.reopen(root) : await openWorkspace(root);
  }

  export async function createWorkspace(name?: string): Promise<Workspace> {
    return catalog
      ? await catalog.create(name)
      : await client().workspaces.create({ name });
  }

  export async function pinWorkspace(
    id: string,
    pinned: boolean
  ): Promise<void> {
    if (catalog) return await catalog.pin(id, pinned);
    await client().workspaces.pin(id, pinned);
  }

  export async function forgetWorkspace(id: string): Promise<void> {
    if (catalog) return await catalog.forget(id);
    await client().workspaces.forget(id);
  }

  export async function readWorkspaceFile(
    id: string,
    relative: string,
    kind: "text" | "bytes",
    signal: AbortSignal
  ) {
    const reads = nativeWorkspaceReader();
    if (reads) return await reads.read(id, relative, kind, signal);
    return kind === "text"
      ? await client().workspaces.read_file(id, relative)
      : await client().workspaces.read_file_bytes(id, relative);
  }

  export async function readWorkspaceDirectory(
    id: string,
    relative: string,
    signal: AbortSignal
  ) {
    const reads = nativeWorkspaceReader();
    return reads
      ? await reads.list(id, relative, signal)
      : await client().workspaces.readdir(id, relative);
  }

  function nativeWorkspaceReader(): NativeWorkspaceReads | undefined {
    const workers = nativeWorkspaceMedia();
    if (!workers) return undefined;
    if (!catalog) throw new Error("workspace_read_catalog_unavailable");
    return (nativeReads ??= new NativeWorkspaceReads(catalog, workers));
  }

  export async function writeWorkspaceFile(
    id: string,
    relative: string,
    content: string,
    expectedMtime: number | undefined,
    signal: AbortSignal,
    check: () => void
  ) {
    const workers = nativeWorkspaceMedia();
    if (workers) {
      if (!catalog) throw new Error("workspace_write_catalog_unavailable");
      const writes = (nativeWrites ??= new NativeWorkspaceWrites(
        catalog,
        workers
      ));
      return await writes.save(
        id,
        relative,
        content,
        expectedMtime,
        signal,
        check
      );
    }
    check();
    return await client().workspaces.write_file(
      id,
      relative,
      content,
      expectedMtime
    );
  }

  /** Main-owned endpoint operations keep native grant approval and the
   * sidecar's persisted config on the same side of the renderer boundary. */
  export async function listProviderEndpoints(): Promise<
    EndpointProviderConfig[]
  > {
    return await client().providers.list_endpoints();
  }

  export async function listGatewayModels() {
    return (await client().providers.gg_models()).models;
  }

  export function nativeConfiguredEndpoint(
    providerId: string,
    modelId?: string
  ) {
    const transport = client();
    return NativeProviderSelection.configuredEndpoint(providerId, modelId, {
      list: transport.providers.list_endpoints,
      hasKey: transport.secrets.has,
      network: nativeAgentEndpointNetwork,
      credentialHome: nativeAgentByokSettings().credentialHome,
    });
  }

  export function nativeBuiltInByok(providerId: string, modelId: string) {
    const transport = client();
    return NativeProviderSelection.builtInByok(providerId, modelId, {
      ...nativeAgentByokSettings(),
      hasKey: transport.secrets.has,
    });
  }

  export async function setProviderEndpoint(
    config: EndpointProviderConfig
  ): Promise<void> {
    await client().providers.set_endpoint(config);
  }

  export async function deleteProviderEndpoint(id: string): Promise<void> {
    await client().providers.delete_endpoint(id);
  }

  export async function probeProviderEndpoint(baseUrl: string): Promise<{
    source: "ollama" | "openai";
    models: ProbedEndpointModel[];
  }> {
    return await client().providers.probe_endpoint(baseUrl);
  }

  /** Best-effort cleanup for the short-lived hosted-AI session when the
   * controller signs the shared Grida account out. */
  export async function clearGridaGatewaySession(): Promise<void> {
    await client().gg.clear_session();
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

  /**
   * Low-level authenticated fetch against the sidecar from the main process —
   * same Basic-Auth + forged Origin/Referer as every call above, returning the
   * raw `Response` so the caller can stream the body straight through. Used by
   * the `grida-workspace://` media protocol handler (#924) to proxy the
   * streamed `GET /workspaces/file` route (forwarding the renderer's Range
   * header) WITHOUT the renderer ever holding the credential. Throws
   * {@link AgentSidecarNotReadyError} before the sidecar is up.
   */
  export async function fetch(
    path: string,
    init?: RequestInit
  ): Promise<Response> {
    return await client().fetch(path, init);
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

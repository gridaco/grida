/**
 * Typed client for the Grida Desktop bridge — `window.grida` exposed by
 * the Electron preload when the page is loaded inside the desktop app.
 *
 * Scaffolds in `editor/scaffolds/desktop/` and pages in
 * `editor/app/desktop/` should import from this module rather than touch
 * `window.grida` directly. This file is the renderer-side desktop bridge
 * contract; native IPC stays owned by the desktop host.
 *
 * GRIDA-SEC-004 — the bridge is exposed only when
 * `location.pathname.startsWith("/desktop/")`. Detection from React must
 * tolerate SSR and the post-mount async preload init.
 */

import { useSyncExternalStore } from "react";
import {
  AGENT_SKILL_IDS,
  AGENT_MODES,
  asAgentMode,
  BYOK_PROVIDER_IDS,
  BYOK_PROVIDER_METADATA,
  AGENT_TIERS,
  AGENT_SESSION_AGENT,
  OLLAMA_ENDPOINT_PRESET,
  resolveEndpointModel,
  resolveEndpointModels,
  type AgentMode,
  type AgentUIMessageChunk,
  type AgentRunOptions,
  type ByokProviderId,
  type ChatMessageWithParts,
  type ChatSessionRow,
  type CreateSessionOptions,
  type EndpointModelEntry,
  type EndpointModelOverrides,
  type EndpointModelSpec,
  type EndpointProviderConfig,
  type ProbedEndpointModel,
  type PatchSessionOptions,
  type RewindResult,
  type SessionListFilter,
  type SessionListPage,
  type SessionStatus,
} from "@grida/agent";
import type {
  DesktopBridge,
  DesktopHostAppId,
  DesktopHostAppInfo,
  NavigationState,
  Workspace,
  WorkspaceFsEntry,
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
  WorkspaceWriteFileResult,
} from "@grida/desktop-bridge";
import {
  DESKTOP_BRIDGE_PROTOCOL,
  DESKTOP_HOST_APP_IDS,
} from "@grida/desktop-bridge";

export {
  AGENT_SKILL_IDS,
  AGENT_MODES,
  asAgentMode,
  BYOK_PROVIDER_IDS,
  BYOK_PROVIDER_METADATA,
  AGENT_TIERS,
  AGENT_SESSION_AGENT,
  OLLAMA_ENDPOINT_PRESET,
  resolveEndpointModel,
  resolveEndpointModels,
  type EndpointModelEntry,
  type EndpointModelOverrides,
  type EndpointModelSpec,
  type EndpointProviderConfig,
  type ProbedEndpointModel,
  type AgentMode,
  type AgentUIMessageChunk,
  type AgentRunOptions,
  type ByokProviderId,
  type ByokProviderMetadata,
  type ChatMessageRow,
  type ChatMessageWithParts,
  type ChatModel,
  type ChatPartRow,
  type ChatSessionRow,
  type CreateSessionOptions,
  type PatchSessionOptions,
  type SessionListFilter,
  type SessionListPage,
  type SessionStatus,
} from "@grida/agent";

export type {
  DesktopBridge,
  DesktopCapabilities,
  DesktopNativeCapabilities,
  FileReadResult,
  FileWriteResult,
  HandshakeResponse,
  NavigationState,
  OpenDialogOptions,
  RecentEntry,
  SaveDialogOptions,
  Workspace,
  WorkspaceFsEntry,
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
  WorkspaceWriteFileResult,
} from "@grida/desktop-bridge";

export { DESKTOP_BRIDGE_PROTOCOL, DESKTOP_HOST_APP_IDS };

export type HostAppId = DesktopHostAppId;

export type HostAppInfo = {
  id: HostAppId;
  label: string;
  installed: boolean;
  supports: Array<"workspace">;
};

declare global {
  interface Window {
    grida?: DesktopBridge;
  }
}

export type DesktopBridgeStatus =
  | { kind: "missing" }
  | { kind: "unsupported"; protocol: unknown }
  | { kind: "ready"; bridge: DesktopBridge };

/**
 * The single "no bridge" instance. `useSyncExternalStore` compares
 * snapshots by reference, so every "missing" code path must return
 * *this* object — a fresh `{ kind: "missing" }` literal each call looks
 * like a perpetual state change and triggers the getServerSnapshot
 * infinite-loop warning.
 */
const MISSING_STATUS: DesktopBridgeStatus = { kind: "missing" };

// Memoized so repeated calls return a stable reference while
// `window.grida` is unchanged. The bridge is installed once and never
// torn down, so this only ever transitions missing → ready/unsupported.
let cachedStatus: DesktopBridgeStatus = MISSING_STATUS;
let cachedCandidate: DesktopBridge | undefined;
let statusComputed = false;

/**
 * Inspect the bridge without collapsing "browser" and "old desktop app"
 * into the same state. Safe to call during SSR.
 */
export function getDesktopBridgeStatus(): DesktopBridgeStatus {
  if (typeof window === "undefined") return MISSING_STATUS;
  const candidate = (window as Window).grida;
  if (statusComputed && cachedCandidate === candidate) {
    return cachedStatus;
  }
  statusComputed = true;
  cachedCandidate = candidate;
  if (typeof candidate !== "object" || candidate === null) {
    cachedStatus = MISSING_STATUS;
  } else if (candidate.protocol !== DESKTOP_BRIDGE_PROTOCOL) {
    cachedStatus = { kind: "unsupported", protocol: candidate.protocol };
  } else {
    cachedStatus = { kind: "ready", bridge: candidate };
  }
  return cachedStatus;
}

/**
 * Return the bridge if the page is currently running inside a compatible
 * desktop app, else `null`. Safe to call during SSR.
 */
export function getDesktopBridge(): DesktopBridge | null {
  const status = getDesktopBridgeStatus();
  return status.kind === "ready" ? status.bridge : null;
}

/**
 * Reactive variant of {@link getDesktopBridge}. Returns `null` during
 * SSR and on the first client render, then flips to the bridge once the
 * preload has installed it. Used by `DesktopBridgeGate`.
 *
 * Why `useSyncExternalStore` for a value that never changes once set:
 * the preload installs `window.grida` synchronously at preload-run time,
 * which can still race with React mount. A single post-mount re-snapshot is enough; the
 * bridge is never torn down for the session.
 */
export function useDesktopBridgeStatus(): DesktopBridgeStatus {
  return useSyncExternalStore(
    subscribeToBridge,
    getDesktopBridgeStatus,
    getServerBridgeStatusSnapshot
  );
}

export function useDesktopBridge(): DesktopBridge | null {
  return useSyncExternalStore(
    subscribeToBridge,
    getDesktopBridge,
    getServerBridgeSnapshot
  );
}

function subscribeToBridge(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // One post-mount re-snapshot catches preload/React mount ordering.
  // Don't fake reactivity with `popstate` — the bridge is never revoked
  // mid-session, so there's nothing else to react to.
  const timer = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timer);
}

function getServerBridgeSnapshot(): DesktopBridge | null {
  return null;
}

function getServerBridgeStatusSnapshot(): DesktopBridgeStatus {
  return MISSING_STATUS;
}

/**
 * Thrown when a namespace below is invoked but `window.grida` isn't
 * installed — the page isn't running inside the desktop renderer, or
 * the preload hasn't finished setting it up. Pages gated by
 * `DesktopBridgeGate` shouldn't see this in practice; throwing makes
 * the misuse loud instead of dropping the call silently.
 *
 * Single source of truth — every namespace below funnels through
 * `bridgeOrThrow()` so the error class only exists once.
 */
export class DesktopBridgeMissingError extends Error {
  constructor() {
    super("desktop bridge not available — `window.grida` is undefined");
    this.name = "DesktopBridgeMissingError";
  }
}

function bridgeOrThrow(): DesktopBridge {
  const b = getDesktopBridge();
  if (!b) throw new DesktopBridgeMissingError();
  return b;
}

/* ─────────────────────── secrets namespace ───────────────────── */

export const BYOK_PROVIDER_LABELS = Object.fromEntries(
  BYOK_PROVIDER_METADATA.map((provider) => [provider.id, provider.label])
) as Record<ByokProviderId, string>;

/**
 * GRIDA-SEC-004 — there is **no `get` method** on the bridge or here.
 * The renderer can only check presence (`has`), `set`, or `delete`.
 * The agent host uses stored keys internally when calling BYOK providers;
 * even if a hypothetical XSS bypassed preload path-scoping it could
 * not exfiltrate the secret material. Mirrors the constraint
 * documented at {@link DesktopBridge.secrets}.
 */
export namespace secrets {
  /** Iteration helper so callers don't reach into the const tuple. */
  export function byokProviders(): ReadonlyArray<ByokProviderId> {
    return BYOK_PROVIDER_METADATA.map((provider) => provider.id);
  }

  export function byokProviderMetadata() {
    return BYOK_PROVIDER_METADATA;
  }

  export async function hasKey(providerId: ByokProviderId): Promise<boolean> {
    return await bridgeOrThrow().secrets.has(providerId);
  }

  /**
   * Reject empty / whitespace-only keys client-side. The agent host
   * enforces the same rule in its secret-write validation,
   * but failing fast here keeps the UI responsive without a
   * round-trip.
   */
  export async function setKey(
    providerId: ByokProviderId,
    key: string
  ): Promise<void> {
    if (key.trim().length === 0) {
      throw new Error("Key cannot be empty.");
    }
    await bridgeOrThrow().secrets.set(providerId, key);
  }

  export async function deleteKey(providerId: ByokProviderId): Promise<void> {
    await bridgeOrThrow().secrets.delete(providerId);
  }

  /**
   * Native confirm dialog for the destructive "Remove key" action.
   * Returns `true` if the user clicked the destructive option. Lives
   * in the secrets namespace (not a generic dialog helper) so the
   * settings page never needs to import the raw bridge — keeping the
   * GRIDA-SEC-004 surface visible at the import sites.
   *
   * Buttons are ordered `[remove, cancel]` so `default_id: 1` (cancel)
   * matches platform convention for destructive prompts.
   */
  export async function confirmDeleteKey(
    providerId: ByokProviderId
  ): Promise<boolean> {
    const label = BYOK_PROVIDER_LABELS[providerId];
    const choice = await bridgeOrThrow().dialog.confirm({
      message: `Remove ${label} key?`,
      detail:
        "The desktop app will stop using this key. You can add it back any time.",
      buttons: ["Remove", "Cancel"],
      default_id: 1,
      cancel_id: 1,
    });
    return choice === 0;
  }
}

/* ─────────────────────── providers namespace ─────────────────── */

/**
 * Endpoint provider config (issue #806) — user-configured OpenAI-
 * compatible endpoints (Ollama preset, self-hosted gateways). Plain
 * readable config, unlike `secrets`: the renderer may list configs back.
 * A keyed gateway stores its key via the `secrets` namespace under the
 * endpoint's id; this namespace never carries credentials.
 *
 * The bridge field is OPTIONAL (older desktop binaries) — UI must gate
 * on {@link providers.isSupported}.
 */
export namespace providers {
  export function isSupported(): boolean {
    return getDesktopBridge()?.providers != null;
  }

  export async function listEndpoints(): Promise<EndpointProviderConfig[]> {
    const bridge = bridgeOrThrow().providers;
    if (!bridge) return [];
    return await bridge.list_endpoints();
  }

  export async function setEndpoint(
    config: EndpointProviderConfig
  ): Promise<void> {
    const bridge = bridgeOrThrow().providers;
    if (!bridge) throw new DesktopBridgeMissingError();
    await bridge.set_endpoint(config);
  }

  export async function deleteEndpoint(id: string): Promise<void> {
    const bridge = bridgeOrThrow().providers;
    if (!bridge) throw new DesktopBridgeMissingError();
    await bridge.delete_endpoint(id);
  }

  /**
   * Discover the models an endpoint serves. The fetch happens on the
   * agent host — the renderer's origin cannot reach a local Ollama
   * directly (CORS). Throws when the bridge predates the surface or the
   * endpoint is unreachable; callers fall back to manual entry.
   */
  export async function probeEndpoint(baseUrl: string): Promise<{
    source: "ollama" | "openai";
    models: ProbedEndpointModel[];
  }> {
    const bridge = bridgeOrThrow().providers;
    if (!bridge?.probe_endpoint) throw new DesktopBridgeMissingError();
    return await bridge.probe_endpoint(baseUrl);
  }

  /**
   * Reveal `endpoints.json` (the hand-editable config — `overrides` for
   * power users live there) in the OS file manager. Returns `false` when
   * the surface isn't available (old binary, or the web daemon bridge
   * which has no native shell) — callers hide the affordance.
   */
  export async function revealConfigFile(): Promise<boolean> {
    const bridge = getDesktopBridge();
    if (!bridge?.providers?.info || !bridge.caps.native.shell) return false;
    const { path } = await bridge.providers.info();
    await bridge.shell.show_item_in_folder(path);
    return true;
  }

  /** Whether {@link revealConfigFile} can work in this host. */
  export function canRevealConfigFile(): boolean {
    const bridge = getDesktopBridge();
    return Boolean(bridge?.providers?.info && bridge.caps.native.shell);
  }

  /**
   * Native confirm for the destructive "Remove endpoint" action —
   * same convention as `secrets.confirmDeleteKey`.
   */
  export async function confirmDeleteEndpoint(label: string): Promise<boolean> {
    const choice = await bridgeOrThrow().dialog.confirm({
      message: `Remove ${label}?`,
      detail:
        "The agent will stop using this endpoint and its registered models. You can add it back any time.",
      buttons: ["Remove", "Cancel"],
      default_id: 1,
      cancel_id: 1,
    });
    return choice === 0;
  }
}

/* ───────────────────────── app namespace ────────────────────── */

export type DesktopAppInfo = {
  version: string;
  platform: string;
};

/**
 * The static identity fields the preload fills in once at handshake
 * (app version, OS platform). Read by the settings page (and any
 * future "About" surface) without importing the raw bridge.
 *
 * GRIDA-SEC-004 — keeping the bridge import surface narrow: pages
 * reach for the namespaces here, and only this module touches
 * `window.grida`.
 */
export namespace app {
  /**
   * Synchronous because `bridge.app.*` is populated at preload-run
   * time (see `desktop/src/preload.ts`). If the bridge isn't installed
   * yet we throw — the desktop layout's `DesktopBridgeGate` ensures
   * it's always present by the time any page mounts.
   */
  export function getAppInfo(): DesktopAppInfo {
    const b = bridgeOrThrow();
    return { version: b.app.version, platform: b.app.platform };
  }

  /**
   * Human-friendly platform label. macOS / Windows / Linux is what
   * the settings page wants; `process.platform` strings like "darwin"
   * / "win32" / "linux" leak Node-ism into the UI.
   */
  export function describePlatform(platform: string): string {
    switch (platform) {
      case "darwin":
        return "macOS";
      case "win32":
        return "Windows";
      case "linux":
        return "Linux";
      default:
        return platform;
    }
  }
}

/* ────────────────────────── ai namespace ────────────────────── */

/**
 * The Grida agent runs behind the AgentHost,
 * against BYOK (OpenRouter / AI Gateway) directly. The renderer sends a
 * `messages` payload (plus optional `workspaceId` / `skills`),
 * receives an AI SDK UI-message stream, and either resolves fs
 * tool calls locally (standalone document window: live `SvgEditor`
 * binding) or just observes them (workspace pane: agent host resolves
 * server-side because it holds the fs + command-execution bindings).
 *
 * Why a callback instead of an async iterator: `ReadableStream` and
 * generator objects don't round-trip cleanly through Electron's
 * `contextBridge` — they get stripped of methods on copy. The bridge
 * accepts a serializable `onChunk` callback that the agent host invokes
 * for each chunk. See `desktop/src/preload.ts`.
 *
 * GRIDA-SEC-004 — the renderer never holds upstream API keys. They live
 * in the agent host's `auth.json`. This namespace is the only surface in
 * the editor tree that touches `bridge.agent`.
 */
export namespace ai {
  /**
   * Start an agent run. Resolves with `{streamId, done}` as
   * soon as the SSE connection is established; `onChunk` is invoked
   * once per `AgentUIMessageChunk` until the stream ends. `done` settles when
   * the agent host closes the stream (after `finish` or `error`).
   *
   * Throws {@link DesktopBridgeMissingError} when invoked outside the
   * desktop renderer.
   */
  export async function startAgentRun(
    opts: AgentRunOptions,
    onChunk: (chunk: AgentUIMessageChunk) => void
  ): Promise<{ streamId: string; sessionId: string; done: Promise<void> }> {
    const handle = await bridgeOrThrow().agent.run(opts, onChunk);
    return {
      streamId: handle.stream_id,
      sessionId: handle.session_id,
      done: handle.done,
    };
  }

  /**
   * Abort an in-flight agent run by session id. Idempotent.
   */
  export async function abortAgentRun(sessionId: string): Promise<void> {
    await bridgeOrThrow().agent.abort(sessionId);
  }

  /**
   * Reconnect to an agent run that's still in flight on the agent host.
   * Used by the chat transport's `reconnectToStream` to resume across
   * a renderer refresh. The agent host replays its buffered chunk log
   * from the start, then live-tails.
   *
   * Returns `null` when no run exists for `sessionId` (agent host already
   * finished + GC'd, or never started). The caller's transport
   * surfaces "no live stream"; the chat panel shows whatever was
   * hydrated from the DB.
   */
  export async function reconnectAgentRun(
    sessionId: string,
    lastEventId: number,
    onChunk: (chunk: AgentUIMessageChunk) => void
  ): Promise<{
    streamId: string;
    sessionId: string;
    done: Promise<void>;
  } | null> {
    const handle = await bridgeOrThrow().agent.reconnect(
      sessionId,
      lastEventId,
      onChunk
    );
    return handle
      ? {
          streamId: handle.stream_id,
          sessionId: handle.session_id,
          done: handle.done,
        }
      : null;
  }
}

/* ──────────────────── sessions namespace ────────────────────── */

/**
 * Agentic-chat sessions are persisted in the agent host's SQLite DB
 * (`${userData}/sessions.db`). This namespace is a thin client over
 * the bridge session methods. Renderer code reaches for these helpers;
 * never `window.grida.sessions` directly.
 *
 * The shape is agent-agnostic — the `agent` field is a free-form
 * string. Grida Copilot and future agents share the same row type.
 *
 * GRIDA-SEC-004 — sessions hold message bodies and tool I/O; treat
 * them as user data. The DB lives outside the renderer-accessible
 * surface; this namespace only reads/writes via the bridge.
 */
export namespace sessions {
  export async function list(
    filter?: SessionListFilter
  ): Promise<SessionListPage> {
    return await bridgeOrThrow().sessions.list(filter);
  }

  export async function get(id: string): Promise<ChatSessionRow | null> {
    return await bridgeOrThrow().sessions.get(id);
  }

  export async function create(
    opts: CreateSessionOptions
  ): Promise<ChatSessionRow> {
    return await bridgeOrThrow().sessions.create(opts);
  }

  export async function rename(
    id: string,
    title: string
  ): Promise<ChatSessionRow> {
    return await bridgeOrThrow().sessions.patch(id, { title });
  }

  export async function archive(id: string): Promise<ChatSessionRow> {
    return await bridgeOrThrow().sessions.patch(id, { archived: true });
  }

  export async function unarchive(id: string): Promise<ChatSessionRow> {
    return await bridgeOrThrow().sessions.patch(id, { archived: false });
  }

  export async function remove(id: string): Promise<void> {
    await bridgeOrThrow().sessions.delete(id);
  }

  export async function listMessages(
    id: string
  ): Promise<ChatMessageWithParts[]> {
    return await bridgeOrThrow().sessions.list_messages(id);
  }

  /** Soft-truncate the session to a prior message (RFC `session / rewinding`).
   *  `restore: true` un-rewinds. Rejected (409) while a run is in flight. */
  export async function rewind(
    id: string,
    fromMessageId: string,
    opts?: { restore?: boolean }
  ): Promise<RewindResult> {
    return await bridgeOrThrow().sessions.rewind(id, fromMessageId, opts);
  }

  /** Fork the session at a message into a new forked session
   *  (RFC `session / fork`). Returns the new session row. */
  export async function fork(
    id: string,
    fromMessageId: string,
    metadata?: Record<string, unknown>
  ): Promise<ChatSessionRow> {
    return await bridgeOrThrow().sessions.fork(id, fromMessageId, metadata);
  }

  /** User-fired compaction (RFC `session / compaction`). */
  export async function compact(id: string): Promise<{
    compacted: boolean;
    reason?: string;
    summaryMessageId?: string;
  }> {
    return await bridgeOrThrow().sessions.compact(id);
  }

  /** Queued sends (RFC `queue`): enqueue a pending user message while a turn
   *  is in flight. The caller mints the id for its optimistic mirror; the CORE
   *  fires the row on a clean idle edge (the scheduler drains it). */
  export async function enqueue(
    id: string,
    message: { id?: string; text: string }
  ): Promise<ChatMessageWithParts> {
    return await bridgeOrThrow().sessions.enqueue(id, message);
  }

  /** The pending queue for a session, FIFO by `queued_at`. */
  export async function listQueued(
    id: string
  ): Promise<ChatMessageWithParts[]> {
    return await bridgeOrThrow().sessions.list_queued(id);
  }

  /** Cancel (remove) a queued message before it fires. */
  export async function cancelQueued(
    id: string,
    messageId: string
  ): Promise<void> {
    await bridgeOrThrow().sessions.cancel_queued(id, messageId);
  }

  /**
   * Subscribe to a session's run-state (RFC `session` §Session status). The
   * current status arrives first, then every idle⇄busy⇄error transition.
   * Returns a `subscriptionId` to pass to {@link unsubscribeStatus} on
   * cleanup, plus a `done` that settles when the subscription ends. This is
   * the authoritative busy/idle the UI renders from — not the AI-SDK client's
   * optimistic per-request status.
   */
  export async function subscribeStatus(
    id: string,
    onStatus: (status: SessionStatus) => void
  ): Promise<{ subscriptionId: string; done: Promise<void> }> {
    const { subscription_id, done } =
      await bridgeOrThrow().sessions.subscribe_status(id, onStatus);
    return { subscriptionId: subscription_id, done };
  }

  /** Stop a status subscription started by {@link subscribeStatus}. */
  export async function unsubscribeStatus(
    subscriptionId: string
  ): Promise<void> {
    await bridgeOrThrow().sessions.unsubscribe_status(subscriptionId);
  }
}

/* ────────────────────────── nav namespace ────────────────── */

/**
 * Imperative wrappers around `bridge.window.navigation.{back,forward}`.
 * Kept in a namespace so the TitleBar's button handlers don't reach
 * into `getDesktopBridge()` directly — same convention as the other
 * namespaces in this file.
 *
 * Reactive state (used by the buttons' disabled flag) comes from the
 * `useNavigationState()` hook in `bridge-react.ts`; the hook owns the
 * subscription bookkeeping so callers don't have to.
 */
export namespace nav {
  export async function back(): Promise<void> {
    await bridgeOrThrow().window.navigation.back();
  }
  export async function forward(): Promise<void> {
    await bridgeOrThrow().window.navigation.forward();
  }
}

/* ───────────────────── workspaces namespace ────────────────── */

/**
 * GRIDA-SEC-004 — opened-directory workspaces. The agent host persists
 * the list at `${userData}/workspaces.json` and is the source of
 * truth; this namespace is just the typed wrapper.
 *
 * The "Recent Workspaces" UX reads `list()` sorted by `openedAt`.
 * Opening a folder via the native picker:
 *
 *   const paths = await bridge.dialog.open({properties: ["openDirectory"]});
 *   if (paths?.[0]) await workspaces.openFolder(paths[0]);
 */
export namespace workspaces {
  export async function list(): Promise<Workspace[]> {
    return await bridgeOrThrow().workspaces.list();
  }
  export async function openFolder(rootPath: string): Promise<Workspace> {
    return await bridgeOrThrow().workspaces.open(rootPath);
  }
  export async function pin(id: string, pinned: boolean): Promise<void> {
    await bridgeOrThrow().workspaces.pin(id, pinned);
  }
  export async function forget(id: string): Promise<void> {
    await bridgeOrThrow().workspaces.forget(id);
  }
  /**
   * List immediate children of `relPath` (workspace root if omitted).
   * Empty array on an empty directory; throws on workspace-not-found,
   * path escape, or fs errors.
   */
  export async function readdir(
    workspaceId: string,
    relPath?: string
  ): Promise<WorkspaceFsEntry[]> {
    return await bridgeOrThrow().workspaces.readdir(workspaceId, relPath);
  }
  /**
   * Read a UTF-8 text file inside the workspace. The agent host refuses
   * binary content and files larger than 1 MiB — callers should catch
   * and surface the error rather than retrying.
   */
  export async function readFile(
    workspaceId: string,
    relPath: string
  ): Promise<WorkspaceReadFileResult> {
    return await bridgeOrThrow().workspaces.read_file(workspaceId, relPath);
  }
  /**
   * Read raw bytes (base64-encoded) for the image viewer. The agent host
   * applies the same 1 MiB cap as {@link readFile} but skips the
   * UTF-8 / null-byte gates so genuine binary content can come
   * through. Callers should pair the result with a `data:<mime>;
   * base64,` prefix derived from the file extension.
   */
  export async function readFileBytes(
    workspaceId: string,
    relPath: string
  ): Promise<WorkspaceReadFileBytesResult> {
    return await bridgeOrThrow().workspaces.read_file_bytes(
      workspaceId,
      relPath
    );
  }
  /**
   * Atomic write via tmpfile + rename inside the workspace. Creates
   * parent directories. The renderer should compare the returned
   * `mtime` against its last-read `mtime` if it cares about external
   * edits.
   */
  export async function writeFile(
    workspaceId: string,
    relPath: string,
    content: string
  ): Promise<WorkspaceWriteFileResult> {
    return await bridgeOrThrow().workspaces.write_file(
      workspaceId,
      relPath,
      content
    );
  }
  /**
   * Move a workspace entry (file or folder) to the OS trash
   * (recoverable). GRIDA-SEC-004: routes through the desktop main
   * process, which re-validates that `relPath` resolves inside the
   * workspace root (and isn't the root itself) before the native trash.
   * Callers must confirm with the user first — see {@link
   * confirmTrashEntry}.
   */
  export async function trashEntry(
    workspaceId: string,
    relPath: string
  ): Promise<void> {
    await bridgeOrThrow().workspaces.trash_entry(workspaceId, relPath);
  }
  /**
   * Native confirm for the destructive "Move to Trash" action. Returns
   * `true` if the user chose to trash. The copy calls out that a folder
   * takes its contents with it. Lives here (next to {@link trashEntry})
   * rather than as a generic dialog helper so the raw GRIDA-SEC-004
   * bridge surface stays visible at one import site — same convention as
   * `secrets.confirmDeleteKey`.
   */
  export async function confirmTrashEntry(
    name: string,
    isDirectory: boolean
  ): Promise<boolean> {
    const choice = await bridgeOrThrow().dialog.confirm({
      message: isDirectory
        ? `Move "${name}" and its contents to the Trash?`
        : `Move "${name}" to the Trash?`,
      detail: "You can restore it from the Trash.",
      buttons: ["Move to Trash", "Cancel"],
      default_id: 1,
      cancel_id: 1,
    });
    return choice === 0;
  }
}

/* ─────────────────────── terminal namespace ─────────────────── */

/**
 * GRIDA-SEC-004 — human-interactive terminal (PTY) pane. A real,
 * unsandboxed shell running as the user (VSCode trust model) — NOT the
 * agent's sandboxed `run_command`. The renderer only ever names a
 * workspace id; the desktop main process resolves the cwd and owns the
 * PTY. This namespace is the only surface in the editor tree that
 * touches `bridge.terminal`.
 *
 * The capability is additive on protocol 1 — older desktop binaries
 * don't have it, so UI must gate on {@link isSupported}.
 */
export namespace terminal {
  export function isSupported(): boolean {
    return getDesktopBridge()?.caps.native.terminal === true;
  }

  /**
   * Spawn a login-shell PTY rooted at the workspace root. Handlers are
   * registered before the shell spawns, so the first output frame is
   * never lost. Resolves with the terminal id used by the siblings.
   */
  export async function create(
    opts: { workspaceId: string; cols: number; rows: number },
    handlers: {
      onData: (data: string) => void;
      onExit: (info: { exitCode: number }) => void;
    }
  ): Promise<{ id: string }> {
    return await bridgeOrThrow().terminal.create(
      {
        workspace_id: opts.workspaceId,
        cols: opts.cols,
        rows: opts.rows,
      },
      {
        on_data: handlers.onData,
        on_exit: (info) => handlers.onExit({ exitCode: info.exit_code }),
      }
    );
  }

  export async function write(id: string, data: string): Promise<void> {
    await bridgeOrThrow().terminal.write(id, data);
  }

  export async function resize(
    id: string,
    cols: number,
    rows: number
  ): Promise<void> {
    await bridgeOrThrow().terminal.resize(id, cols, rows);
  }

  /** Kill the shell process. Idempotent from the renderer's view. */
  export async function kill(id: string): Promise<void> {
    await bridgeOrThrow().terminal.kill(id);
  }
}

/* ─────────────────────── hostApps namespace ─────────────────── */

/**
 * GRIDA-SEC-004 — curated "Open in…" host app integrations.
 * This is not a system inventory API. Callers provide closed app ids,
 * and the agent host returns whether those known integrations are usable
 * for the opened workspace.
 */
export namespace hostApps {
  export async function resolvePreferred(opts: {
    workspaceId: string;
    preferredApps?: HostAppId[];
  }): Promise<HostAppInfo[]> {
    const apps = await bridgeOrThrow().host_apps.resolve_preferred({
      workspace_id: opts.workspaceId,
      preferred_apps: opts.preferredApps,
    });
    return apps.filter(isHostAppInfo);
  }

  export async function openWorkspace(opts: {
    workspaceId: string;
    appId: HostAppId;
  }): Promise<void> {
    await bridgeOrThrow().host_apps.open_workspace({
      workspace_id: opts.workspaceId,
      app_id: opts.appId,
    });
  }
}

function isHostAppInfo(app: DesktopHostAppInfo): app is HostAppInfo {
  return (DESKTOP_HOST_APP_IDS as readonly string[]).includes(app.id);
}

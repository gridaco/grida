/**
 * Workspace file-change watcher host (issue #805).
 *
 * Owns the OS-level recursive watch behind `bridge.workspaces.
 * subscribe_changes`. When a workspace file changes on disk outside the
 * editor — a `git checkout`, another editor, or *the agent's own write* —
 * the host pushes a coalesced batch of `WorkspaceChangeEvent`s to every
 * renderer subscribed to that workspace, which then reloads the open
 * editor (when clean) and surgically refreshes the file tree.
 *
 * Placement mirrors `terminal-host.ts`: a native module (`@parcel/watcher`,
 * the recursive per-OS backend VSCode uses) loaded in the privileged
 * desktop main process, reached only through `guarded()` IPC channels
 * (sender frame must be editor-origin `/desktop/*`). The watch root is a
 * workspace root resolved host-side from the sidecar registry — the
 * renderer only ever names a workspace id, never a raw path.
 *
 * One OS watch per workspace ROOT, ref-counted across every subscriber
 * (multiple panes / windows on the same folder share a single watcher).
 * Subscription ids are minted by the preload (caller-mints-id, like
 * `terminal.create`) so the renderer's change handler is registered
 * before the first event can fire.
 *
 * See /SECURITY.md `GRIDA-SEC-004`.
 */

import path from "node:path";
import type { WebContents } from "electron";
import type { WorkspaceChangeEvent } from "../bridge/contract";
import { IPC_CHANNELS } from "../bridge/contract";

// `@parcel/watcher` is an `export =` namespace module — reference its
// types via the indexed-import form (robust regardless of esModuleInterop)
// rather than named imports.
type AsyncSubscription = import("@parcel/watcher").AsyncSubscription;
type ParcelEvent = import("@parcel/watcher").Event;
type ParcelOptions = import("@parcel/watcher").Options;

/** Renderer-minted handle: UUID-sized opaque token, nothing fancier. */
const SUBSCRIPTION_ID_RE = /^[0-9a-zA-Z-]{1,64}$/;

/**
 * A runaway renderer loop must not pin unbounded watches. The UI opens
 * one subscription per workspace per window; 8 leaves ample headroom.
 */
const MAX_SUBSCRIPTIONS_PER_WEBCONTENTS = 8;

/**
 * Coalesce window. Raw FS events arrive in bursts (a save is often
 * unlink+create+chmod; a `git checkout` touches hundreds of files); we
 * buffer by path and flush once per window so the renderer sees one tidy
 * batch instead of a storm. VSCode uses ~75ms at the watcher source.
 */
export const COALESCE_MS = 75;

/**
 * Pushed down to the native backend so giant, irrelevant subtrees never
 * generate events. Matches the workspace tree's own hidden/noise set;
 * `.git` churns constantly and `node_modules` is enormous.
 */
export const WATCH_IGNORE: readonly string[] = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/target/**",
  "**/dist/**",
];

export function isValidSubscriptionId(id: unknown): id is string {
  return typeof id === "string" && SUBSCRIPTION_ID_RE.test(id);
}

/**
 * Map a raw `@parcel/watcher` event to the bridge shape: native event
 * type → coarse `kind`, absolute path → workspace-relative POSIX path.
 * Returns `null` for a path that resolves outside `root` (defensive — the
 * backend reports inside the watched dir, but a symlinked emission must
 * not leak an out-of-tree path to the renderer).
 *
 * Pure (no fs, no Electron) so the conversion is unit-testable.
 */
export function toRelativeChange(
  root: string,
  event: Pick<ParcelEvent, "type" | "path">
): WorkspaceChangeEvent | null {
  const rel = path.relative(root, event.path);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const rel_path = rel.split(path.sep).join("/");
  const kind =
    event.type === "create"
      ? "added"
      : event.type === "delete"
        ? "deleted"
        : "changed";
  return { kind, rel_path };
}

/**
 * Coalesce a buffer of changes: at most one event per `rel_path`, the
 * most recent kind winning (a rapid update→update collapses to one
 * `changed`; a create-then-delete collapses to `deleted` — the file is
 * gone, which is the truth the renderer should act on). Pure.
 */
export function coalesceChanges(
  events: readonly WorkspaceChangeEvent[]
): WorkspaceChangeEvent[] {
  const byPath = new Map<string, WorkspaceChangeEvent["kind"]>();
  for (const e of events) byPath.set(e.rel_path, e.kind);
  return [...byPath].map(([rel_path, kind]) => ({ kind, rel_path }));
}

/**
 * Ref-counts subscriptions per owner (WebContents) AND per workspace root
 * so a single OS watch backs every subscriber of the same folder. Generic
 * over the owner type so the bookkeeping is unit-testable without Electron
 * or `@parcel/watcher` (workspace-watcher-host.test.ts). The host layer
 * owns the actual watch handles, keyed by root; this class only answers
 * "is this the first / last subscriber for the root" so the host knows
 * when to start / dispose the watch.
 */
export class WorkspaceWatchRegistry<TOwner extends object> {
  private readonly subs = new Map<
    string,
    { owner: TOwner; root: string; workspaceId: string }
  >();
  /** root → set of subscription ids watching it (refcount + fan-out). */
  private readonly roots = new Map<string, Set<string>>();

  constructor(private readonly maxPerOwner: number) {}

  /**
   * Register a subscription. Throws on an invalid or already-used id, or
   * when the owner is at cap. Returns whether this is the FIRST subscriber
   * for `root` (the caller then starts the OS watch).
   */
  add(
    id: unknown,
    owner: TOwner,
    root: string,
    workspaceId: string
  ): { firstForRoot: boolean } {
    if (!isValidSubscriptionId(id)) {
      throw new Error("invalid subscription id");
    }
    if (this.subs.has(id)) {
      throw new Error(`subscription already exists: ${id}`);
    }
    let owned = 0;
    for (const record of this.subs.values()) {
      if (record.owner === owner) owned += 1;
    }
    if (owned >= this.maxPerOwner) {
      throw new Error("too many workspace watchers for this window");
    }
    this.subs.set(id, { owner, root, workspaceId });
    let set = this.roots.get(root);
    const firstForRoot = set === undefined;
    if (!set) {
      set = new Set();
      this.roots.set(root, set);
    }
    set.add(id);
    return { firstForRoot };
  }

  /**
   * Drop a subscription. Returns the root it watched and whether it was
   * the LAST subscriber (the caller then disposes the OS watch), or `null`
   * for an unknown id (idempotent — renderer unmount races host cleanup).
   */
  remove(id: unknown): { root: string; lastForRoot: boolean } | null {
    if (!isValidSubscriptionId(id)) return null;
    const record = this.subs.get(id);
    if (!record) return null;
    this.subs.delete(id);
    const set = this.roots.get(record.root);
    set?.delete(id);
    const lastForRoot = !set || set.size === 0;
    if (lastForRoot) this.roots.delete(record.root);
    return { root: record.root, lastForRoot };
  }

  /** Subscribers currently watching `root` (live fan-out target). */
  subscribersOfRoot(root: string): Array<{ id: string; owner: TOwner }> {
    const set = this.roots.get(root);
    if (!set) return [];
    const out: Array<{ id: string; owner: TOwner }> = [];
    for (const id of set) {
      const record = this.subs.get(id);
      if (record) out.push({ id, owner: record.owner });
    }
    return out;
  }

  hasSubscribersForRoot(root: string): boolean {
    return (this.roots.get(root)?.size ?? 0) > 0;
  }

  /**
   * Drop every subscription owned by `owner` (its window closed). Returns
   * the roots that lost their last subscriber, for the host to dispose.
   */
  removeAllFor(owner: TOwner): string[] {
    const disposedRoots: string[] = [];
    // Safe to iterate the live map: `remove` only deletes the current
    // entry, and deleting the current key mid Map-iteration is well-defined.
    for (const [id, record] of this.subs) {
      if (record.owner !== owner) continue;
      const result = this.remove(id);
      if (result?.lastForRoot) disposedRoots.push(result.root);
    }
    return disposedRoots;
  }
}

// ─────────────────────────── Electron host ───────────────────────────

const registry = new WorkspaceWatchRegistry<WebContents>(
  MAX_SUBSCRIPTIONS_PER_WEBCONTENTS
);

/** Per-root watch state. `sub` is `"starting"` between the async
 * subscribe() call and its resolution so a teardown mid-start is handled
 * by the startWatch post-await check rather than racing a half-open
 * handle. `buffer` coalesces by rel_path; `timer` is the pending flush. */
type WatchState = {
  sub: AsyncSubscription | "starting";
  buffer: Map<string, WorkspaceChangeEvent["kind"]>;
  timer: ReturnType<typeof setTimeout> | null;
};
const watches = new Map<string, WatchState>();

/** WebContents ids that already have a kill-on-destroy hook. */
const hookedWebContents = new Set<number>();

// @parcel/watcher is a native module, loaded lazily so importing this
// module (e.g. from tests exercising the pure helpers + registry) never
// touches the addon. The vite main bundle leaves it external; see
// vite.main.config.ts + the packaging recipe in forge.config.ts.
let watcherModule: typeof import("@parcel/watcher") | null = null;
async function loadWatcher(): Promise<typeof import("@parcel/watcher")> {
  if (!watcherModule) {
    watcherModule = await import("@parcel/watcher");
  }
  return watcherModule;
}

/**
 * Register a renderer's subscription and ensure the workspace root is
 * being watched. `wc` owns the subscription (kill-on-close + the only
 * window that receives its events). `root` is the host-resolved absolute
 * workspace root — the caller (ipc-handlers) resolves it from the sidecar
 * registry; this function never sees a renderer-supplied path.
 */
export async function subscribeWorkspaceChanges(
  wc: WebContents,
  opts: { id: string; root: string; workspaceId: string }
): Promise<void> {
  const { id, root } = opts;
  // Synchronous reservation BEFORE the await below — closes the window
  // where two concurrent subscribes for a fresh root both think they're
  // first (and start two watches).
  const { firstForRoot } = registry.add(id, wc, root, opts.workspaceId);

  // Kill subscriptions on window close — no reattach in v1.
  if (!hookedWebContents.has(wc.id)) {
    hookedWebContents.add(wc.id);
    wc.once("destroyed", () => {
      hookedWebContents.delete(wc.id);
      for (const disposedRoot of registry.removeAllFor(wc)) {
        void disposeWatch(disposedRoot);
      }
    });
  }

  if (firstForRoot) {
    try {
      await startWatch(root);
    } catch (err) {
      // The OS watch couldn't start — roll the subscription back so the
      // renderer's promise rejects and it can fall back to pull-refresh.
      registry.remove(id);
      throw err;
    }
  }
}

/** Tear down one subscription; disposes the OS watch if it was the last. */
export function unsubscribeWorkspaceChanges(id: unknown): void {
  const result = registry.remove(id);
  if (result?.lastForRoot) void disposeWatch(result.root);
}

async function startWatch(root: string): Promise<void> {
  watches.set(root, { sub: "starting", buffer: new Map(), timer: null });
  const watcher = await loadWatcher();
  let subscription: AsyncSubscription;
  try {
    subscription = await watcher.subscribe(
      root,
      (err, events) => onRawEvents(root, err, events),
      { ignore: [...WATCH_IGNORE] } satisfies ParcelOptions
    );
  } catch (err) {
    watches.delete(root);
    throw err;
  }
  // A teardown (last unsubscribe / window close) may have landed while the
  // subscribe() was in flight: `disposeWatch` deleted the entry. Honor it
  // by closing the handle we just opened instead of resurrecting it.
  if (!watches.has(root) || !registry.hasSubscribersForRoot(root)) {
    void subscription.unsubscribe().catch(() => {});
    watches.delete(root);
    return;
  }
  watches.get(root)!.sub = subscription;
}

function onRawEvents(
  root: string,
  err: Error | null,
  events: ParcelEvent[]
): void {
  const state = watches.get(root);
  if (!state) return;
  if (err) {
    console.error(`[grida] workspace watch error (${root}):`, err);
    return;
  }
  for (const event of events) {
    const change = toRelativeChange(root, event);
    if (change) state.buffer.set(change.rel_path, change.kind);
  }
  if (state.buffer.size > 0 && state.timer === null) {
    state.timer = setTimeout(() => flush(root), COALESCE_MS);
  }
}

function flush(root: string): void {
  const state = watches.get(root);
  if (!state) return;
  state.timer = null;
  if (state.buffer.size === 0) return;
  const events: WorkspaceChangeEvent[] = [...state.buffer].map(
    ([rel_path, kind]) => ({ kind, rel_path })
  );
  state.buffer.clear();
  for (const { id, owner } of registry.subscribersOfRoot(root)) {
    if (!owner.isDestroyed()) {
      owner.send(IPC_CHANNELS.WORKSPACE_CHANGE, {
        subscription_id: id,
        events,
      });
    }
  }
}

async function disposeWatch(root: string): Promise<void> {
  const state = watches.get(root);
  if (!state) return;
  watches.delete(root);
  if (state.timer !== null) clearTimeout(state.timer);
  if (state.sub !== "starting") {
    await state.sub.unsubscribe().catch(() => {});
  }
  // If still "starting", the in-flight startWatch sees the deleted entry
  // after its await and unsubscribes the handle itself.
}

/** App-quit belt-and-suspenders for paths that skip webContents teardown. */
export async function disposeAllWorkspaceWatches(): Promise<void> {
  const roots = [...watches.keys()];
  await Promise.all(roots.map((root) => disposeWatch(root)));
}

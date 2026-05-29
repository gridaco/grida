import type { NodeId } from "../types";
import type { TreeSource } from "../source";

/**
 * Per-node load lifecycle exposed by `AsyncTreeSourceHandle.getLoadState`.
 *
 * - `unloaded` — children have not been requested yet.
 * - `loading` — `listChildren` is in flight.
 * - `loaded` — children resolved and committed.
 * - `error` — `listChildren` rejected; the error is available via
 *   `getError(id)`. The node stays in this state until `invalidate(id)`
 *   or a subsequent `load(id)` retries.
 */
export type LoadState = "unloaded" | "loading" | "loaded" | "error";

/**
 * One entry in a `listChildren` result.
 *
 * `hasChildren` is the chevron hint for THIS child — the producer knows
 * whether it is a container at listing time (a file vs a folder, a
 * collection vs a leaf record). If you genuinely don't know cheaply,
 * return `true` and let the next `listChildren(id)` return `[]` to
 * correct the chevron post-load.
 */
export interface AsyncTreeEntry<TMeta = unknown> {
  readonly id: NodeId;
  readonly hasChildren: boolean;
  readonly meta?: TMeta;
}

/**
 * Watcher / SSE / poll event from the producer. The adapter applies
 * these against its internal cache and bumps the source's version.
 *
 * Four shapes by design:
 *
 * - `invalidated` — coarse. "Something under `id` changed; drop my
 *   cached listing so the next expand re-lists." Children that are
 *   currently visible stay visible until the re-listing commits a
 *   replacement.
 * - `created` — granular. Append `entry` to `parent`'s children.
 * - `deleted` — granular. Remove `child` from `parent`'s children and
 *   prune its subtree from the cache.
 * - `changed` — granular. Replace the meta for `id`.
 *
 * Watchers vary in fidelity; emit what you have. Coarse-only is fine.
 */
export type AsyncChangeEvent<TMeta = unknown> =
  | { readonly type: "invalidated"; readonly id: NodeId }
  | {
      readonly type: "created";
      readonly parent: NodeId;
      readonly entry: AsyncTreeEntry<TMeta>;
    }
  | {
      readonly type: "deleted";
      readonly parent: NodeId;
      readonly child: NodeId;
    }
  | {
      readonly type: "changed";
      readonly id: NodeId;
      readonly meta: TMeta;
    };

/**
 * The contract the consumer implements. Transport-agnostic — wrap
 * `fs.promises.readdir`, an HTTP endpoint, an IPC bridge, OPFS, S3
 * `listObjects`, whatever.
 *
 * Reference stability rule: the adapter caches the adapted `TreeNode`
 * objects keyed on (children, meta) of THIS node — if your
 * `listChildren` returns fresh `meta` references on every call for a
 * conceptually-unchanged child, the adapter will rebuild its
 * `TreeNode` and downstream `useTreeSnapshot` selectors keyed on
 * `meta` will thrash. Memoize on your side, or accept the cost.
 */
export interface AsyncTreeProvider<TMeta = unknown> {
  readonly rootId: NodeId;

  /**
   * Synchronous chevron hint. Called once per id; the result is cached
   * by the adapter. For unknown-cost cases (a remote URL where you
   * don't know if it's a folder without listing), return `true` and
   * let the listing self-correct.
   */
  hasChildren(id: NodeId): boolean;

  /**
   * The sole async point. Resolve with the new entries — throw / reject
   * to enter the `error` state. `signal` aborts when the consumer
   * collapses the node mid-load (or calls `handle.abort(id)`).
   *
   * Re-list semantics: subsequent `listChildren` calls REPLACE the
   * cached children. Children present in both the old and new listing
   * keep their cached subtree (load state, descendants); children
   * absent from the new listing are pruned.
   */
  listChildren(
    id: NodeId,
    signal: AbortSignal
  ): Promise<ReadonlyArray<AsyncTreeEntry<TMeta>>>;

  /**
   * Optional. Subscribe to mutation events from the underlying store
   * (fs watcher, SSE, websocket, poll). The handler receives batches —
   * pass change events as they arrive; the adapter applies them and
   * bumps the source's version once per batch.
   */
  subscribeChanges?(
    handler: (events: ReadonlyArray<AsyncChangeEvent<TMeta>>) => void
  ): () => void;

  /** Optional. Meta to attach to the root node. */
  getRootMeta?(): TMeta | undefined;
}

/**
 * Options accepted by `createAsyncTreeSource`.
 */
export interface AsyncSourceOptions {
  /**
   * If `true`, the root's `listChildren` is invoked once during source
   * construction. Defaults to `true` — without it the tree starts
   * empty and the consumer must call `handle.load(rootId)` manually.
   */
  readonly autoLoadRoot?: boolean;

  /**
   * Controls whether the produced `TreeSource` reports the root node
   * as a visible row. Mirrors `TreeSource.showRoot?()`; defaults to
   * `false` (layer-panel convention — only the root's subtree renders).
   */
  readonly showRoot?: boolean;

  /**
   * Optional sink for errors that escape the per-node `error` state
   * (programmer mistakes, unexpected `subscribeChanges` errors). Errors
   * surfaced via `listChildren` already land on `getError(id)` — this
   * callback is for debugging, not user-facing handling.
   */
  readonly onError?: (id: NodeId, err: unknown) => void;
}

/**
 * The object returned by `createAsyncTreeSource`. The `source` plugs
 * into `new TreeController({ source })` exactly like any other
 * `TreeSource`. Load state is queried side-channel via `getLoadState`.
 */
export interface AsyncTreeSourceHandle<TMeta = unknown> {
  /** The synchronous `TreeSource` the controller consumes. */
  readonly source: TreeSource<TMeta>;

  /** Current load state for `id`. Throws on unknown ids — consistent
   *  with `source.getNode` and `source.isContainer`. Use `hasNode(id)`
   *  to probe membership without throwing. */
  getLoadState(id: NodeId): LoadState;

  /** The error stored for `id` if `getLoadState(id) === "error"`.
   *  Throws on unknown ids; returns `null` when the node has no
   *  recorded error. */
  getError(id: NodeId): unknown | null;

  /** `true` if the source has observed `id` (root + anything reached
   *  through a previous `listChildren` resolution). Use to guard
   *  `getLoadState` / `getError` / `getNode` calls on potentially-
   *  stale ids (drag held across a deletion, focused id from a
   *  different source). */
  hasNode(id: NodeId): boolean;

  /**
   * Manually request a load for `id`. Idempotent — a no-op if `id` is
   * already `loading` or `loaded`. Use to pre-warm, retry after error,
   * or load without expanding.
   */
  load(id: NodeId): void;

  /**
   * Abort the in-flight `listChildren` for `id`, if any. The node
   * returns to `unloaded` so a subsequent `load` re-runs the listing.
   */
  abort(id: NodeId): void;

  /**
   * Drop the cached listing for `id` — its `loadState` returns to
   * `unloaded` so the next `load(id)` re-lists. Currently visible
   * children stay until the re-listing commits a replacement.
   */
  invalidate(id: NodeId): void;

  /** Aborts all in-flight loads and clears subscriptions. */
  dispose(): void;
}

import type { NodeId, TreeNode } from "../types";
import type { LoadState } from "./types";

/**
 * The internal per-node record kept by `createAsyncTreeSource`.
 *
 * Distinct from the public `TreeNode<TMeta>` because we hold lifecycle
 * fields (`loadState`, `error`) that the source surfaces side-channel,
 * not via `TreeNode.meta`. The cached `adapted` field is the
 * reference-stable `TreeNode` returned to the controller — it is only
 * rebuilt when one of (`parent`, `children`, `meta`) changes.
 */
export interface NodeRecord<TMeta> {
  id: NodeId;
  parent: NodeId | null;
  hasChildren: boolean;
  children: readonly NodeId[];
  meta: TMeta | undefined;
  loadState: LoadState;
  error: unknown | null;
  adapted: TreeNode<TMeta>;
}

/**
 * Build a fresh `NodeRecord` for `id`. Initial `loadState` is
 * `"unloaded"`; the consumer of this helper bumps it.
 */
export function createRecord<TMeta>(
  id: NodeId,
  parent: NodeId | null,
  hasChildren: boolean,
  meta: TMeta | undefined
): NodeRecord<TMeta> {
  const adapted = {
    id,
    parent,
    children: [] as readonly NodeId[],
    meta,
  } as TreeNode<TMeta>;
  return {
    id,
    parent,
    hasChildren,
    children: adapted.children,
    meta,
    loadState: "unloaded",
    error: null,
    adapted,
  };
}

/**
 * Rebuild the cached `adapted` `TreeNode` for `rec` if any of the
 * fields the renderer observes changed. Reference-stable when nothing
 * changed (FEEDBACKS F1 discipline — `useSyncExternalStore` selectors
 * keyed on `getNode()` see no change).
 */
export function syncAdapted<TMeta>(rec: NodeRecord<TMeta>): void {
  const prev = rec.adapted;
  if (
    prev.parent === rec.parent &&
    prev.children === rec.children &&
    prev.meta === rec.meta &&
    prev.id === rec.id
  ) {
    return;
  }
  rec.adapted = {
    id: rec.id,
    parent: rec.parent,
    children: rec.children,
    meta: rec.meta,
  } as TreeNode<TMeta>;
}

/**
 * The store the async source maintains internally. Keeps records keyed
 * by id, a monotonically-increasing version, listener set, and the
 * map of in-flight `AbortController`s for cancellation.
 *
 * The store itself is pure data + emit — it never reaches out to the
 * provider. The source layer above wires the provider calls.
 */
export class AsyncStore<TMeta> {
  readonly records = new Map<NodeId, NodeRecord<TMeta>>();
  readonly inflight = new Map<NodeId, AbortController>();
  private _version = 0;
  private _listeners = new Set<() => void>();
  /**
   * `notify()` is debounced inside one mutation batch via `_dirty`.
   * Callers wrap a mutation in `mutate(fn)` and only one `bump()`
   * fires regardless of how many records changed.
   */
  private _dirty = false;
  private _batchDepth = 0;

  getVersion(): number {
    return this._version;
  }

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Batch a set of record mutations into one version bump and one
   * notification. Nested calls collapse to a single notify at the
   * outer exit.
   */
  mutate(fn: () => void): void {
    this._batchDepth++;
    try {
      fn();
    } finally {
      this._batchDepth--;
      if (this._batchDepth === 0 && this._dirty) {
        this._dirty = false;
        this._version++;
        // Isolate listener exceptions: one buggy subscriber must not
        // silently drop notifications to the rest of the chain.
        // Errors are reported via console.error so they remain visible
        // in dev without taking down the store.
        for (const l of this._listeners) {
          try {
            l();
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error(
              "[grida/tree-view] async store subscriber threw",
              err
            );
          }
        }
      }
    }
  }

  /** Mark the store dirty — call after any record write inside `mutate`. */
  markDirty(): void {
    this._dirty = true;
  }

  /**
   * Delete `id` and every descendant of `id` reachable through the
   * cached `children` lists. Mirrors `InMemoryTreeSource.remove` — a
   * leak otherwise (orphans pile up in `records`).
   */
  pruneSubtree(id: NodeId): void {
    const stack: NodeId[] = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const rec = this.records.get(cur);
      if (!rec) continue;
      stack.push(...rec.children);
      this.records.delete(cur);
      // Defensive: if a load was in-flight against this id, abort it.
      const ac = this.inflight.get(cur);
      if (ac) {
        ac.abort();
        this.inflight.delete(cur);
      }
    }
  }

  /** Abort every in-flight controller and clear listeners. */
  dispose(): void {
    for (const ac of this.inflight.values()) ac.abort();
    this.inflight.clear();
    this._listeners.clear();
    this.records.clear();
  }
}

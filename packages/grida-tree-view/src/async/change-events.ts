import type { NodeId } from "../types";
import type { AsyncChangeEvent, AsyncTreeEntry } from "./types";
import {
  type AsyncStore,
  type NodeRecord,
  createRecord,
  syncAdapted,
} from "./state";

/**
 * Apply one batch of change events to the store. Wraps the writes in
 * `store.mutate` so the version bumps once and listeners see the
 * batch atomically.
 *
 * Unknown ids in events are silently ignored — the producer's watcher
 * may emit events for ids the adapter never observed (because their
 * parent was never expanded). That's correct behavior, not an error.
 */
export function applyChangeEvents<TMeta>(
  store: AsyncStore<TMeta>,
  events: ReadonlyArray<AsyncChangeEvent<TMeta>>
): void {
  if (events.length === 0) return;
  store.mutate(() => {
    for (const ev of events) applyOne(store, ev);
  });
}

function applyOne<TMeta>(
  store: AsyncStore<TMeta>,
  ev: AsyncChangeEvent<TMeta>
): void {
  switch (ev.type) {
    case "invalidated":
      applyInvalidated(store, ev.id);
      return;
    case "created":
      applyCreated(store, ev.parent, ev.entry);
      return;
    case "deleted":
      applyDeleted(store, ev.parent, ev.child);
      return;
    case "changed":
      applyChanged(store, ev.id, ev.meta);
      return;
  }
}

function applyInvalidated<TMeta>(store: AsyncStore<TMeta>, id: NodeId): void {
  const rec = store.records.get(id);
  if (!rec) return;
  // Cached listing is stale; next expand re-lists. Children stay
  // visible — the producer can chain `deleted` events if it wants a
  // wipe.
  if (rec.loadState === "loaded" || rec.loadState === "error") {
    rec.loadState = "unloaded";
    rec.error = null;
    store.markDirty();
  }
}

/**
 * Apply a `hasChildren` transition on an existing record. The
 * container → leaf direction is destructive: the cached children
 * list and every descendant record are pruned, because they no
 * longer exist in the producer's view. `syncAdapted(rec)` should
 * still be called by the caller after — this helper only mutates
 * the record's fields + descendant cache.
 */
function applyHasChildrenTransition<TMeta>(
  store: AsyncStore<TMeta>,
  rec: NodeRecord<TMeta>,
  hasChildren: boolean
): void {
  if (rec.hasChildren === hasChildren) return;
  if (rec.hasChildren && !hasChildren && rec.children.length > 0) {
    // Container → leaf: prune the entire cached subtree. Producers
    // documented `listChildren` as the canonical replace; a re-list
    // (or re-create) that flips the hint to leaf implies the
    // descendants are gone.
    for (const childId of rec.children) store.pruneSubtree(childId);
    rec.children = [];
    // A leaf is implicitly "loaded" — no listing to fire. If the
    // node was previously "unloaded" (rare), keep that state honest.
    if (rec.loadState === "loaded" || rec.loadState === "error") {
      rec.error = null;
    }
  }
  rec.hasChildren = hasChildren;
}

function applyCreated<TMeta>(
  store: AsyncStore<TMeta>,
  parentId: NodeId,
  entry: AsyncTreeEntry<TMeta>
): void {
  const parent = store.records.get(parentId);
  if (!parent) return;
  const existing = store.records.get(entry.id);
  if (existing) {
    // Same parent → meta-only idempotent replay. Children list is
    // untouched.
    if (existing.parent === parentId) {
      if (existing.meta !== entry.meta) {
        existing.meta = entry.meta;
        syncAdapted(existing);
        store.markDirty();
      }
      if (existing.hasChildren !== entry.hasChildren) {
        applyHasChildrenTransition(store, existing, entry.hasChildren);
        syncAdapted(existing);
        store.markDirty();
      }
      if (!parent.children.includes(entry.id)) {
        // Pointer was right but the listing somehow lost it — restore.
        parent.children = [...parent.children, entry.id];
        syncAdapted(parent);
        store.markDirty();
      }
      return;
    }
    // Cross-parent → producer is reparenting. Detach from the old
    // parent's children list (if still cached) and rebind under the
    // new parent. Preserves the cached subtree (loadState + children)
    // under `existing`.
    if (existing.parent != null) {
      const oldParent = store.records.get(existing.parent);
      if (oldParent && oldParent.children.includes(entry.id)) {
        oldParent.children = oldParent.children.filter((c) => c !== entry.id);
        syncAdapted(oldParent);
      }
    }
    existing.parent = parentId;
    if (existing.meta !== entry.meta) existing.meta = entry.meta;
    if (existing.hasChildren !== entry.hasChildren) {
      applyHasChildrenTransition(store, existing, entry.hasChildren);
    }
    syncAdapted(existing);
    if (!parent.children.includes(entry.id)) {
      parent.children = [...parent.children, entry.id];
      syncAdapted(parent);
    }
    store.markDirty();
    return;
  }
  const rec = createRecord<TMeta>(
    entry.id,
    parentId,
    entry.hasChildren,
    entry.meta
  );
  store.records.set(entry.id, rec);
  // Append to parent's children list.
  parent.children = [...parent.children, entry.id];
  syncAdapted(parent);
  store.markDirty();
}

function applyDeleted<TMeta>(
  store: AsyncStore<TMeta>,
  parentId: NodeId,
  childId: NodeId
): void {
  const parent = store.records.get(parentId);
  if (!parent) return;
  if (!parent.children.includes(childId)) return;
  parent.children = parent.children.filter((c) => c !== childId);
  syncAdapted(parent);
  store.pruneSubtree(childId);
  store.markDirty();
}

function applyChanged<TMeta>(
  store: AsyncStore<TMeta>,
  id: NodeId,
  meta: TMeta
): void {
  const rec = store.records.get(id);
  if (!rec) return;
  if (rec.meta === meta) return;
  rec.meta = meta;
  syncAdapted(rec);
  store.markDirty();
}

/**
 * Replace the children list of `parent` with the result of a
 * `listChildren` resolution. Survives invalidate-then-relist by
 * merging — existing child records whose ids are still present in the
 * new listing retain their subtree (children + loadState); ids no
 * longer present are pruned.
 */
export function commitListing<TMeta>(
  store: AsyncStore<TMeta>,
  parentId: NodeId,
  entries: ReadonlyArray<AsyncTreeEntry<TMeta>>
): void {
  const parent = store.records.get(parentId);
  if (!parent) return;
  store.mutate(() => {
    const nextIds: NodeId[] = [];
    const seen = new Set<NodeId>();
    for (const entry of entries) {
      nextIds.push(entry.id);
      seen.add(entry.id);
      const existing = store.records.get(entry.id);
      if (existing) {
        let changed = false;
        if (existing.parent !== parentId) {
          // Cross-parent re-list: this child was previously cached
          // under a different parent. Detach from the old parent's
          // children list to avoid the same id appearing in two
          // parents' children at once.
          if (existing.parent != null) {
            const old = store.records.get(existing.parent);
            if (old && old.children.includes(entry.id)) {
              old.children = old.children.filter((c) => c !== entry.id);
              syncAdapted(old);
            }
          }
          existing.parent = parentId;
          changed = true;
        }
        if (existing.meta !== entry.meta) {
          existing.meta = entry.meta;
          changed = true;
        }
        if (existing.hasChildren !== entry.hasChildren) {
          applyHasChildrenTransition(store, existing, entry.hasChildren);
          changed = true;
        }
        if (changed) syncAdapted(existing);
      } else {
        const rec: NodeRecord<TMeta> = createRecord(
          entry.id,
          parentId,
          entry.hasChildren,
          entry.meta
        );
        store.records.set(entry.id, rec);
      }
    }
    // Prune anything in the previous list that's not in the new one.
    for (const oldId of parent.children) {
      if (!seen.has(oldId)) store.pruneSubtree(oldId);
    }
    parent.children = nextIds;
    syncAdapted(parent);
    store.markDirty();
  });
}

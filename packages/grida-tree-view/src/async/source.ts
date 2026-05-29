import type { Listener, NodeId, TreeNode } from "../types";
import type { TreeSource } from "../source";
import type { TreeController } from "../controller";
import type {
  AsyncSourceOptions,
  AsyncTreeProvider,
  AsyncTreeSourceHandle,
  LoadState,
} from "./types";
import { AsyncStore, createRecord } from "./state";
import { applyChangeEvents, commitListing } from "./change-events";

/**
 * Adapt an `AsyncTreeProvider` into a synchronous `TreeSource` plus a
 * load-state side channel. The returned `source` plugs into
 * `TreeController` unchanged.
 *
 * The adapter owns: per-node `LoadState`, in-flight `AbortController`
 * dedupe, reference-stable adapted `TreeNode` cache, change-event
 * coalescing into version bumps.
 *
 * What it does NOT own: transport (the provider's responsibility),
 * retry policy (re-call `load(id)` after an error to retry), URI
 * parsing, synthetic placeholder rows.
 */
export function createAsyncTreeSource<TMeta>(
  provider: AsyncTreeProvider<TMeta>,
  options: AsyncSourceOptions = {}
): AsyncTreeSourceHandle<TMeta> {
  const store = new AsyncStore<TMeta>();

  // Seed the root record. Root has no parent and its hasChildren is
  // queried directly from the provider — children come from
  // listChildren on the first load.
  const rootHasChildren = provider.hasChildren(provider.rootId);
  const rootMeta = provider.getRootMeta?.();
  const rootRec = createRecord<TMeta>(
    provider.rootId,
    null,
    rootHasChildren,
    rootMeta
  );
  // A leaf root is already "loaded" — there's nothing to list. Save
  // the controller a no-op transition by setting the state up front.
  if (!rootHasChildren) rootRec.loadState = "loaded";
  store.records.set(provider.rootId, rootRec);

  const onError = options.onError;

  function load(id: NodeId): void {
    const rec = store.records.get(id);
    if (!rec) return;
    if (rec.loadState === "loading" || rec.loadState === "loaded") return;
    // Leaves have no listing to fire. Transition directly to "loaded"
    // — equivalent to a successful empty listChildren without burning
    // a provider call.
    if (!rec.hasChildren) {
      store.mutate(() => {
        rec.loadState = "loaded";
        rec.error = null;
        store.markDirty();
      });
      return;
    }

    const ac = new AbortController();
    store.inflight.set(id, ac);
    store.mutate(() => {
      rec.loadState = "loading";
      rec.error = null;
      store.markDirty();
    });

    provider.listChildren(id, ac.signal).then(
      (entries) => {
        if (ac.signal.aborted) return;
        // Defensive: the record may have been pruned mid-flight (e.g.
        // a deleted parent up the chain). Bail in that case.
        const live = store.records.get(id);
        if (!live) {
          store.inflight.delete(id);
          return;
        }
        store.inflight.delete(id);
        // Wrap commitListing + the loadState flip in one outer mutate
        // so the version bumps once and listeners notify once for the
        // resolution. commitListing's inner mutate collapses into this
        // batch via AsyncStore._batchDepth.
        store.mutate(() => {
          commitListing(store, id, entries);
          live.loadState = "loaded";
          store.markDirty();
        });
      },
      (err) => {
        if (ac.signal.aborted) {
          // The consumer aborted — reset to unloaded so a re-expand
          // re-issues the load. Do NOT surface the error.
          const live = store.records.get(id);
          if (live) {
            store.mutate(() => {
              live.loadState = "unloaded";
              live.error = null;
              store.markDirty();
            });
          }
          store.inflight.delete(id);
          return;
        }
        store.inflight.delete(id);
        const live = store.records.get(id);
        if (!live) return;
        store.mutate(() => {
          live.loadState = "error";
          live.error = err;
          store.markDirty();
        });
        onError?.(id, err);
      }
    );
  }

  function abort(id: NodeId): void {
    const ac = store.inflight.get(id);
    if (!ac) return;
    ac.abort();
    // The Promise's rejection handler resets loadState; nothing more
    // to do here.
  }

  function invalidate(id: NodeId): void {
    applyChangeEvents(store, [{ type: "invalidated", id }]);
  }

  // Wire the optional change-event subscription. The handler is
  // captured by reference so dispose() can release the producer's
  // resources too.
  let unsubscribeChanges: (() => void) | null = null;
  if (provider.subscribeChanges) {
    try {
      unsubscribeChanges = provider.subscribeChanges((events) => {
        applyChangeEvents(store, events);
      });
    } catch (err) {
      onError?.(provider.rootId, err);
    }
  }

  const showRoot = options.showRoot ?? false;

  // Build the synchronous TreeSource facade.
  const source: TreeSource<TMeta> = {
    getRoot() {
      return provider.rootId;
    },
    showRoot() {
      return showRoot;
    },
    getNode(id: NodeId): TreeNode<TMeta> {
      const rec = store.records.get(id);
      if (!rec) {
        throw new Error(`[grida/tree-view] async: unknown node: ${id}`);
      }
      return rec.adapted;
    },
    getVersion() {
      return store.getVersion();
    },
    subscribe(listener: Listener) {
      return store.subscribe(listener);
    },
    isContainer(id: NodeId): boolean {
      const rec = store.records.get(id);
      // Unknown ids throw — consistent with getNode. Callers that need
      // a defensive read should guard with a try/catch or `hasNode`.
      if (!rec) {
        throw new Error(`[grida/tree-view] async: unknown node: ${id}`);
      }
      return rec.hasChildren;
    },
  };

  const autoLoadRoot = options.autoLoadRoot ?? true;
  if (autoLoadRoot && rootHasChildren) {
    load(provider.rootId);
  }

  return {
    source,
    getLoadState(id: NodeId): LoadState {
      const rec = store.records.get(id);
      // Unknown ids throw — consistent with getNode + isContainer.
      // Use `hasNode(id)` to probe without throwing.
      if (!rec) {
        throw new Error(`[grida/tree-view] async: unknown node: ${id}`);
      }
      return rec.loadState;
    },
    getError(id: NodeId): unknown | null {
      const rec = store.records.get(id);
      if (!rec) {
        throw new Error(`[grida/tree-view] async: unknown node: ${id}`);
      }
      return rec.error;
    },
    hasNode(id: NodeId): boolean {
      return store.records.has(id);
    },
    load,
    abort,
    invalidate,
    dispose() {
      unsubscribeChanges?.();
      store.dispose();
    },
  };
}

/**
 * Wire a handle's auto-load behavior to a controller's `expanded`
 * channel. Expanding a node with `loadState === "unloaded"` triggers
 * `handle.load(id)`; collapsing a node with `loadState === "loading"`
 * triggers `handle.abort(id)`.
 *
 * Keep the binding optional so consumers who want manual load control
 * (preloaded prefixes, eager children of selected ancestors, …) can
 * leave it off.
 */
export function bindAsyncTreeController<TMeta>(
  controller: TreeController<TMeta>,
  handle: AsyncTreeSourceHandle<TMeta>
): () => void {
  let prev = new Set<NodeId>(controller.getExpanded());
  // Kick off loads for anything already expanded at bind time (e.g. an
  // initial-expanded set passed via `TreeController` options).
  for (const id of prev) {
    if (handle.hasNode(id) && handle.getLoadState(id) === "unloaded") {
      handle.load(id);
    }
  }
  return controller.subscribe("expanded", () => {
    const now = controller.getExpanded();
    for (const id of now) {
      if (prev.has(id)) continue;
      // `expandTo` may add ancestors whose subtree the source has not
      // observed yet (their parent was never listed). The load skips
      // them quietly — a deeper "reveal-through-unloaded-ancestors"
      // mechanism is a separate design (would need a reveal-path the
      // adapter walks from root). See review finding #6.
      if (!handle.hasNode(id)) continue;
      if (handle.getLoadState(id) === "unloaded") handle.load(id);
    }
    for (const id of prev) {
      if (now.has(id)) continue;
      if (!handle.hasNode(id)) continue;
      if (handle.getLoadState(id) === "loading") handle.abort(id);
    }
    prev = new Set(now);
  });
}

import type {
  AsyncChangeEvent,
  AsyncTreeEntry,
  AsyncTreeProvider,
} from "../../src/async";
import type { NodeId } from "../..";

interface FakeNode {
  id: NodeId;
  hasChildren: boolean;
  children: NodeId[];
  meta: { label: string };
}

export interface FakeProviderControls<TMeta = { label: string }> {
  provider: AsyncTreeProvider<TMeta>;
  /** Resolve the next in-flight listChildren for `id` (FIFO). */
  resolve(id: NodeId): Promise<void>;
  /** Reject the next in-flight listChildren for `id`. */
  reject(id: NodeId, err: unknown): Promise<void>;
  /** Number of unresolved listChildren calls for `id`. */
  pending(id: NodeId): number;
  /** Emit watcher events to the subscriber, if any. */
  emit(events: ReadonlyArray<AsyncChangeEvent<TMeta>>): void;
  /** Whether the most-recent listChildren for `id` aborted. */
  wasAborted(id: NodeId): boolean;
}

/**
 * Build a controllable fake `AsyncTreeProvider` backed by an in-memory
 * tree. `listChildren` returns a Promise the test resolves manually so
 * ordering of state transitions is observable. Mirrors the discipline
 * of the package's other unit tests — deterministic, no real I/O.
 */
export function createFakeFsProvider(init: {
  rootId?: NodeId;
  tree: ReadonlyArray<FakeNode>;
}): FakeProviderControls {
  const rootId = init.rootId ?? "<root>";
  const map = new Map<NodeId, FakeNode>();
  for (const n of init.tree) map.set(n.id, n);

  type Pending = {
    resolve: (
      entries: ReadonlyArray<AsyncTreeEntry<{ label: string }>>
    ) => void;
    reject: (err: unknown) => void;
    aborted: boolean;
  };
  const pending = new Map<NodeId, Pending[]>();
  const abortedSnapshot = new Map<NodeId, boolean>();
  let changeHandler:
    | ((events: ReadonlyArray<AsyncChangeEvent<{ label: string }>>) => void)
    | null = null;

  const provider: AsyncTreeProvider<{ label: string }> = {
    rootId,
    hasChildren(id) {
      return map.get(id)?.hasChildren ?? false;
    },
    listChildren(id, signal) {
      return new Promise((resolve, reject) => {
        const slot: Pending = {
          resolve: (entries) => resolve(entries),
          reject,
          aborted: false,
        };
        const queue = pending.get(id) ?? [];
        queue.push(slot);
        pending.set(id, queue);
        signal.addEventListener("abort", () => {
          slot.aborted = true;
          abortedSnapshot.set(id, true);
          // Remove this slot from the queue — `pending(id)` must reflect
          // outstanding requests, not historical ones.
          const q = pending.get(id);
          if (q) {
            const idx = q.indexOf(slot);
            if (idx >= 0) q.splice(idx, 1);
          }
          // Reject so the source's signal-aware error branch resets to
          // `unloaded`.
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    },
    subscribeChanges(handler) {
      changeHandler = handler;
      return () => {
        changeHandler = null;
      };
    },
    getRootMeta() {
      return map.get(rootId)?.meta;
    },
  };

  function flush(): Promise<void> {
    // Two microtask flushes: one for the resolver, one for the source's
    // .then chain.
    return Promise.resolve().then(() => Promise.resolve());
  }

  return {
    provider,
    async resolve(id) {
      const queue = pending.get(id);
      if (!queue || queue.length === 0) {
        throw new Error(`no pending listChildren for ${id}`);
      }
      const slot = queue.shift()!;
      const node = map.get(id);
      const entries: AsyncTreeEntry<{ label: string }>[] = (
        node?.children ?? []
      ).map((cid) => {
        const c = map.get(cid)!;
        return { id: cid, hasChildren: c.hasChildren, meta: c.meta };
      });
      slot.resolve(entries);
      await flush();
    },
    async reject(id, err) {
      const queue = pending.get(id);
      if (!queue || queue.length === 0) {
        throw new Error(`no pending listChildren for ${id}`);
      }
      const slot = queue.shift()!;
      slot.reject(err);
      await flush();
    },
    pending(id) {
      return pending.get(id)?.length ?? 0;
    },
    emit(events) {
      changeHandler?.(events);
    },
    wasAborted(id) {
      return abortedSnapshot.get(id) ?? false;
    },
  };
}

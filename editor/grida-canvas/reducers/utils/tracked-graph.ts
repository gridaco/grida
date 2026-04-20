import tree from "@grida/tree";
import type { OpBuffer } from "../../sync";

type Graph = InstanceType<typeof tree.graph.Graph>;
type Op = Parameters<OpBuffer["push"]>[0];

/**
 * Wrap a `Graph` so structural mutations emit ops into an {@link OpBuffer}.
 *
 * | call                   | emits                                          |
 * | ---------------------- | ---------------------------------------------- |
 * | `mv(src, target, idx)` | `sync_links(old_parent_i, ...)` then            |
 * |                        | `sync_links(target, ...)`                       |
 * | `order(id, dir)`       | `sync_links(parent_of_id, ...)`                 |
 * | `unlink(id)`           | `sync_links(old_parent, ...)` + `delete_node`   |
 * | `rm(id)`               | `delete_node` for each removed id +             |
 * |                        | `sync_links(old_parent, ...)`                   |
 * | `import(sub, …)`       | `replace_node` for each new id, then            |
 * |                        | `sync_links(target, ...)` (inner `mv` silenced) |
 *
 * Node-property changes don't come through `Graph`; the reducer emits
 * `replace_node` ops for those from Immer patches / bypass clone set.
 * If an underlying method throws, no op is emitted — the buffer stays
 * consistent with the graph.
 */
export function createTrackedGraph<T extends Graph>(
  graph: T,
  buffer: OpBuffer
): T {
  const originals = {
    mv: graph.mv.bind(graph),
    rm: graph.rm.bind(graph),
    unlink: graph.unlink.bind(graph),
    order: graph.order.bind(graph),
    import: graph.import.bind(graph),
  };

  // `@grida/tree` does not expose `links` / `nodes` / `parentOf` publicly,
  // so we read `graph.lut` (cached getter, O(1)) and the private `.graph`
  // shape. Revisit if the tree package adds a public accessor.
  const lutParent = (id: string): string | null | undefined =>
    graph.lut.lu_parent[id];
  const childrenOf = (parent: string): readonly string[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr = (graph as any).graph?.links?.[parent];
    return Array.isArray(arr) ? [...arr] : [];
  };
  const allNodeIds = (): string[] =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.keys((graph as any).graph?.nodes ?? {});

  const syncLinksOp = (parent: string): Op => ({
    kind: "sync_links",
    parent,
    children: childrenOf(parent),
  });

  // Re-entrancy flag: `import()` calls `this.mv(...)` internally. We
  // silence the inner wrapper so the outer wrapper can emit ops in the
  // correct causal order (replace_node before sync_links).
  let suppressed = false;
  const pushOp = (op: Op): void => {
    if (!suppressed) buffer.push(op);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (graph as any).mv = (
    sources: string | readonly string[],
    target: string,
    index: number = -1
  ) => {
    const srcs = Array.isArray(sources) ? sources : [sources as string];
    const oldParents = new Set<string>();
    for (const src of srcs) {
      const p = lutParent(src);
      if (p && p !== target) oldParents.add(p);
    }
    const result = originals.mv(srcs as string[], target, index);
    for (const p of oldParents) pushOp(syncLinksOp(p));
    pushOp(syncLinksOp(target));
    return result;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (graph as any).order = (key: string, direction: unknown) => {
    const parent = lutParent(key);
    const result = originals.order(
      key,
      direction as Parameters<Graph["order"]>[1]
    );
    if (parent) pushOp(syncLinksOp(parent));
    return result;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (graph as any).unlink = (key: string) => {
    const parent = lutParent(key);
    const result = originals.unlink(key);
    if (parent) pushOp(syncLinksOp(parent));
    // `unlink` also deletes the node from `graph.nodes`.
    pushOp({ kind: "delete_node", id: key });
    return result;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (graph as any).rm = (key: string) => {
    const parent = lutParent(key);
    const removed = originals.rm(key);
    // `rm` returns children-first; safe deletion order.
    for (const id of removed) pushOp({ kind: "delete_node", id });
    if (parent) pushOp(syncLinksOp(parent));
    return removed;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (graph as any).import = (
    ...args: Parameters<Graph["import"]>
  ): ReturnType<Graph["import"]> => {
    const beforeIds = new Set(allNodeIds());
    suppressed = true;
    let result: ReturnType<Graph["import"]>;
    try {
      result = originals.import(...args);
    } finally {
      suppressed = false;
    }
    for (const id of allNodeIds()) {
      if (!beforeIds.has(id)) buffer.push({ kind: "replace_node", id });
    }
    const target = args[2];
    if (typeof target === "string") buffer.push(syncLinksOp(target));
    return result;
  };

  return graph;
}

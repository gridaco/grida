import type { NodeId, TreeNode, TreeSource } from "@grida/tree-view";

/**
 * Read-only `@grida/tree-view` adapter over the Grida editor document.
 *
 * The editor owns hierarchy + selection; this is a thin live *view*, never
 * a copy. `@grida/tree-view` never mutates the source — reorders come back
 * out as a `move` intent the consumer applies via an editor command.
 *
 * `getNode()` must be reference-stable between `getVersion()` bumps
 * (`useTreeSnapshot` treats a fresh node ref as a store change and can
 * loop). The snapshot reuses the prior `TreeNode` object whenever the
 * underlying editor node (`meta`) and child id list are unchanged — Immer
 * preserves per-node identity for untouched nodes, so this is cheap.
 *
 * Children are kept in **document order**; visual reversal (layer-panel
 * convention) is the controller's `flatten.reverseChildren` job, not the
 * source's.
 */
export interface EditorTreeSourceConfig<T> {
  root: NodeId;
  /** Child ids of `id` in document order (`[]` for leaves). */
  getChildIds: (id: NodeId) => readonly string[];
  /** The editor object backing `id` (used as `meta`); `undefined` if gone. */
  getMeta: (id: NodeId) => T | undefined;
  /** Whether `id` can hold children (drives chevrons + `into` drops). */
  isContainer: (id: NodeId, meta: T | undefined) => boolean;
}

function shallowEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class EditorTreeSource<T = unknown> implements TreeSource<T> {
  private _version = 0;
  private _listeners = new Set<() => void>();
  private _nodes = new Map<NodeId, TreeNode<T>>();
  private _config: EditorTreeSourceConfig<T>;

  constructor(config: EditorTreeSourceConfig<T>) {
    this._config = config;
    this._snapshot();
  }

  /** Re-read the editor and bump the version if anything observable moved. */
  refresh(): void {
    this._snapshot();
    this._version++;
    for (const l of this._listeners) l();
  }

  private _snapshot(): void {
    const { root, getChildIds, getMeta } = this._config;
    const next = new Map<NodeId, TreeNode<T>>();
    const visit = (id: NodeId, parent: NodeId | null): void => {
      if (next.has(id)) return; // cycle / shared-ref guard
      const childIds = [...getChildIds(id)];
      const meta = getMeta(id);
      const prev = this._nodes.get(id);
      next.set(
        id,
        prev &&
          prev.parent === parent &&
          prev.meta === meta &&
          shallowEqual(prev.children, childIds)
          ? prev
          : { id, parent, children: childIds, meta }
      );
      for (const c of childIds) visit(c, id);
    };
    visit(root, null);
    this._nodes = next;
  }

  getRoot(): NodeId {
    return this._config.root;
  }

  getNode(id: NodeId): TreeNode<T> {
    const n = this._nodes.get(id);
    if (!n) throw new Error(`[starterkit-hierarchy] unknown node: ${id}`);
    return n;
  }

  getVersion(): number {
    return this._version;
  }

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  getLabel(id: NodeId): string {
    const meta = this._nodes.get(id)?.meta as { name?: string } | undefined;
    return meta?.name ?? id;
  }

  isContainer(id: NodeId): boolean {
    const n = this._nodes.get(id);
    return this._config.isContainer(id, n?.meta);
  }

  showRoot(): boolean {
    return false;
  }
}

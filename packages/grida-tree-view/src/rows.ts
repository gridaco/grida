import type { NodeId, Row } from "./types";
import { isContainer, type TreeSource } from "./source";

export interface FlattenOptions {
  /**
   * Reverse children order when flattening — gives a layer-panel feel
   * (visual top = last in document order). Default `false`.
   */
  reverseChildren?: boolean;
}

/**
 * Pure: walk the tree and produce a flat list of currently-visible rows.
 *
 * Stable indices: as long as `(source.getVersion(), expanded, options)`
 * are stable, the row at index `i` keeps its identity.
 */
export function flattenForRender<T>(
  source: TreeSource<T>,
  expanded: ReadonlySet<NodeId>,
  options: FlattenOptions = {}
): Row[] {
  const rows: Row[] = [];
  const showRoot = source.showRoot?.() ?? false;
  const root = source.getRoot();

  const visit = (id: NodeId, depth: number, parentId: NodeId | null) => {
    const node = source.getNode(id);
    const expandable = isContainer(source, id);
    const isExpanded = expandable && expanded.has(id);
    rows.push({
      id,
      depth,
      index: rows.length,
      parentId,
      isExpanded,
      isContainer: expandable,
    });
    if (!isExpanded) return;
    const children = options.reverseChildren
      ? [...node.children].reverse()
      : node.children;
    for (const child of children) {
      visit(child, depth + 1, id);
    }
  };

  if (showRoot) {
    visit(root, 0, null);
  } else {
    const rootNode = source.getNode(root);
    const children = options.reverseChildren
      ? [...rootNode.children].reverse()
      : rootNode.children;
    for (const child of children) {
      visit(child, 0, root);
    }
  }

  return rows;
}

/**
 * Memoizer keyed by `(source.version, expandedRevision, options)`. The
 * controller owns one of these so callers always get reference-stable rows
 * when nothing has changed.
 */
export class RowsSnapshot<T> {
  private _last: {
    sourceVersion: number;
    expandedRevision: number;
    optionsKey: string;
    rows: Row[];
  } | null = null;
  /** Lazily built off `_last.rows`; reset whenever the snapshot changes. */
  private _index: Map<NodeId, number> | null = null;

  get<TOpts extends FlattenOptions>(
    source: TreeSource<T>,
    expanded: ReadonlySet<NodeId>,
    expandedRevision: number,
    options: TOpts
  ): Row[] {
    const sourceVersion = source.getVersion();
    const optionsKey = options.reverseChildren ? "r" : "";
    const last = this._last;
    if (
      last &&
      last.sourceVersion === sourceVersion &&
      last.expandedRevision === expandedRevision &&
      last.optionsKey === optionsKey
    ) {
      return last.rows;
    }
    const rows = flattenForRender(source, expanded, options);
    this._last = { sourceVersion, expandedRevision, optionsKey, rows };
    this._index = null;
    return rows;
  }

  /** O(1) id → visible-row index against the current snapshot, else -1. */
  indexOf(id: NodeId): number {
    const rows = this._last?.rows;
    if (!rows) return -1;
    if (!this._index) {
      this._index = new Map();
      for (let i = 0; i < rows.length; i++) this._index.set(rows[i].id, i);
    }
    return this._index.get(id) ?? -1;
  }

  invalidate(): void {
    this._last = null;
    this._index = null;
  }
}

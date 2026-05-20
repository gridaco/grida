import type { Listener, NodeId, Row, TreeIntent, TreeNode } from "./types";

/**
 * The data adapter the tree view reads from. Consumers implement this
 * over whatever they consider canonical (an editor state, a JSON tree, a
 * remote store, etc.).
 *
 * The library does not mutate the source. It only reads + subscribes.
 *
 * **Reference-stability contract.** `getNode(id)` (and its `.meta`) MUST
 * return the *same object reference* for an unchanged node between
 * `getVersion()` bumps. The React bindings read via `useSyncExternalStore`
 * with an `Object.is` selector guard — returning a fresh object every call
 * is observed as a store change on every render, defeating memoization and
 * (for selectors that read `getNode().meta`) looping. Wrap a live store by
 * caching adapted node objects and only rebuilding the ones that actually
 * changed (then bump `getVersion()`); see the README "Wrapping a live
 * store" recipe.
 */
export interface TreeSource<TMeta = unknown> {
  getRoot(): NodeId;
  /**
   * Return the node for `id`. MUST be reference-stable: the same node
   * (same `.meta`) returns the same object until it actually changes and
   * `getVersion()` is bumped. A fresh object per call breaks memoization
   * and can loop under `useSyncExternalStore`.
   */
  getNode(id: NodeId): TreeNode<TMeta>;
  /**
   * Monotonic version that increments on every change observable by the
   * tree view (topology + label + container-ness). Used as the snapshot
   * key for memoization.
   */
  getVersion(): number;
  subscribe(listener: Listener): () => void;
  /** Optional. Falls back to `id`. */
  getLabel?(id: NodeId): string;
  /** Optional. Falls back to `getNode(id).children.length > 0`. */
  isContainer?(id: NodeId): boolean;
  /**
   * Optional. When provided, controls whether the root node itself is
   * rendered as a row. The default is `false` (root is hidden; only its
   * subtree is rendered — the most common convention for layer panels).
   */
  showRoot?(): boolean;
}

/**
 * In-memory mutable tree source. Useful for demos, tests, and stand-alone
 * tools. Real editors plug their own state in via the `TreeSource`
 * interface above.
 */
export class InMemoryTreeSource<TMeta = unknown> implements TreeSource<TMeta> {
  private _nodes = new Map<NodeId, TreeNode<TMeta>>();
  private _root: NodeId;
  private _version = 0;
  private _listeners = new Set<Listener>();
  private _showRoot: boolean;

  constructor(init: {
    root: NodeId;
    nodes: Iterable<TreeNode<TMeta>>;
    showRoot?: boolean;
  }) {
    this._root = init.root;
    this._showRoot = init.showRoot ?? false;
    for (const node of init.nodes) {
      this._nodes.set(node.id, node);
    }
  }

  getRoot(): NodeId {
    return this._root;
  }

  getNode(id: NodeId): TreeNode<TMeta> {
    const node = this._nodes.get(id);
    if (!node) {
      throw new Error(`[grida/tree-view] unknown node: ${id}`);
    }
    return node;
  }

  getVersion(): number {
    return this._version;
  }

  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  showRoot(): boolean {
    return this._showRoot;
  }

  // ─── mutators ────────────────────────────────────────────────────────────
  // Tiny set used by tests and demos. Real consumers do not call these —
  // they own the state.

  has(id: NodeId): boolean {
    return this._nodes.has(id);
  }

  insertChild(parent: NodeId, child: TreeNode<TMeta>, index?: number): void {
    const p = this.getNode(parent);
    const children = [...p.children];
    const at = index ?? children.length;
    children.splice(at, 0, child.id);
    this._nodes.set(parent, { ...p, children });
    this._nodes.set(child.id, { ...child, parent });
    this.bump();
  }

  remove(id: NodeId): void {
    const node = this._nodes.get(id);
    if (!node || !node.parent) return;
    const parent = this.getNode(node.parent);
    const children = parent.children.filter((c) => c !== id);
    this._nodes.set(parent.id, { ...parent, children });
    // Delete the whole subtree — leaving descendants in `_nodes` orphans
    // them (memory leak + `has()` reports them as live).
    const stack: NodeId[] = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const n = this._nodes.get(cur);
      if (!n) continue;
      stack.push(...n.children);
      this._nodes.delete(cur);
    }
    this.bump();
  }

  /**
   * Move `id` to be the `index`-th child of `newParent`. The index is the
   * position **after** removal from the original parent.
   */
  move(id: NodeId, newParent: NodeId, index: number): void {
    const node = this.getNode(id);
    if (!node.parent) {
      throw new Error("[grida/tree-view] cannot move the root");
    }
    const oldParent = this.getNode(node.parent);
    const filtered = oldParent.children.filter((c) => c !== id);
    if (node.parent === newParent) {
      const target = [...filtered];
      target.splice(index, 0, id);
      this._nodes.set(oldParent.id, { ...oldParent, children: target });
    } else {
      this._nodes.set(oldParent.id, { ...oldParent, children: filtered });
      const target = this.getNode(newParent);
      const next = [...target.children];
      next.splice(index, 0, id);
      this._nodes.set(target.id, { ...target, children: next });
      this._nodes.set(id, { ...node, parent: newParent });
    }
    this.bump();
  }

  setMeta(id: NodeId, meta: TMeta): void {
    const node = this.getNode(id);
    this._nodes.set(id, { ...node, meta });
    this.bump();
  }

  /**
   * Apply a `move` intent emitted by the controller. Convenience for
   * standalone uses that own the source — the demo's intent → source
   * bridge is one line:
   *
   * ```ts
   * controller.subscribe("intent", (i) => source.applyIntent(i));
   * ```
   *
   * `copy` intents are intentionally **not** handled here: cloning needs
   * an id factory and meta-cloner the package can't safely guess.
   * Subscribe yourself if you need copy semantics.
   *
   * The intent's `to.index` is already post-removal, so consecutive moves
   * step the cursor forward and the items land in original order.
   */
  applyIntent(intent: TreeIntent): void {
    if (intent.kind !== "move") return;
    let cursor = intent.to.index;
    for (const id of intent.items) {
      this.move(id, intent.to.parent, cursor);
      cursor++;
    }
  }

  private bump(): void {
    this._version++;
    for (const l of this._listeners) l();
  }
}

/**
 * Walk `id`'s ancestors (excluding `id` itself), root last.
 */
export function* ancestorsOf<T>(
  source: TreeSource<T>,
  id: NodeId
): Generator<NodeId> {
  let cursor: NodeId | null = source.getNode(id).parent;
  while (cursor !== null) {
    yield cursor;
    cursor = source.getNode(cursor).parent;
  }
}

/**
 * Visible-row depth of `id`: -1 for the root (hidden), 0 for root's
 * direct children, 1 for grandchildren, … Matches `Row.depth` produced by
 * `flattenForRender` with `showRoot=false`. The -1 for root makes
 * `rowDepthOf(parent) + 1` equal the resulting Row.depth of a new child
 * regardless of whether the parent is the root.
 */
export function rowDepthOf<T>(source: TreeSource<T>, id: NodeId): number {
  let n = -1;
  let cursor: NodeId | null = id;
  while (cursor !== null) {
    cursor = source.getNode(cursor).parent;
    n++;
  }
  return n - 1;
}

/**
 * Walk up from `id` to find the ancestor (or `id` itself) whose visible
 * row depth equals `targetDepth`. Returns `null` if `id`'s depth is
 * already shallower than `targetDepth`.
 */
export function ancestorAtRowDepth<T>(
  source: TreeSource<T>,
  id: NodeId,
  targetDepth: number
): NodeId | null {
  let cursor = id;
  let depth = rowDepthOf(source, cursor);
  if (depth < targetDepth) return null;
  while (depth > targetDepth) {
    const parent = source.getNode(cursor).parent;
    if (parent === null) return null;
    cursor = parent;
    depth--;
  }
  return cursor;
}

/**
 * `true` if `descendant` is a descendant of `ancestor` (inclusive on `ancestor`
 * if `inclusive` is true, exclusive otherwise).
 */
export function isDescendantOf<T>(
  source: TreeSource<T>,
  descendant: NodeId,
  ancestor: NodeId,
  inclusive = false
): boolean {
  if (descendant === ancestor) return inclusive;
  for (const a of ancestorsOf(source, descendant)) {
    if (a === ancestor) return true;
  }
  return false;
}

/**
 * `true` when `id` can hold children: uses the source's optional
 * `isContainer` predicate, falling back to "has at least one child".
 * Centralized so the row builder, constraints, and the controller all
 * agree on what counts as expandable.
 */
export function isContainer<T>(source: TreeSource<T>, id: NodeId): boolean {
  if (source.isContainer) return source.isContainer(id);
  return source.getNode(id).children.length > 0;
}

/**
 * Pick a sensible next focus target after `removed` rows are deleted, against
 * a pre-removal flat row list. Mirrors the IDE convention:
 *
 *   1. First non-removed row **after** the last removed row.
 *   2. Else first non-removed row **before** the first removed row.
 *   3. Else walk up `parentId` chain from the first removed row.
 *   4. Else `null` (nothing left to focus).
 *
 * Pure over `rows`. Pass `controller.getRows()` *before* mutating the
 * source — once the source mutates those rows are gone. The walk-up step
 * uses `Row.parentId` only; it does not consult the source.
 */
export function nextFocusAfterRemove(
  rows: readonly Row[],
  removed: Iterable<NodeId>
): NodeId | null {
  const removedSet =
    removed instanceof Set ? (removed as Set<NodeId>) : new Set(removed);
  if (removedSet.size === 0) return null;
  const firstIdx = rows.findIndex((r) => removedSet.has(r.id));
  if (firstIdx < 0) return null;
  let lastIdx = firstIdx;
  for (let i = firstIdx + 1; i < rows.length; i++) {
    if (removedSet.has(rows[i].id)) lastIdx = i;
  }
  for (let i = lastIdx + 1; i < rows.length; i++) {
    if (!removedSet.has(rows[i].id)) return rows[i].id;
  }
  for (let i = firstIdx - 1; i >= 0; i--) {
    if (!removedSet.has(rows[i].id)) return rows[i].id;
  }
  // Walk up via parentId — the visible parent of the first removed row
  // that is itself not in the removed set. Stops if the parent isn't in
  // the visible row list (e.g. hidden root).
  let cursor: NodeId | null = rows[firstIdx].parentId;
  while (cursor !== null) {
    if (!removedSet.has(cursor)) {
      const parentRow = rows.find((r) => r.id === cursor);
      return parentRow ? cursor : null;
    }
    const r = rows.find((x) => x.id === cursor);
    cursor = r ? r.parentId : null;
  }
  return null;
}

/**
 * Type-ahead row finder: search `rows` for the first row whose label
 * starts with `prefix`, wrapping around `startAfterId` if given. Returns
 * `null` for an empty prefix or when nothing matches.
 *
 * `getLabel` defaults to `String(row.id)` — pass the source's label
 * accessor for meaningful results:
 *
 * ```ts
 * findByLabelPrefix(controller.getRows(), buffer, {
 *   startAfterId: controller.getFocused() ?? undefined,
 *   getLabel: (id) => source.getLabel?.(id) ?? source.getNode(id).meta?.label ?? id,
 * });
 * ```
 *
 * Pure. Case-insensitive by default. The package does not own the
 * type-ahead *buffer* (a 500ms-reset string the consumer accumulates) —
 * that's keyboard-state, which the consumer already manages.
 */
export function findByLabelPrefix(
  rows: readonly Row[],
  prefix: string,
  options: {
    startAfterId?: NodeId | null;
    getLabel?: (id: NodeId) => string;
    caseSensitive?: boolean;
  } = {}
): NodeId | null {
  if (!prefix) return null;
  if (rows.length === 0) return null;
  const cs = options.caseSensitive ?? false;
  const needle = cs ? prefix : prefix.toLowerCase();
  const getLabel = options.getLabel ?? ((id) => String(id));
  let startIdx = 0;
  if (options.startAfterId != null) {
    const i = rows.findIndex((r) => r.id === options.startAfterId);
    if (i >= 0) startIdx = (i + 1) % rows.length;
  }
  for (let off = 0; off < rows.length; off++) {
    const idx = (startIdx + off) % rows.length;
    const raw = getLabel(rows[idx].id);
    const cmp = cs ? raw : raw.toLowerCase();
    if (cmp.startsWith(needle)) return rows[idx].id;
  }
  return null;
}

/**
 * Compute the union of subtrees rooted at the given `anchors`. Useful for
 * "grouping highlight" features — e.g. shading a container's descendants
 * while the container is selected (Grida/Figma style), or highlighting a
 * folder and all its children while the user drags over it (VS Code /
 * Finder style).
 *
 * The returned set includes each anchor itself unless
 * `{ inclusive: false }` is passed. Anchors that aren't in the source
 * are skipped silently.
 *
 * Cost is O(total subtree size). The function is pure — memoize on the
 * source's `getVersion()` plus the anchor set if you call this every
 * render against a stable input. The per-row "am I in the highlight?"
 * lookup is then O(1) instead of an ancestor-walk per row.
 */
export function subtreeMembership<T>(
  source: TreeSource<T>,
  anchors: Iterable<NodeId>,
  options: { inclusive?: boolean } = {}
): Set<NodeId> {
  const inclusive = options.inclusive ?? true;
  const result = new Set<NodeId>();
  const visit = (id: NodeId, isAnchor: boolean): void => {
    if (inclusive || !isAnchor) result.add(id);
    const node = source.getNode(id);
    for (const c of node.children) visit(c, false);
  };
  for (const a of anchors) {
    // Defensive: skip ids that aren't in the source. Anchors typically
    // come from selection / drag state and can briefly be stale across
    // a source mutation.
    try {
      source.getNode(a);
    } catch {
      continue;
    }
    visit(a, true);
  }
  return result;
}

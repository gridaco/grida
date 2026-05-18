import type {
  ChannelName,
  DragMode,
  IntentListener,
  KeyEventLike,
  Listener,
  NodeId,
  Row,
  SelectionMode,
  TreeIntent,
  TreeNode,
} from "./types";
import type { TreeSource } from "./source";
import { isContainer, isDescendantOf } from "./source";
import {
  InMemorySelectionAdapter,
  modeFromEvent,
  type SelectionAdapter,
} from "./selection";
import { type FlattenOptions, RowsSnapshot } from "./rows";
import { allowAll, type MoveConstraint } from "./constraints";
import { createDrag, type DragHandle } from "./drag";
import {
  defaultKeymap,
  lookupAction,
  type Keymap,
  type KeymapAction,
} from "./keymap";

export interface TreeControllerOptions<T = unknown> {
  source: TreeSource<T>;
  selection?: SelectionAdapter;
  constraint?: MoveConstraint;
  /** Default `reverseChildren: false`. */
  flatten?: FlattenOptions;
  /**
   * Initial expanded set. Defaults to empty. The root is always considered
   * "expanded" implicitly when it is hidden, so its children are visible.
   */
  expanded?: Iterable<NodeId>;
}

interface ChannelMap {
  rows: Set<Listener>;
  expanded: Set<Listener>;
  focus: Set<Listener>;
  drag: Set<Listener>;
  selection: Set<Listener>;
  intent: Set<IntentListener>;
}

/**
 * The library's coordinator. Owns transient UI state (expand, focus,
 * drag) and delegates everything else (tree topology, selection, mutation)
 * to plug-in adapters.
 */
export class TreeController<T = unknown> {
  readonly source: TreeSource<T>;
  readonly selectionAdapter: SelectionAdapter;
  readonly constraint: MoveConstraint;
  readonly flatten: FlattenOptions;

  private _expanded: Set<NodeId>;
  private _expandedRevision = 0;
  private _focused: NodeId | null = null;
  private _selectionAnchor: NodeId | null = null;
  private _drag: DragHandle | null = null;
  private _rows = new RowsSnapshot<T>();

  private _channels: ChannelMap = {
    rows: new Set(),
    expanded: new Set(),
    focus: new Set(),
    drag: new Set(),
    selection: new Set(),
    intent: new Set(),
  };

  private _unsubscribeSource: () => void;
  private _unsubscribeSelection: () => void;

  constructor(options: TreeControllerOptions<T>) {
    this.source = options.source;
    this.selectionAdapter = options.selection ?? new InMemorySelectionAdapter();
    this.constraint = options.constraint ?? allowAll;
    this.flatten = options.flatten ?? {};
    this._expanded = new Set(options.expanded ?? []);

    this._unsubscribeSource = this.source.subscribe(() => {
      this._rows.invalidate();
      this.emit("rows");
    });
    this._unsubscribeSelection = this.selectionAdapter.subscribe(() => {
      this.emit("selection");
    });
  }

  dispose(): void {
    this._unsubscribeSource();
    this._unsubscribeSelection();
    for (const set of Object.values(this._channels)) set.clear();
  }

  // ─── subscription ────────────────────────────────────────────────────────

  subscribe(channel: "intent", listener: IntentListener): () => void;
  subscribe(
    channel: Exclude<ChannelName, "intent">,
    listener: Listener
  ): () => void;
  subscribe(
    channel: ChannelName,
    listener: Listener | IntentListener
  ): () => void {
    if (channel === "intent") {
      const set = this._channels.intent;
      set.add(listener as IntentListener);
      return () => set.delete(listener as IntentListener);
    }
    const set = this._channels[channel] as Set<Listener>;
    set.add(listener as Listener);
    return () => set.delete(listener as Listener);
  }

  /** Subscribe to all channels (rows/expanded/focus/drag/selection). */
  subscribeAny(listener: Listener): () => void {
    const channels = (Object.keys(this._channels) as ChannelName[]).filter(
      (c): c is Exclude<ChannelName, "intent"> => c !== "intent"
    );
    const unsubs = channels.map((c) => this.subscribe(c, listener));
    return () => {
      for (const u of unsubs) u();
    };
  }

  private emit(channel: Exclude<ChannelName, "intent">): void {
    for (const l of this._channels[channel]) l();
  }

  private emitIntent(intent: TreeIntent): void {
    for (const l of this._channels.intent) l(intent);
  }

  // ─── rows / view ─────────────────────────────────────────────────────────

  getRows(): readonly Row[] {
    return this._rows.get(
      this.source,
      this._expanded,
      this._expandedRevision,
      this.flatten
    );
  }

  /** Find the row index for an id, or -1 if not visible. */
  getRowIndex(id: NodeId): number {
    this.getRows(); // refresh the snapshot (and its id→index) if stale
    return this._rows.indexOf(id);
  }

  // ─── expansion ───────────────────────────────────────────────────────────

  isExpanded(id: NodeId): boolean {
    return this._expanded.has(id);
  }

  toggle(id: NodeId): void {
    if (this._expanded.has(id)) this.collapse(id);
    else this.expand(id);
  }

  expand(id: NodeId): void {
    if (this._expanded.has(id)) return;
    this._expanded.add(id);
    this._expandedRevision++;
    this._rows.invalidate();
    this.emit("expanded");
    this.emit("rows");
  }

  collapse(id: NodeId): void {
    if (!this._expanded.has(id)) return;
    this._expanded.delete(id);
    this._expandedRevision++;
    this._rows.invalidate();
    this.emit("expanded");
    this.emit("rows");
  }

  /**
   * Expand all ancestors of `id` so the row becomes visible.
   *
   * Tolerant of ids the external source has not snapshotted yet — e.g. a
   * node selected the tick *before* its source refresh lands (just
   * inserted). Walks the parent chain via the same forgiving accessor the
   * focus paths use; an unresolvable ancestor stops the walk instead of
   * throwing (a mid-`reveal` throw would otherwise take down the panel).
   */
  expandTo(id: NodeId): void {
    const rootHidden = !(this.source.showRoot?.() ?? false);
    const root = this.source.getRoot();
    let changed = false;
    // `ancestorsOf` would `getNode`-throw on a not-yet-known id; walk via
    // `_peek` (returns null instead) so reveal-before-snapshot is a no-op.
    let cursor = this._peek(id)?.parent ?? null;
    while (cursor !== null) {
      const node = this._peek(cursor);
      if (!node) break; // chain broken / not snapshotted — stop, don't throw
      // The root counts as implicitly expanded only while it is hidden.
      // With `showRoot()` on, the root row is real and must be expanded
      // like any other ancestor or the revealed node stays invisible.
      if (!(rootHidden && cursor === root) && !this._expanded.has(cursor)) {
        this._expanded.add(cursor);
        changed = true;
      }
      cursor = node.parent;
    }
    if (changed) {
      this._expandedRevision++;
      this._rows.invalidate();
      this.emit("expanded");
      this.emit("rows");
    }
  }

  /**
   * Reveal `id`: expand all its ancestors so the row becomes visible,
   * move focus to it, and (by default) select it. DOM `scrollIntoView`
   * is the consumer's job — react after the next render:
   *
   * ```ts
   * controller.reveal(id);
   * requestAnimationFrame(() => {
   *   document
   *     .querySelector(`[data-tree-row-id="${CSS.escape(id)}"]`)
   *     ?.scrollIntoView({ block: "center" });
   * });
   * ```
   */
  reveal(id: NodeId, opts?: { select?: boolean }): void {
    this.expandTo(id);
    this.focus(id);
    if (opts?.select !== false) this.select([id], "replace");
  }

  setExpanded(ids: Iterable<NodeId>): void {
    this._expanded = new Set(ids);
    this._expandedRevision++;
    this._rows.invalidate();
    this.emit("expanded");
    this.emit("rows");
  }

  getExpanded(): ReadonlySet<NodeId> {
    return this._expanded;
  }

  // ─── selection ───────────────────────────────────────────────────────────

  getSelection(): readonly NodeId[] {
    return this.selectionAdapter.get();
  }

  /**
   * Selection dispatch. For `"range"`, this expands the range over the
   * current flat row list between the anchor and `ids[0]`.
   */
  select(ids: readonly NodeId[], mode: SelectionMode): void {
    if (mode === "range" && ids.length > 0) {
      const target = ids[0];
      const rows = this.getRows();
      const anchor = this._selectionAnchor ?? this.getSelection()[0] ?? target;
      const ai = this.getRowIndex(anchor);
      const ti = this.getRowIndex(target);
      if (ai >= 0 && ti >= 0) {
        const [from, to] = ai <= ti ? [ai, ti] : [ti, ai];
        const range = rows.slice(from, to + 1).map((r) => r.id);
        this.selectionAdapter.set(range, "range");
        return;
      }
    }
    if (mode === "replace" || mode === "toggle") {
      this._selectionAnchor = ids[ids.length - 1] ?? null;
    }
    this.selectionAdapter.set(ids, mode);
  }

  selectAll(): void {
    const all = this.getRows().map((r) => r.id);
    this.selectionAdapter.set(all, "replace");
  }

  isSelected(id: NodeId): boolean {
    return this.getSelection().includes(id);
  }

  // ─── focus ───────────────────────────────────────────────────────────────

  getFocused(): NodeId | null {
    return this._focused;
  }

  focus(id: NodeId | null): void {
    if (this._focused === id) return;
    this._focused = id;
    this.emit("focus");
  }

  private moveFocus(delta: -1 | 1): void {
    const rows = this.getRows();
    if (rows.length === 0) return;
    const current = this._focused ? this.getRowIndex(this._focused) : -1;
    let next = current + delta;
    if (current < 0) next = delta === 1 ? 0 : rows.length - 1;
    next = Math.max(0, Math.min(rows.length - 1, next));
    this.focus(rows[next].id);
  }

  private focusEnd(end: "first" | "last"): void {
    const rows = this.getRows();
    if (rows.length === 0) return;
    this.focus(end === "first" ? rows[0].id : rows[rows.length - 1].id);
  }

  private focusParent(): void {
    if (!this._focused) return;
    const node = this._peek(this._focused);
    if (!node) return;
    const parent = node.parent;
    if (parent && parent !== this.source.getRoot()) {
      this.focus(parent);
    } else if (parent === this.source.getRoot() && this.source.showRoot?.()) {
      this.focus(parent);
    }
  }

  // ─── drag ────────────────────────────────────────────────────────────────

  startDrag(items: readonly NodeId[], opts?: { mode?: DragMode }): DragHandle {
    // Block dragging across multiple parents from creating absurd positions:
    // we don't refuse the drag, but `disallowDescendant` enforcement happens
    // inside `createDrag`.
    if (this._drag) this._drag.cancel();
    const handle = createDrag({
      source: this.source,
      items,
      mode: opts?.mode,
      constraint: this.constraint,
      // Resolve drop indices in the orientation the rows are rendered in.
      reversed: this.flatten.reverseChildren ?? false,
      onChange: () => this.emit("drag"),
    });
    this._drag = handle;
    this.emit("drag");
    return handle;
  }

  getDrag(): DragHandle | null {
    return this._drag;
  }

  /**
   * Commit the active drag and emit a `move`/`copy` intent.
   *
   * The **`intent` channel is the canonical path** — subscribe with
   * `controller.subscribe("intent", apply)` and apply it to your store
   * (this is the package's mutations-are-intents contract; one subscription
   * handles drag, keyboard, and programmatic mutations uniformly). The
   * return value is a convenience for imperative call sites that commit and
   * apply inline without subscribing; it is the *same* intent, already
   * emitted on the channel. Pick one path, not both. Returns `null` if the
   * drag had no valid position.
   */
  commitDrag(): TreeIntent | null {
    const drag = this._drag;
    if (!drag) return null;
    const pos = drag.drop();
    if (!pos) {
      this._drag = null;
      this.emit("drag");
      return null;
    }
    const intent: TreeIntent = {
      kind: drag.getMode(),
      items: drag.items,
      to: pos,
    };
    this._drag = null;
    this.emit("drag");
    this.emitIntent(intent);
    return intent;
  }

  cancelDrag(): void {
    if (!this._drag) return;
    this._drag.cancel();
    this._drag = null;
    this.emit("drag");
  }

  // ─── keyboard ────────────────────────────────────────────────────────────

  /**
   * Dispatch a key event through the given keymap. Returns `{ handled }`
   * so the consumer can decide whether to call `preventDefault`. The
   * library itself never calls `preventDefault` — the consumer owns the
   * DOM.
   */
  keyDown(
    event: KeyEventLike,
    keymap: Keymap = defaultKeymap
  ): { handled: boolean } {
    const action = lookupAction(event, keymap);
    if (!action) return { handled: false };
    return this.dispatch(action, event);
  }

  /** Direct action dispatch — same engine `keyDown` uses. */
  dispatch(action: KeymapAction, event?: KeyEventLike): { handled: boolean } {
    switch (action) {
      case "focus-prev":
        this.moveFocus(-1);
        this.maybeShiftSelect(event);
        return { handled: true };
      case "focus-next":
        this.moveFocus(1);
        this.maybeShiftSelect(event);
        return { handled: true };
      case "focus-first":
        this.focusEnd("first");
        return { handled: true };
      case "focus-last":
        this.focusEnd("last");
        return { handled: true };
      case "focus-parent":
        this.focusParent();
        return { handled: true };
      case "expand": {
        if (this._focused) this.expand(this._focused);
        return { handled: true };
      }
      case "collapse": {
        if (this._focused) this.collapse(this._focused);
        return { handled: true };
      }
      case "expand-or-noop": {
        if (!this._focused) return { handled: false };
        if (this.canExpand(this._focused)) {
          this.expand(this._focused);
          return { handled: true };
        }
        return { handled: false };
      }
      case "collapse-or-parent": {
        if (!this._focused) return { handled: false };
        if (this.isExpanded(this._focused)) {
          this.collapse(this._focused);
        } else {
          this.focusParent();
        }
        return { handled: true };
      }
      case "toggle": {
        if (this._focused) this.toggle(this._focused);
        return { handled: true };
      }
      case "select-focused": {
        if (this._focused) {
          this.select(
            [this._focused],
            event ? modeFromEvent(event) : "replace"
          );
        }
        return { handled: true };
      }
      case "select-all": {
        this.selectAll();
        return { handled: true };
      }
      case "rename": {
        if (this._focused) {
          this.emitIntent({ kind: "rename", id: this._focused });
        }
        return { handled: true };
      }
      case "delete": {
        const sel = this.getSelection();
        if (sel.length > 0) this.emitIntent({ kind: "delete", ids: sel });
        return { handled: true };
      }
      case "activate": {
        if (this._focused) {
          this.emitIntent({ kind: "activate", id: this._focused });
        }
        return { handled: true };
      }
    }
  }

  emitRenameIntent(id: NodeId): void {
    this.emitIntent({ kind: "rename", id });
  }

  emitDeleteIntent(ids: readonly NodeId[]): void {
    this.emitIntent({ kind: "delete", ids });
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  /**
   * `getNode` that tolerates ids the source has already removed. The
   * source is external and may drop the node the controller still holds
   * as its focus cursor; keyboard paths that would otherwise throw use
   * this and degrade to a no-op.
   */
  private _peek(id: NodeId): TreeNode<T> | null {
    try {
      return this.source.getNode(id);
    } catch {
      return null;
    }
  }

  private canExpand(id: NodeId): boolean {
    if (this.isExpanded(id)) return false;
    if (!this._peek(id)) return false;
    return isContainer(this.source, id);
  }

  private maybeShiftSelect(event: KeyEventLike | undefined): void {
    if (!event?.shiftKey) return;
    if (!this._focused) return;
    this.select([this._focused], "range");
  }

  /**
   * `true` if `descendant` is somewhere under `ancestor`. Re-exported for
   * the demo + tests.
   */
  isDescendantOf(descendant: NodeId, ancestor: NodeId): boolean {
    return isDescendantOf(this.source, descendant, ancestor, false);
  }
}

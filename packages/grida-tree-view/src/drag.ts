import type { DropPlacement, DropPosition, DragMode, NodeId } from "./types";
import type { TreeSource } from "./source";
import { isDescendantOf, rowDepthOf } from "./source";
import { allowAll, type MoveConstraint } from "./constraints";

export interface DragState {
  readonly items: readonly NodeId[];
  readonly mode: DragMode;
  readonly position: DropPosition | null;
}

export interface DragHandle {
  readonly items: readonly NodeId[];
  getMode(): DragMode;
  setMode(mode: DragMode): void;
  /**
   * Update the hovered target and produce the resolved drop position
   * (after constraint coercion). Returns `null` when the position is
   * disallowed.
   *
   * `placementHint` describes which third of the row the pointer is in:
   * - top third    → `before`
   * - middle third → `into` (only meaningful if `over` is a container)
   * - bottom third → `after`
   *
   * `options.desiredDepth` (optional) makes the drop horizontal-aware:
   * for `before`/`after` placements, walks up the `over` row's ancestor
   * chain to find the ancestor at that visible depth and pivots the
   * insertion there. This is how cursor-x can "pop out" of a deeply
   * nested container without changing the y-target row.
   */
  over(
    over: NodeId,
    placementHint: DropPlacement,
    options?: { desiredDepth?: number }
  ): DropPosition | null;
  // Reversed-list orientation is NOT a per-call option: it is configured
  // once via `createDrag({ reversed })` (the `TreeController` passes its
  // `flatten.reverseChildren` through). `placementHint` is always given
  // in *rendered* order; the handle resolves the document index.
  /** Resolved position, suitable for rendering a drop line. */
  getPosition(): DropPosition | null;
  /** Commit the drop. Returns the final position, or `null` if invalid. */
  drop(): DropPosition | null;
  cancel(): void;
}

/**
 * Resolve a raw `(over, placement)` to a normalized `DropPosition`.
 *
 * - `before` → insert at `over`'s index inside `over`'s parent.
 * - `after`  → insert at `over`'s index + 1.
 * - `into`   → append to `over.children`.
 *
 * Skips items that are about to be removed from the same parent so the
 * resulting index correctly reflects the post-removal state (this is the
 * fix the headless-tree consumer hand-rolled in
 * `starterkit-hierarchy/utils.ts`).
 *
 * `opts.desiredDepth` (optional) makes the resolution horizontal-aware:
 * for `before`/`after`, it walks up the `over` row's ancestor chain to
 * find the ancestor at that visible depth and pivots there. Use it to let
 * cursor-x decide "pop out one container" vs "stay inside the container".
 * When omitted, behavior is unchanged (anchor = `over`).
 *
 * `opts.reversed` (optional) — set when the rows are flattened with
 * `reverseChildren` (the layer-panel convention: visual-top = last in
 * document order). `placement` always arrives in *rendered* order; with
 * `reversed` the before/after sense is flipped so the resolved
 * **document** index matches what the user sees. `into` is
 * orientation-independent. The `TreeController` threads this through from
 * its `flatten.reverseChildren`; pass it yourself only for direct wiring.
 */
export function resolveDropPosition(
  source: TreeSource,
  items: readonly NodeId[],
  over: NodeId,
  placement: DropPlacement,
  opts?: { desiredDepth?: number; reversed?: boolean }
): DropPosition | null {
  const overNode = source.getNode(over);
  const itemSet = new Set(items);
  const desiredDepth = opts?.desiredDepth;
  // Reversed display flips before/after so the document index matches the
  // rendered order; `into` (append to children) is orientation-free.
  const dir: DropPlacement =
    opts?.reversed && placement !== "into"
      ? placement === "before"
        ? "after"
        : "before"
      : placement;

  if (dir === "into") {
    const filtered = overNode.children.filter((c) => !itemSet.has(c));
    return {
      parent: over,
      index: filtered.length,
      placement: "into",
      over,
    };
  }

  // For before/after, find the anchor row — the ancestor at the desired
  // visible depth, or `over` itself when no depth hint is given.
  //
  // The pivot is only meaningful for `placement === "after"`: the cursor
  // is visually past the last child of a container, so popping out lets
  // the user say "drop after the container itself" without having to
  // physically move the cursor to a different row. We require the over
  // row to be the *last* child at every step we walk up — otherwise
  // popping out would land the new row inside the parent at a position
  // unrelated to where the cursor visually is.
  //
  // We intentionally do NOT support a `before` first-child pivot. The
  // "first child / before" position is visually identical to "inside the
  // container, at index 0" — the user already gets that for free with no
  // horizontal gesture, and supporting both would let the same cursor
  // position resolve to two different drop targets depending on x. The
  // demo treats `before` purely as "insert before the over row at its
  // own depth"; only `after` honors the pop-out gesture.
  let anchorId: NodeId = over;
  if (desiredDepth !== undefined && dir === "after") {
    let cursor = over;
    let depth = rowDepthOf(source, cursor);
    while (depth > desiredDepth) {
      const parent = source.getNode(cursor).parent;
      if (parent === null) break;
      const parentNode = source.getNode(parent);
      const siblings = parentNode.children.filter((c) => !itemSet.has(c));
      const idx = siblings.indexOf(cursor);
      // After-pivot requires the over row to be the LAST sibling at
      // every step. Stop at the deepest valid pivot when the chain breaks.
      if (idx !== siblings.length - 1) break;
      cursor = parent;
      depth--;
    }
    anchorId = cursor;
  }

  const anchorNode = source.getNode(anchorId);
  if (anchorNode.parent === null) return null;
  const parent = source.getNode(anchorNode.parent);
  const filtered = parent.children.filter((c) => !itemSet.has(c));
  const anchorIndex = filtered.indexOf(anchorId);
  if (anchorIndex < 0) return null;
  return {
    parent: parent.id,
    index: dir === "before" ? anchorIndex : anchorIndex + 1,
    placement: dir,
    over, // keep the original over so the indicator renders on the hovered row
  };
}

interface CreateDragOpts {
  source: TreeSource;
  items: readonly NodeId[];
  mode?: DragMode;
  constraint?: MoveConstraint;
  /**
   * Rows are flattened reversed (`FlattenOptions.reverseChildren`).
   * Flips `over()`'s before/after so the resolved document index matches
   * what the user sees. The `TreeController` passes its
   * `flatten.reverseChildren` here automatically.
   */
  reversed?: boolean;
  onChange?: (state: DragState | null) => void;
}

/**
 * Create a drag transaction. The handle is independent of any DOM events —
 * the consumer wires it to pointer events.
 */
export function createDrag(opts: CreateDragOpts): DragHandle {
  const { source, items } = opts;
  const constraint = opts.constraint ?? allowAll;
  const reversed = opts.reversed ?? false;
  // Cycle prevention can't run here (no target yet) — `over()` refuses any
  // position landing under a dragged item once a target is known.
  let mode: DragMode = opts.mode ?? "move";
  let position: DropPosition | null = null;
  let cancelled = false;

  const emit = () => opts.onChange?.(snapshot());

  const snapshot = (): DragState | null => {
    if (cancelled) return null;
    return { items, mode, position };
  };

  const samePosition = (
    a: DropPosition | null,
    b: DropPosition | null
  ): boolean => {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      a.parent === b.parent &&
      a.index === b.index &&
      a.placement === b.placement &&
      a.over === b.over
    );
  };

  // Assign the resolved position and notify — but only when it actually
  // changed. `over()` is called once per pointer-move; without this guard
  // every frame re-notifies all subscribers (and re-runs their selectors)
  // even when the drop target didn't move.
  const set = (next: DropPosition | null): DropPosition | null => {
    if (samePosition(position, next)) return next;
    position = next;
    emit();
    return next;
  };

  const handle: DragHandle = {
    items,
    getMode: () => mode,
    setMode(next) {
      if (next === mode) return;
      mode = next;
      emit();
    },
    over(over, placementHint, options) {
      if (cancelled) return null;
      let resolved = resolveDropPosition(source, items, over, placementHint, {
        desiredDepth: options?.desiredDepth,
        reversed,
      });
      if (!resolved) return set(null);
      // Run constraint resolution + check.
      if (constraint.resolveDropPosition) {
        resolved = constraint.resolveDropPosition(items, resolved, source);
        if (!resolved) return set(null);
      }
      // Hard-rule: never drop into your own subtree (only relevant when the
      // user's constraint chain didn't already include `disallowDescendant`).
      for (const id of items) {
        if (
          resolved.parent === id ||
          isDescendantOf(source, resolved.parent, id, false)
        ) {
          return set(null);
        }
      }
      if (!constraint.canMove(items, resolved, source)) return set(null);
      return set(resolved);
    },
    getPosition() {
      return position;
    },
    drop() {
      if (cancelled) return null;
      return position;
    },
    cancel() {
      cancelled = true;
      position = null;
      emit();
    },
  };

  return handle;
}

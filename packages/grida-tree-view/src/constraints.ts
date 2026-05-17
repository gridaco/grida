import type { DropPosition, NodeId } from "./types";
import type { TreeSource } from "./source";
import { isContainer, isDescendantOf } from "./source";

export interface MoveConstraint {
  /**
   * Hard predicate evaluated at drag-over and at drop. Return `false` to
   * refuse the drop.
   */
  canMove(
    items: readonly NodeId[],
    to: DropPosition,
    source: TreeSource
  ): boolean;
  /**
   * Optional. Given a raw position the user is hovering, coerce it to a
   * different position (e.g. "into a non-container" → "after that node").
   * Return `null` to refuse the position entirely.
   */
  resolveDropPosition?(
    items: readonly NodeId[],
    raw: DropPosition,
    source: TreeSource
  ): DropPosition | null;
}

/**
 * Compose constraints. `canMove` is the AND of all; `resolveDropPosition`
 * is composed left-to-right (each one sees the output of the previous).
 */
export function allOf(...cs: MoveConstraint[]): MoveConstraint {
  return {
    canMove(items, to, source) {
      for (const c of cs) if (!c.canMove(items, to, source)) return false;
      return true;
    },
    resolveDropPosition(items, raw, source) {
      let pos: DropPosition | null = raw;
      for (const c of cs) {
        if (!pos) return null;
        if (c.resolveDropPosition) {
          pos = c.resolveDropPosition(items, pos, source);
        }
      }
      return pos;
    },
  };
}

/** Negate a constraint's `canMove`. Does not touch `resolveDropPosition`. */
export function not(c: MoveConstraint): MoveConstraint {
  return {
    canMove(items, to, source) {
      return !c.canMove(items, to, source);
    },
  };
}

/**
 * Filesystem-style drag semantics: every drop is coerced to `into` the
 * nearest *valid* ancestor of whatever the cursor is over. Use this when
 * the tree has no user-driven sibling order (file explorers, IDE
 * sidebars) — ordering is determined by name/sort, the only meaningful
 * gesture is "which container does this end up inside?".
 *
 * `predicate(source, id)` decides what counts as a valid container —
 * `id.meta?.kind === "folder"` for an FS demo, `id.kind === "group"` for
 * a graphics tool, etc.
 *
 * The constraint also enforces the no-cycle rule (a folder can't end up
 * inside itself or a descendant) — you usually don't need to chain
 * `disallowDescendant` when you use this.
 *
 * Returns `null` (refuses the drop) when no ancestor along the chain
 * satisfies `predicate` — e.g. dropping above the topmost folder.
 */
export function intoNearestAncestor(
  predicate: (source: TreeSource, id: NodeId) => boolean
): MoveConstraint {
  return {
    canMove(items, to, source) {
      if (to.placement !== "into") return false;
      if (!predicate(source, to.over)) return false;
      // Don't allow dropping a node into itself or its own subtree.
      for (const id of items) {
        if (to.over === id) return false;
        if (isDescendantOf(source, to.over, id, false)) return false;
      }
      return true;
    },
    resolveDropPosition(_items, raw, source) {
      let target: NodeId | null = raw.over;
      while (target !== null && !predicate(source, target)) {
        target = source.getNode(target).parent;
      }
      if (target === null) return null;
      const node = source.getNode(target);
      return {
        parent: target,
        index: node.children.length,
        placement: "into",
        over: target,
      };
    },
  };
}

/**
 * Disallow dropping into a non-container. `resolveDropPosition` coerces
 * `into` over a non-container to `after` it.
 */
export function onlyIntoContainers(): MoveConstraint {
  return {
    canMove(_items, to, source) {
      if (to.placement !== "into") return true;
      return isContainer(source, to.over);
    },
    resolveDropPosition(_items, raw, source) {
      if (raw.placement !== "into") return raw;
      if (isContainer(source, raw.over)) return raw;
      // Coerce: drop "after" the over node, at its parent's index+1.
      const overNode = source.getNode(raw.over);
      if (overNode.parent === null) return null;
      const parent = source.getNode(overNode.parent);
      const idx = parent.children.indexOf(raw.over);
      return {
        parent: overNode.parent,
        index: idx + 1,
        placement: "after",
        over: raw.over,
      };
    },
  };
}

/**
 * Refuse cross-parent moves. Items must end up under their current parent.
 */
export function sameParentOnly(): MoveConstraint {
  return {
    canMove(items, to, source) {
      if (items.length === 0) return true;
      const first = source.getNode(items[0]).parent;
      if (first === null) return false;
      if (to.parent !== first) return false;
      for (const id of items) {
        if (source.getNode(id).parent !== first) return false;
      }
      return true;
    },
  };
}

/**
 * Refuse dropping any item into its own subtree (would create a cycle).
 */
export function disallowDescendant(): MoveConstraint {
  return {
    canMove(items, to, source) {
      for (const id of items) {
        // The drop's `parent` cannot be `id` itself nor a descendant of `id`.
        if (to.parent === id) return false;
        if (isDescendantOf(source, to.parent, id, false)) return false;
      }
      return true;
    },
  };
}

/**
 * Free-form predicate. Useful for one-off rules ("locked node can't move",
 * "frame-only children" etc.).
 */
export function allowWhen(
  predicate: (
    items: readonly NodeId[],
    to: DropPosition,
    source: TreeSource
  ) => boolean
): MoveConstraint {
  return { canMove: predicate };
}

/** A pass-through constraint that allows everything. */
export const allowAll: MoveConstraint = {
  canMove() {
    return true;
  },
};

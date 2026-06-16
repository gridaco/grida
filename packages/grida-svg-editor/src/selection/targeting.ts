// Group-first targeting POLICY — pure, headless; the executable shadow of
// `packages/grida-svg-editor/docs/group-first-targeting.md`.
//
// Like `marquee.ts`, this is a deliberate UX OPINION (human-oriented,
// Figma-like), not spec or geometric necessity. It lives OUTSIDE `core/`: the
// surface owns raw hit-testing (pointer → leaf), and THIS module decides which
// node along the leaf's ancestor chain a pick actually resolves to. A faithful
// port of the non-SVG Grida Canvas `getRayTarget`
// (`editor/grida-canvas/reducers/tools/target.ts`).
//
// The organizing principle:
//
//   The current selection defines the current FOCUS DEPTH in the hierarchy.
//   Resolution is computed from `(hits, selection, mode)` and is tree-aware:
//
//     - tap (nested_first=false) → a lateral / sibling-aware move at the focus
//       depth: the ancestor-of-the-leaf closest to the selection by weighted
//       graph distance, but NEVER a proper ancestor of the selection — a tap
//       moves laterally / stays / descends, it never CLIMBS (escaping upward is
//       Escape's job). Clicked inside the focused container → stay; clicked into
//       a SIBLING subtree at the same depth → that sibling (sibling weight 0.9
//       beats parent/root); clicked on a COUSIN leaf → the leaf itself, not the
//       shared container (no-climb); nothing / unrelated selected → the topmost
//       container (shallowest).
//     - double-click (nested_first=true) → descend ONE level below the focus:
//       the nearest DESCENDANT of the selection toward the leaf. Empty
//       selection establishes focus at the topmost container, so progressive
//       double-clicks descend one level each (never trapped at depth 1).
//     - meta/ctrl (deepest=true) → jump straight to the leaf, bypassing the
//       hierarchy. NOT selection-aware.
//
// `hits` is the leaf's ancestor chain, ROOT-EXCLUDED, LEAF-FIRST:
//   [leaf, parent, ..., child-of-root].
// The sibling-weighted graph distance is what makes lateral sibling-selection
// and "stay at focus depth" work WITHOUT scope/isolation. No container
// predicate is needed — `<g>`, nested `<svg>`, `<a>`, `<switch>` are just
// ancestors in the chain.

import type { NodeId } from "../types";

export namespace targeting {
  /** The minimal read-only tree the resolver needs. `parent_of` returns
   *  `null` at (or above) the root. */
  export interface TreeView {
    parent_of(id: NodeId): NodeId | null;
  }

  export interface Options {
    /** Authoritative selection — defines the current focus depth. */
    selection: readonly NodeId[];
    /** Meta/Ctrl held → resolve straight to the leaf (deepest). */
    deepest: boolean;
    /** Double-click drill → descend one level below the selection. */
    nested_first: boolean;
  }

  /** Siblings are treated as closer than parent/child (distance 1) so a tap
   *  into a sibling subtree resolves to the sibling at the focus depth without
   *  a tie-breaker. Mirrors Grida Canvas `weights: { sibling: 0.9 }`. */
  const SIBLING_WEIGHT = 0.9;

  /**
   * Resolve which node a pick (hover / tap / double-click) targets.
   *
   * @param hits  the leaf's ancestor chain, root-excluded, leaf-first.
   * @param tree  parent lookup over the document.
   * @param opts  selection (focus depth) + mode flags.
   * @returns the resolved node id, or `null` when `hits` is empty.
   */
  export function resolve_target(
    hits: readonly NodeId[],
    tree: TreeView,
    opts: Options
  ): NodeId | null {
    if (hits.length === 0) return null;

    // Depth in edges from the root (root = 0). Memoized per call — the chain
    // is short and the same ids recur across the findNearest inner loop.
    const depth_cache = new Map<NodeId, number>();
    const depth = (id: NodeId): number => {
      const cached = depth_cache.get(id);
      if (cached !== undefined) return cached;
      let d = 0;
      const seen = new Set<NodeId>([id]);
      let cur = tree.parent_of(id);
      while (cur !== null && !seen.has(cur)) {
        d++;
        seen.add(cur);
        cur = tree.parent_of(cur);
      }
      depth_cache.set(id, d);
      return d;
    };

    const ancestors_inclusive = (id: NodeId): Set<NodeId> => {
      const set = new Set<NodeId>();
      let cur: NodeId | null = id;
      while (cur !== null && !set.has(cur)) {
        set.add(cur);
        cur = tree.parent_of(cur);
      }
      return set;
    };

    /** Lowest common ancestor, or `null` if the two ids are not connected
     *  (e.g. a stale selection id from a different/old tree). */
    const lca = (a: NodeId, b: NodeId): NodeId | null => {
      const a_anc = ancestors_inclusive(a);
      const seen = new Set<NodeId>();
      let cur: NodeId | null = b;
      while (cur !== null && !seen.has(cur)) {
        if (a_anc.has(cur)) return cur;
        seen.add(cur);
        cur = tree.parent_of(cur);
      }
      return null;
    };

    /** Is `a` a (strict) descendant of `b`? */
    const is_descendant_of = (a: NodeId, b: NodeId): boolean => {
      const seen = new Set<NodeId>();
      let cur = tree.parent_of(a);
      while (cur !== null && !seen.has(cur)) {
        if (cur === b) return true;
        seen.add(cur);
        cur = tree.parent_of(cur);
      }
      return false;
    };

    const graph_distance = (a: NodeId, b: NodeId): number => {
      if (a === b) return 0;
      const m = lca(a, b);
      if (m === null) return Infinity;
      return depth(a) + depth(b) - 2 * depth(m);
    };

    const weighted_distance = (a: NodeId, b: NodeId): number => {
      if (a === b) return 0;
      const pa = tree.parent_of(a);
      if (pa !== null && pa === tree.parent_of(b)) return SIBLING_WEIGHT;
      return graph_distance(a, b);
    };

    // ── deepest (meta/ctrl) ── max-depth candidate = the leaf. Ties resolve
    //    to the first in `hits` order (topmost), matching Grida Canvas.
    if (opts.deepest) {
      let best: NodeId | null = null;
      let best_depth = -Infinity;
      for (const id of hits) {
        const d = depth(id);
        if (d > best_depth) {
          best_depth = d;
          best = id;
        }
      }
      return best;
    }

    // Shallowest-first, stable on the original `hits` order for equal depth
    // (mirrors target.ts: Rust orders topmost-first within a depth).
    const by_depth = [...hits].sort((a, b) => {
      const dd = depth(a) - depth(b);
      return dd !== 0 ? dd : hits.indexOf(a) - hits.indexOf(b);
    });

    // Drop selection ids not connected to the leaf (stale / different tree) —
    // otherwise `graph_distance` returns Infinity and poisons the minimum.
    const leaf = hits[0];
    const selection = opts.selection.filter((s) => lca(leaf, s) !== null);

    const find_nearest = (
      candidates: readonly NodeId[],
      sel: readonly NodeId[],
      use_sibling_weight: boolean,
      prefer_children: boolean
    ): NodeId | null => {
      if (candidates.length === 0 || sel.length === 0) return null;
      const dist = use_sibling_weight ? weighted_distance : graph_distance;
      const scored = candidates.map((c) => {
        let min = Infinity;
        for (const s of sel) {
          const d = dist(c, s);
          if (d < min) min = d;
        }
        return {
          id: c,
          distance: min,
          // Only consulted as a `prefer_children` tie-breaker below — skip the
          // per-candidate ancestor walk when it can't change the outcome (the
          // common tap / hover path passes `prefer_children = false`).
          is_child: prefer_children
            ? sel.some((s) => is_descendant_of(c, s))
            : false,
          depth: depth(c),
        };
      });
      scored.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        if (prefer_children) {
          if (a.is_child && !b.is_child) return -1;
          if (!a.is_child && b.is_child) return 1;
        }
        return a.depth - b.depth;
      });
      return scored[0]?.id ?? null;
    };

    if (selection.length > 0) {
      // ── double-click drill ── descend into the selection's subtree only.
      if (opts.nested_first) {
        const descendants = by_depth.filter(
          (c) =>
            !selection.includes(c) &&
            selection.some((s) => is_descendant_of(c, s))
        );
        if (descendants.length > 0) {
          // Unweighted (siblings can't appear among pure descendants), nearest
          // wins → the immediate child of the selection on the path to leaf.
          const r = find_nearest(descendants, selection, false, false);
          if (r !== null) return r;
        }
        // No descendant in the chain → fall through to the lateral resolver.
      }

      // ── tap (lateral / sibling-aware) ── nearest by weighted graph distance,
      //    NO-CLIMB: never a PROPER ancestor of the selection. A tap moves
      //    laterally, stays, or descends — it never climbs out of the focus
      //    (that is Escape's job). Without this, a cousin-leaf hit resolves to
      //    the shared container (the ancestor sits closer by raw distance);
      //    dropping the focus's ancestors leaves exactly the candidates the
      //    non-SVG editor's leaf-only `hits` would have had. The selected nodes
      //    themselves stay in play so "stay" (distance 0) still wins.
      const focus_ancestors = new Set<NodeId>();
      for (const s of selection)
        for (const a of ancestors_inclusive(s)) focus_ancestors.add(a);
      for (const s of selection) focus_ancestors.delete(s);
      const lateral = by_depth.filter((c) => !focus_ancestors.has(c));

      const nearest = find_nearest(
        lateral.length > 0 ? lateral : by_depth,
        selection,
        true,
        opts.nested_first
      );
      if (nearest !== null) return nearest;
    }

    // Empty / disconnected selection (or no graph-distance match) → the
    // topmost container. For double-click this establishes focus at the top,
    // so the next double-click descends one level.
    return by_depth[0] ?? null;
  }
}

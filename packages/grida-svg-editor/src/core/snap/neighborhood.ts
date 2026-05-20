// Snap-target selection policy.
//
// Editor-specific — this file depends on `SvgDocument`. When the snap
// module extracts to a shared package, this file stays here (per-editor
// neighborhood policies); only `session.ts` + `options.ts` move.
//
// Policy (Phase 2 / Figma-shaped): for each dragged id, gather
// (parent + parent's element children), exclude the *full subtree* of
// the dragged set, then expand each sibling via `snap_descent` so a
// `<g>` contributes its own bbox AND its rendered descendant leaves.
// Symmetric on the agent side — callers run `snap_descent` on agent
// ids before resolving rects, so dragging a group exposes both its
// bbox and its leaves as snap candidates.
//
// See `./GROUPS.md` for the ADR + caveats.

import { STRUCTURAL_GRAPHICS_SET } from "../group";
import type { SvgDocument } from "../document";
import type { NodeId } from "../../types";

/** Tags whose subtree is never rendered (resource containers). Children
 *  inside these are referenced via `<use>` or `clip-path`, not drawn
 *  directly, so they must not surface as snap targets. */
const NON_RENDERED_CONTAINER_TAGS: ReadonlySet<string> = new Set([
  "defs",
  "symbol",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "filter",
  "linearGradient",
  "radialGradient",
]);

/** Self-only render check. Does NOT walk ancestors — callers that descend
 *  from a known-rendered root already inherit ancestor-rendered as an
 *  invariant. Returns `false` for `display="none"`, `visibility="hidden"`,
 *  and for resource-container tags whose contents are never drawn. */
function is_self_rendered(doc: SvgDocument, id: NodeId): boolean {
  const tag = doc.tag_of(id);
  if (NON_RENDERED_CONTAINER_TAGS.has(tag)) return false;
  if (doc.get_attr(id, "display") === "none") return false;
  if (doc.get_attr(id, "visibility") === "hidden") return false;
  return true;
}

/** Recursive descent into a `<g>`. Pushes every rendered structural
 *  descendant — including nested `<g>` ids themselves — into `out`.
 *  Caller is responsible for adding the root id. */
function collect_rendered_subtree(
  doc: SvgDocument,
  parent: NodeId,
  out: Set<NodeId>
): void {
  for (const child of doc.element_children_of(parent)) {
    if (!is_self_rendered(doc, child)) continue;
    if (!STRUCTURAL_GRAPHICS_SET.has(doc.tag_of(child))) continue;
    out.add(child);
    if (doc.tag_of(child) === "g") {
      collect_rendered_subtree(doc, child, out);
    }
  }
}

/**
 * Expand a single id into its snap-candidate id set.
 *
 *  - Non-`<g>`: returns `[id]`.
 *  - `<g>`: returns `[id, ...rendered structural descendants]` — the
 *    group's own bbox stays in the set (preserving group-to-group
 *    alignment) AND every rendered leaf inside it becomes its own
 *    candidate. Nested `<g>` ids are included as bboxes; their
 *    children flatten in too.
 *
 * Editor-agnostic w.r.t. rect resolution — this returns ids only.
 * Callers feed the ids to the geometry provider to get rects.
 */
export function snap_descent(doc: SvgDocument, id: NodeId): NodeId[] {
  if (doc.tag_of(id) !== "g") return [id];
  if (!is_self_rendered(doc, id)) return [];
  const out = new Set<NodeId>([id]);
  collect_rendered_subtree(doc, id, out);
  return [...out];
}

export function compute_neighborhood(
  doc: SvgDocument,
  dragged: ReadonlyArray<NodeId>
): NodeId[] {
  if (dragged.length === 0) return [];

  // Subtree-aware exclusion: dragging a group means the agent set is
  // (group + all its leaves), so neighbors must exclude the entire
  // dragged subtree. Without this, a leaf inside a dragged group would
  // appear as both an agent rect AND a target rect → self-snap.
  const excluded = new Set<NodeId>();
  for (const id of dragged) {
    excluded.add(id);
    if (doc.tag_of(id) === "g") {
      collect_rendered_subtree(doc, id, excluded);
    }
  }

  const out = new Set<NodeId>();
  for (const id of dragged) {
    const parent = doc.parent_of(id);
    if (parent === null) continue;
    // Parent is added as-is (its own bbox is a snap target); we do NOT
    // descend into it, because its descendants include the dragged id
    // and other agents — descending here would just re-discover the
    // siblings already iterated below. Apply the same filters we apply
    // to siblings: structural, rendered, and not in the dragged subtree
    // (so an ancestor of a dragged element is itself excludable when
    // ancestor+descendant are co-selected).
    if (
      !excluded.has(parent) &&
      STRUCTURAL_GRAPHICS_SET.has(doc.tag_of(parent)) &&
      is_self_rendered(doc, parent)
    ) {
      out.add(parent);
    }
    for (const sib of doc.element_children_of(parent)) {
      if (excluded.has(sib)) continue;
      if (!STRUCTURAL_GRAPHICS_SET.has(doc.tag_of(sib))) continue;
      if (!is_self_rendered(doc, sib)) continue;
      // Descend siblings: `<g>` siblings contribute their bbox + leaves.
      for (const inner of snap_descent(doc, sib)) {
        if (excluded.has(inner)) continue;
        out.add(inner);
      }
    }
  }
  return [...out];
}

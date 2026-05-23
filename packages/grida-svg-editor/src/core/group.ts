// Pure planner for the Cmd+G "wrap selection in <g>" operation.
//
// `group.plan` is read-only — it validates against the policy in
// `../../docs/grouping.md` and either returns a `GroupPlan` (positions
// captured for apply + revert) or `null` (rejected). The editor
// orchestrator in `core/editor.ts` is the only place that creates the
// new `<g>` and drives history.

import type { NodeId } from "../types";
import type { SvgDocument } from "./document";

export type GroupPlan = {
  parent: NodeId;
  /** Where the new `<g>` is inserted in `parent.children`. */
  insert_before: NodeId | null;
  /** Selected ids sorted by document (element) order. */
  children: NodeId[];
  /**
   * For each child, its `next_element_sibling_of` before mutation —
   * used by revert to restore exact element-tree positions.
   */
  original_positions: Map<NodeId, NodeId | null>;
};

export namespace group {
  /**
   * Tags that may be valid children of a `<g>` element. Wrapping any
   * other tag in `<g>` would produce content-model-invalid SVG (e.g.
   * `<tspan>` must live inside `<text>`; `<stop>` must live inside a
   * gradient).
   */
  export const STRUCTURAL_GRAPHICS: ReadonlySet<string> = new Set([
    "g",
    "defs",
    "svg",
    "use",
    "image",
    "switch",
    "foreignObject",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "a",
  ]);

  /**
   * Tags whose content model is constrained — a freshly-inserted `<g>`
   * here would either be invalid (text-content / gradient / filter
   * parents) or semantically meaningless (defs, symbol).
   */
  export const CONSTRAINED_PARENT: ReadonlySet<string> = new Set([
    "text",
    "tspan",
    "defs",
    "clipPath",
    "mask",
    "pattern",
    "marker",
    "symbol",
    "filter",
    "linearGradient",
    "radialGradient",
    "animateMotion",
    "switch",
  ]);

  /**
   * Read-only policy gate. Returns a plan when grouping the given
   * selection is accepted; returns `null` (rejected) otherwise.
   *
   * Decision tree matches `../../docs/grouping.md`. Default
   * stance: "when unclear, reject."
   */
  export function plan(
    doc: SvgDocument,
    ids: ReadonlyArray<NodeId>
  ): GroupPlan | null {
    if (ids.length === 0) return null;

    // rules out root (which has parent === null)
    const parent = doc.parent_of(ids[0]);
    if (parent === null) return null;

    for (const id of ids) {
      if (doc.parent_of(id) !== parent) return null;
      if (!STRUCTURAL_GRAPHICS.has(doc.tag_of(id))) return null;
    }

    if (CONSTRAINED_PARENT.has(doc.tag_of(parent))) return null;

    // Cache the element-siblings listing once. Both contiguity and
    // `original_positions` derive from it without re-filtering.
    const siblings = doc.element_children_of(parent);
    const sibling_index = new Map<NodeId, number>();
    for (let i = 0; i < siblings.length; i++) sibling_index.set(siblings[i], i);

    const indices: number[] = [];
    for (const id of ids) {
      const i = sibling_index.get(id);
      if (i === undefined) return null;
      indices.push(i);
    }

    // Contiguity: indices must form an unbroken run after sorting. Set
    // dedupes a defensive duplicate-id case (selection should never
    // contain duplicates, but be defensive).
    const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) return null;
    }

    const children = sorted.map((i) => siblings[i]);
    const last_index = sorted[sorted.length - 1];

    const original_positions = new Map<NodeId, NodeId | null>();
    for (const i of sorted) {
      original_positions.set(siblings[i], siblings[i + 1] ?? null);
    }

    return {
      parent,
      insert_before: siblings[last_index + 1] ?? null,
      children,
      original_positions,
    };
  }
}

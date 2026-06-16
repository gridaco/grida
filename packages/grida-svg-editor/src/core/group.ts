// Pure planner for the Cmd+G "wrap selection in <g>" operation.
//
// `group.plan` is read-only — it validates against the policy in
// `../../docs/grouping.md` and either returns a `GroupPlan` (positions
// captured for apply + revert) or `null` (rejected). The editor
// orchestrator in `core/editor.ts` is the only place that creates the
// new `<g>` and drives history.

import type { NodeId } from "../types";
import type { SvgDocument } from "./document";
import { XLINK_NS } from "./document";
import { transform } from "./transform";

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

export type UngroupPlan = {
  /** The `<g>` being dissolved. */
  group_id: NodeId;
  /** The group's parent — where children are hoisted to. */
  parent: NodeId;
  /** The group's element-children, in document order. Hoisted in this order. */
  children: NodeId[];
  /**
   * The group's own `transform=` value, or `null` when the group has no
   * transform. When non-null, the editor bakes it onto each child by
   * prepending the parsed ops (NOT a matrix collapse — see `ungroup` in
   * `editor.ts`).
   */
  group_transform: string | null;
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

    // `Set` dedupes a defensive duplicate-id case (selection should never
    // contain duplicates, but be defensive).
    const indices = new Set<number>();
    for (const id of ids) {
      const i = sibling_index.get(id);
      if (i === undefined) return null;
      indices.add(i);
    }

    // Same-parent selections wrap regardless of contiguity: non-contiguous
    // siblings are gathered into the new <g> in document order, the group
    // lands at the front-most selected sibling's z-position, and any
    // unselected siblings between them drop behind it (a paint-order shift
    // that matches Figma / Illustrator, undoable via `original_positions`).
    const sorted = Array.from(indices).sort((a, b) => a - b);

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

  /**
   * Own-attribute allowlist for the safe clean-structural ungroup subset.
   * A group carrying ONLY these attributes is a plain structural wrapper:
   * dissolving it splices its children into the parent without changing
   * what renders (modulo baking the `transform`, which `ungroup` does).
   *
   * - `transform` — baked into each child by prepending its ops.
   * - `id` — only allowed when no `<use>` references it (checked below);
   *   the group's own `id` simply disappears (no child inherits it).
   * - `data-grida-id` — the editor's runtime node identity. Internal; the
   *   group node is removed entirely so the id retires with it.
   *
   * ANY other own attribute (`class`, `style`, `opacity`, `fill`,
   * `stroke`, `filter`, `clip-path`, `mask`, `font-*`, …) carries visual
   * / cascade / inheritance state that is NOT generally equivalent to the
   * per-child result of removing the group (TODO §10). Those groups are
   * refused — never silently mishandled.
   */
  const UNGROUP_OWN_ATTR_ALLOWLIST: ReadonlySet<string> = new Set([
    "transform",
    "id",
    "data-grida-id",
  ]);

  /** SVG animation elements (SMIL). A direct animation child targets the
   *  group as its `targetElement`; dissolving the group orphans the
   *  animation. Refuse rather than relocate it. */
  const ANIMATION_TAGS: ReadonlySet<string> = new Set([
    "animate",
    "animateTransform",
    "animateMotion",
    "set",
  ]);

  /**
   * Read-only policy gate for ungrouping (`Cmd+Shift+G`). Returns an
   * `UngroupPlan` when dissolving the given `<g>` is in the **safe
   * clean-structural subset**; returns `null` (refuse) otherwise.
   *
   * Ungrouping is NOT the inverse of grouping when the group carries
   * visual / cascade / reference state — see `../docs/grouping.md`
   * §Ungrouping and `../TODO.md` §10 for the full case study. This gate
   * implements the conservative subset: a plain structural wrapper
   * (optionally with a bakeable `transform`) with at least one child,
   * not in `<defs>`, not referenced by `<use>`, not animation-bearing.
   *
   * Default stance, matching `plan`: "when unclear, reject."
   */
  export function plan_ungroup(
    doc: SvgDocument,
    id: NodeId
  ): UngroupPlan | null {
    if (doc.tag_of(id) !== "g") return null;

    const parent = doc.parent_of(id);
    // Root <g> (no parent) cannot be dissolved — there is nowhere to hoist.
    if (parent === null) return null;

    // Refuse groups anywhere inside <defs> — those are asset definitions,
    // not canvas groups (TODO §10). Walk ancestors.
    {
      let cur: NodeId | null = parent;
      while (cur !== null) {
        if (doc.tag_of(cur) === "defs") return null;
        cur = doc.parent_of(cur);
      }
    }

    const children = doc.element_children_of(id);
    if (children.length < 1) return null;

    // Own-attribute subset check. Any attribute outside the allowlist is
    // visual / cascade / reference state we refuse to flatten.
    let has_id = false;
    for (const a of doc.attributes_of(id)) {
      // Reject any namespaced own-attribute: the allowlist names the
      // un-namespaced structural attrs (`transform` / `id` / `data-grida-id`).
      // A namespaced attribute whose local name happens to match (e.g.
      // `x:transform`) is unknown state we won't flatten.
      if (a.ns !== null) return null;
      if (!UNGROUP_OWN_ATTR_ALLOWLIST.has(a.name)) return null;
      if (a.name === "id") has_id = true;
    }

    // <use> reference check. `find_by_tag` cheaply enumerates every
    // `<use>` in the document, so we can be precise: refuse only when an
    // actual `<use>` targets this group's id. (If no enumeration were
    // available we would refuse any id-bearing group — but it is, so we
    // don't have to be that blunt.)
    if (has_id) {
      const own_id = doc.get_attr(id, "id");
      if (own_id !== null) {
        const fragment = `#${own_id}`;
        for (const use_id of doc.find_by_tag(doc.root, "use")) {
          // SVG 2 `href` (no namespace) and legacy `xlink:href`.
          const href =
            doc.get_attr(use_id, "href") ??
            doc.get_attr(use_id, "href", XLINK_NS);
          if (href === fragment) return null;
        }
      }
    }

    // Direct-child animation check. An animation child targets the group.
    for (const child of children) {
      if (ANIMATION_TAGS.has(doc.tag_of(child))) return null;
    }

    const group_transform = doc.get_attr(id, "transform");

    // If the group has a transform, every child's own transform must be
    // parseable so we can bake cleanly by composing op lists. An
    // unparseable child transform (e.g. an unknown function) can't be
    // safely composed — refuse. When the group has no transform, child
    // transforms are untouched, so their parseability is irrelevant.
    if (group_transform !== null) {
      if (transform.parse(group_transform) === null) return null;
      for (const child of children) {
        if (transform.parse(doc.get_attr(child, "transform")) === null) {
          return null;
        }
      }
    }

    return {
      group_id: id,
      parent,
      children: [...children],
      group_transform,
    };
  }
}

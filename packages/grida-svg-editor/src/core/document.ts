// In-memory SVG document IR with round-trip serialization.
//
// The IR keeps every byte of source trivia (attribute order, quote styles,
// whitespace, comments, prolog, epilog, doctype, namespace prefixes). The
// serializer emits attributes as authored unless they were touched; touched
// attributes are rewritten in-place at their original position. New
// attributes are appended.

import {
  encode_attr_value,
  encode_text,
  parse_svg,
  type AnyNode,
  type AttrToken,
  type CDataNode,
  type CommentNode,
  type DoctypeNode,
  type ElementNode,
  type ParseResult,
  type PiNode,
  type TextNode,
  XLINK_NS,
  XMLNS_NS,
  XML_NS,
} from "@grida/svg/parser";
import { svg_parse } from "@grida/svg/parse";
import type { NodeId } from "../types";

/**
 * What `is_vector_edit_target` returns when a node is eligible for
 * vector (vertex) editing — a tag-discriminated snapshot of the authored
 * geometry attributes at enter time.
 *
 * Consumed by `VectorEditSession` (which holds it as `source_attrs`) and by
 * `PathModel` (whose `toNativeAttrs(source_tag)` decides on each commit
 * whether the post-edit form is still expressible in the source tag, or
 * whether the element must promote to `<path d="…">`).
 *
 * Geometry conventions:
 *   - All coordinates are in the element's own local space, exactly as
 *     authored. No `transform=` resolution, no parent CTM, no viewport
 *     remap.
 *   - `line` carries its two endpoints; `polyline` / `polygon` points are
 *     `[x, y]` tuples so the consumer can hand them straight to
 *     `vn.fromPolyline` / `vn.fromPolygon`.
 *   - `rect` / `circle` / `ellipse` carry their native geometry numbers.
 *     These geometry primitives have no addressable interior vertices in
 *     their native form, so editing one as vector geometry re-types the
 *     element to `<path>` (see `retype_to_path`). The document holds the
 *     native tag until that re-type is committed. Design:
 *     `docs/wg/feat-svg-editor/promote-to-path.md`.
 *
 * Re-type vs. native writeback is decided per edit, not per tag: an edit
 * that the source tag can still express (a straight vertex move on
 * `line` / `polyline` / `polygon`) writes back natively; one it cannot (a
 * curve, or a topology change that leaves the tag's canonical form)
 * re-types the element to `<path>`.
 */
export type VectorEditSource =
  | { kind: "path"; d: string }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | {
      kind: "polyline";
      points: ReadonlyArray<readonly [number, number]>;
    }
  | {
      kind: "polygon";
      points: ReadonlyArray<readonly [number, number]>;
    }
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      /** Corner radii; `0` when the rect has square corners. */
      rx: number;
      ry: number;
    }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number };

/** The native vector tags `retype_to_path` can re-type, keyed by tag → the
 *  native geometry attributes it consumes (so no orphaned geometry attr
 *  survives on the resulting `<path>`). Covers the geometry primitives
 *  (rect / circle / ellipse — always re-typed) and the vertex tags (line /
 *  polyline / polygon — re-typed only when an edit escapes their native
 *  form). */
const RETYPABLE_GEOMETRY_ATTRS: Readonly<Record<string, ReadonlySet<string>>> =
  {
    line: new Set(["x1", "y1", "x2", "y2"]),
    polyline: new Set(["points"]),
    polygon: new Set(["points"]),
    rect: new Set(["x", "y", "width", "height", "rx", "ry"]),
    circle: new Set(["cx", "cy", "r"]),
    ellipse: new Set(["cx", "cy", "rx", "ry"]),
  };

/**
 * Opaque reversal token returned by `retype_to_path`. Callers hold it and
 * hand it back to `revert_retype` to restore the original primitive
 * byte-for-byte; they do not inspect it. All trivia / attribute-token
 * knowledge stays inside `SvgDocument`.
 */
export type RetypeRecord = {
  readonly prev_local: string;
  readonly prev_raw_tag: string;
  /** Geometry attribute tokens removed on re-type, with their original
   *  index in the element's `attrs` array. Ascending by index so they can
   *  be spliced back in order. Typed as the document's internal attr token. */
  readonly removed: ReadonlyArray<{ index: number; token: AttrToken }>;
  /** True iff the re-type added a synthetic `fill="none"` (the `<line>`
   *  fidelity guard — see `retype_to_path`). `revert_retype` removes it. */
  readonly added_fill_none?: boolean;
};

/**
 * Parse a single SVG length attribute as a plain user-unit number. Returns
 * `null` for absent, non-finite, or unit/percentage values (`50%`, `5px`,
 * `5em`) — those are an out-of-scope geometry gap, and refusing them here
 * means the editor never offers a promotion it cannot perform faithfully.
 */
function parse_user_unit(raw: string | null): number | null {
  if (raw === null) return null;
  const s = raw.trim();
  if (s === "") return null;
  // Bare number only: optional sign, digits, optional fraction/exponent.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface DocumentEvents {
  /** Fires after any structural mutation. */
  on_change(fn: () => void): () => void;
}

/**
 * Attribute names whose writes can shift a node's rendered bounds.
 * Membership drives `_geometry_version` bumps in `set_attr`. Only
 * non-namespaced attribute names — namespaced writes (xlink:href, etc.)
 * never bump because they're references, not geometry.
 *
 * Includes text-shaping attributes (font-*) because they re-shape glyph
 * runs and change `<text>` bbox.
 */
export const GEOMETRY_ATTRS: ReadonlySet<string> = new Set([
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "width",
  "height",
  "r",
  "rx",
  "ry",
  "points",
  "d",
  "transform",
  "viewBox",
  "font-size",
  "font-family",
  "font-weight",
  "font-style",
  "text-anchor",
  "dx",
  "dy",
  "rotate",
  "textLength",
  "lengthAdjust",
  "pathLength",
  "marker-start",
  "marker-mid",
  "marker-end",
]);

/** `transform:` CSS property at the start of a declaration list or after `;`. */
const CSS_TRANSFORM_PROPERTY = /(?:^|;)\s*transform\s*:/i;

export class SvgDocument implements DocumentEvents {
  private nodes: Map<NodeId, AnyNode>;
  private prolog: AnyNode[];
  private epilog: AnyNode[];
  /** Snapshot of the input string, used for `reset()`. */
  private source: string;
  /** Original parse result, for `reset()`. */
  private original: ParseResult;
  readonly root: NodeId;
  private listeners = new Set<() => void>();
  /**
   * Counter that bumps ONLY when something the hierarchy view cares about
   * changes — tree topology (`insert`/`remove`), text-node content
   * (`set_text`), or the `id` attribute (which feeds display labels). Pure
   * presentation-attribute writes (x, y, fill, …) do NOT bump it.
   *
   * Why a separate counter: consumers like the layers panel cache snapshots
   * keyed on this. During a drag, x/y writes fire `emit()` repeatedly but
   * `structure_version` stays stable, so the panel's snapshot reference
   * stays the same and React skips the re-render of the whole tree.
   */
  private _structure_version = 0;
  /** Bumps on writes that can shift world-space bounds (`GEOMETRY_ATTRS`,
   *  `set_text`, `insert`, `remove`). Cache key for `GeometryProvider`;
   *  see ../../docs/geometry.md. */
  private _geometry_version = 0;

  constructor(svg: string) {
    if (typeof svg !== "string") {
      throw new TypeError(
        `new SvgDocument(svg) requires a string source, got ${svg === null ? "null" : typeof svg}`
      );
    }
    this.source = svg;
    const parsed = parse_svg(svg);
    this.original = parsed;
    this.nodes = parsed.nodes;
    this.prolog = parsed.prolog;
    this.epilog = parsed.epilog;
    this.root = parsed.root;
  }

  static parse(svg: string): SvgDocument {
    return new SvgDocument(svg);
  }

  /** Reload from the original parse, discarding all edits. */
  reset_to_original(): void {
    const parsed = parse_svg(this.source);
    this.original = parsed;
    this.nodes = parsed.nodes;
    this.prolog = parsed.prolog;
    this.epilog = parsed.epilog;
    (this as { root: NodeId }).root = parsed.root;
    this._structure_version++;
    this._geometry_version++;
    this.emit();
  }

  /** Replace document with new svg source (clears edits + history-owned state). */
  load(svg: string): void {
    if (typeof svg !== "string") {
      throw new TypeError(
        `SvgDocument.load(svg) requires a string source, got ${svg === null ? "null" : typeof svg}`
      );
    }
    this.source = svg;
    const parsed = parse_svg(svg);
    this.original = parsed;
    this.nodes = parsed.nodes;
    this.prolog = parsed.prolog;
    this.epilog = parsed.epilog;
    (this as { root: NodeId }).root = parsed.root;
    this._structure_version++;
    this._geometry_version++;
    this.emit();
  }

  on_change(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** See `_structure_version` for what this counter signals. */
  get structure_version(): number {
    return this._structure_version;
  }

  /** See `_geometry_version` for what this counter signals. */
  get geometry_version(): number {
    return this._geometry_version;
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  /** Notify subscribers — for callers that mutate directly via setAttr/etc. */
  notify(): void {
    this.emit();
  }

  // ─── Tree queries ────────────────────────────────────────────────────────

  get(id: NodeId): AnyNode | null {
    return this.nodes.get(id) ?? null;
  }

  is_element(id: NodeId): boolean {
    return this.nodes.get(id)?.kind === "element";
  }

  parent_of(id: NodeId): NodeId | null {
    return this.nodes.get(id)?.parent ?? null;
  }

  children_of(id: NodeId): readonly NodeId[] {
    const n = this.nodes.get(id);
    if (!n || n.kind !== "element") return [];
    return n.children;
  }

  /** Element children only — text/comment/cdata filtered out. */
  element_children_of(id: NodeId): readonly NodeId[] {
    return this.children_of(id).filter((c) => this.is_element(c));
  }

  next_sibling_of(id: NodeId): NodeId | null {
    const parent = this.parent_of(id);
    if (parent === null) return null;
    const siblings = this.children_of(parent);
    const i = siblings.indexOf(id);
    return i >= 0 && i + 1 < siblings.length ? siblings[i + 1] : null;
  }

  next_element_sibling_of(id: NodeId): NodeId | null {
    const parent = this.parent_of(id);
    if (parent === null) return null;
    const siblings = this.element_children_of(parent);
    const i = siblings.indexOf(id);
    return i >= 0 && i + 1 < siblings.length ? siblings[i + 1] : null;
  }

  tag_of(id: NodeId): string {
    const n = this.nodes.get(id);
    return n && n.kind === "element" ? n.local : "";
  }

  contains(ancestor: NodeId, descendant: NodeId): boolean {
    if (ancestor === descendant) return true;
    let cur: NodeId | null = this.parent_of(descendant);
    while (cur !== null) {
      if (cur === ancestor) return true;
      cur = this.parent_of(cur);
    }
    return false;
  }

  /**
   * Filter a selection down to its **subtree roots** — drop any id whose
   * ancestor is also in the input set.
   *
   * Mirrors `pruneNestedNodes` in the main canvas editor's query module
   * ([editor/grida-canvas/query/index.ts:138](../../../../editor/grida-canvas/query/index.ts)) and shares its UX motivation:
   * when a parent and a descendant are both selected, only the parent
   * should drive multi-node mutations — otherwise the descendant
   * accumulates the transform twice (once via the parent's `transform`,
   * once via its own attribute write). Required for `commands.remove`
   * (avoids re-attaching detached descendants on undo) and any multi-
   * member translate path (avoids 2× drift for the Bar-chart marquee
   * case).
   *
   * Order: preserves the input order for retained ids. Duplicates in
   * the input are not deduplicated — callers are responsible (the
   * editor's `commands.select` already dedupes).
   *
   * Performance: `O(n × depth)`. Builds a `Set` over the input once,
   * then walks each id's ancestor chain at most once. The main editor's
   * version is `O(n² × depth)` (per-pair `isAncestor`) — fine at typical
   * selection sizes (a few dozen), worth winning here for free since
   * `parent_of` is `O(1)` on our parent-map.
   */
  prune_nested_nodes(ids: ReadonlyArray<NodeId>): NodeId[] {
    if (ids.length <= 1) return [...ids];
    const set = new Set(ids);
    const out: NodeId[] = [];
    for (const id of ids) {
      let nested = false;
      let cur: NodeId | null = this.parent_of(id);
      while (cur !== null) {
        if (set.has(cur)) {
          nested = true;
          break;
        }
        cur = this.parent_of(cur);
      }
      if (!nested) out.push(id);
    }
    return out;
  }

  all_nodes(): readonly NodeId[] {
    const out: NodeId[] = [];
    const walk = (id: NodeId) => {
      out.push(id);
      const c = this.children_of(id);
      for (const ch of c) walk(ch);
    };
    walk(this.root);
    return out;
  }

  all_elements(): readonly NodeId[] {
    return this.all_nodes().filter((id) => this.is_element(id));
  }

  find_by_tag(ancestor: NodeId, tag: string): readonly NodeId[] {
    const out: NodeId[] = [];
    const walk = (id: NodeId) => {
      if (id !== ancestor && this.is_element(id) && this.tag_of(id) === tag) {
        out.push(id);
      }
      for (const c of this.children_of(id)) walk(c);
    };
    walk(ancestor);
    return out;
  }

  // ─── Attribute access ────────────────────────────────────────────────────

  /** Read attribute by local name, optionally namespace-filtered. */
  get_attr(id: NodeId, name: string, ns: string | null = null): string | null {
    const n = this.nodes.get(id);
    if (!n || n.kind !== "element") return null;
    for (const a of n.attrs) {
      if (a.local === name && (ns === null || a.ns === ns)) {
        return a.value;
      }
    }
    return null;
  }

  /**
   * Set / remove an attribute. If the attribute exists, it is mutated in place
   * (preserving source position). If it doesn't, it's appended.
   */
  set_attr(
    id: NodeId,
    name: string,
    value: string | null,
    ns: string | null = null
  ): void {
    const n = this.nodes.get(id);
    if (!n || n.kind !== "element") return;
    // `id` feeds the display label for non-text nodes — treat as structural.
    const structural = name === "id";
    // Only non-namespaced geometry attributes affect bounds. xlink:href etc.
    // are references, not geometry.
    const geometry = ns === null && GEOMETRY_ATTRS.has(name);
    for (let i = 0; i < n.attrs.length; i++) {
      const a = n.attrs[i];
      if (a.local === name && (ns === null || a.ns === ns)) {
        if (value === null) {
          n.attrs.splice(i, 1);
        } else {
          a.value = value;
        }
        if (structural) this._structure_version++;
        if (geometry) this._geometry_version++;
        this.emit();
        return;
      }
    }
    if (value !== null) {
      const prefix = ns === XLINK_NS ? "xlink" : null;
      n.attrs.push({
        raw_name: prefix ? `${prefix}:${name}` : name,
        prefix,
        local: name,
        ns,
        value,
        pre: " ",
        eq_trivia: "",
        quote: '"',
      });
      if (structural) this._structure_version++;
      if (geometry) this._geometry_version++;
      this.emit();
    }
  }

  attributes_of(
    id: NodeId
  ): { name: string; ns: string | null; value: string }[] {
    const n = this.nodes.get(id);
    if (!n || n.kind !== "element") return [];
    return n.attrs.map((a) => ({ name: a.local, ns: a.ns, value: a.value }));
  }

  // ─── Inline style ────────────────────────────────────────────────────────

  get_style(id: NodeId, property: string): string | null {
    const style = this.get_attr(id, "style");
    if (!style) return null;
    const decls = parse_inline_style(style);
    for (const d of decls) {
      if (d.property === property) return d.value;
    }
    return null;
  }

  set_style(id: NodeId, property: string, value: string | null): void {
    const style = this.get_attr(id, "style") ?? "";
    const decls = parse_inline_style(style);
    const idx = decls.findIndex((d) => d.property === property);
    if (value === null) {
      if (idx === -1) return;
      decls.splice(idx, 1);
    } else if (idx === -1) {
      decls.push({ property, value });
    } else {
      decls[idx].value = value;
    }
    const next = decls.map((d) => `${d.property}: ${d.value}`).join("; ");
    this.set_attr(id, "style", next === "" ? null : next);
  }

  get_all_styles(id: NodeId): Array<{ property: string; value: string }> {
    const style = this.get_attr(id, "style");
    if (!style) return [];
    return parse_inline_style(style);
  }

  // ─── Text content ────────────────────────────────────────────────────────

  /**
   * Whether `id` can be opened in the flat-string text editor.
   *
   * v1 contract: the editor only operates on a *single flat text run*. That
   * means the target must be a `<text>` or `<tspan>` whose direct children
   * are all text nodes (or it has no children). A `<text>` containing a
   * `<tspan>` is *not* honestly editable — `text_of` would drop the tspan
   * content from the editor's view, and a flat-text write would leave the
   * tspan dangling. Tspan-as-target is fine and well-defined when it's a
   * leaf; only the host decides whether to route double-click to a tspan
   * or its parent text.
   */
  is_text_edit_target(id: NodeId): boolean {
    const n = this.nodes.get(id);
    if (!n || n.kind !== "element") return false;
    if (n.local !== "text" && n.local !== "tspan") return false;
    for (const c of n.children) {
      if (this.nodes.get(c)?.kind !== "text") return false;
    }
    return true;
  }

  /**
   * Returns a tag-discriminated snapshot of the authored geometry attrs
   * if this node is eligible for vector (vertex) editing — else `null`.
   *
   * Eligibility:
   *   - `<path>`     — requires non-empty `d`.
   *   - `<line>`     — requires two distinct finite user-unit endpoints.
   *   - `<polyline>` — requires `points` parseable to ≥ 2 vertices.
   *   - `<polygon>`  — same as polyline.
   *   - `<rect>`     — requires finite user-unit `width`/`height` > 0.
   *   - `<circle>`   — requires finite user-unit `r` > 0.
   *   - `<ellipse>`  — requires finite user-unit `rx`/`ry` > 0.
   *
   * The vertex tags (`line` / `polyline` / `polygon`) write edits back to
   * their native attributes while the geometry stays expressible there; an
   * edit that escapes the native form (a curve, or a topology change that
   * leaves the canonical chain) re-types the element to `<path>`. The
   * geometry primitives (`rect` / `circle` / `ellipse`) have no native
   * vector form, so any vector edit re-types them. In all cases the native
   * tag is preserved byte-for-byte until the first re-typing edit commits
   * (see `retype_to_path`). Design:
   * `docs/wg/feat-svg-editor/promote-to-path.md`.
   *
   * Geometry that is not a plain user-unit number (`%`, `px`, `em`, …) is
   * an out-of-scope gap, so such an element returns `null` rather than
   * advertising an edit the editor cannot perform faithfully.
   *
   * Rejects `<image>` / `<use>` (raster / reference bounding boxes, no
   * editable outline).
   */
  is_vector_edit_target(id: NodeId): VectorEditSource | null {
    const n = this.nodes.get(id);
    if (!n || n.kind !== "element") return null;
    // A retypable native shape (line / polyline / polygon / rect / circle /
    // ellipse) must not already carry an unprefixed `d`: re-typing appends
    // one, and a pre-authored (malformed) `d` would collide into an invalid
    // double-`d` `<path>`. A namespaced `foo:d` is a foreign attr that
    // survives verbatim (re-type only touches unprefixed `d`), so it is not a
    // collision and does not disqualify. `<path>` is exempt — `d` is its own
    // geometry, and it is absent from RETYPABLE_GEOMETRY_ATTRS.
    if (
      RETYPABLE_GEOMETRY_ATTRS[n.local] &&
      n.attrs.some((a) => a.prefix === null && a.ns === null && a.local === "d")
    ) {
      return null;
    }
    switch (n.local) {
      case "path": {
        const d = this.get_attr(id, "d");
        if (d === null || d.trim().length === 0) return null;
        return { kind: "path", d };
      }
      case "line": {
        const x1 = parse_user_unit(this.get_attr(id, "x1")) ?? 0;
        const y1 = parse_user_unit(this.get_attr(id, "y1")) ?? 0;
        const x2 = parse_user_unit(this.get_attr(id, "x2")) ?? 0;
        const y2 = parse_user_unit(this.get_attr(id, "y2")) ?? 0;
        // Degenerate (zero-length) line has nothing to vector-edit.
        if (x1 === x2 && y1 === y2) return null;
        return { kind: "line", x1, y1, x2, y2 };
      }
      case "polyline":
      case "polygon": {
        const raw = this.get_attr(id, "points") ?? "";
        const parsed = svg_parse.parse_points(raw);
        if (parsed.length < 2) return null;
        const points: [number, number][] = parsed.map((p) => [p.x, p.y]);
        return n.local === "polyline"
          ? { kind: "polyline", points }
          : { kind: "polygon", points };
      }
      case "rect": {
        const x = parse_user_unit(this.get_attr(id, "x")) ?? 0;
        const y = parse_user_unit(this.get_attr(id, "y")) ?? 0;
        const width = parse_user_unit(this.get_attr(id, "width"));
        const height = parse_user_unit(this.get_attr(id, "height"));
        if (width === null || height === null) return null;
        if (width <= 0 || height <= 0) return null;
        // SVG corner-radii defaulting: a missing rx/ry mirrors the other;
        // both missing → square corners. Negatives are treated as 0.
        const rx_raw = parse_user_unit(this.get_attr(id, "rx"));
        const ry_raw = parse_user_unit(this.get_attr(id, "ry"));
        let rx = rx_raw ?? ry_raw ?? 0;
        let ry = ry_raw ?? rx_raw ?? 0;
        rx = Math.max(0, Math.min(rx, width / 2));
        ry = Math.max(0, Math.min(ry, height / 2));
        return { kind: "rect", x, y, width, height, rx, ry };
      }
      case "circle": {
        const cx = parse_user_unit(this.get_attr(id, "cx")) ?? 0;
        const cy = parse_user_unit(this.get_attr(id, "cy")) ?? 0;
        const r = parse_user_unit(this.get_attr(id, "r"));
        if (r === null || r <= 0) return null;
        return { kind: "circle", cx, cy, r };
      }
      case "ellipse": {
        const cx = parse_user_unit(this.get_attr(id, "cx")) ?? 0;
        const cy = parse_user_unit(this.get_attr(id, "cy")) ?? 0;
        const rx = parse_user_unit(this.get_attr(id, "rx"));
        const ry = parse_user_unit(this.get_attr(id, "ry"));
        if (rx === null || ry === null) return null;
        if (rx <= 0 || ry <= 0) return null;
        return { kind: "ellipse", cx, cy, rx, ry };
      }
      default:
        return null;
    }
  }

  /**
   * Re-type a native vector element (`<line>` / `<polyline>` / `<polygon>` /
   * `<rect>` / `<circle>` / `<ellipse>`) into a `<path>` in place, consuming
   * its native geometry attributes and setting `d`. A structural mutation:
   * this layer executes the re-type; it does not decide when one is
   * warranted.
   *
   * Idempotent: returns `null` if `id` is not currently one of those tags
   * (so it is safe to call repeatedly — once re-typed, e.g. already a
   * `<path>`, further calls are no-ops). Otherwise mutates the node and
   * returns an opaque {@link RetypeRecord} reversal token.
   *
   * Identity, children, `self_closing`, non-geometry attributes, and all
   * source trivia are preserved unchanged — only the tag and the geometry
   * attributes move. Pass the token to {@link revert_retype} to restore
   * the original primitive byte-for-byte.
   *
   * (see test/svg-editor-vector-promote-to-path.md)
   */
  retype_to_path(id: NodeId, d: string): RetypeRecord | null {
    const n = this.nodes.get(id);
    if (!n || n.kind !== "element") return null;
    const geom = RETYPABLE_GEOMETRY_ATTRS[n.local];
    if (!geom) return null;

    const prev_local = n.local;
    const prev_raw_tag = n.raw_tag;

    // Capture + remove the native geometry attrs (unprefixed only). Walk
    // back-to-front so splices don't shift the indices we still need, then
    // reverse to ascending order for faithful restoration.
    const removed: { index: number; token: AttrToken }[] = [];
    for (let i = n.attrs.length - 1; i >= 0; i--) {
      const a = n.attrs[i];
      // Unprefixed geometry attrs only — a prefixed `foo:cx` is not the
      // shape's geometry and must survive verbatim.
      if (a.prefix === null && a.ns === null && geom.has(a.local)) {
        removed.push({ index: i, token: a });
        n.attrs.splice(i, 1);
      }
    }
    removed.reverse();

    // Re-type. Keep any namespace prefix (e.g. `svg:circle` → `svg:path`).
    n.local = "path";
    n.raw_tag = n.prefix ? `${n.prefix}:path` : "path";

    // Append the `d` attribute (mirrors set_attr's append shape).
    n.attrs.push({
      raw_name: "d",
      prefix: null,
      local: "d",
      ns: null,
      value: d,
      pre: " ",
      eq_trivia: "",
      quote: '"',
    });

    // Fidelity guard for `<line>`: a line has no fill region, so its fill
    // (default `black`, or any inherited/authored value) never paints. A
    // `<path>` DOES fill — an open path closes implicitly for fill — so the
    // re-typed element would suddenly show a fill the line never had. When
    // the element declares no fill of its own (presentation attr or inline
    // style), pin `fill="none"` so the path renders stroke-only like the
    // line did. (An element that explicitly declares a fill keeps it — that
    // authored value is respected as-is.)
    let added_fill_none = false;
    if (
      prev_local === "line" &&
      this.get_attr(id, "fill") === null &&
      this.get_style(id, "fill") === null
    ) {
      n.attrs.push({
        raw_name: "fill",
        prefix: null,
        local: "fill",
        ns: null,
        value: "none",
        pre: " ",
        eq_trivia: "",
        quote: '"',
      });
      added_fill_none = true;
    }

    this._structure_version++;
    this._geometry_version++;
    this.emit();
    return { prev_local, prev_raw_tag, removed, added_fill_none };
  }

  /**
   * Reverse a {@link retype_to_path}: restore the original tag, remove the
   * `d` attribute the promotion added, and splice the captured geometry
   * attribute tokens back at their original positions (preserving their
   * trivia, so a later `serialize()` is byte-equal to the pre-promotion
   * source).
   */
  revert_retype(id: NodeId, token: RetypeRecord): void {
    const n = this.nodes.get(id);
    if (!n || n.kind !== "element") return;

    // Remove the appended `d` (unprefixed). Only one exists — the re-type
    // added it and the source tags carry none.
    for (let i = n.attrs.length - 1; i >= 0; i--) {
      const a = n.attrs[i];
      if (a.prefix === null && a.ns === null && a.local === "d") {
        n.attrs.splice(i, 1);
        break;
      }
    }

    // Remove the synthetic `fill="none"` if the re-type added one.
    if (token.added_fill_none) {
      for (let i = n.attrs.length - 1; i >= 0; i--) {
        const a = n.attrs[i];
        if (a.prefix === null && a.ns === null && a.local === "fill") {
          n.attrs.splice(i, 1);
          break;
        }
      }
    }

    n.local = token.prev_local;
    n.raw_tag = token.prev_raw_tag;

    // Re-insert removed tokens at ascending original indices.
    for (const { index, token: t } of token.removed) {
      n.attrs.splice(index, 0, t);
    }

    this._structure_version++;
    this._geometry_version++;
    this.emit();
  }

  // Structural-fact predicates — atomic yes/no queries about authored
  // SVG content. Callers (per-class handlers, is_rotatable) compose
  // them into intent-specific verdicts; this layer never composes.
  // Layering: docs/wg/feat-svg-editor/glossary/policy-class.md

  /**
   * True iff this `<text>` / `<tspan>` carries a non-empty `rotate=""`
   * per-glyph attribute (which conflicts with element-level rotation).
   */
  has_glyph_rotate(id: NodeId): boolean {
    const tag = this.tag_of(id);
    if (tag !== "text" && tag !== "tspan") return false;
    const value = this.get_attr(id, "rotate");
    if (value === null) return false;
    return value.trim() !== "";
  }

  /**
   * True iff this element's inline `style=""` declares a `transform:`
   * CSS property (which would shadow the editor's `transform=` writes).
   */
  has_inline_css_transform(id: NodeId): boolean {
    const style = this.get_attr(id, "style");
    if (!style) return false;
    return CSS_TRANSFORM_PROPERTY.test(style);
  }

  /**
   * True iff this element has a direct `<animateTransform>` child
   * (which produces a time-varying transform invisible to attribute writes).
   * Only direct children are checked — nested cases attach to the nearer ancestor.
   */
  has_animate_transform_child(id: NodeId): boolean {
    for (const c of this.children_of(id)) {
      const n = this.nodes.get(c);
      if (n?.kind === "element" && n.local === "animateTransform") return true;
    }
    return false;
  }

  text_of(id: NodeId): string {
    const n = this.nodes.get(id);
    if (!n || n.kind !== "element") return "";
    let out = "";
    for (const c of n.children) {
      const cn = this.nodes.get(c);
      if (cn?.kind === "text") out += cn.value;
    }
    return out;
  }

  /** Replace all direct text children with a single text node carrying `value`. */
  set_text(id: NodeId, value: string): void {
    const n = this.nodes.get(id);
    if (!n || n.kind !== "element") return;
    // Drop existing text children.
    n.children = n.children.filter((c) => this.nodes.get(c)?.kind !== "text");
    // Drop them from the node map too — they're orphans now.
    if (value !== "") {
      const text_id = `t${Math.random().toString(36).slice(2, 10)}`;
      const text_node: TextNode = {
        kind: "text",
        id: text_id,
        parent: id,
        value,
      };
      this.nodes.set(text_id, text_node);
      n.children.push(text_id);
    }
    // Text content drives the display label for `<text>` nodes — structural.
    this._structure_version++;
    // Glyph run changes shift bbox.
    this._geometry_version++;
    this.emit();
  }

  // ─── Mutation: insert / remove ───────────────────────────────────────────

  insert(id: NodeId, parent: NodeId, before: NodeId | null): void {
    const node = this.nodes.get(id);
    const parent_node = this.nodes.get(parent);
    if (!node || !parent_node || parent_node.kind !== "element") return;
    if (node.parent !== null) {
      const old_parent = this.nodes.get(node.parent);
      if (old_parent && old_parent.kind === "element") {
        const i = old_parent.children.indexOf(id);
        if (i >= 0) old_parent.children.splice(i, 1);
      }
    }
    const ix = before === null ? -1 : parent_node.children.indexOf(before);
    if (ix < 0) parent_node.children.push(id);
    else parent_node.children.splice(ix, 0, id);
    node.parent = parent;
    this._structure_version++;
    this._geometry_version++;
    this.emit();
  }

  remove(id: NodeId): void {
    const n = this.nodes.get(id);
    if (!n || n.parent === null) return;
    const parent = this.nodes.get(n.parent);
    if (!parent || parent.kind !== "element") return;
    const i = parent.children.indexOf(id);
    if (i >= 0) parent.children.splice(i, 1);
    n.parent = null;
    this._structure_version++;
    this._geometry_version++;
    this.emit();
  }

  /** Create a new element node and register it (not yet inserted). */
  create_element(
    local: string,
    opts?: { prefix?: string | null; ns?: string | null }
  ): NodeId {
    const id = `e${Math.random().toString(36).slice(2, 10)}`;
    const prefix = opts?.prefix ?? null;
    const ns = opts?.ns ?? null;
    const node: ElementNode = {
      kind: "element",
      id,
      parent: null,
      raw_tag: prefix ? `${prefix}:${local}` : local,
      prefix,
      local,
      ns,
      attrs: [],
      children: [],
      self_closing: false,
      open_tag_trailing: "",
      close_tag_leading: "",
      close_tag_trailing: "",
    };
    this.nodes.set(id, node);
    return id;
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  serialize(): string {
    let out = "";
    for (const p of this.prolog) out += this.emit_node(p);
    out += this.emit_node(this.nodes.get(this.root)!);
    for (const e of this.epilog) out += this.emit_node(e);
    return out;
  }

  private emit_node(n: AnyNode): string {
    switch (n.kind) {
      case "text":
        return encode_text((n as TextNode).value);
      case "comment":
        return `<!--${(n as CommentNode).value}-->`;
      case "cdata":
        return `<![CDATA[${(n as CDataNode).value}]]>`;
      case "pi": {
        const pi = n as PiNode;
        return `<?${pi.target}${pi.value ? " " + pi.value : ""}?>`;
      }
      case "doctype":
        return `<!DOCTYPE${(n as DoctypeNode).value}>`;
      case "element": {
        const e = n as ElementNode;
        let s = `<${e.raw_tag}`;
        for (const a of e.attrs) s += this.emit_attr(a);
        if (e.children.length === 0 && e.self_closing) {
          s += `${e.open_tag_trailing}/>`;
          return s;
        }
        s += `${e.open_tag_trailing}>`;
        for (const cid of e.children) {
          const cn = this.nodes.get(cid);
          if (cn) s += this.emit_node(cn);
        }
        s += `</${e.close_tag_leading}${e.raw_tag}${e.close_tag_trailing}>`;
        return s;
      }
    }
  }

  private emit_attr(a: AttrToken): string {
    return `${a.pre}${a.raw_name}${a.eq_trivia}=${a.quote}${encode_attr_value(
      a.value,
      a.quote
    )}${a.quote}`;
  }
}

// ─── Inline style helpers ──────────────────────────────────────────────────

function parse_inline_style(
  s: string
): Array<{ property: string; value: string }> {
  // Very small CSS declaration list parser. Doesn't handle comments / nested
  // parens precisely; SVG editors don't usually need that. Sufficient for v0.
  const out: Array<{ property: string; value: string }> = [];
  const decls = s.split(";");
  for (const decl of decls) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    const property = decl.slice(0, colon).trim();
    const value = decl.slice(colon + 1).trim();
    if (property) out.push({ property, value });
  }
  return out;
}

export { XLINK_NS, XML_NS, XMLNS_NS };

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
 *   - `polyline` / `polygon` points are `[x, y]` tuples so the consumer
 *     can hand them straight to `vn.fromPolyline` / `vn.fromPolygon`.
 */
export type VectorEditSource =
  | { kind: "path"; d: string }
  | {
      kind: "polyline";
      points: ReadonlyArray<readonly [number, number]>;
    }
  | {
      kind: "polygon";
      points: ReadonlyArray<readonly [number, number]>;
    };

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
   * v1 eligibility:
   *   - `<path>`     — requires non-empty `d`.
   *   - `<polyline>` — requires `points` parseable to ≥ 2 vertices.
   *   - `<polygon>`  — same as polyline.
   *
   * Deliberately rejects `<line>` in v1: the only useful vertex-edit
   * gestures on a `<line>` are (a) introducing a new vertex (which would
   * have to promote it to `<polyline>`) and (b) bending it with a tangent
   * (which would have to promote it to `<path>`). Both promotions are
   * out of scope for v1, so opening a `<line>` in vector-edit mode would
   * advertise capabilities that don't work.
   *
   * Also rejects `<rect>`, `<circle>`, `<ellipse>`, `<image>`, `<use>` —
   * those would force the same promotion-to-`<path>` machinery (trivia
   * transfer, cross-cutting attr carry, DOM-element swap, history-bracket
   * changes) that v1 keeps out of scope.
   */
  is_vector_edit_target(id: NodeId): VectorEditSource | null {
    const n = this.nodes.get(id);
    if (!n || n.kind !== "element") return null;
    switch (n.local) {
      case "path": {
        const d = this.get_attr(id, "d");
        if (d === null || d.trim().length === 0) return null;
        return { kind: "path", d };
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
      default:
        return null;
    }
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

// Pure intent helpers. They take a `SvgDocument` and produce baseline /
// patch operations. Editor wraps them in history transactions.

import { SVGPathData, SVGPathDataTransformer } from "@grida/svg/pathdata";
import { svg_parse } from "@grida/svg/parse";
import cmath from "@grida/cmath";
import type { NodeId, Rect, Vec2 } from "../types";
import type { SvgDocument } from "./document";
import { path_control_polyline } from "./hit-shape-svg";
import {
  classify,
  parse_transform_list,
  recompose_with_pivot,
  type TransformOp,
} from "./transform";

const XLINK_NS = "http://www.w3.org/1999/xlink";

// ─── Translate ─────────────────────────────────────────────────────────────

export type TranslateBaseline =
  | { type: "viaTransform"; transform: string | null }
  | { type: "rect"; x: number; y: number }
  | { type: "circle"; cx: number; cy: number }
  | { type: "ellipse"; cx: number; cy: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "polyline"; points: string }
  | { type: "polygon"; points: string }
  | { type: "path"; d: string }
  | { type: "text"; x: number; y: number }
  | { type: "tspan"; x: number; y: number }
  | { type: "image"; x: number; y: number }
  | { type: "use"; x: number; y: number }
  | { type: "unsupported" };

function num(doc: SvgDocument, id: NodeId, name: string, fallback = 0): number {
  return svg_parse.parse_number(doc.get_attr(id, name), fallback);
}

export function capture_translate_baseline(
  doc: SvgDocument,
  id: NodeId
): TranslateBaseline {
  const tag = doc.tag_of(id);
  const own_transform = doc.get_attr(id, "transform");
  if (own_transform !== null || tag === "g") {
    return { type: "viaTransform", transform: own_transform };
  }
  switch (tag) {
    case "rect":
      return { type: "rect", x: num(doc, id, "x"), y: num(doc, id, "y") };
    case "circle":
      return {
        type: "circle",
        cx: num(doc, id, "cx"),
        cy: num(doc, id, "cy"),
      };
    case "ellipse":
      return {
        type: "ellipse",
        cx: num(doc, id, "cx"),
        cy: num(doc, id, "cy"),
      };
    case "line":
      return {
        type: "line",
        x1: num(doc, id, "x1"),
        y1: num(doc, id, "y1"),
        x2: num(doc, id, "x2"),
        y2: num(doc, id, "y2"),
      };
    case "polyline":
      return { type: "polyline", points: doc.get_attr(id, "points") ?? "" };
    case "polygon":
      return { type: "polygon", points: doc.get_attr(id, "points") ?? "" };
    case "path":
      return { type: "path", d: doc.get_attr(id, "d") ?? "" };
    case "text":
      return { type: "text", x: num(doc, id, "x"), y: num(doc, id, "y") };
    case "tspan":
      return { type: "tspan", x: num(doc, id, "x"), y: num(doc, id, "y") };
    case "image":
      return { type: "image", x: num(doc, id, "x"), y: num(doc, id, "y") };
    case "use":
      return { type: "use", x: num(doc, id, "x"), y: num(doc, id, "y") };
    default:
      return { type: "unsupported" };
  }
}

/**
 * Batch variant of {@link capture_translate_baseline} — captures baselines
 * for a set of ids into a `ReadonlyMap`. Used wherever a translate
 * operation needs to remember the pre-translation state of multiple
 * nodes (drag gesture, RPC, dwell detection).
 */
export function capture_translate_baselines(
  doc: SvgDocument,
  ids: ReadonlyArray<NodeId>
): ReadonlyMap<NodeId, TranslateBaseline> {
  const out = new Map<NodeId, TranslateBaseline>();
  for (const id of ids) out.set(id, capture_translate_baseline(doc, id));
  return out;
}

/**
 * Representative anchor point of a `TranslateBaseline` — the attribute
 * coordinate `apply_translate` offsets. Used by callers that need to
 * align baselines to an external lattice (pixel-grid, custom snap).
 *
 * Rules per element kind:
 *   - rect / text / tspan / image / use: `(x, y)`
 *   - circle / ellipse: `(cx, cy)` (no radius subtracted — consistent
 *     anchor across all kinds, not a true bounds top-left)
 *   - line / polyline / polygon: min of endpoints / points
 *   - path: first M/m command's coords (best-effort; the path-data
 *     layer would be needed for a tight bbox)
 *   - viaTransform / unsupported: `null` — no document-space anchor
 *     available without the doc itself
 */
export function baseline_anchor(b: TranslateBaseline): Vec2 | null {
  switch (b.type) {
    case "rect":
    case "text":
    case "tspan":
    case "image":
    case "use":
      return { x: b.x, y: b.y };
    case "circle":
    case "ellipse":
      return { x: b.cx, y: b.cy };
    case "line":
      return { x: Math.min(b.x1, b.x2), y: Math.min(b.y1, b.y2) };
    case "polyline":
    case "polygon":
      return svg_parse.points_top_left(svg_parse.parse_points(b.points));
    case "path":
      return svg_parse.parse_path_first_move(b.d);
    case "viaTransform": {
      // For elements written through the `transform=` attribute (a `<g>`
      // or any node with a pre-existing transform), use the parsed
      // leading-translate as the anchor — that's the visible NW-shift the
      // user expects to land on grid points. Refuses (returns null) when
      // the transform list is more complex than leading-translate-then-
      // anything (matrix / multi-translate / etc) so pixel-grid snap
      // stays honest about what it can align.
      const ops = parse_transform_list(b.transform);
      if (ops === null) return null;
      for (const op of ops) {
        if (op.type === "translate") return { x: op.tx, y: op.ty };
        // Stop at anything that isn't a translate — later ops are in a
        // transformed space; the anchor wouldn't be meaningful.
        break;
      }
      return null;
    }
    case "unsupported":
      return null;
  }
}

/**
 * Top-left of the union over a collection of `TranslateBaseline`s.
 * Returns `null` when no baseline yields an anchor (e.g. all
 * `viaTransform` / `unsupported`). Callers fall through (no alignment).
 */
export function baseline_union_top_left(
  baselines: ReadonlyMap<unknown, TranslateBaseline>
): Vec2 | null {
  const anchors: Vec2[] = [];
  for (const b of baselines.values()) {
    const p = baseline_anchor(b);
    if (p) anchors.push(p);
  }
  return svg_parse.points_top_left(anchors);
}

function shift_points_string(points: string, dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return points;
  return svg_parse
    .parse_points(points)
    .map((p) => `${p.x + dx},${p.y + dy}`)
    .join(" ");
}

export function compose_leading_translate(
  existing: string,
  dx: number,
  dy: number
): string | null {
  if (dx === 0 && dy === 0) return existing ? existing : null;
  if (!existing) return `translate(${dx} ${dy})`;
  const lead = svg_parse.parse_leading_translate(existing);
  if (lead) {
    const tx = lead.tx + dx;
    const ty = lead.ty + dy;
    return lead.rest
      ? `translate(${tx} ${ty}) ${lead.rest}`
      : `translate(${tx} ${ty})`;
  }
  return `translate(${dx} ${dy}) ${existing}`;
}

function shift_path_d(d: string, dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return d;
  try {
    return new SVGPathData(d)
      .transform(SVGPathDataTransformer.TRANSLATE(dx, dy))
      .encode();
  } catch {
    return d;
  }
}

export function apply_translate(
  doc: SvgDocument,
  id: NodeId,
  baseline: TranslateBaseline,
  dx: number,
  dy: number
): void {
  switch (baseline.type) {
    case "viaTransform":
      doc.set_attr(
        id,
        "transform",
        compose_leading_translate(baseline.transform ?? "", dx, dy)
      );
      return;
    case "rect":
    case "image":
    case "use":
    case "text":
    case "tspan":
      doc.set_attr(id, "x", String(baseline.x + dx));
      doc.set_attr(id, "y", String(baseline.y + dy));
      return;
    case "circle":
    case "ellipse":
      doc.set_attr(id, "cx", String(baseline.cx + dx));
      doc.set_attr(id, "cy", String(baseline.cy + dy));
      return;
    case "line":
      doc.set_attr(id, "x1", String(baseline.x1 + dx));
      doc.set_attr(id, "y1", String(baseline.y1 + dy));
      doc.set_attr(id, "x2", String(baseline.x2 + dx));
      doc.set_attr(id, "y2", String(baseline.y2 + dy));
      return;
    case "polyline":
    case "polygon":
      doc.set_attr(id, "points", shift_points_string(baseline.points, dx, dy));
      return;
    case "path":
      doc.set_attr(id, "d", shift_path_d(baseline.d, dx, dy));
      return;
    case "unsupported":
      return;
  }
}

// ─── Resize / scale ────────────────────────────────────────────────────────

export type ResizeDirection = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type ResizeAttrs =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "image"; x: number; y: number; w: number; h: number }
  | { kind: "use"; x: number; y: number; w: number; h: number }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "polyline"; points: string }
  | { kind: "polygon"; points: string }
  | { kind: "path"; d: string }
  | { kind: "text"; x: number; y: number; fontSize: number }
  | { kind: "unsupported" };

export type ResizeBaseline = {
  bbox: Rect;
  attrs: ResizeAttrs;
};

export function is_resizable(tag: string): boolean {
  switch (tag) {
    case "rect":
    case "image":
    case "use":
    case "circle":
    case "ellipse":
    case "line":
    case "polyline":
    case "polygon":
    case "path":
    case "text":
      return true;
    default:
      return false;
  }
}

export function capture_resize_baseline(
  doc: SvgDocument,
  id: NodeId,
  bbox: Rect
): ResizeBaseline {
  const tag = doc.tag_of(id);
  let attrs: ResizeAttrs;
  switch (tag) {
    case "rect":
      attrs = {
        kind: "rect",
        x: num(doc, id, "x"),
        y: num(doc, id, "y"),
        w: num(doc, id, "width", bbox.width),
        h: num(doc, id, "height", bbox.height),
      };
      break;
    case "image":
      attrs = {
        kind: "image",
        x: num(doc, id, "x"),
        y: num(doc, id, "y"),
        w: num(doc, id, "width", bbox.width),
        h: num(doc, id, "height", bbox.height),
      };
      break;
    case "use":
      attrs = {
        kind: "use",
        x: num(doc, id, "x"),
        y: num(doc, id, "y"),
        w: num(doc, id, "width", bbox.width),
        h: num(doc, id, "height", bbox.height),
      };
      break;
    case "circle":
      attrs = {
        kind: "circle",
        cx: num(doc, id, "cx"),
        cy: num(doc, id, "cy"),
        r: num(doc, id, "r"),
      };
      break;
    case "ellipse":
      attrs = {
        kind: "ellipse",
        cx: num(doc, id, "cx"),
        cy: num(doc, id, "cy"),
        rx: num(doc, id, "rx"),
        ry: num(doc, id, "ry"),
      };
      break;
    case "line":
      attrs = {
        kind: "line",
        x1: num(doc, id, "x1"),
        y1: num(doc, id, "y1"),
        x2: num(doc, id, "x2"),
        y2: num(doc, id, "y2"),
      };
      break;
    case "polyline":
      attrs = { kind: "polyline", points: doc.get_attr(id, "points") ?? "" };
      break;
    case "polygon":
      attrs = { kind: "polygon", points: doc.get_attr(id, "points") ?? "" };
      break;
    case "path":
      attrs = { kind: "path", d: doc.get_attr(id, "d") ?? "" };
      break;
    case "text":
      attrs = {
        kind: "text",
        x: num(doc, id, "x"),
        y: num(doc, id, "y"),
        fontSize: parseFloat(doc.get_attr(id, "font-size") ?? "16") || 16,
      };
      break;
    default:
      attrs = { kind: "unsupported" };
  }
  return { bbox, attrs };
}

export function compute_resize_factors(
  baseline: ResizeBaseline,
  dir: ResizeDirection,
  dx: number,
  dy: number,
  shift: boolean
): { sx: number; sy: number; origin: { x: number; y: number } } {
  const b = baseline.bbox;
  let anchorX = 0;
  let anchorY = 0;
  let baseHX = 0;
  let baseHY = 0;
  let affectsX = true;
  let affectsY = true;
  switch (dir) {
    case "nw":
      anchorX = b.x + b.width;
      anchorY = b.y + b.height;
      baseHX = b.x;
      baseHY = b.y;
      break;
    case "n":
      anchorX = b.x + b.width / 2;
      anchorY = b.y + b.height;
      baseHX = b.x + b.width / 2;
      baseHY = b.y;
      affectsX = false;
      break;
    case "ne":
      anchorX = b.x;
      anchorY = b.y + b.height;
      baseHX = b.x + b.width;
      baseHY = b.y;
      break;
    case "e":
      anchorX = b.x;
      anchorY = b.y + b.height / 2;
      baseHX = b.x + b.width;
      baseHY = b.y + b.height / 2;
      affectsY = false;
      break;
    case "se":
      anchorX = b.x;
      anchorY = b.y;
      baseHX = b.x + b.width;
      baseHY = b.y + b.height;
      break;
    case "s":
      anchorX = b.x + b.width / 2;
      anchorY = b.y;
      baseHX = b.x + b.width / 2;
      baseHY = b.y + b.height;
      affectsX = false;
      break;
    case "sw":
      anchorX = b.x + b.width;
      anchorY = b.y;
      baseHX = b.x;
      baseHY = b.y + b.height;
      break;
    case "w":
      anchorX = b.x + b.width;
      anchorY = b.y + b.height / 2;
      baseHX = b.x;
      baseHY = b.y + b.height / 2;
      affectsY = false;
      break;
  }
  const newHX = baseHX + (affectsX ? dx : 0);
  const newHY = baseHY + (affectsY ? dy : 0);
  const denomX = baseHX - anchorX;
  const denomY = baseHY - anchorY;
  let sx = affectsX && denomX !== 0 ? (newHX - anchorX) / denomX : 1;
  let sy = affectsY && denomY !== 0 ? (newHY - anchorY) / denomY : 1;
  if (shift && affectsX && affectsY) {
    const mag = Math.max(Math.abs(sx), Math.abs(sy));
    sx = sx >= 0 ? mag : -mag;
    sy = sy >= 0 ? mag : -mag;
  }
  sx = Math.max(0.001, sx);
  sy = Math.max(0.001, sy);
  return { sx, sy, origin: { x: anchorX, y: anchorY } };
}

function scale_points_string(
  points: string,
  origin: { x: number; y: number },
  sx: number,
  sy: number
): string {
  return svg_parse
    .parse_points(points)
    .map((p) => {
      const x = origin.x + (p.x - origin.x) * sx;
      const y = origin.y + (p.y - origin.y) * sy;
      return `${x},${y}`;
    })
    .join(" ");
}

function scale_path_d(
  d: string,
  origin: { x: number; y: number },
  sx: number,
  sy: number
): string {
  try {
    const e = origin.x * (1 - sx);
    const f = origin.y * (1 - sy);
    return new SVGPathData(d)
      .transform(SVGPathDataTransformer.MATRIX(sx, 0, 0, sy, e, f))
      .encode();
  } catch {
    return d;
  }
}

function bbox_center(
  points: ReadonlyArray<{ x: number; y: number }>
): { cx: number; cy: number } | null {
  if (points.length === 0) return null;
  const r = cmath.rect.fromPointsOrZero(points.map((p) => [p.x, p.y]));
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
}

function new_local_center(
  doc: SvgDocument,
  id: NodeId
): { cx: number; cy: number } | null {
  switch (doc.tag_of(id)) {
    case "rect":
    case "image":
    case "use": {
      const x = num(doc, id, "x");
      const y = num(doc, id, "y");
      return {
        cx: x + num(doc, id, "width") / 2,
        cy: y + num(doc, id, "height") / 2,
      };
    }
    case "circle":
    case "ellipse":
      return { cx: num(doc, id, "cx"), cy: num(doc, id, "cy") };
    case "line": {
      const x1 = num(doc, id, "x1");
      const y1 = num(doc, id, "y1");
      const x2 = num(doc, id, "x2");
      const y2 = num(doc, id, "y2");
      return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
    }
    case "polyline":
    case "polygon": {
      const points = doc.get_attr(id, "points");
      if (!points) return null;
      return bbox_center(svg_parse.parse_points(points));
    }
    case "path": {
      const d = doc.get_attr(id, "d");
      if (!d) return null;
      return bbox_center(path_control_polyline(d));
    }
    default:
      return null;
  }
}

/** Translate every local-frame coord of `id`'s geometry by (dx, dy). The
 *  primitive arms write intrinsic attrs directly — we can't route through
 *  `apply_translate` here because `capture_translate_baseline` returns
 *  `viaTransform` whenever the node has a `transform=`, and that branch
 *  prepends a `translate()` to the transform string, which would clobber
 *  the pivot rewrite the caller is about to do. */
function shift_geometry(
  doc: SvgDocument,
  id: NodeId,
  dx: number,
  dy: number
): void {
  switch (doc.tag_of(id)) {
    case "rect":
    case "image":
    case "use":
      doc.set_attr(id, "x", String(num(doc, id, "x") + dx));
      doc.set_attr(id, "y", String(num(doc, id, "y") + dy));
      return;
    case "circle":
    case "ellipse":
      doc.set_attr(id, "cx", String(num(doc, id, "cx") + dx));
      doc.set_attr(id, "cy", String(num(doc, id, "cy") + dy));
      return;
    case "line":
      doc.set_attr(id, "x1", String(num(doc, id, "x1") + dx));
      doc.set_attr(id, "y1", String(num(doc, id, "y1") + dy));
      doc.set_attr(id, "x2", String(num(doc, id, "x2") + dx));
      doc.set_attr(id, "y2", String(num(doc, id, "y2") + dy));
      return;
    case "polyline":
    case "polygon": {
      const points = doc.get_attr(id, "points");
      if (points)
        doc.set_attr(id, "points", shift_points_string(points, dx, dy));
      return;
    }
    case "path": {
      const d = doc.get_attr(id, "d");
      if (d) doc.set_attr(id, "d", shift_path_d(d, dx, dy));
      return;
    }
  }
}

/**
 * Commit-only. Moves the rotate pivot to the new local center and shifts
 * geometry by δ = (R − I) · Δc so the doc-space rendering is unchanged.
 * Without the shift, changing the pivot offsets the rect in doc space and
 * the HUD's stable-matrix chrome falls out of alignment with the element.
 */
function renormalize_rotate_pivot(doc: SvgDocument, id: NodeId): void {
  const existing = doc.get_attr(id, "transform");
  if (existing === null || existing.indexOf("rotate") === -1) return;
  const ops = parse_transform_list(existing);
  if (ops === null) return;
  const cls = classify(ops);
  if (
    cls !== "single_rotate_only" &&
    cls !== "leading_translate_then_single_rotate"
  ) {
    return;
  }
  const rot = find_op(ops, "rotate");
  if (!rot || rot.explicit_pivot !== true) return;
  const c_pre = new_local_center(doc, id);
  if (!c_pre) return;
  const dc_x = c_pre.cx - rot.cx;
  const dc_y = c_pre.cy - rot.cy;
  if (dc_x === 0 && dc_y === 0) return;
  const theta = (rot.angle * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // δ = (R − I) · Δc
  const dx = (cos - 1) * dc_x - sin * dc_y;
  const dy = sin * dc_x + (cos - 1) * dc_y;
  shift_geometry(doc, id, dx, dy);
  const next = recompose_with_pivot(ops, c_pre.cx + dx, c_pre.cy + dy);
  if (next === existing) return;
  doc.set_attr(id, "transform", next);
}

export function apply_resize(
  doc: SvgDocument,
  id: NodeId,
  baseline: ResizeBaseline,
  sx: number,
  sy: number,
  origin: { x: number; y: number },
  /** "preview": geometry only. "commit": also recompose rotate pivot. */
  phase: "preview" | "commit" = "commit"
): void {
  const a = baseline.attrs;
  switch (a.kind) {
    case "rect":
    case "image":
    case "use":
      doc.set_attr(id, "x", String(origin.x + (a.x - origin.x) * sx));
      doc.set_attr(id, "y", String(origin.y + (a.y - origin.y) * sy));
      doc.set_attr(id, "width", String(Math.max(0.001, a.w * sx)));
      doc.set_attr(id, "height", String(Math.max(0.001, a.h * sy)));
      break;
    case "circle": {
      const s = Math.min(sx, sy);
      doc.set_attr(id, "cx", String(origin.x + (a.cx - origin.x) * s));
      doc.set_attr(id, "cy", String(origin.y + (a.cy - origin.y) * s));
      doc.set_attr(id, "r", String(Math.max(0.001, a.r * s)));
      break;
    }
    case "ellipse":
      doc.set_attr(id, "cx", String(origin.x + (a.cx - origin.x) * sx));
      doc.set_attr(id, "cy", String(origin.y + (a.cy - origin.y) * sy));
      doc.set_attr(id, "rx", String(Math.max(0.001, a.rx * sx)));
      doc.set_attr(id, "ry", String(Math.max(0.001, a.ry * sy)));
      break;
    case "line":
      doc.set_attr(id, "x1", String(origin.x + (a.x1 - origin.x) * sx));
      doc.set_attr(id, "y1", String(origin.y + (a.y1 - origin.y) * sy));
      doc.set_attr(id, "x2", String(origin.x + (a.x2 - origin.x) * sx));
      doc.set_attr(id, "y2", String(origin.y + (a.y2 - origin.y) * sy));
      break;
    case "polyline":
    case "polygon":
      doc.set_attr(id, "points", scale_points_string(a.points, origin, sx, sy));
      break;
    case "path":
      doc.set_attr(id, "d", scale_path_d(a.d, origin, sx, sy));
      break;
    case "text": {
      const isCorner = sx !== 1 && sy !== 1;
      if (!isCorner) return;
      const s = Math.min(sx, sy);
      doc.set_attr(id, "x", String(origin.x + (a.x - origin.x) * s));
      doc.set_attr(id, "y", String(origin.y + (a.y - origin.y) * s));
      doc.set_attr(id, "font-size", String(Math.max(1, a.fontSize * s)));
      return;
    }
    case "unsupported":
      return;
  }
  if (phase === "commit") renormalize_rotate_pivot(doc, id);
}

// ─── Href replacement (image / use) ────────────────────────────────────────

export function replace_href(
  doc: SvgDocument,
  id: NodeId,
  value: string
): { old_href: string | null; old_xlink: string | null } {
  const old_href = doc.get_attr(id, "href");
  const old_xlink = doc.get_attr(id, "href", XLINK_NS);
  const write_href = old_href !== null || old_xlink === null;
  const write_xlink = old_xlink !== null;
  if (write_href) doc.set_attr(id, "href", value);
  if (write_xlink) doc.set_attr(id, "href", value, XLINK_NS);
  return { old_href, old_xlink };
}

// ─── Rotate ────────────────────────────────────────────────────────────────
//
// Rotation is the gesture SVG has no clean primitive-attribute path for: a
// rotated rect can't be expressed as `<rect x y w h>` — it MUST live in the
// `transform=` attribute. This forces refuse-and-surface for every spec
// corner where we can't compose cleanly.
//
// Refuse set (`is_rotatable` returns a `reason`-tagged verdict):
//   1. non-trivial-transform     — `transform=` parses to something more
//                                   complex than a leading translate + at
//                                   most one rotate. Includes matrix /
//                                   scale / skew / multiple rotates / out
//                                   of order. Flatten Transform recovers.
//   2. text-with-glyph-rotate    — `<text rotate>` is the per-glyph
//                                   typesetting attribute; composing with
//                                   `transform="rotate(...)"` is well-
//                                   defined math but ambiguous UX.
//   3. css-property-transform    — `style="transform: ..."` (CSS-property,
//                                   not the attribute) interacts with
//                                   `transform-box` and the cascade in
//                                   ways v1 doesn't handle. Move the
//                                   declaration to the attribute first.
//   4. animated-transform        — `<animateTransform>` child means the
//                                   static `transform=` is the base value
//                                   under `additive="sum"` but is
//                                   overridden under `additive="replace"`
//                                   (the default). User intent ambiguous.
//
// Visual-position-jump caveat: when the source has an existing rotation
// (`single_rotate_only` / `leading_translate_then_single_rotate`),
// `apply_rotate` replaces the pivot with the bbox-center pivot of the new
// gesture. If the original pivot was elsewhere, the element jumps
// visually at gesture start. This is a v1 limitation; Flatten Transform
// pre-bakes the original to recover. Documented and tested.

export type RotatableVerdict =
  | { kind: "yes" }
  | {
      kind: "refuse";
      reason:
        | "non-trivial-transform"
        | "text-with-glyph-rotate"
        | "css-property-transform"
        | "animated-transform";
    };

/**
 * Inspect a node and decide whether the rotate gesture is safe to apply.
 * Used by the rotate-orchestrator at gesture commit to drop the preview
 * with a chip rather than emit a defensible-but-noisy `transform=`.
 *
 * Order of checks matches the order the user is most likely to see; the
 * first failure short-circuits.
 */
export function is_rotatable(doc: SvgDocument, id: NodeId): RotatableVerdict {
  // 1. transform attribute must classify to identity / leading-translate /
  //    single-rotate / leading-translate-then-rotate. Matrix / scale /
  //    skew / multi-rotate refuse.
  const own_transform = doc.get_attr(id, "transform");
  const ops = parse_transform_list(own_transform);
  if (ops === null) {
    return { kind: "refuse", reason: "non-trivial-transform" };
  }
  const cls = classify(ops);
  if (cls === "mixed") {
    return { kind: "refuse", reason: "non-trivial-transform" };
  }
  // 2. <text rotate="..."> is the per-glyph attribute; refuse.
  if (doc.tag_of(id) === "text" || doc.tag_of(id) === "tspan") {
    const text_rotate = doc.get_attr(id, "rotate");
    if (text_rotate !== null && text_rotate.trim() !== "") {
      return { kind: "refuse", reason: "text-with-glyph-rotate" };
    }
  }
  // 3. inline `style="transform: ..."` (CSS property, not attribute).
  const style = doc.get_attr(id, "style");
  if (style && /(?:^|;)\s*transform\s*:/i.test(style)) {
    return { kind: "refuse", reason: "css-property-transform" };
  }
  // 4. animated transform child.
  for (const c of doc.children_of(id)) {
    if (doc.is_element(c) && doc.tag_of(c) === "animateTransform") {
      return { kind: "refuse", reason: "animated-transform" };
    }
  }
  return { kind: "yes" };
}

export type RotateBaseline = {
  /** Original `transform=` verbatim — for byte-equal identity-restore on
   *  angle === 0 (and no pre-existing rotation). */
  transform: string | null;
  /** Leading translate component of the parsed transform list, if any.
   *  Preserved across the rotate so the emit is `translate(...) rotate(...)`. */
  leading_translate: Vec2 | null;
  /** Pre-existing rotation angle in degrees from the parsed list (the SVG
   *  transform string carries degrees). Zero when the source had no
   *  rotation. */
  current_rotation_deg: number;
  /** World-space pivot, frozen at gesture start. The bbox-center pivot
   *  policy is enforced by the orchestrator; this field doesn't care
   *  where it came from. */
  pivot: Vec2;
};

function find_op<K extends TransformOp["type"]>(
  ops: ReadonlyArray<TransformOp>,
  type: K
): Extract<TransformOp, { type: K }> | null {
  for (const op of ops) {
    if (op.type === type) return op as Extract<TransformOp, { type: K }>;
  }
  return null;
}

export function capture_rotate_baseline(
  doc: SvgDocument,
  id: NodeId,
  pivot: Vec2
): RotateBaseline {
  const transform = doc.get_attr(id, "transform");
  const ops = parse_transform_list(transform) ?? [];
  const lead = find_op(ops, "translate");
  const rot = find_op(ops, "rotate");
  return {
    transform,
    leading_translate: lead ? { x: lead.tx, y: lead.ty } : null,
    current_rotation_deg: rot?.angle ?? 0,
    pivot,
  };
}

export function capture_rotate_baselines(
  doc: SvgDocument,
  ids: ReadonlyArray<NodeId>,
  pivot: Vec2
): ReadonlyMap<NodeId, RotateBaseline> {
  const out = new Map<NodeId, RotateBaseline>();
  for (const id of ids) out.set(id, capture_rotate_baseline(doc, id, pivot));
  return out;
}

const RAD_TO_DEG = 180 / Math.PI;

/** Snap trailing FP noise off the 10th decimal place. The rad→deg
 *  conversion + addition produce e.g. `29.999999999999996` for what the
 *  user dragged as "30°"; rounding to 1e-9 absorbs the noise without
 *  losing any user-meaningful precision (SVG coordinates rarely go past
 *  4 decimals in authored content).
 *
 *  Limits drift accumulation across a long gesture: each frame's emit
 *  re-renders from `current_rotation_deg + delta_deg`, where the delta
 *  is recomputed against the gesture-start anchor — not accumulated. So
 *  noise stays bounded per-frame. */
function fmt_angle(n: number): string {
  return String(Math.round(n * 1e9) / 1e9);
}

/**
 * Compose `baseline.current_rotation_deg + degrees(angle_radians)` into a
 * single `rotate(θ_total cx cy)` token, preserving any leading translate
 * the baseline captured. Pivot is expressed in pre-translate local space
 * (`pivot - leading_translate`), which is the correct space for
 * `rotate(θ cx cy)` per SVG 1.1 §7.6.
 *
 * Identity-restore: when angle === 0 AND current_rotation === 0, restore
 * the original `transform=` byte-equal (may have been null). This is the
 * round-trip invariant the "rotated then rotated back" test locks down.
 */
export function apply_rotate(
  doc: SvgDocument,
  id: NodeId,
  baseline: RotateBaseline,
  angle_radians: number
): void {
  const angle_deg = angle_radians * RAD_TO_DEG;
  const total = baseline.current_rotation_deg + angle_deg;
  // Identity-restore: only when both the gesture delta AND any pre-existing
  // rotation are zero. Otherwise we have to write a rotate token.
  if (total === 0 && angle_deg === 0) {
    doc.set_attr(id, "transform", baseline.transform);
    return;
  }
  const tx = baseline.leading_translate?.x ?? 0;
  const ty = baseline.leading_translate?.y ?? 0;
  const cx = baseline.pivot.x - tx;
  const cy = baseline.pivot.y - ty;
  // 3-arg canonical: a re-parse yields `explicit_pivot: true`, which the
  // resize gate requires to consider the element editor-authored.
  const rotate_token = `rotate(${fmt_angle(total)} ${cx} ${cy})`;
  const str = baseline.leading_translate
    ? `translate(${tx} ${ty}) ${rotate_token}`
    : rotate_token;
  doc.set_attr(id, "transform", str);
}

/**
 * Allows identity, leading-translate-only, and `(translate?) rotate(θ cx cy)`
 * with an explicit 3-arg pivot. Refuses 1-arg `rotate(θ)`: re-emitting it
 * would canonicalize the source and violate P1 round-trip.
 */
export function is_resizable_node(doc: SvgDocument, id: NodeId): boolean {
  if (!is_resizable(doc.tag_of(id))) return false;
  const ops = parse_transform_list(doc.get_attr(id, "transform"));
  if (ops === null) return false;
  const cls = classify(ops);
  if (cls === "identity" || cls === "leading_translate_only") return true;
  if (
    cls === "single_rotate_only" ||
    cls === "leading_translate_then_single_rotate"
  ) {
    const rot = find_op(ops, "rotate");
    return rot?.explicit_pivot === true;
  }
  return false;
}

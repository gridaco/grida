// SVG document adapter for the hit-shape logic container.
//
// Derives `HitShape` from `SvgDocument` attributes. Thin and intentionally
// fragile — this is the "backend" side of the hit-test split. The reusable
// logic (types, distance math, picker, memoizer) lives in `./hit-shape.ts`.
// The DOM-coupled wiring that composes this adapter with live `bounds_of`
// lives in `dom.ts` (`SvgHitShapeDriver`).
//
// ─── Known issues ───────────────────────────────────────────────────────────
//
// See `docs/wg/feat-svg-editor/hit-test.md` for the full postmortem and v2 design guide. Summary:
//
//   1. Attribute geometry is LOCAL-SPACE. For nodes inside transformed
//      ancestors (`<g transform="...">`), the returned shape is in the
//      ancestor-relative frame — NOT world-space. Callers that compare
//      against a world-space click will get junk distance for transformed
//      descendants. Mitigations: compose CTM in user code, or fall back to
//      bounds-rect when any ancestor has a transform (the current dom.ts
//      wiring does the latter, implicitly, via `SvgHitShapeDriver` returning
//      `null` here → bounds-fallback there).
//
//   2. `<path>` is approximated as a control polyline: M/L endpoints, plus
//      Q/C control points (no curve sampling). Tight on straight runs,
//      loose on tightly-curved Beziers. v2 should lower curves to flattened
//      polylines or implement true distance-to-curve.
//
//   3. Descendants of non-rendering containers (`<defs>`, `<symbol>`,
//      `<clipPath>`, `<mask>`, `<pattern>`) are NOT filtered here.
//      `is_transparent_tag` only checks the node's own tag, not its
//      ancestry. The caller's z-order walk is responsible for skipping
//      them. v2 needs an ancestor-aware filter.
//
//   4. `fill="none"` is not consulted. Filled and stroke-only rects are
//      treated identically — interior counts as `distance == 0`. For
//      stroke-only shapes (decorative frames, orbit rings) this means
//      "click anywhere in the interior" selects them. Resolving this
//      requires reading the computed cascade.
//
// The right v2 architecture is in docs/wg/feat-svg-editor/hit-test.md §"Concrete v2 guide".

import { SVGPathData } from "@grida/svg/pathdata";
import { svg_parse } from "@grida/svg/parse";
import type { NodeId, Vec2 } from "../types";
import type { SvgDocument } from "./document";
import type { HitShape } from "./hit-shape";
import { classify, parse_transform_list, type TransformOp } from "./transform";

/** Tags that never participate in picking. Containers and non-rendering
 *  metadata. The root `<svg>` is in this set — root pickability is a
 *  host decision (measurement HUD wants it, selection doesn't), gated
 *  by an explicit `allow_root` flag at the caller. */
const TRANSPARENT_TAGS = new Set([
  "g",
  "svg",
  "defs",
  "symbol",
  "clipPath",
  "mask",
  "marker",
  "pattern",
  "linearGradient",
  "radialGradient",
  "stop",
  "filter",
  "title",
  "desc",
  "metadata",
  "style",
  "script",
]);

export function is_transparent_tag(tag: string): boolean {
  return TRANSPARENT_TAGS.has(tag);
}

function num(doc: SvgDocument, id: NodeId, name: string, fallback = 0): number {
  return svg_parse.parse_number(doc.get_attr(id, name), fallback);
}

/**
 * Hit-shape derived from document attributes. Returns `null` when the
 * node has no derivable shape (transparent tag, malformed attrs, or a
 * `transform=` we can't compose cleanly — matrix / scale / skew / mixed).
 *
 * For `transform=` values that classify to identity / leading-translate /
 * single-rotate / translate-then-rotate, the returned shape is the
 * post-transform polygon/segment (rotated rects become 4-corner polygons),
 * so picking lands on the rendered outline rather than the silent AABB
 * fallback in `SvgHitShapeDriver`.
 *
 * Caveat: see "Known issues" #1 at the top of this file — ancestor CTM
 * is still NOT composed here. Inside a `<g transform="...">` the shape
 * is still in the ancestor-relative frame.
 */
export function hit_shape_of_doc(
  doc: SvgDocument,
  id: NodeId
): HitShape | null {
  const tag = doc.tag_of(id);
  // Parse own transform via Layer 1 — anything more complex than
  // identity / leading-translate / single-rotate / translate-then-rotate
  // falls back to AABB (caller in SvgHitShapeDriver).
  const ops = parse_transform_list(doc.get_attr(id, "transform"));
  if (ops === null) return null;
  const cls = classify(ops);
  if (cls === "mixed") return null;
  const xform = pick_affine(ops);
  const has_rotation = xform.angle_rad !== 0;

  switch (tag) {
    case "rect": {
      const x = num(doc, id, "x");
      const y = num(doc, id, "y");
      const w = num(doc, id, "width");
      const h = num(doc, id, "height");
      if (!has_rotation) {
        // Pure translate (or identity) — keep axis-aligned rect kind.
        const t = xform.translate;
        return {
          kind: "rect",
          x: x + t.x,
          y: y + t.y,
          width: w,
          height: h,
        };
      }
      // Rotated rect — emit a 4-corner polygon (closed).
      const corners: Vec2[] = [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
      return {
        kind: "polygon",
        pts: corners.map((p) => transform_point(p, xform)),
        closed: true,
      };
    }
    case "circle": {
      const cx = num(doc, id, "cx");
      const cy = num(doc, id, "cy");
      const r = num(doc, id, "r");
      // Circles are rotation-invariant — only translate the center.
      const tc = transform_point({ x: cx, y: cy }, xform);
      return { kind: "ellipse", cx: tc.x, cy: tc.y, rx: r, ry: r };
    }
    case "ellipse": {
      const cx = num(doc, id, "cx");
      const cy = num(doc, id, "cy");
      const rx = num(doc, id, "rx");
      const ry = num(doc, id, "ry");
      // Rotated ellipse has no axis-aligned ellipse representation. Fall
      // back to AABB for the rotated case; translate-only stays clean.
      if (has_rotation) return null;
      const tc = transform_point({ x: cx, y: cy }, xform);
      return { kind: "ellipse", cx: tc.x, cy: tc.y, rx, ry };
    }
    case "line": {
      const a = transform_point(
        { x: num(doc, id, "x1"), y: num(doc, id, "y1") },
        xform
      );
      const b = transform_point(
        { x: num(doc, id, "x2"), y: num(doc, id, "y2") },
        xform
      );
      return { kind: "segment", a, b };
    }
    case "polyline": {
      const pts = svg_parse.parse_points(doc.get_attr(id, "points") ?? "");
      if (pts.length === 0) return null;
      return {
        kind: "polyline",
        pts: pts.map((q) => transform_point({ x: q.x, y: q.y }, xform)),
        closed: false,
      };
    }
    case "polygon": {
      const pts = svg_parse.parse_points(doc.get_attr(id, "points") ?? "");
      if (pts.length === 0) return null;
      return {
        kind: "polygon",
        pts: pts.map((q) => transform_point({ x: q.x, y: q.y }, xform)),
        closed: true,
      };
    }
    case "path": {
      const d = doc.get_attr(id, "d") ?? "";
      const pts = path_control_polyline(d);
      if (pts.length === 0) return null;
      return {
        kind: "path",
        pts: pts.map((p) => transform_point(p, xform)),
        closed: /[zZ]\s*$/.test(d),
      };
    }
    default:
      return null;
  }
}

/** Affine reduction of a classified transform list: extract the (single)
 *  rotation and (single, leading) translation. The classifier rules out
 *  multi-rotate / matrix / scale / skew before we reach here. */
type Affine = {
  translate: Vec2;
  pivot: Vec2;
  angle_rad: number;
};

function pick_affine(ops: ReadonlyArray<TransformOp>): Affine {
  let tx = 0;
  let ty = 0;
  let pivot: Vec2 = { x: 0, y: 0 };
  let angle_rad = 0;
  for (const op of ops) {
    if (op.type === "translate") {
      tx = op.tx;
      ty = op.ty;
    } else if (op.type === "rotate") {
      pivot = { x: op.cx, y: op.cy };
      angle_rad = (op.angle * Math.PI) / 180;
    }
  }
  return { translate: { x: tx, y: ty }, pivot, angle_rad };
}

/** Apply (rotate around pivot by angle_rad, then translate). Mirrors the
 *  SVG transform-list semantic order: `translate(...) rotate(...)` means
 *  matrix product T·R applied to P → translation moves the *rotated*
 *  point. */
function transform_point(p: Vec2, x: Affine): Vec2 {
  let q: Vec2 = p;
  if (x.angle_rad !== 0) {
    const c = Math.cos(x.angle_rad);
    const s = Math.sin(x.angle_rad);
    const dx = q.x - x.pivot.x;
    const dy = q.y - x.pivot.y;
    q = {
      x: x.pivot.x + dx * c - dy * s,
      y: x.pivot.y + dx * s + dy * c,
    };
  }
  if (x.translate.x !== 0 || x.translate.y !== 0) {
    q = { x: q.x + x.translate.x, y: q.y + x.translate.y };
  }
  return q;
}

/** Path-`d` → control-polyline approximation. Each command contributes
 *  any control points it carries (Q: x1/y1; C: x1/y1 + x2/y2) plus its
 *  endpoint. T/S shorthand and A arcs contribute only the endpoint at
 *  this fidelity. Returns `[]` for unparseable input. */
export function path_control_polyline(d: string): Vec2[] {
  if (!d) return [];
  let path: SVGPathData;
  try {
    path = new SVGPathData(d).toAbs();
  } catch {
    return [];
  }
  const out: Vec2[] = [];
  for (const cmd of path.commands) {
    const c = cmd as unknown as Record<string, number>;
    if (typeof c.x1 === "number" && typeof c.y1 === "number") {
      out.push({ x: c.x1, y: c.y1 });
    }
    if (typeof c.x2 === "number" && typeof c.y2 === "number") {
      out.push({ x: c.x2, y: c.y2 });
    }
    if (typeof c.x === "number" && typeof c.y === "number") {
      out.push({ x: c.x, y: c.y });
    }
  }
  return out;
}

// Per-class resize handlers + dispatcher — the backing logic for the
// resize intent under Policy Class. Replaces the nine-arm tag switch
// that used to live in `intents.ts:apply_resize`.
//
// Contract: every handler is pure over (doc, id, baseline, sx, sy, origin);
// writes go through doc.set_attr (the SVG Document Layer's chokepoint);
// each handler switches on chosen_policy(cls, "resize") so unimplemented
// future policies surface loudly.
//
// Layering: docs/wg/feat-svg-editor/glossary/policy-class.md

import { SVGPathData, SVGPathDataTransformer } from "@grida/svg/pathdata";
import { svg_parse } from "@grida/svg/parse";
import type { NodeId } from "../../../types";
import type { SvgDocument } from "../../document";
// Type-only import; no runtime dependency on intents.ts.
import type { ResizeBaseline } from "../../resize-pipeline/resize-pipeline";
import { policy_class } from "..";

type Origin = { x: number; y: number };

// ─── Geometry utilities (lifted verbatim from intents.ts) ───────────────────

function scale_points_string(
  points: string,
  origin: Origin,
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
  origin: Origin,
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

// ─── Per-class handlers ─────────────────────────────────────────────────────

/**
 * VertexChain × resize — vertex transport in local space.
 * Line carries its own (x1, y1, x2, y2); polyline / polygon share `points`.
 * Result type is preserved.
 */
function resize_vertex_chain(
  doc: SvgDocument,
  id: NodeId,
  baseline: ResizeBaseline,
  sx: number,
  sy: number,
  origin: Origin
): void {
  const a = baseline.attrs;
  if (a.kind === "line") {
    doc.set_attr(id, "x1", String(origin.x + (a.x1 - origin.x) * sx));
    doc.set_attr(id, "y1", String(origin.y + (a.y1 - origin.y) * sy));
    doc.set_attr(id, "x2", String(origin.x + (a.x2 - origin.x) * sx));
    doc.set_attr(id, "y2", String(origin.y + (a.y2 - origin.y) * sy));
    return;
  }
  if (a.kind === "polyline" || a.kind === "polygon") {
    doc.set_attr(id, "points", scale_points_string(a.points, origin, sx, sy));
    return;
  }
  // Baseline kind doesn't match VertexChain — should not happen (dispatcher
  // routes by Policy Class). Silent noop preserves legacy behavior.
}

/**
 * VertexBox × resize — axis-aligned bounding-box transport (rect / image / use).
 * Width/height clamp at 0.001 prevents inverted boxes and degenerate writes.
 */
function resize_vertex_box(
  doc: SvgDocument,
  id: NodeId,
  baseline: ResizeBaseline,
  sx: number,
  sy: number,
  origin: Origin
): void {
  const a = baseline.attrs;
  if (a.kind !== "rect" && a.kind !== "image" && a.kind !== "use") return;
  doc.set_attr(id, "x", String(origin.x + (a.x - origin.x) * sx));
  doc.set_attr(id, "y", String(origin.y + (a.y - origin.y) * sy));
  doc.set_attr(id, "width", String(Math.max(0.001, a.w * sx)));
  doc.set_attr(id, "height", String(Math.max(0.001, a.h * sy)));
}

/**
 * Circle × resize — the canonical Policy Class fork.
 *
 * v1 picks `restrict`: clamp the gesture onto the `rx = ry` constraint
 * surface (`s = min(sx, sy)`) and bake the projection. The circle stays
 * a circle. `promote` and `via-transform` are declared legal but
 * unimplemented; the exhaustive switch surfaces any future swap.
 */
function resize_circle(
  doc: SvgDocument,
  id: NodeId,
  baseline: ResizeBaseline,
  sx: number,
  sy: number,
  origin: Origin
): void {
  const a = baseline.attrs;
  if (a.kind !== "circle") return;
  const policy = policy_class.chosen_policy("circle", "resize");
  switch (policy) {
    case "restrict": {
      // Project (sx, sy) onto the rx = ry constraint surface, then bake.
      const s = Math.min(sx, sy);
      doc.set_attr(id, "cx", String(origin.x + (a.cx - origin.x) * s));
      doc.set_attr(id, "cy", String(origin.y + (a.cy - origin.y) * s));
      doc.set_attr(id, "r", String(Math.max(0.001, a.r * s)));
      return;
    }
    case "promote":
    case "via-transform":
    case "bake":
      throw new Error(
        `Circle resize policy '${policy}' is legal per Policy Class but not implemented in v1`
      );
    case undefined:
      throw new Error(
        "Circle resize has no chosen policy declared in Policy Class"
      );
    default: {
      const _exhaustive: never = policy;
      void _exhaustive;
      throw new Error("unreachable");
    }
  }
}

/**
 * Ellipse × resize — independent rx, ry. No constraint to enforce
 * (ellipse is already the general axis-aligned-radii form).
 */
function resize_ellipse(
  doc: SvgDocument,
  id: NodeId,
  baseline: ResizeBaseline,
  sx: number,
  sy: number,
  origin: Origin
): void {
  const a = baseline.attrs;
  if (a.kind !== "ellipse") return;
  doc.set_attr(id, "cx", String(origin.x + (a.cx - origin.x) * sx));
  doc.set_attr(id, "cy", String(origin.y + (a.cy - origin.y) * sy));
  doc.set_attr(id, "rx", String(Math.max(0.001, a.rx * sx)));
  doc.set_attr(id, "ry", String(Math.max(0.001, a.ry * sy)));
}

/**
 * Path × resize — bake the affine into every segment of `d` via
 * svg-pathdata's MATRIX transformer. Curve handles, arc radii, and
 * segment endpoints scale together; segment types are preserved.
 */
function resize_path(
  doc: SvgDocument,
  id: NodeId,
  baseline: ResizeBaseline,
  sx: number,
  sy: number,
  origin: Origin
): void {
  const a = baseline.attrs;
  if (a.kind !== "path") return;
  doc.set_attr(id, "d", scale_path_d(a.d, origin, sx, sy));
}

/**
 * Text × resize.
 *
 * **Unnatural — see UNNATURAL.md.** Text class is "deferred" in Policy
 * Class (no resize cells declared) but accepted by the legacy
 * `is_resizable` capability gate. This handler preserves legacy
 * behavior verbatim:
 *
 *   - Edge drags (one of sx, sy is 1) are refused.
 *   - Corner drags scale (x, y, font-size) uniformly by min(sx, sy).
 *
 * When Text class is properly declared in Policy Class, the policy
 * switch above will gain a `text` branch and this handler's body will
 * either re-route through `chosen_policy("text", "resize")` or split
 * by sub-class (font-resize vs. container-box-resize is a design
 * question for the Text class work).
 */
function resize_text(
  doc: SvgDocument,
  id: NodeId,
  baseline: ResizeBaseline,
  sx: number,
  sy: number,
  origin: Origin
): void {
  const a = baseline.attrs;
  if (a.kind !== "text") return;
  const isCorner = sx !== 1 && sy !== 1;
  if (!isCorner) return;
  const s = Math.min(sx, sy);
  doc.set_attr(id, "x", String(origin.x + (a.x - origin.x) * s));
  doc.set_attr(id, "y", String(origin.y + (a.y - origin.y) * s));
  doc.set_attr(id, "font-size", String(Math.max(1, a.fontSize * s)));
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

/**
 * Resize dispatch through Policy Class.
 *
 * Replaces the nine-arm tag switch in `intents.ts:apply_resize`. The
 * caller (`apply_resize`) wraps this with the commit-phase pivot
 * recomposition; this function does **only** the geometry write.
 *
 * Classes rejected by Policy Class (`group`, `none`) noop silently.
 * Text is carved out as the one known gap (see Text handler doc).
 */
export function dispatch_resize(
  doc: SvgDocument,
  id: NodeId,
  baseline: ResizeBaseline,
  sx: number,
  sy: number,
  origin: Origin
): void {
  const cls = policy_class.of(doc.tag_of(id));
  switch (cls) {
    case "vertex-chain":
      return resize_vertex_chain(doc, id, baseline, sx, sy, origin);
    case "vertex-box":
      return resize_vertex_box(doc, id, baseline, sx, sy, origin);
    case "circle":
      return resize_circle(doc, id, baseline, sx, sy, origin);
    case "ellipse":
      return resize_ellipse(doc, id, baseline, sx, sy, origin);
    case "path":
      return resize_path(doc, id, baseline, sx, sy, origin);
    case "text":
      return resize_text(doc, id, baseline, sx, sy, origin);
    case "group":
    case "none":
      return;
    default: {
      const _exhaustive: never = cls;
      void _exhaustive;
      return;
    }
  }
}

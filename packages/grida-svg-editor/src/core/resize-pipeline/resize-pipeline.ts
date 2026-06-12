// Resize pipeline — sibling to translate-pipeline. The funnel every
// resize-mutating gesture flows through.
//
// Editor-agnostic. This file MUST NOT import any DOM type. It composes
// pure stages against a frozen context, and writes through
// `SvgDocument`'s typed attr-set chokepoint.
//
// Coordinate space: the pipeline operates in **world space** — the
// root SVG's own user-coordinate system. `plan.baseline.bbox` and the
// per-axis `dx`/`dy` are world-space; `intent.apply` writes raw
// attributes (own-frame); for flat docs world ≡ own and no projection
// step exists. The DOM adapter is responsible for converting CSS-pixel
// cursor deltas to world deltas at the intent boundary
// (`camera.transform.invert`) and for projecting snap guides world →
// screen at HUD paint time. `getScreenCTM` does not feed pipeline math.
//
// Shape mirrors translate-pipeline deliberately: same stage protocol,
// same plan-threading, same emission shape. The two pipelines share
// primitives (snap session, cmath snap, pixel-grid math) but their
// inputs differ — translate carries a Vec2 delta, resize carries a
// direction + per-axis world-frame deltas.

import cmath from "@grida/cmath";
import type { guide as _guide } from "@grida/cmath/_snap";
import { SVGPathData, SVGPathDataTransformer } from "@grida/svg/pathdata";
import { svg_parse } from "@grida/svg/parse";
import type { NodeId, Rect } from "../../types";
import type { SvgDocument } from "../document";
import { hit_shape_svg } from "../hit-shape-svg";
import { transform, type TransformOp } from "../transform";
import {
  dispatch_resize,
  RESIZE_WRITE_ATTRS,
} from "../policy-class/handlers/resize";
import { resize_capability } from "../resize-capability";
import type { SnapSession } from "../snap";

const XLINK_NS = "http://www.w3.org/1999/xlink";

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

/** Exact pre-gesture attribute strings — one entry per attribute a
 *  resize may write on the captured tag (per-tag geometry set plus
 *  `transform`, which commit-phase pivot renormalization rewrites).
 *  `null` = the attribute was absent. `intent.restore` writes these
 *  back verbatim so revert is byte-exact and independent of handler
 *  gesture semantics. */
export type ResizeRawAttrs = ReadonlyArray<{
  readonly name: string;
  readonly value: string | null;
}>;

export type ResizeBaseline = {
  bbox: Rect;
  attrs: ResizeAttrs;
  raw: ResizeRawAttrs;
};

/** Input to the pipeline. `dx` / `dy` are in **world space** (root-SVG
 *  own user units), sign-adjusted so a positive value grows the moving
 *  edge outward. The DOM adapter converts CSS-pixel cursor deltas to
 *  world deltas at the intent boundary; the pipeline never sees screen
 *  pixels. */
export type ResizeInput = {
  id: NodeId;
  direction: ResizeDirection;
  dx: number;
  dy: number;
};

export type ResizeModifiers = {
  /** Shift-drag aspect lock. When `"uniform"`, the larger-magnitude
   *  axis wins and both axes scale by the same factor (preserving
   *  baseline aspect ratio). Independent of element-driven uniformity
   *  (circle, text-on-corner) which is enforced by
   *  `intent.compute_factors` and `resize_capability.constraint`. */
  aspect_lock: "off" | "uniform";
  /** Hard override — skip the snap stage regardless of session /
   *  options. */
  force_disable_snap: boolean;
};

export type ResizeOptions = {
  /** `null` (or `<= 0`) = pixel-grid stage is identity. */
  pixel_grid_quantum: number | null;
  snap_enabled: boolean;
  snap_threshold_px: number;
};

export type ResizeContext = {
  input: ResizeInput;
  modifiers: ResizeModifiers;
  options: ResizeOptions;
  snap_session: SnapSession | null;
};

/** The mutating shape that flows through stages. */
export type ResizePlan = {
  id: NodeId;
  baseline: ResizeBaseline;
  members?: ReadonlyArray<{ id: NodeId; baseline: ResizeBaseline }>;
  direction: ResizeDirection;
  /** World-space, sign-adjusted gesture deltas. */
  dx: number;
  dy: number;
};

export type ResizeStageEmission = {
  guide?: _guide.SnapGuide;
};

export type ResizeStage = {
  readonly name: string;
  run(
    plan: ResizePlan,
    ctx: ResizeContext
  ): { plan: ResizePlan; emit?: ResizeStageEmission };
};

export type ResizePipelineResult = {
  plan: ResizePlan;
  guides: ReadonlyArray<_guide.SnapGuide>;
};

export namespace resize_pipeline {
  // ─── intent — pure per-element baseline + factors + apply ────────────

  export namespace intent {
    function num(
      doc: SvgDocument,
      id: NodeId,
      name: string,
      fallback = 0
    ): number {
      return svg_parse.parse_number(doc.get_attr(id, name), fallback);
    }

    /** Attribute names a resize gesture may write for `tag`: the
     *  handler write surface (`RESIZE_WRITE_ATTRS`, owned next to the
     *  handlers) plus `transform` — the pipeline's own write
     *  (commit-phase `renormalize_rotate_pivot`). Drives the
     *  `baseline.raw` snapshot that `restore` writes back. */
    function writable_attrs(tag: string): ReadonlyArray<string> {
      const handler_writes = RESIZE_WRITE_ATTRS[tag];
      return handler_writes ? [...handler_writes, "transform"] : [];
    }

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

    export function capture_baseline(
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
          attrs = {
            kind: "polyline",
            points: doc.get_attr(id, "points") ?? "",
          };
          break;
        case "polygon":
          attrs = {
            kind: "polygon",
            points: doc.get_attr(id, "points") ?? "",
          };
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
      const raw = writable_attrs(tag).map((name) => ({
        name,
        value: doc.get_attr(id, name),
      }));
      return { bbox, attrs, raw };
    }

    /**
     * Restore an element to its exact pre-gesture state by writing the
     * `baseline.raw` snapshot back verbatim (`null` removes the attr).
     *
     * Deliberately NOT `apply(..., 1, 1, ...)`: handlers may refuse
     * gesture shapes (text refuses non-corner input), so an identity
     * re-application routes the restore through those refusal arms and
     * silently no-ops — nor can any identity-scale write recover the
     * commit-phase `transform` rewrite. Mirrors
     * `translate_pipeline.intent.revert`'s exact-attr restore.
     */
    export function restore(
      doc: SvgDocument,
      id: NodeId,
      baseline: ResizeBaseline
    ): void {
      for (const a of baseline.raw) doc.set_attr(id, a.name, a.value);
    }

    export function compute_factors(
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

    // ─── Commit-phase rotate-pivot recomposition ───────────────────────
    //
    // After a resize, if the element carries a rotate(θ cx cy) with an
    // editor-authored explicit pivot, we re-center it on the new local
    // bbox and shift the intrinsic geometry by δ = (R − I)·Δc so the
    // doc-space rendering is unchanged. Without this, the HUD's stable-
    // matrix chrome would drift off the element.

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
          return bbox_center(hit_shape_svg.path_control_polyline(d));
        }
        default:
          return null;
      }
    }

    function shift_points_string(
      points: string,
      dx: number,
      dy: number
    ): string {
      if (dx === 0 && dy === 0) return points;
      return svg_parse
        .parse_points(points)
        .map((p) => `${p.x + dx},${p.y + dy}`)
        .join(" ");
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

    /** Translate every local-frame coord of `id`'s geometry by (dx,
     *  dy). The primitive arms write intrinsic attrs directly — we
     *  can't route through `translate_pipeline.intent.apply` here
     *  because `translate_pipeline.intent.capture_baseline` returns
     *  `viaTransform` whenever the node has a `transform=`, and that
     *  branch prepends a `translate()` to the transform string, which
     *  would clobber the pivot rewrite the caller is about to do. */
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

    function find_rotate_op(
      ops: ReadonlyArray<TransformOp>
    ): Extract<TransformOp, { type: "rotate" }> | null {
      for (const op of ops) {
        if (op.type === "rotate") return op;
      }
      return null;
    }

    /**
     * Commit-only. Moves the rotate pivot to the new local center and
     * shifts geometry by δ = (R − I) · Δc so the doc-space rendering
     * is unchanged. Without the shift, changing the pivot offsets the
     * rect in doc space and the HUD's stable-matrix chrome falls out
     * of alignment with the element.
     */
    function renormalize_rotate_pivot(doc: SvgDocument, id: NodeId): void {
      const existing = doc.get_attr(id, "transform");
      if (existing === null || existing.indexOf("rotate") === -1) return;
      const ops = transform.parse(existing);
      if (ops === null) return;
      const cls = transform.classify(ops);
      if (
        cls !== "single_rotate_only" &&
        cls !== "leading_translate_then_single_rotate"
      ) {
        return;
      }
      const rot = find_rotate_op(ops);
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
      const next = transform.recompose(ops, c_pre.cx + dx, c_pre.cy + dy);
      if (next === existing) return;
      doc.set_attr(id, "transform", next);
    }

    /**
     * Apply a resize gesture.
     *
     * Body delegates to `dispatch_resize` (Policy Class layer); the
     * only concern that lives here is the commit-phase pivot
     * recomposition, which is rotate-specific and outside Policy
     * Class's resize handler.
     */
    export function apply(
      doc: SvgDocument,
      id: NodeId,
      baseline: ResizeBaseline,
      sx: number,
      sy: number,
      origin: { x: number; y: number },
      /** "preview": geometry only. "commit": also recompose rotate
       *  pivot. */
      phase: "preview" | "commit" = "commit"
    ): void {
      dispatch_resize(doc, id, baseline, sx, sy, origin);
      if (phase === "commit") renormalize_rotate_pivot(doc, id);
    }

    // ─── Href replacement (image / use) ────────────────────────────────

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

    /**
     * Allows identity, leading-translate-only, and
     * `(translate?) rotate(θ cx cy)` with an explicit 3-arg pivot.
     * Refuses 1-arg `rotate(θ)`: re-emitting it would canonicalize the
     * source and violate P1 round-trip.
     */
    export function is_resizable_node(doc: SvgDocument, id: NodeId): boolean {
      if (!is_resizable(doc.tag_of(id))) return false;
      const ops = transform.parse(doc.get_attr(id, "transform"));
      if (ops === null) return false;
      const cls = transform.classify(ops);
      if (cls === "identity" || cls === "leading_translate_only") return true;
      if (
        cls === "single_rotate_only" ||
        cls === "leading_translate_then_single_rotate"
      ) {
        const rot = find_rotate_op(ops);
        return rot?.explicit_pivot === true;
      }
      return false;
    }
  }

  // ─── stages — pure functions composed by `run` ───────────────────────
  //
  // Order: aspect_lock → snap → pixel_grid. Each stage is purely a
  // transformation on `plan.{dx, dy}` (world-space deltas); none of
  // them touch attribute writes. The orchestrator turns the final plan
  // into (sx, sy, origin) via `intent.compute_factors` + `intent.apply`.
  //
  // The snap stage queries the element's *effective rect* via
  // `resize_capability.effective` so that, when a constraint (circle
  // uniform, text-on-corner uniform, text-on-edge no-op) kicks in,
  // snap sees what the attribute write will actually produce.

  export namespace stages {
    function pipeline_baseline(plan: ResizePlan): ResizeBaseline {
      return plan.baseline;
    }

    function corner_x_of(
      r: { x: number; width: number },
      dir: ResizeDirection
    ): number {
      switch (dir) {
        case "nw":
        case "w":
        case "sw":
          return r.x;
        case "ne":
        case "e":
        case "se":
          return r.x + r.width;
        case "n":
        case "s":
          return r.x + r.width / 2;
      }
    }

    function corner_y_of(
      r: { y: number; height: number },
      dir: ResizeDirection
    ): number {
      switch (dir) {
        case "nw":
        case "n":
        case "ne":
          return r.y;
        case "sw":
        case "s":
        case "se":
          return r.y + r.height;
        case "e":
        case "w":
          return r.y + r.height / 2;
      }
    }

    /** Collapse `(dx, dy)` to a uniform scale when Shift-drag is
     *  active. Element-driven uniform (circle / text-on-corner) is
     *  enforced inside `resize_capability.constraint`, not here — this
     *  stage is *only* the user-visible modifier. No-op on edge
     *  handles (uniform across one axis isn't a meaningful
     *  constraint). */
    export const aspect_lock: ResizeStage = {
      name: "aspect_lock",
      run(plan, ctx) {
        if (ctx.modifiers.aspect_lock !== "uniform") return { plan };
        if (!resize_capability.is_corner(plan.direction)) return { plan };
        const pbase = pipeline_baseline(plan);
        const locked = intent.compute_factors(
          pbase,
          plan.direction,
          plan.dx,
          plan.dy,
          true
        );
        const bbox = pbase.bbox;
        const Hx_base = corner_x_of(bbox, plan.direction);
        const Hy_base = corner_y_of(bbox, plan.direction);
        const new_Hx =
          locked.origin.x + (Hx_base - locked.origin.x) * locked.sx;
        const new_Hy =
          locked.origin.y + (Hy_base - locked.origin.y) * locked.sy;
        return {
          plan: {
            ...plan,
            dx: new_Hx - Hx_base,
            dy: new_Hy - Hy_base,
          },
        };
      },
    };

    /** Consults `ctx.snap_session` for moving-edge alignment
     *  correction. Identity on `force_disable_snap`, missing session,
     *  or `snap_enabled === false`. */
    export const snap: ResizeStage = {
      name: "snap",
      run(plan, ctx) {
        if (ctx.modifiers.force_disable_snap) return { plan };
        if (!ctx.snap_session) return { plan };
        if (!ctx.options.snap_enabled) return { plan };

        const pbase = pipeline_baseline(plan);
        const f = intent.compute_factors(
          pbase,
          plan.direction,
          plan.dx,
          plan.dy,
          false
        );
        const eff = resize_capability.effective(
          pbase,
          plan.direction,
          f.sx,
          f.sy
        );
        if (eff.no_op) return { plan };

        const r = ctx.snap_session.snap_resize(
          eff.rect,
          { x: eff.mask.x_edge, y: eff.mask.y_edge },
          {
            enabled: true,
            threshold_px: ctx.options.snap_threshold_px,
          }
        );
        if (r.dx === 0 && r.dy === 0) {
          return { plan, emit: r.guide ? { guide: r.guide } : undefined };
        }

        if (eff.uniform) {
          const bbox = pbase.bbox;
          const new_Hx = eff.moving_corner.x + r.dx;
          const new_Hy = eff.moving_corner.y + r.dy;
          const sx_from_x =
            eff.mask.x_edge !== null && r.dx !== 0 && bbox.width !== 0
              ? ((new_Hx - eff.origin.x) /
                  (eff.moving_corner.x - eff.origin.x)) *
                eff.sx
              : null;
          const sy_from_y =
            eff.mask.y_edge !== null && r.dy !== 0 && bbox.height !== 0
              ? ((new_Hy - eff.origin.y) /
                  (eff.moving_corner.y - eff.origin.y)) *
                eff.sy
              : null;
          let s = eff.sx;
          if (sx_from_x !== null && sy_from_y !== null) {
            s = Math.min(sx_from_x, sy_from_y);
          } else if (sx_from_x !== null) {
            s = sx_from_x;
          } else if (sy_from_y !== null) {
            s = sy_from_y;
          }
          const Hx_base = corner_x_of(bbox, plan.direction);
          const Hy_base = corner_y_of(bbox, plan.direction);
          const target_Hx = eff.origin.x + (Hx_base - eff.origin.x) * s;
          const target_Hy = eff.origin.y + (Hy_base - eff.origin.y) * s;
          return {
            plan: {
              ...plan,
              dx: eff.mask.affects_x ? target_Hx - Hx_base : 0,
              dy: eff.mask.affects_y ? target_Hy - Hy_base : 0,
            },
            emit: r.guide ? { guide: r.guide } : undefined,
          };
        }
        return {
          plan: {
            ...plan,
            dx: eff.mask.affects_x ? plan.dx + r.dx : plan.dx,
            dy: eff.mask.affects_y ? plan.dy + r.dy : plan.dy,
          },
          emit: r.guide ? { guide: r.guide } : undefined,
        };
      },
    };

    /** Quantize the moving corner's *post-resize* position to integer
     *  multiples of `pixel_grid_quantum` in own-frame space. Identity
     *  when quantum is `null` / `<= 0` or the gesture is a no-op. */
    export const pixel_grid: ResizeStage = {
      name: "pixel_grid",
      run(plan, ctx) {
        const q = ctx.options.pixel_grid_quantum;
        if (q === null || q <= 0) return { plan };
        const pbase = pipeline_baseline(plan);
        const f = intent.compute_factors(
          pbase,
          plan.direction,
          plan.dx,
          plan.dy,
          false
        );
        const eff = resize_capability.effective(
          pbase,
          plan.direction,
          f.sx,
          f.sy
        );
        if (eff.no_op) return { plan };
        const target_Hx = eff.mask.affects_x
          ? Math.round(eff.moving_corner.x / q) * q
          : eff.moving_corner.x;
        const target_Hy = eff.mask.affects_y
          ? Math.round(eff.moving_corner.y / q) * q
          : eff.moving_corner.y;
        const bbox = pbase.bbox;
        const Hx_base = corner_x_of(bbox, plan.direction);
        const Hy_base = corner_y_of(bbox, plan.direction);
        return {
          plan: {
            ...plan,
            dx: eff.mask.affects_x ? target_Hx - Hx_base : 0,
            dy: eff.mask.affects_y ? target_Hy - Hy_base : 0,
          },
        };
      },
    };

    /** Default stage list for HUD-driven resize gestures (drag). No
     *  NUDGE / RPC analogs at v1 (no `commands.resize` per README). */
    export const DEFAULT: ReadonlyArray<ResizeStage> = Object.freeze([
      aspect_lock,
      snap,
      pixel_grid,
    ]);
  }

  // ─── pipeline funnel + plan apply / revert + group synthesizer ───────

  /** The funnel. Threads `plan` through `stages` in order; aggregates
   *  guide emissions. Pure: same inputs → same outputs. */
  export function run(
    init: ResizePlan,
    stages: ReadonlyArray<ResizeStage>,
    ctx: ResizeContext
  ): ResizePipelineResult {
    let plan = init;
    const guides: _guide.SnapGuide[] = [];
    for (const stage of stages) {
      const out = stage.run(plan, ctx);
      plan = out.plan;
      if (out.emit?.guide) guides.push(out.emit.guide);
    }
    return { plan, guides };
  }

  export function apply(
    doc: SvgDocument,
    plan: ResizePlan,
    phase: "preview" | "commit" = "commit"
  ): void {
    const f = intent.compute_factors(
      plan.baseline,
      plan.direction,
      plan.dx,
      plan.dy,
      false
    );
    const members = plan.members ?? [{ id: plan.id, baseline: plan.baseline }];
    for (const m of members) {
      intent.apply(doc, m.id, m.baseline, f.sx, f.sy, f.origin, phase);
    }
  }

  export function revert(doc: SvgDocument, plan: ResizePlan): void {
    const members = plan.members ?? [{ id: plan.id, baseline: plan.baseline }];
    for (const m of members) {
      intent.restore(doc, m.id, m.baseline);
    }
  }

  /**
   * Synthesize a "group" baseline over an arbitrary union rect. The
   * attrs carrier is `rect`-kind so the pipeline math (snap / pixel-
   * grid) treats the group as free per-axis — per-member constraints
   * (circle uniform, text edge no-op) kick in at apply time against
   * each member's own captured baseline.
   *
   * For single-member groups callers should pass the member's own
   * baseline directly so the per-element snap correction
   * (`eff.uniform` branch) fires correctly.
   */
  export function synthesize_group_baseline(union: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): ResizeBaseline {
    return {
      bbox: {
        x: union.x,
        y: union.y,
        width: union.width,
        height: union.height,
      },
      attrs: {
        kind: "rect",
        x: union.x,
        y: union.y,
        w: union.width,
        h: union.height,
      },
      // Math carrier only — never bound to a real node, so there is
      // nothing to snapshot or restore. `apply`/`revert` always run
      // against each member's own captured baseline.
      raw: [],
    };
  }
}

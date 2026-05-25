// The universal "parametric handle" primitive — a knob that rides a 1D
// constraint manifold (segment or arc) and reports a scalar value on
// drag. This is the producer-side complement to
// `cmath.parametric.ParametricHandle`: cmath owns the data shapes,
// hud owns the layout / coincidence / projection math that turns
// those shapes into pixels and gestures.
//
// Design — see the package README's "Parametric handles" section and
// the `/sdk-design` decision banner at the head of the corner-radius
// migration plan. Headline invariants:
//
// 1. Strictly 1D output on a 1D manifold (segment, arc). 2D handles
//    are not this primitive — vector-edit's tangent / vertex knobs
//    are a different paradigm.
// 2. Coincidence groups are opt-in declarative; the resolver
//    (`resolveParametricHandleByDirection`) only picks among ids the
//    input named.
// 3. Modifier policy lives in the host. The producer reports
//    `modifiers: { alt, shift }` on its intent; corner-radius's
//    "alt → explicit anchor" is host-side reducer logic, not a
//    producer feature.
// 4. Stepped values (e.g. polygon count) are a `domain.step`
//    quantizer, not a separate primitive.
//
// Naming — the action kind in `hit-regions.ts` is `parametric_knob`
// (the visible grabbable element), the intent kind in `intent.ts` is
// `parametric_handle` (the abstract value-on-curve), the gesture
// kind in `gesture.ts` is also `parametric_handle`. Different
// discriminated unions; the suffix difference disambiguates the
// roles at every site.

import cmath from "@grida/cmath";
import type { NodeId } from "../event/gesture";

// ─── Public re-exports of the data shapes from cmath ─────────────────────

export type ParametricHandle = cmath.parametric.ParametricHandle;
export type ParametricHandleGroup = cmath.parametric.ParametricHandleGroup;
export type ParametricHandleInput = cmath.parametric.ParametricHandleInput;

// ─── Defaults — locked, not configurable per `/sdk-design` ────────────────

/**
 * Screen-px floor of the knob's resting position from the curve's
 * `t = 0` endpoint. The corner-radius affordance uses this so a knob
 * at value=0 doesn't collide with the resize-corner knob beneath it;
 * other affordances inherit the same convention.
 */
export const DEFAULT_PARAMETRIC_HANDLE_INSET = 16;

/** Default screen-px size of the knob. Matches resize-corner knobs. */
export const DEFAULT_PARAMETRIC_HANDLE_SIZE = 8;

/**
 * Default screen-px hit AABB size. Padded above the visual knob per
 * the package's render/hit asymmetry rule.
 */
export const DEFAULT_PARAMETRIC_HIT_SIZE = 16;

/**
 * Distance (in doc-space px) within which two handles in the same
 * declared group count as coincident. 0.5 doc-px is generous for
 * floating-point noise; coincidence is otherwise a clean geometric
 * event (e.g. all four corner-radius handles reaching `min(w,h)/2`).
 */
const COINCIDENCE_EPS_DOC = 0.5;

// ─── Layout — pure math, no canvas ────────────────────────────────────────

/**
 * One handle's render-time layout. `pos` is doc-space (after the
 * input's `transform` has been applied); `track_doc` is the doc-space
 * track (curve or point set) used by the gesture's projection.
 * `domain` is the effective domain with defaults filled in
 * (`min = 0`, `max = 1`).
 */
export interface ParametricHandleLayout {
  /** The node id of the owning input — routes intents back. */
  node_id: NodeId;
  /** The handle id within the input — names the manipulated parameter. */
  handle_id: string;
  /** Doc-space position of the knob center. */
  pos: cmath.Vector2;
  /** Screen-px visual knob size. */
  size: number;
  /** Screen-px hit AABB size (>= size, padded). */
  hit_size: number;
  /** Stable label — `parametric:<node_id>:<handle_id>`. */
  label: string;
  /** Doc-space track for the gesture's projection — continuous curve
   *  OR discrete point set. */
  track_doc: cmath.ui.Curve | cmath.ui.PointSet;
  /** Effective domain (`min`/`max` defaulted; `step` preserved). */
  domain: { min: number; max: number; step?: number };
}

/**
 * Compute the per-frame layout for every handle in an input. One
 * layout entry per declared handle, in declaration order. Coincidence
 * detection (the "4-corner collapse" semantic of corner-radius) is a
 * separate concern — call {@link parametricHandleLayoutGroups} on the
 * result.
 *
 * `during_gesture` lifts the snap-back floor: at rest, a handle whose
 * `value` lands closer to `t = 0` than the input's `inset` (in screen
 * px) is floored to `t_inset`; during a drag the knob follows the
 * cursor down to `t = 0` so the gesture feels honest.
 *
 * `zoom` is the camera's uniform scale (`transform[0][0]`). Pass `1`
 * for unit tests against doc-space math.
 */
export function computeParametricHandleLayout(
  input: ParametricHandleInput,
  zoom: number,
  opts: {
    size?: number;
    hit_size?: number;
    during_gesture?: boolean;
  } = {}
): ParametricHandleLayout[] {
  const size = opts.size ?? DEFAULT_PARAMETRIC_HANDLE_SIZE;
  const hit_size = opts.hit_size ?? DEFAULT_PARAMETRIC_HIT_SIZE;
  const during_gesture = opts.during_gesture ?? false;
  const local_transform = input.transform;

  return input.handles.map((h) => {
    const domain = {
      min: h.domain?.min ?? 0,
      max: h.domain?.max ?? 1,
      step: h.domain?.step,
    };
    const t = renderT(h.value, domain, h.track, h.inset, zoom, during_gesture);
    const local_pos = evaluateTrack(h.track, t);
    const pos = local_transform
      ? cmath.vector2.transform(local_pos, local_transform)
      : local_pos;
    const track_doc = local_transform
      ? transformTrack(h.track, local_transform)
      : h.track;
    return {
      node_id: input.node_id,
      handle_id: h.id,
      pos,
      size,
      hit_size,
      label: `parametric:${input.node_id}:${h.id}`,
      track_doc,
      domain,
    };
  });
}

/** Evaluate a track at `t` — dispatch on kind. */
function evaluateTrack(
  track: cmath.ui.Curve | cmath.ui.PointSet,
  t: number
): cmath.Vector2 {
  if (track.kind === "points") return cmath.ui.evaluatePointSet(track, t);
  return cmath.ui.evaluateCurve(track, t);
}

/**
 * Resolve the t the producer uses to RENDER a handle. Applies:
 *
 * - The domain mapping `t = (value - min) / (max - min)`.
 * - The snap-back floor (when `during_gesture` is false and `inset`
 *   is set): `t = max(t, inset_screen / curveLength / zoom)`.
 *
 * Clamps the result to `[0, 1]`. The `step` quantizer is NOT applied
 * here — it only affects EMITTED values, not the rendered position
 * (which follows the host-supplied `value` whatever it is).
 */
function renderT(
  value: number,
  domain: { min: number; max: number },
  track: cmath.ui.Curve | cmath.ui.PointSet,
  inset: number | undefined,
  zoom: number,
  during_gesture: boolean
): number {
  const span = domain.max - domain.min;
  let t = span === 0 ? 0 : (value - domain.min) / span;
  // `inset` is a continuous-curve concept (snap back along the curve
  // by some doc-space distance). Point sets have no continuous "start
  // neighborhood" to snap back to, so we skip the floor for them.
  if (
    !during_gesture &&
    inset != null &&
    inset > 0 &&
    track.kind !== "points"
  ) {
    const len = curveLength(track);
    if (len > 0) {
      const inset_doc = inset / Math.max(zoom, 1e-6);
      const t_floor = Math.min(inset_doc / len, 1);
      if (t < t_floor) t = t_floor;
    }
  }
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return t;
}

/** Euclidean length of a continuous curve in its own frame. */
function curveLength(c: cmath.ui.Curve): number {
  if (c.kind === "segment") {
    return Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
  }
  return c.radius * Math.max(0, c.to - c.from);
}

/**
 * Transform a curve through a 2×3 affine. Segments map exactly
 * (segments → segments under any affine). Arcs map exactly only under
 * SIMILARITY transforms (rotation + uniform scale + translation); a
 * shear or non-uniform scale produces an ellipse, which this
 * primitive doesn't model. The result is reported as the
 * scale-and-rotation–adjusted arc that's correct for similarity
 * inputs; non-similarity transforms degrade silently.
 *
 * Document this guarantee at the input boundary — hosts that paint
 * parametric arcs over sheared selections must pre-bake the
 * doc-space arc and pass an identity transform.
 */
function transformTrack(
  track: cmath.ui.Curve | cmath.ui.PointSet,
  m: cmath.Transform
): cmath.ui.Curve | cmath.ui.PointSet {
  if (track.kind === "segment") {
    return {
      kind: "segment",
      a: cmath.vector2.transform(track.a, m),
      b: cmath.vector2.transform(track.b, m),
    };
  }
  if (track.kind === "points") {
    return {
      kind: "points",
      points: track.points.map((p) => cmath.vector2.transform(p, m)),
    };
  }
  // Similarity-only — scale magnitude from the first column, rotation
  // from atan2 of the linear part.
  const scale = Math.hypot(m[0][0], m[1][0]);
  const rot = Math.atan2(m[1][0], m[0][0]);
  return {
    kind: "arc",
    center: cmath.vector2.transform(track.center, m),
    radius: track.radius * scale,
    from: track.from + rot,
    to: track.to + rot,
  };
}

// ─── Coincidence + direction-resolution ───────────────────────────────────

/**
 * Partition a layout into hit-region groups using the input's
 * declared coincidence groups.
 *
 * A declared group "fires" only when ALL its members are within
 * `eps_doc` of each other in doc-space — i.e. the handles have
 * geometrically collapsed onto one point. When a group fires, its
 * members are returned as one sublist and the producer registers a
 * single hit region with `candidates = members`; the gesture resolves
 * which member the pointer meant from drag direction.
 *
 * When a declared group doesn't fire (members are spread out), its
 * members are returned as singletons — one hit region per handle.
 *
 * Handles not mentioned in any declared group are always singletons.
 *
 * The function never invents groupings the input didn't declare —
 * that's an `/sdk-design` invariant ("coincidence is opt-in").
 */
export function parametricHandleLayoutGroups(
  input: ParametricHandleInput,
  layout: readonly ParametricHandleLayout[],
  eps_doc: number = COINCIDENCE_EPS_DOC
): ParametricHandleLayout[][] {
  const by_id = new Map(layout.map((l) => [l.handle_id, l]));
  const declared = input.groups ?? [];
  const claimed = new Set<string>();
  const groups: ParametricHandleLayout[][] = [];

  for (const decl of declared) {
    const members = decl.ids
      .map((id) => by_id.get(id))
      .filter((l): l is ParametricHandleLayout => !!l);
    if (members.length === 0) continue;
    if (members.length === 1) {
      // Declared group of 1 — degenerate. Treat as singleton; don't
      // claim, so the layout-order pass below emits it.
      continue;
    }
    const [head, ...rest] = members;
    const coincident = rest.every(
      (m) =>
        Math.abs(m.pos[0] - head.pos[0]) <= eps_doc &&
        Math.abs(m.pos[1] - head.pos[1]) <= eps_doc
    );
    if (coincident) {
      groups.push(members);
      for (const m of members) claimed.add(m.handle_id);
    }
    // Non-coincident: members fall through to singletons.
  }

  for (const l of layout) {
    if (!claimed.has(l.handle_id)) groups.push([l]);
  }
  return groups;
}

/**
 * Resolve which handle in a coincident group the user is dragging.
 *
 * Each candidate has a curve whose tangent at the coincident position
 * points toward `t = 1`. The user "pulls the knob back along that
 * direction" to decrease value, so the drag delta most OPPOSITE the
 * tangent identifies the intended handle. Equivalent: maximize
 * `tangent · (-delta)`.
 *
 * Ties (rare — would require two curves with identical tangents
 * passing through the same point) break by first-listed candidate.
 */
export function resolveParametricHandleByDirection(
  group: readonly ParametricHandleLayout[],
  dx: number,
  dy: number
): ParametricHandleLayout {
  let best = group[0];
  let best_dot = -Infinity;
  for (const l of group) {
    const [tx, ty] = trackTangent(l.track_doc);
    const dot = tx * -dx + ty * -dy;
    if (dot > best_dot) {
      best_dot = dot;
      best = l;
    }
  }
  return best;
}

/**
 * Unit tangent at the track's `t = 0` end, pointing toward `t = 1`.
 * Continuous curves return the geometric tangent at the start;
 * discrete point sets return the unit vector from the first point to
 * the second (the "next step direction"). Degenerate cases return
 * `[1, 0]` as a convention so callers don't have to guard.
 */
function trackTangent(
  track: cmath.ui.Curve | cmath.ui.PointSet
): cmath.Vector2 {
  if (track.kind === "segment") {
    const dx = track.b[0] - track.a[0];
    const dy = track.b[1] - track.a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return [1, 0];
    return [dx / len, dy / len];
  }
  if (track.kind === "points") {
    if (track.points.length < 2) return [1, 0];
    const dx = track.points[1][0] - track.points[0][0];
    const dy = track.points[1][1] - track.points[0][1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return [1, 0];
    return [dx / len, dy / len];
  }
  if (track.radius === 0) return [1, 0];
  const dir = track.to >= track.from ? 1 : -1;
  return [-Math.sin(track.from) * dir, Math.cos(track.from) * dir];
}

// ─── Projection + quantization ────────────────────────────────────────────

/**
 * Project a doc-space point onto a handle's track and return both
 * the parameter `t` and the host-units `value` (denormalized through
 * `domain`, then snapped to `step` if set).
 *
 * The producer calls this once per pointer_move during a drag. The
 * `value` is what flows back to the host on the intent's `value`
 * field; `t` is internal (useful for tests and debug overlays).
 *
 * Dispatches on `track.kind`: continuous curves use
 * {@link cmath.ui.projectPointOnCurve}; point sets use
 * {@link cmath.ui.projectPointOnSet}, which snaps to the nearest
 * point. `step` quantization (if `domain.step > 0`) is applied on
 * top of either, then clamped to `[min, max]`.
 */
export function projectParametricHandleValue(
  layout: ParametricHandleLayout,
  point: cmath.Vector2
): { t: number; value: number } {
  const { t } = projectTrack(layout.track_doc, point);
  const span = layout.domain.max - layout.domain.min;
  let value = layout.domain.min + t * span;
  if (layout.domain.step && layout.domain.step > 0) {
    const k = Math.round((value - layout.domain.min) / layout.domain.step);
    value = layout.domain.min + k * layout.domain.step;
  }
  if (value < layout.domain.min) value = layout.domain.min;
  else if (value > layout.domain.max) value = layout.domain.max;
  return { t, value };
}

/** Project a point onto a track — dispatch on kind. */
function projectTrack(
  track: cmath.ui.Curve | cmath.ui.PointSet,
  point: cmath.Vector2
): { t: number; position: cmath.Vector2 } {
  if (track.kind === "points") return cmath.ui.projectPointOnSet(track, point);
  return cmath.ui.projectPointOnCurve(track, point);
}

// ─── Painter ──────────────────────────────────────────────────────────────

export interface DrawParametricHandlesParams {
  ctx: CanvasRenderingContext2D;
  transform: cmath.Transform;
  /** Viewport width in CSS pixels. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
  /** Device pixel ratio of the canvas. */
  dpr: number;
  /** Pre-computed handle layouts. Coincident handles are dedup-painted
   *  by screen pixel — overlapping knobs paint as one circle. */
  handles: readonly ParametricHandleLayout[];
  /** Stroke + fill color for the knob. */
  color: string;
  /** Fill color for the interior. Defaults to white for the standard
   *  hollow-ring look (matches `drawCornerRadius`). */
  fillColor?: string;
}

/**
 * Paint parametric handles into the canvas context. Stateless,
 * pixel-dedup'd. Same visual shape as `drawCornerRadius` — the two
 * collapse into one painter in Phase 2 when corner-radius migrates.
 */
export function drawParametricHandles(p: DrawParametricHandlesParams): void {
  const { ctx, transform, dpr, handles, color, fillColor = "#ffffff" } = p;
  if (handles.length === 0) return;
  const [[sx, , tx], [, sy, ty]] = transform;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = fillColor;

  const painted = new Set<string>();
  for (const h of handles) {
    const scrX = sx * h.pos[0] + tx;
    const scrY = sy * h.pos[1] + ty;
    const key = `${Math.round(scrX)}:${Math.round(scrY)}`;
    if (painted.has(key)) continue;
    painted.add(key);
    const r = h.size / 2;
    ctx.beginPath();
    ctx.ellipse(scrX, scrY, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
  void p.width;
  void p.height;
}

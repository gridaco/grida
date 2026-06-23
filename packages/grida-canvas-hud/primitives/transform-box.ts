// Transform-box — class-bound math reducer for the `transform-box`
// named class. Lives in `primitives/` for code organization (one file
// per math domain, pure-function tests without mounting the chrome);
// not Tier 2 in the audience sense — its closure of valid actions IS
// the transform-box chrome's gesture grammar. See the package README
// section "Tier 2 — Primitives (the open building blocks)".
//
// Pure mathematical reducer for a 2×3 affine transform manipulated by
// three op kinds: translate, scale-side, rotate. Operates on a unit box
// [0,0]→[1,1] with size in pixel-space. Translation components of the
// transform are normalized [0..1] against `size`.
//
// Lifted verbatim from the editor's image-paint editor math
// ([editor/grida-canvas-react/viewport/ui/__math/image-transform.ts]).
// The model is NOT image-specific — image-fit is just the first consumer.
//
// CENTER DEFINITION:
//   Center = center of (rect * transform). Rect corners are transformed
//   by the matrix to get the visual center (used as the rotation pivot).
//
// MATHEMATICS:
//   Each corner is a pure projection of a box corner through the
//   transform matrix. No back-solving from points — pure mathematical
//   projection.

import cmath from "@grida/cmath";

/**
 * 2×3 affine transform. Structurally compatible with `AffineTransform`
 * from `@grida/cg` — the HUD package keeps a local alias to avoid
 * acquiring a `@grida/cg` workspace dep just for the type.
 */
export type AffineTransform = [
  [number, number, number],
  [number, number, number],
];

export type TransformBoxAction =
  | {
      type: "translate";
      delta: cmath.Vector2;
    }
  | {
      type: "scale-side";
      side: cmath.RectangleSide;
      delta: cmath.Vector2;
    }
  | {
      type: "scale-corner";
      corner: cmath.IntercardinalDirection;
      delta: cmath.Vector2;
    }
  | {
      type: "rotate";
      corner: cmath.IntercardinalDirection;
      delta: cmath.Vector2;
    };

export interface TransformBoxOptions {
  size: cmath.Vector2;
  /**
   * Live modifier state, applied identically to the element box's resize /
   * rotate:
   *   - `alt` — scale from the box CENTER (anchor the center instead of the
   *     opposite edge / corner).
   *   - `shift` — aspect-lock a scale (uniform), snap a rotation to
   *     {@link ROTATE_SNAP_DEG}, or axis-lock a translation to the box's
   *     dominant axis.
   * Omitted ⇒ no modifiers (the unconstrained reduction).
   */
  modifiers?: { alt?: boolean; shift?: boolean };
  /**
   * The box's container rotation in degrees (the host's `TransformBoxInput.
   * rotation`). Used ONLY to snap a Shift-rotate to an ABSOLUTE
   * {@link ROTATE_SNAP_DEG} grid (visible angle = `rotation` +
   * `decompose(base).rotation` + the gesture's delta). Omitted ⇒ 0.
   */
  rotation?: number;
}

/** Rotation snap increment (degrees) under Shift — matches the element box. */
const ROTATE_SNAP_DEG = 15;

export type TransformBoxCorners = {
  nw: cmath.Vector2;
  ne: cmath.Vector2;
  se: cmath.Vector2;
  sw: cmath.Vector2;
};

const EPSILON = 1e-10;

/**
 * Reduces a transform-box affine in response to a UI action.
 */
export function reduceTransformBox(
  base: AffineTransform,
  action: TransformBoxAction,
  options: TransformBoxOptions
): AffineTransform {
  const { size, modifiers } = options;
  const alt = !!modifiers?.alt;
  const shift = !!modifiers?.shift;
  const container_rotation = options.rotation ?? 0;

  switch (action.type) {
    case "translate":
      return applyTranslation(base, action.delta, size, shift);
    case "scale-side":
      return applyScaling(base, action.side, action.delta, size, alt, shift);
    case "scale-corner":
      return applyCornerScaling(
        base,
        action.corner,
        action.delta,
        size,
        alt,
        shift
      );
    case "rotate":
      return applyRotation(
        base,
        action.corner,
        action.delta,
        size,
        shift,
        container_rotation
      );
  }
}

// Unit-square local coords (a, b) ∈ {0,1}² of each corner, in the box's own
// frame: nw = (0,0), ne = (1,0), se = (1,1), sw = (0,1).
function cornerLocalCoord(
  corner: cmath.IntercardinalDirection
): [number, number] {
  switch (corner) {
    case "nw":
      return [0, 0];
    case "ne":
      return [1, 0];
    case "se":
      return [1, 1];
    case "sw":
      return [0, 1];
  }
}

/**
 * The box's edge vectors `u` (nw→ne, width) and `v` (nw→sw, height) in
 * pixel space, with degenerate-axis recovery: once a drag has driven a side
 * to ~0 its corner-derived vector is the zero vector, so we rebuild that
 * axis's direction from the base linear part (the perpendicular of the
 * surviving axis, scaled by `size`) — letting a collapsed box re-expand
 * instead of stranding the user. `null` iff BOTH axes are fully collapsed.
 */
function boxAxes(
  corners: TransformBoxCorners,
  base: AffineTransform,
  size: cmath.Vector2
): { u: cmath.Vector2; v: cmath.Vector2 } | null {
  let u = cmath.vector2.sub(corners.ne, corners.nw);
  let v = cmath.vector2.sub(corners.sw, corners.nw);
  const lu = Math.hypot(u[0], u[1]);
  const lv = Math.hypot(v[0], v[1]);
  if (lu < SIZE_EPSILON && lv < SIZE_EPSILON) return null;
  if (lu < SIZE_EPSILON) {
    const vn: cmath.Vector2 = [v[0] / lv, v[1] / lv];
    const w = Math.abs(size[0]) > SIZE_EPSILON ? size[0] : lv;
    u = [vn[1] * w, -vn[0] * w]; // perpendicular of v
  } else if (lv < SIZE_EPSILON) {
    const un: cmath.Vector2 = [u[0] / lu, u[1] / lu];
    const h = Math.abs(size[1]) > SIZE_EPSILON ? size[1] : lu;
    v = [-un[1] * h, un[0] * h]; // perpendicular of u
  }
  return { u, v };
}

/**
 * Scale the box in its own local frame (gridaco/grida#881 modifiers). The
 * dragged handle's local coord is `(ca, cb)` ∈ {0,1}²; `scaleX` / `scaleY`
 * pick which axes it drives (a corner drives both, a side one). Solves the
 * per-axis scale factor that puts the dragged handle under the cursor while
 * the anchor stays fixed, then rebuilds the four corners — so the box stays a
 * parallelogram (no shear) and works on a rotated box (the `u`/`v` edge
 * vectors carry the orientation).
 *
 * Modifiers, identical to the element box:
 *   - `alt` (from-center) — anchor the box CENTER (a = b = 0.5) instead of the
 *     opposite edge / corner, so the box grows symmetrically.
 *   - `shift` (aspect-lock) — for a corner, lock both factors to the larger
 *     magnitude (sign-preserving); for a side, drive the perpendicular axis by
 *     the same factor about its center (uniform scale).
 *
 * Returns `base` unchanged on a fully-collapsed box (no `NaN`).
 */
function scaleBox(
  base: AffineTransform,
  size: cmath.Vector2,
  ca: number,
  cb: number,
  scaleX: boolean,
  scaleY: boolean,
  pixelDelta: cmath.Vector2,
  alt: boolean,
  shift: boolean
): AffineTransform {
  const corners = getTransformBoxCorners(base, size);
  const axes = boxAxes(corners, base, size);
  if (!axes) return base;
  const { u, v } = axes;
  const det = u[0] * v[1] - v[0] * u[1];
  if (Math.abs(det) < SIZE_EPSILON) return base;

  // Local-coord (a, b) displacement of the dragged handle: solve
  // da·u + db·v = pixelDelta.
  const da = (pixelDelta[0] * v[1] - v[0] * pixelDelta[1]) / det;
  const db = (u[0] * pixelDelta[1] - pixelDelta[0] * u[1]) / det;

  // Anchor: opposite edge / corner, or the box center under `alt`. An
  // un-driven axis anchors at its center (0.5) so aspect grows it both ways.
  const ax = alt ? 0.5 : scaleX ? 1 - ca : 0.5;
  const ay = alt ? 0.5 : scaleY ? 1 - cb : 0.5;

  let sx = 1;
  let sy = 1;
  if (scaleX && Math.abs(ca - ax) > EPSILON) sx = (ca + da - ax) / (ca - ax);
  if (scaleY && Math.abs(cb - ay) > EPSILON) sy = (cb + db - ay) / (cb - ay);

  if (shift) {
    if (scaleX && scaleY) {
      const mag = Math.max(Math.abs(sx), Math.abs(sy));
      sx = sx < 0 ? -mag : mag;
      sy = sy < 0 ? -mag : mag;
    } else if (scaleX) {
      sy = sx;
    } else if (scaleY) {
      sx = sy;
    }
  }

  const mk = (a: number, b: number): cmath.Vector2 => {
    const na = ax + sx * (a - ax);
    const nb = ay + sy * (b - ay);
    return [
      corners.nw[0] + na * u[0] + nb * v[0],
      corners.nw[1] + na * u[1] + nb * v[1],
    ];
  };
  return cornersToBoxTransform(
    { nw: mk(0, 0), ne: mk(1, 0), se: mk(1, 1), sw: mk(0, 1) },
    size
  );
}

/** Corner scaling — drives both axes from the dragged corner. */
function applyCornerScaling(
  base: AffineTransform,
  corner: cmath.IntercardinalDirection,
  pixelDelta: cmath.Vector2,
  size: cmath.Vector2,
  alt = false,
  shift = false
): AffineTransform {
  const [ca, cb] = cornerLocalCoord(corner);
  return scaleBox(base, size, ca, cb, true, true, pixelDelta, alt, shift);
}

/**
 * Given a transform-box matrix and the box size, returns the four
 * transformed corners in pixel space.
 *
 *   Each corner = transform * box_corner
 */
export function getTransformBoxCorners(
  transform: AffineTransform,
  size: cmath.Vector2
): TransformBoxCorners {
  const width = size[0] || 1;
  const height = size[1] || 1;

  const boxCorners: cmath.Vector2[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];

  // Transform matrix in pixel space — translation columns denormalized
  // by (width, height).
  const pixelTransform: cmath.Transform = [
    [transform[0][0], transform[0][1], transform[0][2] * width],
    [transform[1][0], transform[1][1], transform[1][2] * height],
  ];

  const corners = boxCorners.map((corner) =>
    cmath.vector2.transform(corner, pixelTransform)
  );

  return {
    nw: corners[0],
    ne: corners[1],
    se: corners[2],
    sw: corners[3],
  };
}

/**
 * Decomposes an affine transform into rotation (deg), scale [sx, sy],
 * and translation [tx, ty] components.
 */
export function decompose(transform: AffineTransform): {
  rotation: number;
  scale: cmath.Vector2;
  translation: cmath.Vector2;
} {
  const matrix: cmath.Transform = [
    [transform[0][0], transform[0][1], transform[0][2]],
    [transform[1][0], transform[1][1], transform[1][2]],
  ];

  return {
    rotation: cmath.transform.angle(matrix),
    scale: cmath.transform.getScale(matrix),
    translation: cmath.transform.getTranslate(matrix),
  };
}

/**
 * Composes rotation (deg), scale, and translation into an affine
 * transform, anchored so the supplied `center` is preserved.
 */
export function compose(
  rotation: number,
  scale: cmath.Vector2,
  translation: cmath.Vector2,
  center: cmath.Vector2
): AffineTransform {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const a = scale[0] * cos;
  const b = -scale[1] * sin;
  const c = scale[0] * sin;
  const d = scale[1] * cos;

  const rotatedScaledCenter = [
    a * center[0] + b * center[1],
    c * center[0] + d * center[1],
  ];

  const tx = center[0] - rotatedScaledCenter[0] + translation[0];
  const ty = center[1] - rotatedScaledCenter[1] + translation[1];

  return [
    [a, b, tx],
    [c, d, ty],
  ];
}

// Degenerate-size guard. Translation is normalised by `size`, so a 0-axis
// would produce Infinity/NaN and corrupt the host's bound transform.
// Scale-side projects onto a corner-derived axis whose length collapses
// to ~0 in the same degenerate case. EPSILON is a pixel-scale floor —
// any size smaller than this is treated as a no-op axis.
const SIZE_EPSILON = 1e-8;

function applyTranslation(
  base: AffineTransform,
  pixelDelta: cmath.Vector2,
  size: cmath.Vector2,
  shift = false
): AffineTransform {
  // Shift axis-lock: constrain the drag to the box's dominant axis (the
  // delta is already de-rotated into the box's un-rotated frame upstream).
  let delta = pixelDelta;
  if (shift) {
    delta =
      Math.abs(pixelDelta[0]) >= Math.abs(pixelDelta[1])
        ? [pixelDelta[0], 0]
        : [0, pixelDelta[1]];
  }
  const sx = Math.abs(size[0]) > SIZE_EPSILON ? size[0] : 0;
  const sy = Math.abs(size[1]) > SIZE_EPSILON ? size[1] : 0;
  if (sx === 0 && sy === 0) return base;
  const dx = sx === 0 ? 0 : delta[0] / sx;
  const dy = sy === 0 ? 0 : delta[1] / sy;
  return [
    [base[0][0], base[0][1], base[0][2] + dx],
    [base[1][0], base[1][1], base[1][2] + dy],
  ];
}

/**
 * Side scaling — drives one axis from the dragged edge (the other is
 * untouched unless Shift aspect-locks it). Delegates to {@link scaleBox}.
 *
 * TODO: true original-direction scaling (scaling pure X/Y axes regardless of
 * current rotation) is unimplemented — scaling follows the box's current
 * (possibly rotated) axes, inherited from the editor's image-paint editor.
 */
function applyScaling(
  base: AffineTransform,
  side: cmath.RectangleSide,
  pixelDelta: cmath.Vector2,
  size: cmath.Vector2,
  alt = false,
  shift = false
): AffineTransform {
  // Dragged edge's local coord on its driven axis; the other coord is unused.
  let ca = 0.5;
  let cb = 0.5;
  let scaleX = false;
  let scaleY = false;
  switch (side) {
    case "left":
      ca = 0;
      scaleX = true;
      break;
    case "right":
      ca = 1;
      scaleX = true;
      break;
    case "top":
      cb = 0;
      scaleY = true;
      break;
    case "bottom":
      cb = 1;
      scaleY = true;
      break;
  }
  return scaleBox(base, size, ca, cb, scaleX, scaleY, pixelDelta, alt, shift);
}

/**
 * Convert pixel-space corners back to a box-relative transform.
 */
export function cornersToBoxTransform(
  corners: TransformBoxCorners,
  size: cmath.Vector2
): AffineTransform {
  const width = size[0] || 1;
  const height = size[1] || 1;

  const { nw, ne, sw } = corners;

  const widthVector = cmath.vector2.sub(ne, nw);
  const heightVector = cmath.vector2.sub(sw, nw);

  return [
    [widthVector[0] / width, heightVector[0] / height, nw[0] / width],
    [widthVector[1] / width, heightVector[1] / height, nw[1] / height],
  ];
}

/**
 * Rigid-body rotation of the transformed geometry (rect × transform)
 * around its center. Preserves corner distances and keeps pre/post
 * centers aligned.
 */
function applyRotation(
  base: AffineTransform,
  corner: cmath.IntercardinalDirection,
  pixelDelta: cmath.Vector2,
  size: cmath.Vector2,
  shift = false,
  containerRotationDeg = 0
): AffineTransform {
  const corners = getTransformBoxCorners(base, size);
  const center = cmath.vector2.multiply(
    cmath.vector2.add(corners.nw, corners.se),
    [0.5, 0.5]
  );

  const cornerPoint = corners[corner];
  const target = cmath.vector2.add(cornerPoint, pixelDelta);
  const baseVector = cmath.vector2.sub(cornerPoint, center);
  const targetVector = cmath.vector2.sub(target, center);

  const baseLength = Math.hypot(baseVector[0], baseVector[1]);
  if (baseLength < EPSILON) return base;

  const targetLength = Math.hypot(targetVector[0], targetVector[1]);
  if (targetLength < EPSILON) return base;

  const normalizedTarget = [
    (targetVector[0] / targetLength) * baseLength,
    (targetVector[1] / targetLength) * baseLength,
  ] as cmath.Vector2;

  const dot = cmath.vector2.dot(baseVector, normalizedTarget);
  const cross = cmath.vector2.cross(baseVector, normalizedTarget);
  let angle = Math.atan2(cross, dot);

  // Shift angle-snap: snap the ABSOLUTE visible rotation (container + base's
  // own rotation + this delta) to the ROTATE_SNAP_DEG grid, then back out the
  // delta to apply. Snapping the absolute angle (not the delta) matches the
  // element box, so the box can land on an exact 15° even from an off-grid
  // start.
  if (shift) {
    const base_deg = containerRotationDeg + decompose(base).rotation;
    const total_deg = base_deg + (angle * 180) / Math.PI;
    const snapped_deg =
      Math.round(total_deg / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
    angle = ((snapped_deg - base_deg) * Math.PI) / 180;
  } else if (Math.abs(angle) < EPSILON) {
    return base;
  }

  if (Math.abs(angle) < EPSILON) return base;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const rotatePoint = (point: cmath.Vector2): cmath.Vector2 => {
    const relative = cmath.vector2.sub(point, center);
    return cmath.vector2.add(center, [
      relative[0] * cos - relative[1] * sin,
      relative[0] * sin + relative[1] * cos,
    ]);
  };

  const rotatedCorners = {
    nw: rotatePoint(corners.nw),
    ne: rotatePoint(corners.ne),
    se: rotatePoint(corners.se),
    sw: rotatePoint(corners.sw),
  };

  return cornersToBoxTransform(rotatedCorners, size);
}

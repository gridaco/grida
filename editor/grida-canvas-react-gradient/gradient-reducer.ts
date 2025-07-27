import type cg from "@grida/cg";
import cmath from "@grida/cmath";
import { ellipseMarkerRotation, degToRad } from "./utils/ellipse";

export type GradientType = "linear" | "radial" | "sweep";

export type GradientValue = {
  transform: cg.AffineTransform;
  positions: number[];
  colors: cg.RGBA8888[];
};

export interface Point {
  x: number;
  y: number;
}

export interface ControlPoints {
  A: Point;
  B: Point;
  C: Point;
}

// Base anchors for an identity transform
export const getBaseControlPoints = (
  gradientType: GradientType
): ControlPoints => {
  if (gradientType === "linear") {
    return {
      A: { x: 0, y: 0.5 },
      B: { x: 1, y: 0.5 },
      C: { x: 0, y: 1 },
    };
  }
  return {
    // radial and sweep share the same default anchors
    A: { x: 0.5, y: 0.5 },
    B: { x: 1, y: 0.5 },
    C: { x: 0.5, y: 1 },
  };
};

// Convert transform to relative control points
/**
 * Converts an affine transform back into relative control points.
 * The returned points are always normalized so that for radial and
 * sweep gradients the C control remains perpendicular to the A–B axis.
 */
export const getPointsFromTransform = (
  t: cg.AffineTransform,
  gradientType: GradientType
): ControlPoints => {
  const base = getBaseControlPoints(gradientType);
  const _A = cmath.vector2.transform([base.A.x, base.A.y], t);
  const _B = cmath.vector2.transform([base.B.x, base.B.y], t);
  const _C = cmath.vector2.transform([base.C.x, base.C.y], t);
  const A = { x: _A[0], y: _A[1] };
  const B = { x: _B[0], y: _B[1] };
  let C = { x: _C[0], y: _C[1] };

  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.hypot(dx, dy) || 1e-6;
  if (gradientType === "linear") {
    const px = -dy / len;
    const py = dx / len;
    C = {
      x: A.x + px * (len * 0.5),
      y: A.y + py * (len * 0.5),
    };
  } else {
    const dist = Math.hypot(C.x - A.x, C.y - A.y);
    const nx = -dy / len;
    const ny = dx / len;
    C = { x: A.x + nx * dist, y: A.y + ny * dist };
  }

  return { A, B, C };
};

// Compute transform from control points
/**
 * Calculates the affine transform that maps the default gradient
 * anchors to the given control points.
 *
 * For linear gradients the matrix is derived using only the A and B
 * points, producing translation, rotation and scale along the gradient
 * axis. Radial and sweep gradients use all three points.
 */
export const getTransformFromPoints = (
  points: ControlPoints,
  gradientType: GradientType
): cg.AffineTransform => {
  const base = getBaseControlPoints(gradientType);

  if (gradientType === "linear") {
    const dx = points.B.x - points.A.x;
    const dy = points.B.y - points.A.y;
    const len = Math.hypot(dx, dy) || 1e-6;
    const cos = dx / len;
    const sin = dy / len;

    const a = cos * len;
    const d = sin * len;
    const b = -sin;
    const e = cos;
    const tx = points.A.x - b * 0.5;
    const ty = points.A.y - e * 0.5;

    return [
      [a, b, tx],
      [d, e, ty],
    ];
  }

  // For radial and sweep gradients, ensure C only affects scaleY
  // First, ensure C is perpendicular to A-B
  const dx = points.B.x - points.A.x;
  const dy = points.B.y - points.A.y;
  const len = Math.hypot(dx, dy) || 1e-6;
  const perpX = -dy / len;
  const perpY = dx / len;

  // Project C onto the perpendicular direction
  const cRelX = points.C.x - points.A.x;
  const cRelY = points.C.y - points.A.y;
  const cPerpDist = cRelX * perpX + cRelY * perpY;

  // Create constrained C point
  const constrainedC = {
    x: points.A.x + perpX * cPerpDist,
    y: points.A.y + perpY * cPerpDist,
  };

  // Use the constrained points for transform calculation
  const pts = {
    A: points.A,
    B: points.B,
    C: constrainedC,
  };

  const u1 = base.B.x - base.A.x;
  const u2 = base.B.y - base.A.y;
  const v1 = base.C.x - base.A.x;
  const v2 = base.C.y - base.A.y;

  const p1 = pts.B.x - pts.A.x;
  const p2 = pts.B.y - pts.A.y;
  const q1 = pts.C.x - pts.A.x;
  const q2 = pts.C.y - pts.A.y;

  const det = u1 * v2 - u2 * v1 || 1e-6;

  const a = (p1 * v2 - q1 * u2) / det;
  const b = (q1 * u1 - p1 * v1) / det;
  const d = (p2 * v2 - q2 * u2) / det;
  const e = (q2 * u1 - p2 * v1) / det;

  const tx = points.A.x - a * base.A.x - b * base.A.y;
  const ty = points.A.y - d * base.A.x - e * base.A.y;

  return [
    [a, b, tx],
    [d, e, ty],
  ];
};

// Get screen coordinates from relative control points
export const getControlPoints = (
  points: ControlPoints,
  width: number,
  height: number
) => {
  return {
    A: { x: points.A.x * width, y: points.A.y * height },
    B: { x: points.B.x * width, y: points.B.y * height },
    C: { x: points.C.x * width, y: points.C.y * height },
  };
};

export const screenToGradientPosition = (
  x: number,
  y: number,
  gradientType: GradientType,
  points: ControlPoints,
  width: number,
  height: number
) => {
  const { A, B, C } = getControlPoints(points, width, height);

  if (gradientType === "linear" || gradientType === "radial") {
    // Project onto A-B line for both linear and radial
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    const projX = x - A.x;
    const projY = y - A.y;
    const projection = (projX * dx + projY * dy) / (length * length);

    return Math.max(0, Math.min(1, projection));
  } else {
    // For sweep, use angle around A
    const angle = Math.atan2(y - A.y, x - A.x);
    const baseAngle = Math.atan2(B.y - A.y, B.x - A.x);
    let relativeAngle = angle - baseAngle;

    // Normalize to 0-1
    while (relativeAngle < 0) relativeAngle += 2 * Math.PI;
    while (relativeAngle > 2 * Math.PI) relativeAngle -= 2 * Math.PI;

    return relativeAngle / (2 * Math.PI);
  }
};

export const gradientPositionToScreen = (
  position: number,
  gradientType: GradientType,
  points: ControlPoints,
  width: number,
  height: number
) => {
  const { A, B, C } = getControlPoints(points, width, height);

  if (gradientType === "linear" || gradientType === "radial") {
    // Linear interpolation along A-B line for both linear and radial
    return {
      x: A.x + (B.x - A.x) * position,
      y: A.y + (B.y - A.y) * position,
    };
  } else {
    // For sweep, position on ellipse
    const radiusX = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2)); // A-B distance
    const radiusY = Math.sqrt(Math.pow(C.x - A.x, 2) + Math.pow(C.y - A.y, 2)); // A-C distance

    // Base angle from A-B direction
    const baseAngle = Math.atan2(B.y - A.y, B.x - A.x);
    const angle = baseAngle + position * 2 * Math.PI;

    // Ellipse rotation angle (same as A-B direction)
    const rotationAngle = Math.atan2(B.y - A.y, B.x - A.x);

    // Parametric ellipse equations with rotation
    const cosRot = Math.cos(rotationAngle);
    const sinRot = Math.sin(rotationAngle);
    const cosAngle = Math.cos(angle - baseAngle);
    const sinAngle = Math.sin(angle - baseAngle);

    return {
      x: A.x + radiusX * cosAngle * cosRot - radiusY * sinAngle * sinRot,
      y: A.y + radiusX * cosAngle * sinRot + radiusY * sinAngle * cosRot,
    };
  }
};

export const getStopMarkerTransform = (
  position: number,
  gradientType: GradientType,
  points: ControlPoints,
  width: number,
  height: number,
  stopOffset?: number
) => {
  // Fixed stop offset for consistent physical appearance
  const relativeStopOffset = stopOffset ?? 25;
  const trackPos = gradientPositionToScreen(
    position,
    gradientType,
    points,
    width,
    height
  );
  const { A, B, C } = getControlPoints(points, width, height);

  switch (gradientType) {
    case "linear":
    case "radial": {
      // Position along A-B line with perpendicular offset
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const length = Math.sqrt(dx * dx + dy * dy);

      let perpX = -dy / length;
      let perpY = dx / length;

      if (perpY > 0) {
        perpX = -perpX;
        perpY = -perpY;
      }

      const angle = Math.atan2(-perpY, -perpX) * (180 / Math.PI) + 270;

      return {
        x: trackPos.x + perpX * relativeStopOffset,
        y: trackPos.y + perpY * relativeStopOffset,
        rotation: angle,
      };
    }
    case "sweep": {
      const radiusX = Math.sqrt(
        Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2)
      );
      const radiusY = Math.sqrt(
        Math.pow(C.x - A.x, 2) + Math.pow(C.y - A.y, 2)
      );
      const baseAngle = Math.atan2(B.y - A.y, B.x - A.x) * (180 / Math.PI);
      const currentAngle = baseAngle + position * 360;
      const rotation = ellipseMarkerRotation(
        A.x,
        A.y,
        radiusX,
        radiusY,
        currentAngle,
        baseAngle
      );
      const rad = degToRad(rotation - 90);
      const perpX = Math.cos(rad);
      const perpY = Math.sin(rad);

      return {
        x: trackPos.x + perpX * relativeStopOffset,
        y: trackPos.y + perpY * relativeStopOffset,
        rotation,
      };
    }
  }
};

// Hit detection utilities
export const getDistance = (x1: number, y1: number, x2: number, y2: number) => {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
};

// Helper function to insert a stop in sorted position by offset
export const insertStopInSortedPosition = (
  positions: number[],
  colors: cg.RGBA8888[],
  newPosition: number,
  newColor: cg.RGBA8888
): { positions: number[]; colors: cg.RGBA8888[]; insertedIndex: number } => {
  const newPositions = [...positions];
  const newColors = [...colors];

  // Find the correct position to insert the new stop
  let insertIndex = 0;
  for (let i = 0; i < newPositions.length; i++) {
    if (newPosition > newPositions[i]) {
      insertIndex = i + 1;
    } else {
      break;
    }
  }

  // Insert the stop at the correct position
  newPositions.splice(insertIndex, 0, newPosition);
  newColors.splice(insertIndex, 0, newColor);

  return {
    positions: newPositions,
    colors: newColors,
    insertedIndex: insertIndex,
  };
};

// Helper function to sort stops by offset and return the new index of a specific stop
export const sortStopsByOffset = (
  positions: number[],
  colors: cg.RGBA8888[],
  originalIndex: number
): { positions: number[]; colors: cg.RGBA8888[]; newIndex: number } => {
  const newPositions = [...positions];
  const newColors = [...colors];
  const movedPosition = newPositions[originalIndex];
  const movedColor = newColors[originalIndex];

  // Remove the stop from its current position
  newPositions.splice(originalIndex, 1);
  newColors.splice(originalIndex, 1);

  // Find the correct position to re-insert it
  let newIndex = 0;
  for (let i = 0; i < newPositions.length; i++) {
    if (movedPosition > newPositions[i]) {
      newIndex = i + 1;
    } else {
      break;
    }
  }

  // Insert the stop at the correct position
  newPositions.splice(newIndex, 0, movedPosition);
  newColors.splice(newIndex, 0, movedColor);

  return { positions: newPositions, colors: newColors, newIndex };
};

export const detectHitTarget = (
  x: number,
  y: number,
  controlPoints: ControlPoints,
  positions: number[],
  width: number,
  height: number,
  gradientType: GradientType,
  controlSize?: number,
  stopSize?: number
) => {
  // Calculate relative sizes based on container dimensions
  const relativeControlSize = controlSize ?? Math.min(width, height) * 0.02; // 2% of smaller dimension
  const relativeStopSize = stopSize ?? 18; // Fixed stop size for consistent hit detection
  const { A, B, C } = getControlPoints(controlPoints, width, height);

  // Check control points
  const distA = getDistance(x, y, A.x, A.y);
  const distB = getDistance(x, y, B.x, B.y);
  const distC = getDistance(x, y, C.x, C.y);

  if (distA < relativeControlSize)
    return { type: "control", target: "A", distance: distA };
  if (distB < relativeControlSize)
    return { type: "control", target: "B", distance: distB };
  if (gradientType !== "linear" && distC < relativeControlSize)
    return { type: "control", target: "C", distance: distC };

  // Check stop markers
  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    const markerTransform = getStopMarkerTransform(
      position,
      gradientType,
      controlPoints,
      width,
      height
    );
    const dist = getDistance(x, y, markerTransform.x, markerTransform.y);
    if (dist < relativeStopSize / 2 + Math.min(width, height) * 0.012) {
      return { type: "stop", target: i, distance: dist };
    }
  }

  // Check track for adding new stop
  const gradientPos = screenToGradientPosition(
    x,
    y,
    gradientType,
    controlPoints,
    width,
    height
  );
  const trackPos = gradientPositionToScreen(
    gradientPos,
    gradientType,
    controlPoints,
    width,
    height
  );
  const trackDist = getDistance(x, y, trackPos.x, trackPos.y);

  const relativeHitThreshold =
    gradientType === "sweep"
      ? Math.min(width, height) * 0.05 // 5% for sweep
      : Math.min(width, height) * 0.0375; // 3.75% for linear/radial
  if (
    trackDist < relativeHitThreshold &&
    gradientPos >= 0 &&
    gradientPos <= 1
  ) {
    return { type: "track", position: gradientPos, distance: trackDist };
  }

  return null;
};

// ControlPoints State (already defined as ControlPoints)
// export interface ControlPoints { ... }

// ControlPoints Actions
export type ControlPointsAction =
  | {
      type: "UPDATE_CONTROL_POINT";
      payload: {
        point: "A" | "B" | "C";
        deltaX: number;
        deltaY: number;
        width: number;
        height: number;
        gradientType: GradientType;
      };
    }
  | { type: "SET_CONTROL_POINTS"; payload: ControlPoints };

// ControlPoints Reducer
export function controlPointsReducer(
  state: ControlPoints,
  action: ControlPointsAction
): ControlPoints {
  switch (action.type) {
    case "UPDATE_CONTROL_POINT": {
      const { point, deltaX, deltaY, width, height, gradientType } =
        action.payload;
      const rel = { x: deltaX / width, y: deltaY / height };
      if (gradientType === "linear") {
        return {
          ...state,
          [point]: {
            x: state[point].x + rel.x,
            y: state[point].y + rel.y,
          },
        };
      } else {
        // Copy logic from main reducer for radial/sweep
        const A = state.A;
        const B = state.B;
        const C = state.C;
        if (point === "A") {
          const newA = { x: A.x + rel.x, y: A.y + rel.y };
          const oldLen = Math.hypot(B.x - A.x, B.y - A.y) || 1e-6;
          const newLen = Math.hypot(B.x - newA.x, B.y - newA.y) || 1e-6;
          const ratio = newLen / oldLen;
          const nx = -(B.y - newA.y) / newLen;
          const ny = (B.x - newA.x) / newLen;
          const distAC = Math.hypot(C.x - A.x, C.y - A.y) * ratio;
          return {
            ...state,
            A: newA,
            C: {
              x: newA.x + nx * distAC,
              y: newA.y + ny * distAC,
            },
          };
        } else if (point === "B") {
          const newB = { x: B.x + rel.x, y: B.y + rel.y };
          const oldLen = Math.hypot(B.x - A.x, B.y - A.y) || 1e-6;
          const newLen = Math.hypot(newB.x - A.x, newB.y - A.y) || 1e-6;
          const ratio = newLen / oldLen;
          const nx = -(newB.y - A.y) / newLen;
          const ny = (newB.x - A.x) / newLen;
          const distAC = Math.hypot(C.x - A.x, C.y - A.y) * ratio;
          return {
            ...state,
            B: newB,
            C: {
              x: A.x + nx * distAC,
              y: A.y + ny * distAC,
            },
          };
        } else if (point === "C") {
          // C point should only move perpendicular to A-B axis (scaleY constraint)
          const dx = B.x - A.x;
          const dy = B.y - A.y;
          const len = Math.hypot(dx, dy) || 1e-6;
          const perpX = -dy / len;
          const perpY = dx / len;

          // Project the drag delta onto the perpendicular direction
          const dragDotPerp = rel.x * perpX + rel.y * perpY;

          // Get current distance of C from A along perpendicular direction
          const currentDist = (C.x - A.x) * perpX + (C.y - A.y) * perpY;
          const newDist = currentDist + dragDotPerp;

          return {
            ...state,
            C: {
              x: A.x + perpX * newDist,
              y: A.y + perpY * newDist,
            },
          };
        }
      }
      return state;
    }
    case "SET_CONTROL_POINTS": {
      return { ...action.payload };
    }
    default:
      return state;
  }
}

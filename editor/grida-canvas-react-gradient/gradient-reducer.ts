import { produce } from "immer";
import type cg from "@grida/cg";
import { ellipseMarkerRotation, degToRad } from "./ellipse-utils";

export type GradientType = "linear" | "radial" | "sweep";

export type GradientValue = {
  transform: cg.AffineTransform;
  positions: number[];
  colors: cg.RGBA8888[];
};

export interface GradientTransform {
  // 2D affine transform matrix [[a, b, tx], [d, e, ty]]
  a: number;
  b: number;
  /**
   * A point x (relative coordinate 0-1, can be negative)
   */
  tx: number; //
  d: number;
  e: number;
  /**
   * A point y (relative coordinate 0-1, can be negative)
   */
  ty: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ControlPoints {
  A: Point;
  B: Point;
  C: Point;
}

export interface GradientState {
  controlPoints: ControlPoints;
  transform: GradientTransform;
  positions: number[];
  colors: cg.RGBA8888[];
  focusedStop: number | null;
  focusedControl: "A" | "B" | "C" | null;
  dragState: {
    type: "stop" | "A" | "B" | "C" | null;
    index?: number;
    offset?: { x: number; y: number };
  };
  hoverPreview: {
    position: number;
    screenX: number;
    screenY: number;
  } | null;
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

// Apply affine transform to a relative point
export const applyTransform = (t: GradientTransform, p: Point): Point => {
  return {
    x: t.a * p.x + t.b * p.y + t.tx,
    y: t.d * p.x + t.e * p.y + t.ty,
  };
};

// Convert transform to relative control points
/**
 * Converts an affine transform back into relative control points.
 * The returned points are always normalized so that for radial and
 * sweep gradients the C control remains perpendicular to the A–B axis.
 */
export const getPointsFromTransform = (
  t: GradientTransform,
  gradientType: GradientType
): ControlPoints => {
  const base = getBaseControlPoints(gradientType);
  const A = applyTransform(t, base.A);
  const B = applyTransform(t, base.B);
  let C = applyTransform(t, base.C);

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
): GradientTransform => {
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

    return { a, b, tx, d, e, ty };
  }

  let pts = points;

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

  return { a, b, tx, d, e, ty };
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
  state: GradientState,
  width: number,
  height: number,
  gradientType: GradientType,
  controlSize?: number,
  stopSize?: number
) => {
  // Calculate relative sizes based on container dimensions
  const relativeControlSize = controlSize ?? Math.min(width, height) * 0.02; // 2% of smaller dimension
  const relativeStopSize = stopSize ?? 18; // Fixed stop size for consistent hit detection
  const { A, B, C } = getControlPoints(state.controlPoints, width, height);

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
  for (let i = 0; i < state.positions.length; i++) {
    const position = state.positions[i];
    const markerTransform = getStopMarkerTransform(
      position,
      gradientType,
      state.controlPoints,
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
    state.controlPoints,
    width,
    height
  );
  const trackPos = gradientPositionToScreen(
    gradientPos,
    gradientType,
    state.controlPoints,
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

// Action types
export type GradientAction =
  | {
      type: "SET_TRANSFORM";
      payload: { transform: GradientTransform; gradientType: GradientType };
    }
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
  | { type: "SET_POSITIONS"; payload: number[] }
  | { type: "SET_COLORS"; payload: cg.RGBA8888[] }
  | { type: "ADD_STOP"; payload: { position: number; color: cg.RGBA8888 } }
  | {
      type: "UPDATE_STOP_POSITION";
      payload: { index: number; position: number };
    }
  | {
      type: "UPDATE_STOP_COLOR";
      payload: { index: number; color: cg.RGBA8888 };
    }
  | { type: "REMOVE_STOP"; payload: number }
  | { type: "SET_FOCUSED_STOP"; payload: number | null }
  | { type: "SET_FOCUSED_CONTROL"; payload: "A" | "B" | "C" | null }
  | { type: "SET_DRAG_STATE"; payload: GradientState["dragState"] }
  | { type: "SET_HOVER_PREVIEW"; payload: GradientState["hoverPreview"] }
  | { type: "RESET_FOCUS" }
  | {
      type: "HANDLE_POINTER_DOWN";
      payload: {
        x: number;
        y: number;
        width: number;
        height: number;
        gradientType: GradientType;
      };
    }
  | {
      type: "HANDLE_POINTER_MOVE";
      payload: {
        x: number;
        y: number;
        width: number;
        height: number;
        gradientType: GradientType;
      };
    }
  | { type: "HANDLE_POINTER_UP" }
  | { type: "HANDLE_POINTER_LEAVE" };

const identity: GradientTransform = {
  a: 1,
  b: 0,
  tx: 0,
  d: 0,
  e: 1,
  ty: 0,
};

export function getValue(state: GradientState): GradientValue {
  return {
    positions: state.positions,
    colors: state.colors,
    transform: [
      [state.transform.a, state.transform.b, state.transform.tx],
      [state.transform.d, state.transform.e, state.transform.ty],
    ],
  };
}

// Initial state
export function createInitialState(
  type?: GradientType,
  gradient?: GradientValue
): GradientState {
  if (type && gradient) {
    const transform: GradientTransform = {
      a: gradient.transform[0][0],
      b: gradient.transform[0][1],
      tx: gradient.transform[0][2],
      d: gradient.transform[1][0],
      e: gradient.transform[1][1],
      ty: gradient.transform[1][2],
    };
    return {
      transform,
      controlPoints: getPointsFromTransform(transform, type),
      positions: gradient.positions,
      colors: gradient.colors,
      focusedStop: null,
      focusedControl: null,
      dragState: { type: null },
      hoverPreview: null,
    };
  }
  return {
    transform: identity,
    controlPoints: getPointsFromTransform(identity, type ?? "linear"),
    positions: [0, 1],
    colors: [
      { r: 255, g: 0, b: 0, a: 1 },
      { r: 0, g: 0, b: 255, a: 1 },
    ],
    focusedStop: null,
    focusedControl: null,
    dragState: { type: null },
    hoverPreview: null,
  };
}

// Reducer
export const gradientReducer = (
  state: GradientState,
  action: GradientAction
): GradientState => {
  return produce(state, (draft) => {
    switch (action.type) {
      case "SET_TRANSFORM":
        draft.transform = action.payload.transform;
        draft.controlPoints = getPointsFromTransform(
          action.payload.transform,
          action.payload.gradientType
        );
        break;

      case "UPDATE_CONTROL_POINT": {
        const { point, deltaX, deltaY, width, height, gradientType } =
          action.payload;
        const rel = { x: deltaX / width, y: deltaY / height };

        if (gradientType === "linear") {
          draft.controlPoints[point] = {
            x: draft.controlPoints[point].x + rel.x,
            y: draft.controlPoints[point].y + rel.y,
          };
        } else {
          const A = draft.controlPoints.A;
          const B = draft.controlPoints.B;
          const C = draft.controlPoints.C;

          if (point === "A") {
            const newA = { x: A.x + rel.x, y: A.y + rel.y };
            const oldLen = Math.hypot(B.x - A.x, B.y - A.y) || 1e-6;
            const newLen = Math.hypot(B.x - newA.x, B.y - newA.y) || 1e-6;
            const ratio = newLen / oldLen;
            const nx = -(B.y - newA.y) / newLen;
            const ny = (B.x - newA.x) / newLen;
            const distAC = Math.hypot(C.x - A.x, C.y - A.y) * ratio;
            draft.controlPoints.A = newA;
            draft.controlPoints.C = {
              x: newA.x + nx * distAC,
              y: newA.y + ny * distAC,
            };
          } else if (point === "B") {
            const newB = { x: B.x + rel.x, y: B.y + rel.y };
            const oldLen = Math.hypot(B.x - A.x, B.y - A.y) || 1e-6;
            const newLen = Math.hypot(newB.x - A.x, newB.y - A.y) || 1e-6;
            const ratio = newLen / oldLen;
            const nx = -(newB.y - A.y) / newLen;
            const ny = (newB.x - A.x) / newLen;
            const distAC = Math.hypot(C.x - A.x, C.y - A.y) * ratio;
            draft.controlPoints.B = newB;
            draft.controlPoints.C = {
              x: A.x + nx * distAC,
              y: A.y + ny * distAC,
            };
          } else if (point === "C") {
            const newC = { x: C.x + rel.x, y: C.y + rel.y };
            const dx = B.x - A.x;
            const dy = B.y - A.y;
            const len = Math.hypot(dx, dy) || 1e-6;
            const dist = Math.hypot(newC.x - A.x, newC.y - A.y);
            const nx = -dy / len;
            const ny = dx / len;
            draft.controlPoints.C = {
              x: A.x + nx * dist,
              y: A.y + ny * dist,
            };
          }
        }

        draft.transform = getTransformFromPoints(
          draft.controlPoints,
          gradientType
        );
        break;
      }

      case "SET_POSITIONS":
        draft.positions = action.payload;
        break;

      case "SET_COLORS":
        draft.colors = action.payload;
        break;

      case "ADD_STOP": {
        const {
          positions: newPositions,
          colors: newColors,
          insertedIndex,
        } = insertStopInSortedPosition(
          draft.positions,
          draft.colors,
          action.payload.position,
          action.payload.color
        );
        draft.positions = newPositions;
        draft.colors = newColors;
        // Update focused stop to the newly inserted stop
        draft.focusedStop = insertedIndex;
        break;
      }

      case "UPDATE_STOP_POSITION": {
        const stopIndex = action.payload.index;
        if (stopIndex >= 0 && stopIndex < draft.positions.length) {
          draft.positions[stopIndex] = action.payload.position;
        }
        break;
      }

      case "UPDATE_STOP_COLOR": {
        const stopIndex = action.payload.index;
        if (stopIndex >= 0 && stopIndex < draft.colors.length) {
          draft.colors[stopIndex] = action.payload.color;
        }
        break;
      }

      case "REMOVE_STOP":
        if (draft.positions.length > 2) {
          const indexToRemove = action.payload;
          draft.positions.splice(indexToRemove, 1);
          draft.colors.splice(indexToRemove, 1);
          if (draft.focusedStop === indexToRemove) {
            draft.focusedStop = null;
          } else if (
            draft.focusedStop !== null &&
            draft.focusedStop > indexToRemove
          ) {
            // Adjust focused stop index if it was after the removed stop
            draft.focusedStop--;
          }
        }
        break;

      case "SET_FOCUSED_STOP":
        draft.focusedStop = action.payload;
        if (action.payload !== null) {
          draft.focusedControl = null;
        }
        break;

      case "SET_FOCUSED_CONTROL":
        draft.focusedControl = action.payload;
        if (action.payload) {
          draft.focusedStop = null;
        }
        break;

      case "SET_DRAG_STATE":
        draft.dragState = action.payload;
        break;

      case "SET_HOVER_PREVIEW":
        draft.hoverPreview = action.payload;
        break;

      case "RESET_FOCUS":
        draft.focusedStop = null;
        draft.focusedControl = null;
        break;

      case "HANDLE_POINTER_DOWN": {
        const { x, y, width, height, gradientType } = action.payload;
        const hitTarget = detectHitTarget(
          x,
          y,
          state,
          width,
          height,
          gradientType
        );

        if (hitTarget?.type === "control") {
          const { A, B, C } = getControlPoints(
            draft.controlPoints,
            width,
            height
          );
          const controlPoint = hitTarget.target as "A" | "B" | "C";
          const point = controlPoint === "A" ? A : controlPoint === "B" ? B : C;

          draft.dragState = {
            type: controlPoint,
            offset: { x: x - point.x, y: y - point.y },
          };
          draft.focusedControl = controlPoint;
          draft.focusedStop = null;
        } else if (hitTarget?.type === "stop") {
          const stopIndex = hitTarget.target as number;
          const position = draft.positions[stopIndex];
          if (position !== undefined) {
            const markerTransform = getStopMarkerTransform(
              position,
              gradientType,
              draft.controlPoints,
              width,
              height
            );
            draft.dragState = {
              type: "stop",
              index: stopIndex,
              offset: { x: x - markerTransform.x, y: y - markerTransform.y },
            };
            draft.focusedStop = stopIndex;
            draft.focusedControl = null;
          }
        } else if (
          hitTarget?.type === "track" &&
          hitTarget.position !== undefined
        ) {
          const newPosition = hitTarget.position;
          const newColor: cg.RGBA8888 = { r: 128, g: 128, b: 128, a: 1 };
          const {
            positions: newPositions,
            colors: newColors,
            insertedIndex,
          } = insertStopInSortedPosition(
            draft.positions,
            draft.colors,
            newPosition,
            newColor
          );
          draft.positions = newPositions;
          draft.colors = newColors;
          draft.focusedStop = insertedIndex;
          draft.focusedControl = null;
        } else {
          draft.focusedStop = null;
          draft.focusedControl = null;
        }
        break;
      }

      case "HANDLE_POINTER_MOVE": {
        const { x, y, width, height, gradientType } = action.payload;

        if (draft.dragState.type) {
          const adjustedX = x - (draft.dragState.offset?.x || 0);
          const adjustedY = y - (draft.dragState.offset?.y || 0);

          if (draft.dragState.type === "A") {
            const relativeX = adjustedX / width;
            const relativeY = adjustedY / height;

            if (gradientType === "linear") {
              draft.controlPoints.A.x = relativeX;
              draft.controlPoints.A.y = relativeY;
            } else {
              const A = draft.controlPoints.A;
              const B = draft.controlPoints.B;
              const C = draft.controlPoints.C;
              const newA = { x: relativeX, y: relativeY };
              const oldLen = Math.hypot(B.x - A.x, B.y - A.y) || 1e-6;
              const newLen = Math.hypot(B.x - newA.x, B.y - newA.y) || 1e-6;
              const ratio = newLen / oldLen;
              const nx = -(B.y - newA.y) / newLen;
              const ny = (B.x - newA.x) / newLen;
              const distAC = Math.hypot(C.x - A.x, C.y - A.y) * ratio;
              draft.controlPoints.A = newA;
              draft.controlPoints.C = {
                x: newA.x + nx * distAC,
                y: newA.y + ny * distAC,
              };
            }

            draft.transform = getTransformFromPoints(
              draft.controlPoints,
              gradientType
            );
          } else if (draft.dragState.type === "B") {
            const relativeX = adjustedX / width;
            const relativeY = adjustedY / height;

            if (gradientType === "linear") {
              draft.controlPoints.B.x = relativeX;
              draft.controlPoints.B.y = relativeY;
            } else {
              const A = draft.controlPoints.A;
              const B = draft.controlPoints.B;
              const C = draft.controlPoints.C;
              const newB = { x: relativeX, y: relativeY };
              const oldLen = Math.hypot(B.x - A.x, B.y - A.y) || 1e-6;
              const newLen = Math.hypot(newB.x - A.x, newB.y - A.y) || 1e-6;
              const ratio = newLen / oldLen;
              const nx = -(newB.y - A.y) / newLen;
              const ny = (newB.x - A.x) / newLen;
              const distAC = Math.hypot(C.x - A.x, C.y - A.y) * ratio;
              draft.controlPoints.B = newB;
              draft.controlPoints.C = {
                x: A.x + nx * distAC,
                y: A.y + ny * distAC,
              };
            }

            draft.transform = getTransformFromPoints(
              draft.controlPoints,
              gradientType
            );
          } else if (draft.dragState.type === "C") {
            const relativeX = adjustedX / width;
            const relativeY = adjustedY / height;

            if (gradientType === "linear") {
              draft.controlPoints.C.x = relativeX;
              draft.controlPoints.C.y = relativeY;
            } else {
              const A = draft.controlPoints.A;
              const B = draft.controlPoints.B;
              const dx = B.x - A.x;
              const dy = B.y - A.y;
              const len = Math.hypot(dx, dy) || 1e-6;
              const dist = Math.hypot(relativeX - A.x, relativeY - A.y);
              const nx = -dy / len;
              const ny = dx / len;
              draft.controlPoints.C = {
                x: A.x + nx * dist,
                y: A.y + ny * dist,
              };
            }

            draft.transform = getTransformFromPoints(
              draft.controlPoints,
              gradientType
            );
          } else if (
            draft.dragState.type === "stop" &&
            draft.dragState.index !== undefined
          ) {
            const newPosition = screenToGradientPosition(
              adjustedX,
              adjustedY,
              gradientType,
              draft.controlPoints,
              width, // Pass actual width
              height // Pass actual height
            );
            const stopIndex = draft.dragState.index;
            if (stopIndex >= 0 && stopIndex < draft.positions.length) {
              draft.positions[stopIndex] = newPosition;
            }
          }

          draft.hoverPreview = null;
        } else {
          // Show hover preview
          const { A, B, C } = getControlPoints(
            draft.controlPoints,
            width,
            height
          );
          let hoveringOverControl = false;

          // Check if hovering over controls
          const distA = getDistance(x, y, A.x, A.y);
          const distB = getDistance(x, y, B.x, B.y);
          const distC = getDistance(x, y, C.x, C.y);

          const relativeControlHoverSize = Math.min(width, height) * 0.0375; // 3.75% of smaller dimension
          if (
            distA < relativeControlHoverSize ||
            distB < relativeControlHoverSize ||
            (gradientType !== "linear" && distC < relativeControlHoverSize)
          ) {
            hoveringOverControl = true;
          }

          // Check existing stops
          if (!hoveringOverControl) {
            for (let i = 0; i < draft.positions.length; i++) {
              const position = draft.positions[i];
              const markerTransform = getStopMarkerTransform(
                position,
                gradientType,
                draft.controlPoints,
                width,
                height
              );
              const dist = getDistance(
                x,
                y,
                markerTransform.x,
                markerTransform.y
              );
              const relativeStopHoverSize = 18 / 2 + 10; // Fixed stop hover size
              if (dist < relativeStopHoverSize) {
                hoveringOverControl = true;
                break;
              }
            }
          }

          if (!hoveringOverControl) {
            const gradientPos = screenToGradientPosition(
              x,
              y,
              gradientType,
              draft.controlPoints,
              width,
              height
            );
            const trackPos = gradientPositionToScreen(
              gradientPos,
              gradientType,
              draft.controlPoints,
              width,
              height
            );
            const trackDist = getDistance(x, y, trackPos.x, trackPos.y);

            // Use a larger hit area for elliptical tracks (sweep only)
            const relativeTrackHitThreshold =
              gradientType === "sweep"
                ? Math.min(width, height) * 0.05 // 5% for sweep
                : Math.min(width, height) * 0.0375; // 3.75% for linear/radial

            if (
              trackDist < relativeTrackHitThreshold &&
              gradientPos >= 0 &&
              gradientPos <= 1
            ) {
              draft.hoverPreview = {
                position: gradientPos,
                screenX: trackPos.x,
                screenY: trackPos.y,
              };
            } else {
              draft.hoverPreview = null;
            }
          } else {
            draft.hoverPreview = null;
          }
        }
        break;
      }

      case "HANDLE_POINTER_UP": {
        // If we were dragging a stop, sort the stops to maintain order
        if (
          draft.dragState.type === "stop" &&
          draft.dragState.index !== undefined
        ) {
          const originalIndex = draft.dragState.index;
          const {
            positions: sortedPositions,
            colors: sortedColors,
            newIndex,
          } = sortStopsByOffset(draft.positions, draft.colors, originalIndex);
          draft.positions = sortedPositions;
          draft.colors = sortedColors;
          // Update focused stop to the new position
          draft.focusedStop = newIndex;
        }
        draft.dragState = { type: null };
        break;
      }

      case "HANDLE_POINTER_LEAVE":
        draft.hoverPreview = null;
        break;
    }
  });
};

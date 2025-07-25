import { produce } from "immer";
import type cg from "@grida/cg";
import { ellipseMarkerRotation, degToRad } from "./ellipse-utils";

export type GradientType = "linear" | "radial" | "sweep";

export type GradientValue = {
  transform: cg.AffineTransform;
  stops: cg.GradientStop[];
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
  stops: cg.GradientStop[];
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
export const getPointsFromTransform = (
  t: GradientTransform,
  gradientType: GradientType
): ControlPoints => {
  const base = getBaseControlPoints(gradientType);
  const A = applyTransform(t, base.A);
  const B = applyTransform(t, base.B);
  let C = applyTransform(t, base.C);

  if (gradientType === "linear") {
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const px = -dy / len;
    const py = dx / len;
    C = {
      x: A.x + px * (len * 0.5),
      y: A.y + py * (len * 0.5),
    };
  }

  return { A, B, C };
};

// Compute transform from control points
export const getTransformFromPoints = (
  points: ControlPoints,
  gradientType: GradientType
): GradientTransform => {
  const base = getBaseControlPoints(gradientType);

  let pts = points;

  if (gradientType === "linear") {
    const dx = points.B.x - points.A.x;
    const dy = points.B.y - points.A.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const px = -dy / len;
    const py = dx / len;
    pts = {
      A: points.A,
      B: points.B,
      C: {
        x: points.A.x + px * (len * 0.5),
        y: points.A.y + py * (len * 0.5),
      },
    };
  }

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
  stops: cg.GradientStop[],
  newStop: cg.GradientStop
): { stops: cg.GradientStop[]; insertedIndex: number } => {
  const newStops = [...stops];

  // Find the correct position to insert the new stop
  let insertIndex = 0;
  for (let i = 0; i < newStops.length; i++) {
    if (newStop.offset > newStops[i].offset) {
      insertIndex = i + 1;
    } else {
      break;
    }
  }

  // Insert the stop at the correct position
  newStops.splice(insertIndex, 0, newStop);

  return { stops: newStops, insertedIndex: insertIndex };
};

// Helper function to sort stops by offset and return the new index of a specific stop
export const sortStopsByOffset = (
  stops: cg.GradientStop[],
  originalIndex: number
): { stops: cg.GradientStop[]; newIndex: number } => {
  const newStops = [...stops];
  const movedStop = newStops[originalIndex];

  // Remove the stop from its current position
  newStops.splice(originalIndex, 1);

  // Find the correct position to re-insert it
  let newIndex = 0;
  for (let i = 0; i < newStops.length; i++) {
    if (movedStop.offset > newStops[i].offset) {
      newIndex = i + 1;
    } else {
      break;
    }
  }

  // Insert the stop at the correct position
  newStops.splice(newIndex, 0, movedStop);

  return { stops: newStops, newIndex };
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
  for (let i = 0; i < state.stops.length; i++) {
    const stop = state.stops[i];
    const markerTransform = getStopMarkerTransform(
      stop.offset,
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
  | { type: "SET_STOPS"; payload: cg.GradientStop[] }
  | { type: "ADD_STOP"; payload: cg.GradientStop }
  | {
      type: "UPDATE_STOP";
      payload: { index: number; updates: Partial<cg.GradientStop> };
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
    stops: state.stops,
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
      stops: gradient.stops,
      focusedStop: null,
      focusedControl: null,
      dragState: { type: null },
      hoverPreview: null,
    };
  }
  return {
    transform: identity,
    controlPoints: getPointsFromTransform(identity, type ?? "linear"),
    stops: [
      { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } }, // Changed to cg.GradientStop format
      { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } }, // Changed to cg.GradientStop format
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
        const cp = draft.controlPoints[point];
        const next = {
          x: cp.x + deltaX / width,
          y: cp.y + deltaY / height,
        };
        draft.controlPoints[point] = next;

        if (gradientType !== "linear") {
          if (point === "B") {
            const A = draft.controlPoints.A;
            const B = draft.controlPoints.B;
            const dx = B.x - A.x;
            const dy = B.y - A.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
            const px = -dy / len;
            const py = dx / len;
            const AC = {
              x: draft.controlPoints.C.x - A.x,
              y: draft.controlPoints.C.y - A.y,
            };
            const distAC = Math.sqrt(AC.x * AC.x + AC.y * AC.y);
            draft.controlPoints.C.x = A.x + px * distAC;
            draft.controlPoints.C.y = A.y + py * distAC;
          } else if (point === "C") {
            const A = draft.controlPoints.A;
            const B = draft.controlPoints.B;
            const dx = B.x - A.x;
            const dy = B.y - A.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
            const px = -dy / len;
            const py = dx / len;
            const dist = Math.sqrt(
              Math.pow(draft.controlPoints.C.x - A.x, 2) +
                Math.pow(draft.controlPoints.C.y - A.y, 2)
            );
            draft.controlPoints.C.x = A.x + px * dist;
            draft.controlPoints.C.y = A.y + py * dist;
          }
        }
        draft.transform = getTransformFromPoints(
          draft.controlPoints,
          gradientType
        );
        break;
      }

      case "SET_STOPS":
        draft.stops = action.payload;
        break;

      case "ADD_STOP": {
        const { stops: newStops, insertedIndex } = insertStopInSortedPosition(
          draft.stops,
          action.payload
        );
        draft.stops = newStops;
        // Update focused stop to the newly inserted stop
        draft.focusedStop = insertedIndex;
        break;
      }

      case "UPDATE_STOP": {
        const stopIndex = action.payload.index;
        if (stopIndex >= 0 && stopIndex < draft.stops.length) {
          draft.stops[stopIndex] = {
            ...draft.stops[stopIndex],
            ...action.payload.updates,
          };
        }
        break;
      }

      case "REMOVE_STOP":
        if (draft.stops.length > 2) {
          const indexToRemove = action.payload;
          draft.stops.splice(indexToRemove, 1);
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
          const stop = draft.stops[stopIndex];
          if (stop) {
            const markerTransform = getStopMarkerTransform(
              stop.offset,
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
          const newStop: cg.GradientStop = {
            offset: hitTarget.position, // Changed from position to offset
            color: { r: 128, g: 128, b: 128, a: 1 }, // Changed to RGBA8888 format
          };
          const { stops: newStops, insertedIndex } = insertStopInSortedPosition(
            draft.stops,
            newStop
          );
          draft.stops = newStops;
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
            // Convert absolute pixel coordinates to relative coordinates
            const relativeX = adjustedX / width;
            const relativeY = adjustedY / height;
            draft.controlPoints.A.x = relativeX;
            draft.controlPoints.A.y = relativeY;
            draft.transform = getTransformFromPoints(
              draft.controlPoints,
              gradientType
            );
          } else if (draft.dragState.type === "B") {
            const relativeX = adjustedX / width;
            const relativeY = adjustedY / height;
            draft.controlPoints.B.x = relativeX;
            draft.controlPoints.B.y = relativeY;

            if (gradientType !== "linear") {
              const A = draft.controlPoints.A;
              const B = draft.controlPoints.B;
              const dx = B.x - A.x;
              const dy = B.y - A.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
              const px = -dy / len;
              const py = dx / len;
              const AC = {
                x: draft.controlPoints.C.x - A.x,
                y: draft.controlPoints.C.y - A.y,
              };
              const distAC = Math.sqrt(AC.x * AC.x + AC.y * AC.y);
              draft.controlPoints.C.x = A.x + px * distAC;
              draft.controlPoints.C.y = A.y + py * distAC;
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
              const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
              const px = -dy / len;
              const py = dx / len;
              const dist = Math.sqrt(
                Math.pow(relativeX - A.x, 2) + Math.pow(relativeY - A.y, 2)
              );
              draft.controlPoints.C.x = A.x + px * dist;
              draft.controlPoints.C.y = A.y + py * dist;
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
            if (stopIndex >= 0 && stopIndex < draft.stops.length) {
              draft.stops[stopIndex].offset = newPosition; // Changed from position to offset
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
            for (let i = 0; i < draft.stops.length; i++) {
              const stop = draft.stops[i];
              const markerTransform = getStopMarkerTransform(
                stop.offset,
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
          const { stops: sortedStops, newIndex } = sortStopsByOffset(
            draft.stops,
            originalIndex
          );
          draft.stops = sortedStops;
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

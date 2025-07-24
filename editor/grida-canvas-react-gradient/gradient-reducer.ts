import { produce } from "immer";
import type cg from "@grida/cg";

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

export interface GradientState {
  gradientType: GradientType;
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

// Utility functions for calculations
export const getControlPoints = (
  transform: GradientTransform,
  width: number,
  height: number
) => {
  // Convert relative coordinates (0-1) to absolute pixel coordinates
  const A = { x: transform.tx * width, y: transform.ty * height };

  // B point: A + (a, d) * scale - controls rotation and main radius
  const scale = 100; // Base scale for visualization
  const B = {
    x: A.x + transform.a * scale,
    y: A.y + transform.d * scale,
  };

  // C point: Always perpendicular to A-B line, distance controlled by (b, e)
  // Calculate perpendicular direction to A-B
  const abLength = Math.sqrt(
    transform.a * transform.a + transform.d * transform.d
  );
  if (abLength === 0) {
    // Fallback if A and B are at same position
    return { A, B, C: { x: A.x, y: A.y - scale } };
  }

  // Perpendicular unit vector (90° rotation of A-B direction)
  const perpX = -transform.d / abLength;
  const perpY = transform.a / abLength;

  // C distance from transform.b and transform.e (should represent the same distance)
  const cDistance =
    Math.sqrt(transform.b * transform.b + transform.e * transform.e) * scale;

  const C = {
    x: A.x + perpX * cDistance,
    y: A.y + perpY * cDistance,
  };

  return { A, B, C };
};

export const screenToGradientPosition = (
  x: number,
  y: number,
  gradientType: GradientType,
  transform: GradientTransform,
  width: number,
  height: number
) => {
  const { A, B, C } = getControlPoints(transform, width, height);

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
  transform: GradientTransform,
  width: number,
  height: number
) => {
  const { A, B, C } = getControlPoints(transform, width, height);

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
  transform: GradientTransform,
  width: number,
  height: number,
  stopOffset: number = 25
) => {
  const trackPos = gradientPositionToScreen(
    position,
    gradientType,
    transform,
    width,
    height
  );
  const { A } = getControlPoints(transform, width, height);

  if (gradientType === "linear" || gradientType === "radial") {
    // Same logic for both linear and radial - position along A-B line
    const { B } = getControlPoints(transform, width, height);
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
      x: trackPos.x + perpX * stopOffset,
      y: trackPos.y + perpY * stopOffset,
      rotation: angle,
    };
  } else {
    // For sweep, position radially outward from center
    const angle = Math.atan2(trackPos.y - A.y, trackPos.x - A.x);
    const perpX = Math.cos(angle);
    const perpY = Math.sin(angle);

    return {
      x: trackPos.x + perpX * stopOffset,
      y: trackPos.y + perpY * stopOffset,
      rotation: angle * (180 / Math.PI) + 90,
    };
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
  controlSize: number = 8,
  stopSize: number = 18
) => {
  const { A, B, C } = getControlPoints(state.transform, width, height);

  // Check control points
  const distA = getDistance(x, y, A.x, A.y);
  const distB = getDistance(x, y, B.x, B.y);
  const distC = getDistance(x, y, C.x, C.y);

  if (distA < controlSize)
    return { type: "control", target: "A", distance: distA };
  if (distB < controlSize)
    return { type: "control", target: "B", distance: distB };
  if (distC < controlSize)
    return { type: "control", target: "C", distance: distC };

  // Check stop markers
  for (let i = 0; i < state.stops.length; i++) {
    const stop = state.stops[i];
    const markerTransform = getStopMarkerTransform(
      stop.offset, // Changed from position to offset
      state.gradientType,
      state.transform,
      width,
      height
    );
    const dist = getDistance(x, y, markerTransform.x, markerTransform.y);
    if (dist < stopSize / 2 + 5) {
      return { type: "stop", target: i, distance: dist };
    }
  }

  // Check track for adding new stop
  const gradientPos = screenToGradientPosition(
    x,
    y,
    state.gradientType,
    state.transform,
    width,
    height
  );
  const trackPos = gradientPositionToScreen(
    gradientPos,
    state.gradientType,
    state.transform,
    width,
    height
  );
  const trackDist = getDistance(x, y, trackPos.x, trackPos.y);

  const hitThreshold = state.gradientType === "sweep" ? 20 : 15;
  if (trackDist < hitThreshold && gradientPos >= 0 && gradientPos <= 1) {
    return { type: "track", position: gradientPos, distance: trackDist };
  }

  return null;
};

// Action types
export type GradientAction =
  | { type: "SET_GRADIENT_TYPE"; payload: GradientType }
  | { type: "SET_TRANSFORM"; payload: GradientTransform }
  | {
      type: "UPDATE_CONTROL_POINT";
      payload: {
        point: "A" | "B" | "C";
        deltaX: number;
        deltaY: number;
        width: number;
        height: number;
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
      };
    }
  | {
      type: "HANDLE_POINTER_MOVE";
      payload: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }
  | { type: "HANDLE_POINTER_UP" }
  | { type: "HANDLE_POINTER_LEAVE" };

const identity: GradientTransform = {
  a: 1,
  b: 0,
  tx: 0.5,
  d: 0,
  e: 1,
  ty: 0.5,
};

// Initial state
export const createInitialState = (): GradientState => ({
  gradientType: "linear",
  transform: identity,
  stops: [
    { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } }, // Changed to cg.GradientStop format
    { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } }, // Changed to cg.GradientStop format
  ],
  focusedStop: null,
  focusedControl: null,
  dragState: { type: null },
  hoverPreview: null,
});

// Reducer
export const gradientReducer = (
  state: GradientState,
  action: GradientAction
): GradientState => {
  return produce(state, (draft) => {
    switch (action.type) {
      case "SET_GRADIENT_TYPE":
        draft.gradientType = action.payload;
        break;

      case "SET_TRANSFORM":
        draft.transform = action.payload;
        break;

      case "UPDATE_CONTROL_POINT": {
        const { point, deltaX, deltaY, width, height } = action.payload;
        const scale = 100;

        switch (point) {
          case "A":
            // Convert pixel deltas to relative deltas
            const relativeDeltaX = deltaX / width;
            const relativeDeltaY = deltaY / height;

            draft.transform.tx = Math.max(
              -0.5, // Allow negative values as requested
              Math.min(1.5, draft.transform.tx + relativeDeltaX) // Allow values beyond 1
            );
            draft.transform.ty = Math.max(
              -0.5, // Allow negative values as requested
              Math.min(1.5, draft.transform.ty + relativeDeltaY) // Allow values beyond 1
            );
            break;

          case "B": {
            // B controls both rotation and overall scale (both X and Y)
            const currentDistanceB = Math.sqrt(
              Math.pow(draft.transform.a, 2) + Math.pow(draft.transform.d, 2)
            );

            // Calculate new A-B vector
            const newA = deltaX / scale;
            const newD = deltaY / scale;
            const newDistanceB = Math.sqrt(
              Math.pow(newA, 2) + Math.pow(newD, 2)
            );

            // Scale factor
            const scaleFactor = newDistanceB / currentDistanceB;

            // Scale C proportionally while maintaining its perpendicular direction
            draft.transform.a = newA;
            draft.transform.d = newD;
            draft.transform.b = draft.transform.b * scaleFactor;
            draft.transform.e = draft.transform.e * scaleFactor;
            break;
          }

          case "C": {
            // C is constrained to perpendicular direction of A-B
            const abLength = Math.sqrt(
              draft.transform.a * draft.transform.a +
                draft.transform.d * draft.transform.d
            );
            if (abLength > 0) {
              // Perpendicular unit vector
              const perpX = -draft.transform.d / abLength;
              const perpY = draft.transform.a / abLength;

              // Project the delta onto the perpendicular direction
              const projectedDelta = deltaX * perpX + deltaY * perpY;

              // Current C distance
              const currentCDistance = Math.sqrt(
                draft.transform.b * draft.transform.b +
                  draft.transform.e * draft.transform.e
              );
              const newCDistance = Math.max(
                0.1,
                currentCDistance + projectedDelta / scale
              );

              // Update b and e to maintain perpendicular direction with new distance
              draft.transform.b = perpX * newCDistance;
              draft.transform.e = perpY * newCDistance;
            }
            break;
          }
        }
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
        const { x, y, width, height } = action.payload;
        const hitTarget = detectHitTarget(x, y, state, width, height);

        if (hitTarget?.type === "control") {
          const { A, B, C } = getControlPoints(draft.transform, width, height);
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
              stop.offset, // Changed from position to offset
              draft.gradientType,
              draft.transform,
              width, // Pass actual width
              height // Pass actual height
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
        const { x, y, width, height } = action.payload;

        if (draft.dragState.type) {
          const adjustedX = x - (draft.dragState.offset?.x || 0);
          const adjustedY = y - (draft.dragState.offset?.y || 0);

          if (draft.dragState.type === "A") {
            // Convert absolute pixel coordinates to relative coordinates
            const relativeX = adjustedX / width;
            const relativeY = adjustedY / height;

            draft.transform.tx = Math.max(
              -0.5, // Allow negative values as requested
              Math.min(1.5, relativeX) // Allow values beyond 1
            );
            draft.transform.ty = Math.max(
              -0.5, // Allow negative values as requested
              Math.min(1.5, relativeY) // Allow values beyond 1
            );
          } else if (draft.dragState.type === "B") {
            const { A } = getControlPoints(draft.transform, width, height);
            const scale = 100;

            // Calculate current distances
            const currentDistanceB = Math.sqrt(
              Math.pow(draft.transform.a, 2) + Math.pow(draft.transform.d, 2)
            );

            // Calculate new A-B vector
            const newA = (adjustedX - A.x) / scale;
            const newD = (adjustedY - A.y) / scale;
            const newDistanceB = Math.sqrt(newA * newA + newD * newD);

            // Scale factor
            const scaleFactor = newDistanceB / currentDistanceB;

            draft.transform.a = newA;
            draft.transform.d = newD;
            draft.transform.b = (draft.transform.b || 0) * scaleFactor;
            draft.transform.e = (draft.transform.e || 0) * scaleFactor;
          } else if (draft.dragState.type === "C") {
            const { A } = getControlPoints(draft.transform, width, height);

            // Calculate A-B direction for perpendicular constraint
            const abLength = Math.sqrt(
              draft.transform.a * draft.transform.a +
                draft.transform.d * draft.transform.d
            );
            if (abLength > 0) {
              // Perpendicular unit vector
              const perpX = -draft.transform.d / abLength;
              const perpY = draft.transform.a / abLength;

              // Vector from A to mouse position
              const mouseX = adjustedX - A.x;
              const mouseY = adjustedY - A.y;

              // Project onto perpendicular direction
              const projectedDistance = mouseX * perpX + mouseY * perpY;
              const clampedDistance = Math.max(10, Math.abs(projectedDistance)); // Minimum distance

              // Maintain direction (positive or negative)
              const finalDistance =
                projectedDistance >= 0 ? clampedDistance : -clampedDistance;

              const scale = 100;
              draft.transform.b = (perpX * finalDistance) / scale;
              draft.transform.e = (perpY * finalDistance) / scale;
            }
          } else if (
            draft.dragState.type === "stop" &&
            draft.dragState.index !== undefined
          ) {
            const newPosition = screenToGradientPosition(
              adjustedX,
              adjustedY,
              draft.gradientType,
              draft.transform,
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
          const { A, B, C } = getControlPoints(draft.transform, width, height);
          let hoveringOverControl = false;

          // Check if hovering over controls
          const distA = getDistance(x, y, A.x, A.y);
          const distB = getDistance(x, y, B.x, B.y);
          const distC = getDistance(x, y, C.x, C.y);

          if (distA < 15 || distB < 15 || distC < 15) {
            hoveringOverControl = true;
          }

          // Check existing stops
          if (!hoveringOverControl) {
            for (let i = 0; i < draft.stops.length; i++) {
              const stop = draft.stops[i];
              const markerTransform = getStopMarkerTransform(
                stop.offset, // Changed from position to offset
                draft.gradientType,
                draft.transform,
                width, // Pass actual width
                height // Pass actual height
              );
              const dist = getDistance(
                x,
                y,
                markerTransform.x,
                markerTransform.y
              );
              if (dist < 18 / 2 + 10) {
                hoveringOverControl = true;
                break;
              }
            }
          }

          if (!hoveringOverControl) {
            const gradientPos = screenToGradientPosition(
              x,
              y,
              draft.gradientType,
              draft.transform,
              width, // Pass actual width
              height // Pass actual height
            );
            const trackPos = gradientPositionToScreen(
              gradientPos,
              draft.gradientType,
              draft.transform,
              width, // Pass actual width
              height // Pass actual height
            );
            const trackDist = getDistance(x, y, trackPos.x, trackPos.y);

            // Use a larger hit area for elliptical tracks (sweep only)
            const hitThreshold = draft.gradientType === "sweep" ? 20 : 15;

            if (
              trackDist < hitThreshold &&
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

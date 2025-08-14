import { type Draft } from "immer";

import type {
  EditorEventTarget_PointerMove,
  EditorEventTarget_PointerDown,
  EditorEventTarget_Drag,
  EditorVariableWidthAddStopAction,
} from "../action";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";
import assert from "assert";
import { self_updateVariableWidthSnappedP } from "./methods/vector";
import { threshold } from "./tools/snap";
import cmath from "@grida/cmath";
import vn from "@grida/vn";
import type { ReducerContext } from ".";

/**
 * Computes segment snapping for variable width content edit mode.
 *
 * This function calculates the parametric position on the closest segment
 * when the pointer is close enough to snap to it. Unlike vector edit mode,
 * this doesn't rely on UI hover state and computes snapping for all segments.
 *
 * @param draft - The editor state draft to modify
 * @param logical_pos - The logical pointer position in canvas space
 * @param rect - The node's absolute bounding rectangle
 * @param node - The vector node being edited
 */
function __self_compute_variable_width_segment_snapping<
  S extends editor.state.IEditorState,
>(
  draft: Draft<S>,
  logical_pos: cmath.Vector2,
  rect: cmath.Rectangle,
  node: grida.program.nodes.VectorNode
) {
  assert(draft.content_edit_mode?.type === "width");

  // Calculate local point (relative to vector network origin)
  const local_point = cmath.vector2.sub(logical_pos, [rect.x, rect.y]);

  const { segments, vertices } = node.vectorNetwork;
  let closest_segment: vn.EvaluatedPointOnSegment | null = null;
  let closest_distance = Infinity;

  // Check all segments to find the closest one within threshold
  for (
    let segment_index = 0;
    segment_index < segments.length;
    segment_index++
  ) {
    const segment = segments[segment_index];
    const a = vertices[segment.a];
    const b = vertices[segment.b];
    const ta = segment.ta;
    const tb = segment.tb;

    // Project the point onto the segment
    const t = cmath.bezier.project(a, b, ta, tb, local_point);

    // Evaluate the curve at the projected parametric value
    const parametricPoint = cmath.bezier.evaluate(a, b, ta, tb, t);

    // Calculate distance to the projected point
    const distance = cmath.vector2.distance(local_point, parametricPoint);

    // Check if within threshold and closer than previous closest
    const segment_snap_threshold = threshold(10, draft.transform);
    if (distance <= segment_snap_threshold && distance < closest_distance) {
      closest_distance = distance;
      closest_segment = {
        segment: segment_index,
        t,
        point: parametricPoint,
      };
    }
  }

  // Update the snapped segment point
  self_updateVariableWidthSnappedP(draft, closest_segment);
}

export function on_pointer_move(
  draft: editor.state.IEditorState,
  canvas_space_pointer_position: cmath.Vector2,
  context: ReducerContext
) {
  assert(draft.content_edit_mode?.type === "width");
  const { node_id } = draft.content_edit_mode;

  const logical_pos = canvas_space_pointer_position;
  draft.pointer.logical = logical_pos;

  const node = dq.__getNodeById(
    draft,
    node_id
  ) as grida.program.nodes.VectorNode;
  const rect = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;

  // Compute segment snapping for variable width content edit mode
  // This is purely mathematical and doesn't rely on UI hover state
  __self_compute_variable_width_segment_snapping(
    draft,
    logical_pos,
    rect,
    node
  );
}

/**
 * Handles variable width tool pointer down events
 */
export function on_pointer_down(
  draft: editor.state.IEditorState,
  _action: EditorEventTarget_PointerDown,
  _context: ReducerContext
) {
  assert(draft.content_edit_mode?.type === "width");
  const { node_id, snapped_p } = draft.content_edit_mode;

  // If we have a snapped point, add a new stop at that position
  if (snapped_p) {
    // Calculate the parametric position u (0-1) based on the segment and t value
    const node = dq.__getNodeById(
      draft,
      node_id
    ) as grida.program.nodes.VectorNode;

    const { segments } = node.vectorNetwork;
    const totalSegments = segments.length;

    // Convert segment index and t to global u parameter
    const u = (snapped_p.segment + snapped_p.t) / totalSegments;

    // TODO: need to compute the correct initial r at the point, based on its neighbors
    // For now, we will simply be using the middle value of the neighbor, not caring the position diff of them
    const profile = draft.content_edit_mode.variable_width_profile;

    // Find neighboring stops to interpolate radius
    let r = 10; // default radius
    if (profile.stops.length > 0) {
      const insertIndex = profile.stops.findIndex((stop) => stop.u > u);
      const prevIndex =
        insertIndex === -1 ? profile.stops.length - 1 : insertIndex - 1;
      const nextIndex = insertIndex === -1 ? -1 : insertIndex;

      if (
        prevIndex >= 0 &&
        nextIndex >= 0 &&
        nextIndex < profile.stops.length
      ) {
        // Interpolate between two neighbors
        const prevStop = profile.stops[prevIndex];
        const nextStop = profile.stops[nextIndex];
        const t_interp = (u - prevStop.u) / (nextStop.u - prevStop.u);
        r = prevStop.r + t_interp * (nextStop.r - prevStop.r);
      } else if (prevIndex >= 0) {
        // Use previous stop's radius
        r = profile.stops[prevIndex].r;
      } else if (nextIndex >= 0 && nextIndex < profile.stops.length) {
        // Use next stop's radius
        r = profile.stops[nextIndex].r;
      }
    }

    // Dispatch the add-stop action
    const addStopAction: EditorVariableWidthAddStopAction = {
      type: "variable-width/add-stop",
      target: {
        node_id,
        u,
        r,
      },
    };

    // Apply the action directly to the draft
    const { target } = addStopAction;
    const { u: newU, r: newR } = target;

    // Find the correct position to insert the new stop (maintain sorted order by u)
    const insertIndex = profile.stops.findIndex((stop) => stop.u > newU);
    const newStopIndex =
      insertIndex === -1 ? profile.stops.length : insertIndex;

    // Insert the new stop
    profile.stops.splice(newStopIndex, 0, { u: newU, r: newR });

    // Select the newly added stop
    draft.content_edit_mode.variable_width_selected_stop = newStopIndex;

    // Clear the snapped point after using it
    draft.content_edit_mode.snapped_p = null;
  }
}

/**
 * Handles translate-variable-width-stop gesture during drag
 */
export function on_drag_gesture_translate_variable_width_stop(
  draft: editor.state.IEditorState
) {
  assert(draft.content_edit_mode?.type === "width");
  assert(draft.gesture.type === "translate-variable-width-stop");
  const { content_edit_mode } = draft;
  const { movement } = draft.gesture;
  const { initial_stop, stop } = draft.gesture;

  // Simple U parameter update based on horizontal movement
  // Later: this will be replaced with cursor-to-curve projection
  const delta_u = movement[0] / 200; // Scale factor for movement sensitivity
  const new_u = cmath.clamp(initial_stop.u + delta_u, 0, 1);

  // Update the stop
  content_edit_mode.variable_width_profile.stops[stop] = {
    ...initial_stop,
    u: new_u,
  };
}

/**
 * Handles resize-variable-width-stop gesture during drag
 */
export function on_drag_resize_variable_width_stop(
  draft: editor.state.IEditorState
) {
  assert(draft.content_edit_mode?.type === "width");
  assert(draft.gesture.type === "resize-variable-width-stop");
  const { content_edit_mode } = draft;
  const { movement, initial_curve_position, initial_angle } = draft.gesture;
  const { initial_stop, stop, side } = draft.gesture;

  // Get the current cursor position in screen coordinates
  const current_cursor: cmath.Vector2 = [
    initial_curve_position[0] + movement[0],
    initial_curve_position[1] + movement[1],
  ];

  // Calculate the perpendicular direction to the curve
  const perp_angle = initial_angle + Math.PI / 2; // Perpendicular to curve
  const perp_vector: cmath.Vector2 = [
    Math.cos(perp_angle),
    Math.sin(perp_angle),
  ];

  // Calculate the vector from curve position to cursor position
  const to_cursor: cmath.Vector2 = [
    current_cursor[0] - initial_curve_position[0],
    current_cursor[1] - initial_curve_position[1],
  ];

  // Project the to_cursor vector onto the perpendicular direction
  const dot_product =
    to_cursor[0] * perp_vector[0] + to_cursor[1] * perp_vector[1];

  // Apply side-specific direction (left side should be negative projection)
  const signed_r = side === "left" ? -dot_product : dot_product;
  const clamped_r = cmath.clamp(signed_r, 0, 1000); // Min 0, max 1000

  // Update the stop
  content_edit_mode.variable_width_profile.stops[stop] = {
    ...initial_stop,
    r: clamped_r,
  };
}

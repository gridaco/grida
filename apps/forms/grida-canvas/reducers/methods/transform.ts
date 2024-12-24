import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import { self_insertNode } from "./insert";
import { self_deleteNode } from "./delete";
import { document } from "../../document-query";
import { cmath } from "../../cmath";
import { domapi } from "../../domapi";
import { getSnapTargets, snapMovementToObjects } from "../tools/snap";
import nodeTransformReducer from "../node-transform.reducer";
import nodeReducer from "../node.reducer";
import assert from "assert";
import { grida } from "@/grida";

/**
 * maps the resize handle (direction) to the transform origin point (inverse)
 */
const __scale_direction_to_transform_origin_point = {
  nw: "se",
  ne: "sw",
  sw: "ne",
  se: "nw",
  n: "s",
  e: "w",
  s: "n",
  w: "e",
} as const;

/**
 * maps the resize handle (direction) to the mouse movement direction multiplier (inverse)
 */
const __resize_handle_to_mouse_direction_multiplier = {
  nw: [-1, -1] as cmath.Vector2,
  ne: [1, -1] as cmath.Vector2,
  sw: [-1, 1] as cmath.Vector2,
  se: [1, 1] as cmath.Vector2,
  n: [0, -1] as cmath.Vector2,
  e: [1, 0] as cmath.Vector2,
  s: [0, 1] as cmath.Vector2,
  w: [-1, 0] as cmath.Vector2,
} as const;

export function self_update_gesture_transform<S extends IDocumentEditorState>(
  draft: Draft<S>
) {
  if (draft.gesture.type === "idle") return;
  if (draft.gesture.type === "draw") return;
  if (draft.gesture.type === "corner-radius") return;
  if (draft.gesture.type === "nudge") return; // nudge is not a transform gesture - only a virtual gesture
  if (draft.gesture.type === "translate-point") return;
  if (draft.gesture.type === "curve") return;

  switch (draft.gesture.type) {
    case "translate": {
      return __self_update_gesture_transform_translate(draft);
    }
    case "scale": {
      return __self_update_gesture_transform_scale(draft);
    }
    case "rotate": {
      return __self_update_gesture_transform_rotate(draft);
    }
    default:
      throw new Error(
        `Gesture type not supported: ${(draft.gesture as any).type}`
      );
  }
}

function __self_update_gesture_transform_translate(
  draft: Draft<IDocumentEditorState>
) {
  assert(draft.gesture.type === "translate", "Gesture type must be translate");
  const {
    movement: _movement,
    initial_selection,
    initial_rects,
    initial_clone_ids,
    initial_snapshot,
  } = draft.gesture;
  const {
    translate_with_clone,
    tarnslate_with_axis_lock,
    translate_with_hierarchy_change,
  } = draft.gesture_modifiers;

  // TODO: translate_with_clone - move it somewhere else
  // #region [translate_with_clone]
  switch (translate_with_clone) {
    case "on": {
      if (draft.gesture.is_currently_cloned) break;
      draft.gesture.is_currently_cloned = true;
      // if translate with clone is on, switch selection (if not already) to the cloned node
      // while..
      // - reset the original node
      // - update the cloned node

      const clones = initial_selection.map((node_id, i) => {
        const original = initial_snapshot.nodes[node_id];
        const clone = { ...original, id: initial_clone_ids[i] };
        return clone;
      });

      clones.forEach((clone) => {
        self_insertNode(draft, draft.document.root_id, clone);
      });

      // reset the original node
      initial_selection.forEach((node_id, i) => {
        const node = document.__getNodeById(draft, node_id);
        draft.document.nodes[node_id] = nodeTransformReducer(node, {
          type: "position",
          x: initial_rects[i].x,
          y: initial_rects[i].y,
        });
      });

      draft.gesture.selection = initial_clone_ids;
      draft.selection = initial_clone_ids;
      // now, the cloned not will be measured relative to the original selection
      draft.surface_measurement_target = initial_selection;
      draft.surface_measurement_targeting_locked = true;

      break;
    }
    case "off": {
      if (!draft.gesture.is_currently_cloned) break;

      try {
        initial_clone_ids.forEach((clone) => {
          self_deleteNode(draft, clone);
        });
      } catch (e) {}

      draft.gesture.is_currently_cloned = false;
      draft.gesture.selection = initial_selection;
      draft.selection = initial_selection;
      draft.surface_measurement_target = undefined;
      draft.surface_measurement_targeting_locked = false;
      break;
    }
  }
  // #endregion

  const current_selection = draft.gesture.selection;

  // #region [tarnslate_with_axis_lock]
  // axis lock movement with dominant axis
  const adj_movement =
    tarnslate_with_axis_lock === "on"
      ? cmath.ext.movement.axisLockedByDominance(_movement)
      : _movement;
  // #endregion

  // #region [translate_with_hierarchy_change]
  switch (translate_with_hierarchy_change) {
    case "on": {
      // check if the cursor finds a new parent (if it escapes the current parent or enters a new parent)
      const hits = [...draft.surface_raycast_detected_node_ids];
      // filter out the current selection (both original and cloned) and non-container nodes
      // the current selection will always be hit as it moves with the cursor (unless not grouped - but does not matter)
      // both original and cloned nodes are considered as the same node, unless, the cloned node will instantly be moved to the original (if its a container) - this is not the case when clone modifier is turned on after the translate has started, but does not matter.
      // TODO: room for performance improvement - use while loop and break when the first valid dropzone is found
      const possible_parents = hits.filter((node_id) => {
        if (initial_selection.includes(node_id)) return false;
        if (initial_clone_ids.includes(node_id)) return false;
        const node = document.__getNodeById(draft, node_id);
        if (node.type !== "container") return false;
        return true;
      });

      const new_parent_id = possible_parents[0];
      if (!new_parent_id) break; // this is when outside the canvas (this might need to change if we support infinite canvas)

      // TODO: room for improvement - do a selection - parent comparison and handle at once (currently doing each comparison for each node) (this is redundant as if dropzone has changed, it will be changed for all selection)
      let is_parent_changed = false;
      // update the parent of the current selection
      current_selection.forEach((node_id) => {
        //
        //
        const prev_parent_id = document.getParentId(
          draft.document_ctx,
          node_id
        )!;
        if (prev_parent_id === new_parent_id) return;

        is_parent_changed = true;

        // unregister the node from the previous parent
        const parent = document.__getNodeById(
          draft,
          prev_parent_id
        ) as grida.program.nodes.i.IChildren;
        parent.children = parent.children?.filter((id) => id !== node_id);

        // register the node to the new parent
        const new_parent = document.__getNodeById(
          draft,
          new_parent_id
        ) as grida.program.nodes.i.IChildren;
        new_parent.children = new_parent.children ?? [];
        new_parent.children.push(node_id);

        // update the context
        draft.document_ctx = document.Context.from(draft.document).snapshot();
      });

      if (is_parent_changed) draft.dropzone_node_id = new_parent_id;

      break;
    }
    case "off": {
      draft.dropzone_node_id = undefined;
      break;
    }
  }
  // #endregion

  const snap_target_node_ids = getSnapTargets(current_selection, draft);

  const snap_target_node_rects = snap_target_node_ids
    .map((node_id: string) => {
      const r = domapi.get_node_bounding_rect(node_id);
      if (!r) reportError(`Node ${node_id} does not have a bounding rect`);
      return r!;
    })
    .filter(Boolean);

  const { translated, snapping } = snapMovementToObjects(
    initial_rects,
    snap_target_node_rects,
    adj_movement,
    [4, 4]
  );

  draft.gesture.surface_snapping = snapping;

  let i = 0;
  for (const node_id of current_selection) {
    const node = document.__getNodeById(draft, node_id);
    const r = translated[i++];

    const parent_id = document.getParentId(draft.document_ctx, node_id)!;
    const parent_rect = domapi.get_node_bounding_rect(parent_id)!;

    assert(
      parent_rect,
      "Parent rect must be defined : " + parent_id + "/" + node_id
    );

    // the r position is relative to the canvas, we need to convert it to the node's local position
    // absolute to relative => accumulated parent's position
    const relative_position = cmath.vector2.subtract(r.position, [
      parent_rect.x,
      parent_rect.y,
    ]);

    draft.document.nodes[node_id] = nodeTransformReducer(node, {
      type: "position",
      x: relative_position[0],
      y: relative_position[1],
    });
  }
}

function __self_update_gesture_transform_scale(
  draft: Draft<IDocumentEditorState>
) {
  assert(draft.gesture.type === "scale", "Gesture type must be scale");
  const { transform_with_center_origin, transform_with_preserve_aspect_ratio } =
    draft.gesture_modifiers;

  const {
    selection,
    direction,
    movement: rawMovement,
    initial_rects,
  } = draft.gesture;

  const initial_bounding_rectangle = cmath.rect.getBoundingRect(initial_rects);

  // get the origin point based on handle

  const origin =
    transform_with_center_origin === "on"
      ? cmath.rect.center(initial_bounding_rectangle)
      : cmath.rect.getCardinalPoint(
          initial_bounding_rectangle,
          __scale_direction_to_transform_origin_point[direction]
        );

  // inverse the delta based on handle
  const movement = cmath.vector2.multiply(
    __resize_handle_to_mouse_direction_multiplier[direction],
    rawMovement,
    transform_with_center_origin === "on" ? [2, 2] : [1, 1]
  );

  let i = 0;
  for (const node_id of selection) {
    const node = document.__getNodeById(draft, node_id);
    const initial_rect = initial_rects[i++];
    const parent_id = document.getParentId(draft.document_ctx, node_id)!;
    const parent_rect = domapi.get_node_bounding_rect(parent_id)!;

    assert(
      parent_rect,
      "Parent rect must be defined : " + parent_id + "/" + node_id
    );

    // the r position is relative to the canvas, we need to convert it to the node's local position
    const relative_position = cmath.vector2.subtract(
      [initial_rect.x, initial_rect.y],
      [parent_rect.x, parent_rect.y]
    );
    const relative_rect: cmath.Rectangle = {
      x: relative_position[0],
      y: relative_position[1],
      width: initial_rect.width,
      height: initial_rect.height,
    };

    const relative_origin = cmath.vector2.subtract(origin, [
      parent_rect.x,
      parent_rect.y,
    ]);

    draft.document.nodes[node_id] = nodeTransformReducer(node, {
      type: "scale",
      rect: relative_rect,
      origin: relative_origin,
      movement,
      preserveAspectRatio: transform_with_preserve_aspect_ratio === "on",
    });
  }
}

function __self_update_gesture_transform_rotate(
  draft: Draft<IDocumentEditorState>
) {
  assert(draft.gesture.type === "rotate", "Gesture type must be rotate");
  const { movement, selection } = draft.gesture;
  const { rotate_with_quantize } = draft.gesture_modifiers;

  const _angle = cmath.principalAngle(
    // TODO: need to store the initial angle and subtract
    // TODO: get anchor and calculate the offset
    // TODO: translate the movement (distance) relative to the center of the node
    cmath.vector2.angle(cmath.vector2.zero, movement)
  );

  const _user_q =
    typeof rotate_with_quantize === "number" ? rotate_with_quantize : 0;
  // quantize value - even when quantize modifier is off, we still use 0.01 as the default value
  const q = Math.max(0.01, _user_q);
  const angle = cmath.quantize(_angle, q);

  const node = document.__getNodeById(draft, selection);

  draft.document.nodes[selection] = nodeReducer(node, {
    type: "node/change/rotation",
    rotation: angle,
    node_id: selection,
  });
}

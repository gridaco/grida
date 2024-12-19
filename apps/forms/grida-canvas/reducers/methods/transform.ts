import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import { document } from "../../document-query";
import assert from "assert";
import { cmath } from "../../cmath";
import { domapi } from "../../domapi";
import { snapMovementToObjects } from "../tools/snap";
import nodeTransformReducer from "../node-transform.reducer";
import nodeReducer from "../node.reducer";
import { self_insertNode } from "./insert";
import { self_deleteNode } from "./delete";

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
  if (!draft.gesture) return;
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
    case "corner-radius":
    default:
      throw new Error(`Gesture type not supported: ${draft.gesture.type}`);
  }
}

function __self_update_gesture_transform_translate(
  draft: Draft<IDocumentEditorState>
) {
  assert(
    draft.gesture && draft.gesture.type === "translate",
    "Gesture type must be translate"
  );
  const {
    movement: _movement,
    initial_selection,
    initial_rects,
    initial_clone_ids,
    initial_snapshot,
  } = draft.gesture!;
  const { translate_with_clone, tarnslate_with_axis_lock } = draft.modifiers;

  // TODO: translate_with_clone - move it somewhere else
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

  const selection = draft.gesture.selection;

  // set of each sibling and parent of selection
  const snap_target_node_ids = Array.from(
    new Set(
      selection
        .map((node_id) =>
          document
            .getSiblings(draft.document_ctx, node_id)
            .concat(document.getParentId(draft.document_ctx, node_id) ?? [])
        )
        .flat()
    )
  ).filter((node_id) => !selection.includes(node_id));

  const snap_target_node_rects = snap_target_node_ids.map((node_id) => {
    return domapi.get_node_bounding_rect(node_id)!;
  });

  // axis lock movement with dominant axis
  const adj_movement =
    tarnslate_with_axis_lock === "on"
      ? cmath.ext.movement.axisLockedByDominance(_movement)
      : _movement;

  const { translated, snapping } = snapMovementToObjects(
    initial_rects,
    snap_target_node_rects,
    adj_movement
  );

  draft.surface_snapping = snapping;

  let i = 0;
  for (const node_id of selection) {
    const node = document.__getNodeById(draft, node_id);
    const r = translated[i++];

    const parent_rect = domapi.get_node_bounding_rect(
      document.getParentId(draft.document_ctx, node_id)!
    )!;

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
  assert(draft.gesture!.type === "scale", "Gesture type must be scale");
  const { transform_with_center_origin, transform_with_preserve_aspect_ratio } =
    draft.modifiers;

  const {
    selection,
    direction,
    movement: rawMovement,
    initial_rects,
  } = draft.gesture!;

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
    const initial_rect = initial_rects[i++];
    const node = document.__getNodeById(draft, node_id);

    draft.document.nodes[node_id] = nodeTransformReducer(node, {
      type: "scale",
      initial: initial_rect,
      origin,
      movement,
      preserveAspectRatio: transform_with_preserve_aspect_ratio === "on",
    });
  }
}

function __self_update_gesture_transform_rotate(
  draft: Draft<IDocumentEditorState>
) {
  assert(draft.gesture!.type === "rotate", "Gesture type must be rotate");
  const { movement, selection } = draft.gesture!;
  const { rotate_with_quantize } = draft.modifiers;

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

import type { Draft } from "immer";
import { editor } from "@/grida-canvas";
import { self_insertSubDocument } from "./insert";
import { self_try_remove_node } from "./delete";
import cmath from "@grida/cmath";
import { dnd } from "@grida/cmath/_dnd";
import { dq } from "@/grida-canvas/query";
import {
  getSnapTargets,
  snapObjectsTranslation,
  threshold,
} from "../tools/snap";
import { snapObjectsResize } from "../tools/snap-resize";
import updateNodeTransform from "../node-transform.reducer";
import nodeReducer from "../node.reducer";
import assert from "assert";
import grida from "@grida/schema";
import vn from "@grida/vn";
import tree from "@grida/tree";
import { EDITOR_GRAPH_POLICY } from "@/grida-canvas/policy";
import type { ReducerContext } from "..";

/**
 * Determines if a node type allows hierarchy changes during translation.
 * Container nodes and scenes allow children to escape/enter during translation.
 * Group and boolean nodes do not allow hierarchy changes - children must stay within their parent.
 */
function allows_hierarchy_change(
  node_type: grida.program.nodes.NodeType
): boolean {
  switch (node_type) {
    case "scene":
    case "container":
      return true;
    case "group":
    case "boolean":
      return false;
    default:
      return false;
  }
}

export function self_nudge_transform<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  targets: string[],
  dx: number,
  dy: number,
  context: ReducerContext
) {
  // clear the previous surface snapping
  draft.surface_snapping = undefined;

  // for nudge, gesture is not required, but only for surface ux.
  if (draft.gesture.type === "nudge") {
    const snap_target_node_ids = getSnapTargets(draft.selection, draft);
    const snap_target_node_rects = snap_target_node_ids.map(
      (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
    );
    const origin_rects = targets.map(
      (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
    );
    const { snapping } = snapObjectsTranslation(
      origin_rects,
      { objects: snap_target_node_rects },
      [dx, dy],
      editor.config.DEFAULT_SNAP_NUDGE_THRESHOLD
    );
    draft.surface_snapping = snapping;
  }

  for (const node_id of targets) {
    const node = dq.__getNodeById(draft, node_id);
    updateNodeTransform(node, {
      type: "translate",
      dx: dx,
      dy: dy,
    });
  }
}

export function self_update_gesture_transform<
  S extends editor.state.IEditorState,
>(draft: Draft<S>, context: ReducerContext) {
  if (draft.gesture.type === "idle") return;
  if (draft.gesture.type === "draw") return;
  if (draft.gesture.type === "corner-radius") return;
  if (draft.gesture.type === "nudge") return; // nudge is not a transform gesture - only a virtual gesture
  if (draft.gesture.type === "translate-vector-controls") return;
  if (draft.gesture.type === "curve") return;
  if (draft.gesture.type === "gap") return;
  if (draft.gesture.type === "padding") return;
  if (draft.gesture.type === "brush") return;
  if (draft.gesture.type === "guide") return;

  switch (draft.gesture.type) {
    case "translate": {
      return __self_update_gesture_transform_translate(draft, context);
    }
    case "sort": {
      return __self_update_gesture_transform_translate_sort(draft);
    }
    case "insert-and-resize":
    case "scale": {
      return __self_update_gesture_transform_scale(draft, context);
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
  draft: Draft<editor.state.IEditorState>,
  context: ReducerContext
) {
  assert(draft.gesture.type === "translate", "Gesture type must be translate");
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.nodes[
    draft.scene_id
  ] as grida.program.nodes.SceneNode;
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
    translate_with_force_disable_snap: __translate_with_force_disable_snap,
  } = draft.gesture_modifiers;

  const should_snap = __translate_with_force_disable_snap !== "on";

  // TODO: translate_with_clone - move it somewhere else
  // FIXME: this does not respect the hierarchy and relative position
  // #region [translate_with_clone]
  switch (translate_with_clone) {
    case "on": {
      if (draft.gesture.is_currently_cloned) break; // already cloned

      // if translate with clone is on, switch selection (if not already) to the cloned node
      // while..
      // - reset the original node
      // - update the cloned node

      const to_be_cloned = initial_selection.slice();

      to_be_cloned.forEach((original_id, i) => {
        const initial_parent_id = dq.getParentId(
          initial_snapshot.document_ctx,
          original_id
        );

        const parent_id = initial_parent_id;

        const prototype =
          grida.program.nodes.factory.createPrototypeFromSnapshot(
            initial_snapshot.document,
            original_id
          );

        const sub =
          grida.program.nodes.factory.create_packed_scene_document_from_prototype(
            prototype,
            (_, depth) => {
              // the root shall be assigned to reserved id
              if (depth === 0) return initial_clone_ids[i];

              // else, default.
              return context.idgen.next();
            }
          );

        self_insertSubDocument(draft, parent_id, sub);
      });

      // reset the original node (these were previously the selection, moving targets.)
      // FIXME: not only reset the position, but it should also reset the hierarchy. (which current approach cannot handle) (it's more of 'undo')
      // To fix this, we actually need to reset the entire document, and move the clones.
      initial_selection.forEach((node_id, i) => {
        draft.document.nodes[node_id] =
          initial_snapshot.document.nodes[node_id];
      });

      draft.gesture.selection = initial_clone_ids;
      draft.selection = initial_clone_ids;
      // now, the cloned not will be measured relative to the original selection
      draft.surface_measurement_target = initial_selection;
      draft.surface_measurement_targeting_locked = true;

      // set the flag
      draft.gesture.is_currently_cloned = true;
      draft.active_duplication = {
        origins: initial_selection,
        clones: initial_clone_ids,
      };

      break;
    }
    case "off": {
      if (!draft.gesture.is_currently_cloned) break;

      try {
        initial_clone_ids.forEach((clone) => {
          self_try_remove_node(draft, clone);
        });
      } catch (e) {}

      draft.gesture.is_currently_cloned = false;
      draft.gesture.selection = initial_selection;
      draft.selection = initial_selection;
      draft.surface_measurement_target = undefined;
      draft.surface_measurement_targeting_locked = false;
      draft.active_duplication = null;
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
  // FIXME:
  switch (translate_with_hierarchy_change) {
    case "on": {
      // check if the cursor finds a new parent (if it escapes the current parent or enters a new parent)
      const hits = draft.hits.slice();

      // filter out the...
      // 1. current selection (both original and cloned) and children of the current selection, recursive (both original and cloned)
      // 2. non-container nodes
      // the current selection will always be hit as it moves with the cursor (unless not grouped - but does not matter)
      // both original and cloned nodes are considered as the same node, unless, the cloned node will instantly be moved to the original (if its a container) - this is not the case when clone modifier is turned on after the translate has started, but does not matter.

      const hierarchy_ids = [
        ...initial_selection,
        ...initial_selection
          .map((node_id) => dq.getChildren(draft.document_ctx, node_id, true))
          .flat(),
        ...initial_clone_ids,
        ...initial_clone_ids
          .map((node_id) => dq.getChildren(draft.document_ctx, node_id, true))
          .flat(),
      ];

      // TODO: room for performance improvement - use while loop and break when the first valid dropzone is found
      const possible_parents = hits.filter((node_id) => {
        // [1]
        if (hierarchy_ids.includes(node_id)) return false;

        const node = dq.__getNodeById(draft, node_id);
        // [2]
        if (!allows_hierarchy_change(node.type)) return false;

        return true;
      });

      const new_parent_id = possible_parents[0] ?? null;

      // TODO: room for improvement - do a selection - parent comparison and handle at once (currently doing each comparison for each node) (this is redundant as if dropzone has changed, it will be changed for all selection)
      let is_parent_changed = false;
      // update the parent of the current selection
      current_selection.forEach((node_id) => {
        //
        const prev_parent_id = dq.getParentId(draft.document_ctx, node_id);

        // Normalize parent IDs for comparison (null means scene)
        const effective_prev_parent = prev_parent_id ?? draft.scene_id!;
        const effective_new_parent = new_parent_id ?? draft.scene_id!;

        if (effective_prev_parent === effective_new_parent) return;

        // Check if the current parent allows hierarchy changes
        if (prev_parent_id) {
          const current_parent = dq.__getNodeById(draft, prev_parent_id);
          if (!allows_hierarchy_change(current_parent.type)) {
            // Current parent doesn't allow hierarchy changes, so prevent escaping
            return;
          }
        }

        is_parent_changed = true;

        // Use Graph.mv() - mutates draft.document directly (scene is now a node!)
        const graphInstance = new tree.graph.Graph(
          draft.document,
          EDITOR_GRAPH_POLICY
        );

        const target = new_parent_id ?? draft.scene_id!;
        graphInstance.mv(node_id, target);

        // Update context from graph's cached LUT
        draft.document_ctx = graphInstance.lut;
      });

      if (is_parent_changed) {
        draft.dropzone = new_parent_id
          ? { type: "node", node_id: new_parent_id }
          : undefined;
      }

      break;
    }
    case "off": {
      draft.dropzone = undefined;
      break;
    }
  }
  // #endregion

  const snap_target_node_ids = getSnapTargets(current_selection, draft);
  const snap_target_node_rects = snap_target_node_ids
    .map((node_id: string) => {
      const r = context.geometry.getNodeAbsoluteBoundingRect(node_id);
      if (!r) reportError(`Node ${node_id} does not have a bounding rect`);
      return r!;
    })
    .filter(Boolean);

  const { translated, snapping } = snapObjectsTranslation(
    initial_rects,
    {
      objects: snap_target_node_rects,
      guides: draft.ruler === "on" ? scene.guides : undefined,
    },
    adj_movement,
    threshold(
      editor.config.DEFAULT_SNAP_MOVEMNT_THRESHOLD_FACTOR,
      draft.transform
    ),
    should_snap
  );

  draft.surface_snapping = snapping;

  try {
    let i = 0;

    for (const node_id of current_selection) {
      const node = dq.__getNodeById(draft, node_id);
      const r = translated[i++];

      const parent_id = dq.getParentId(draft.document_ctx, node_id);
      const parent_node = parent_id ? dq.__getNodeById(draft, parent_id) : null;
      const is_scene_parent = parent_node?.type === "scene";

      let relative_position: cmath.Vector2;
      if (parent_id && !is_scene_parent) {
        // sub node with non-scene parent
        const parent_rect =
          context.geometry.getNodeAbsoluteBoundingRect(parent_id)!;

        if (!parent_rect) {
          console.error("below error is caused by");
          console.error(
            JSON.parse(
              JSON.stringify({
                document_ctx: draft.document_ctx,
                document: draft.document,
              })
            )
          );
          throw new Error(
            `Parent '${parent_id}' rect must be defined [${parent_id}/${node_id}]`
          );
        }

        // the r position is relative to the canvas, we need to convert it to the node's local position
        // absolute to relative => accumulated parent's position
        relative_position = cmath.vector2.sub(r.position, [
          parent_rect.x,
          parent_rect.y,
        ]);
      } else {
        // top node (scene child or orphan)
        relative_position = r.position;
      }

      updateNodeTransform(node, {
        type: "position",
        x: relative_position[0],
        y: relative_position[1],
      });
    }
  } catch (e) {
    // FIXME: thre is a problem with the hierarchy change logic.
    // REMOVE TRY-CATCH AFTER FIXING THE ISSUE
    // this can happen since using unsafe domapi.
    reportError(e);
  }
}

function __self_update_gesture_transform_translate_sort(
  draft: Draft<editor.state.IEditorState>
) {
  assert(draft.gesture.type === "sort", "Gesture type must be translate-swap");

  const { layout, movement, node_id, node_initial_rect, placement } =
    draft.gesture;

  // [moving node]
  // apply movement as-is to moving node
  const moving_rect = cmath.rect.translate(node_initial_rect, movement);
  const moving_node = dq.__getNodeById(
    draft,
    node_id
  ) as grida.program.nodes.i.IPositioning;
  moving_node.left = moving_rect.x;
  moving_node.top = moving_rect.y;

  // [dnd testing]
  const { index: dnd_target_index } = dnd.test(moving_rect, layout.objects);

  // if no change, return
  if (dnd_target_index === placement.index) return;

  // recalculate the layout following the index change
  // while keeping the order of the objects, re-assign the rect.
  const __moved = cmath.arrayMove(
    layout.objects,
    placement.index,
    dnd_target_index
  );

  // update the layout
  draft.gesture.layout.objects = layout.objects.map((obj, i) => {
    const next_rect_ref = __moved[i];
    // this center-aligns the object to the next rect, while keeping the size.
    const next_rect = cmath.rect.alignA(obj, next_rect_ref, {
      horizontal: "center",
      vertical: "center",
    });

    return { ...next_rect, id: obj.id };
  });

  // TODO: currently, the index is always identical to initial placement index, we need to update the entire logic, for this index to change, and layout order not to change.
  const next_placement_index = layout.objects.findIndex(
    (obj) => obj.id === node_id
  );

  const next_placement_rect = layout.objects[next_placement_index];

  // // update the placement
  draft.gesture.placement = {
    index: next_placement_index,
    rect: next_placement_rect,
  };

  // // update the dropzone
  draft.dropzone = {
    type: "rect",
    rect: next_placement_rect,
  };

  // update the position of the real nodes (except the moving node)
  layout.objects.forEach((obj, i) => {
    if (obj.id === node_id) return;
    const node = dq.__getNodeById(
      draft,
      obj.id
    ) as grida.program.nodes.i.IPositioning;
    node.left = obj.x;
    node.top = obj.y;
  });
}

function __self_update_gesture_transform_scale(
  draft: Draft<editor.state.IEditorState>,
  context: ReducerContext
) {
  assert(
    draft.gesture.type === "scale" ||
      draft.gesture.type === "insert-and-resize",
    "Gesture type must be scale or insert-and-resize"
  );
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.nodes[
    draft.scene_id
  ] as grida.program.nodes.SceneNode;
  const { transform_with_center_origin, transform_with_preserve_aspect_ratio } =
    draft.gesture_modifiers;

  const {
    selection,
    direction,
    initial_snapshot,
    movement: rawMovement,
    initial_rects,
  } = draft.gesture;

  const initial_bounding_rectangle = cmath.rect.union(initial_rects);

  // get the origin point based on handle
  const origin =
    transform_with_center_origin === "on"
      ? cmath.rect.getCenter(initial_bounding_rectangle)
      : cmath.rect.getCardinalPoint(
          initial_bounding_rectangle,
          // maps the resize handle (direction) to the transform origin point (inverse)
          cmath.compass.invertDirection(direction)
        );

  // #region [snap]
  const should_snap =
    draft.gesture_modifiers.scale_with_force_disable_snap !== "on";

  let adjusted_raw_movement = rawMovement;

  if (should_snap) {
    const snap_target_node_ids = getSnapTargets(selection, {
      document_ctx: draft.document_ctx,
      document: draft.document,
    });

    const snap_target_node_rects = snap_target_node_ids
      .map((node_id: string) => {
        const r = context.geometry.getNodeAbsoluteBoundingRect(node_id);
        if (!r) {
          reportError(`Node ${node_id} does not have a bounding rect`);
        }
        return r;
      })
      .filter((r): r is cmath.Rectangle => r !== null && r !== undefined);

    const { adjusted_movement, snapping } = snapObjectsResize(
      initial_rects,
      {
        objects: snap_target_node_rects,
        guides: draft.ruler === "on" ? scene.guides : undefined,
      },
      direction,
      origin,
      rawMovement,
      threshold(
        editor.config.DEFAULT_SNAP_MOVEMNT_THRESHOLD_FACTOR,
        draft.transform
      ),
      {
        enabled: should_snap,
        preserveAspectRatio: transform_with_preserve_aspect_ratio === "on",
        centerOrigin: transform_with_center_origin === "on",
      }
    );

    adjusted_raw_movement = adjusted_movement;
    draft.surface_snapping = snapping;
  } else {
    draft.surface_snapping = undefined;
  }
  // #endregion

  // inverse the delta based on handle
  const movement = cmath.vector2.multiply(
    cmath.compass.cardinal_direction_vector[direction],
    adjusted_raw_movement,
    transform_with_center_origin === "on" ? [2, 2] : [1, 1]
  );

  let i = 0;
  for (const node_id of selection) {
    const node = draft.document.nodes[node_id];
    const initial_node = initial_snapshot.document.nodes[node_id];
    const initial_rect = initial_rects[i++];

    const parent_id = dq.getParentId(draft.document_ctx, node_id);
    const parent_node = parent_id ? dq.__getNodeById(draft, parent_id) : null;
    const is_scene_parent = parent_node?.type === "scene";

    // TODO: scaling for bitmap node is not supported yet.
    const is_scalable = initial_node.type !== "bitmap";
    if (!is_scalable) continue;

    if (!parent_id || is_scene_parent) {
      // Scene child or orphan - use absolute positioning
      updateNodeTransform(node, {
        type: "scale",
        rect: initial_rect,
        origin: origin,
        movement,
        preserveAspectRatio: transform_with_preserve_aspect_ratio === "on",
      });
    } else {
      // Nested node with non-scene parent - use relative positioning
      const parent_rect =
        context.geometry.getNodeAbsoluteBoundingRect(parent_id)!;

      assert(
        parent_rect,
        "Parent rect must be defined : " + parent_id + "/" + node_id
      );

      // the r position is relative to the canvas, we need to convert it to the node's local position
      const relative_position = cmath.vector2.sub(
        [initial_rect.x, initial_rect.y],
        [parent_rect.x, parent_rect.y]
      );
      const relative_rect: cmath.Rectangle = {
        x: relative_position[0],
        y: relative_position[1],
        width: initial_rect.width,
        height: initial_rect.height,
      };

      const relative_origin = cmath.vector2.sub(origin, [
        parent_rect.x,
        parent_rect.y,
      ]);

      updateNodeTransform(node, {
        type: "scale",
        rect: relative_rect,
        origin: relative_origin,
        movement,
        preserveAspectRatio: transform_with_preserve_aspect_ratio === "on",
      });
    }

    if (initial_node.type === "vector") {
      // TODO: mrege with the above
      const vne = new vn.VectorNetworkEditor(initial_node.vector_network);
      const scale = cmath.rect.getScaleFactors(initial_rect, {
        x: initial_rect.x,
        y: initial_rect.y,
        width: initial_rect.width + movement[0],
        height: initial_rect.height + movement[1],
      });
      vne.scale(scale);
      (
        draft.document.nodes[node_id] as grida.program.nodes.VectorNode
      ).vector_network = vne.value;
      //
    }
  }
}

function __self_update_gesture_transform_rotate(
  draft: Draft<editor.state.IEditorState>
) {
  assert(draft.gesture.type === "rotate", "Gesture type must be rotate");
  const { movement, selection } = draft.gesture;
  const { rotate_with_quantize } = draft.gesture_modifiers;
  const { rotation_quantize_step } = draft;

  const _angle = cmath.principalAngle(
    // TODO: need to store the initial angle and subtract
    // TODO: get anchor and calculate the offset
    // TODO: translate the movement (distance) relative to the center of the node
    cmath.vector2.angle(cmath.vector2.zero, movement)
  );

  const _user_q =
    typeof rotate_with_quantize === "number"
      ? rotate_with_quantize
      : rotation_quantize_step;
  const q = Math.max(0.01, _user_q);
  const angle = cmath.quantize(_angle, q);

  const node = dq.__getNodeById(draft, selection);

  draft.gesture.rotation = angle;
  draft.document.nodes[selection] = nodeReducer(node, {
    type: "node/change/*",
    node_id: selection,
    rotation: angle,
  });
}

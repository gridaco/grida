import { type Draft } from "immer";
import { safeOriginal } from "../utils/immer";
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
import updateNodeTransform from "../node-transform.reducer";
import nodeReducer from "../node.reducer";
import assert from "assert";
import grida from "@grida/schema";
import tree from "@grida/tree";
import { EDITOR_GRAPH_POLICY } from "@/grida-canvas/policy";
import type { ReducerContext } from "..";
import { self_update_gesture_scale } from "./scale";
import { perf } from "@/grida-canvas/perf";

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
    case "tray":
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
    updateNodeTransform(
      node,
      {
        type: "translate",
        dx: dx,
        dy: dy,
      },
      context.geometry,
      node_id
    );
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

  const __perf_end = perf.start("gesture_transform", {
    gesture: draft.gesture.type,
  });
  try {
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
          `Gesture type not supported: ${(draft.gesture as unknown as { type: string }).type}`
        );
    }
  } finally {
    __perf_end();
  }
}

function __self_update_gesture_transform_translate(
  draft: Draft<editor.state.IEditorState>,
  context: ReducerContext
) {
  assert(draft.scene_id, "scene_id is not set");

  // Use original() for read-only lookups to avoid Immer proxy creation.
  // Immer's produceWithPatches creates a lazy proxy for every accessed draft
  // property, then walks ALL proxied entries during finalization to detect
  // changes and produce patches. The translate gesture stores
  // initial_snapshot (a full document clone with 1K+ nodes) inside
  // draft.gesture — reading it from the draft causes Immer to proxy the
  // entire snapshot, and finalization walks all of it. By reading immutable
  // gesture fields from original(), we avoid this entirely.
  const orig = safeOriginal(draft)!;

  const scene = orig.document.nodes[
    draft.scene_id
  ] as grida.program.nodes.SceneNode;

  // Read immutable gesture fields from orig to avoid proxying the gesture
  // object through Immer.
  const origGesture = orig.gesture as typeof draft.gesture;
  assert(origGesture.type === "translate", "Gesture type must be translate");
  const { initial_selection, initial_rects, initial_clone_ids } = origGesture;
  // Snapshot lives in the side-channel, completely outside Immer's tree.
  const initial_snapshot = context.gesture_snapshot.get()!;
  // Type-narrow the draft gesture for safe access to translate-specific fields.
  const draftGesture = draft.gesture as Draft<editor.gesture.GestureTranslate>;
  // movement is written by the event handler before this function runs,
  // so we must read it from the draft.
  const _movement = draftGesture.movement;
  const {
    translate_with_clone,
    tarnslate_with_axis_lock,
    translate_with_hierarchy_change,
    translate_with_force_disable_snap: __translate_with_force_disable_snap,
  } = orig.gesture_modifiers;

  const should_snap = __translate_with_force_disable_snap !== "on";

  // TODO: translate_with_clone - move it somewhere else
  // FIXME: this does not respect the hierarchy and relative position
  // #region [translate_with_clone]
  switch (translate_with_clone) {
    case "on": {
      if (draftGesture.is_currently_cloned) break; // already cloned

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
      initial_selection.forEach((node_id) => {
        draft.document.nodes[node_id] =
          initial_snapshot.document.nodes[node_id];
      });

      draftGesture.selection = initial_clone_ids;
      draft.selection = initial_clone_ids;
      // now, the cloned not will be measured relative to the original selection
      draft.surface_measurement_target = initial_selection;
      draft.surface_measurement_targeting_locked = true;

      // set the flag
      draftGesture.is_currently_cloned = true;
      draft.active_duplication = {
        origins: initial_selection,
        clones: initial_clone_ids,
      };

      break;
    }
    case "off": {
      if (!draftGesture.is_currently_cloned) break;

      try {
        initial_clone_ids.forEach((clone) => {
          self_try_remove_node(draft, clone);
        });
      } catch {}

      draftGesture.is_currently_cloned = false;
      draftGesture.selection = initial_selection;
      draft.selection = initial_selection;
      draft.surface_measurement_target = undefined;
      draft.surface_measurement_targeting_locked = false;
      draft.active_duplication = null;
      break;
    }
  }
  // #endregion

  const current_selection = draftGesture.selection;

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
      // Read hits from orig — hits array is set by pointer events before
      // gesture transform runs and is not mutated here.
      const hits = orig.hits.slice();

      // filter out the...
      // 1. current selection (both original and cloned) and children of the current selection, recursive (both original and cloned)
      // 2. non-container nodes
      // the current selection will always be hit as it moves with the cursor (unless not grouped - but does not matter)
      // both original and cloned nodes are considered as the same node, unless, the cloned node will instantly be moved to the original (if its a container) - this is not the case when clone modifier is turned on after the translate has started, but does not matter.

      // Use document_ctx from draft (may have been updated by clone insertion above).
      // Note: this access proxies document_ctx, but it's needed for correctness
      // when cloning has modified the hierarchy.
      const ctx_for_hierarchy = draft.document_ctx;

      // Build the hierarchy exclusion set. This collects the selection,
      // clones, and all their descendants so that they're excluded from
      // the dropzone search below. Use a flat collector instead of
      // spread + flat to avoid intermediate array allocations.
      const hierarchy_ids = new Set<string>();
      for (const id of initial_selection) {
        hierarchy_ids.add(id);
        for (const child of dq.getChildren(ctx_for_hierarchy, id, true)) {
          hierarchy_ids.add(child);
        }
      }
      for (const id of initial_clone_ids) {
        hierarchy_ids.add(id);
        for (const child of dq.getChildren(ctx_for_hierarchy, id, true)) {
          hierarchy_ids.add(child);
        }
      }

      // Find the first valid dropzone from hits. Short-circuit instead
      // of filtering all hits — we only need the first match.
      let new_parent_id: string | null = null;
      for (const node_id of hits) {
        if (hierarchy_ids.has(node_id)) continue;

        // Read node type from original state to avoid Immer proxy creation.
        // Node types are immutable during a translate gesture.
        const node = orig.document.nodes[node_id];
        if (!node || !allows_hierarchy_change(node.type)) continue;

        new_parent_id = node_id;
        break;
      }

      // TODO: room for improvement - do a selection - parent comparison and handle at once (currently doing each comparison for each node) (this is redundant as if dropzone has changed, it will be changed for all selection)
      let is_parent_changed = false;
      // Hoist Graph construction outside the loop — Graph holds a reference
      // to draft.document (not a copy), so mv() mutations are visible across
      // iterations and the generation counter ensures lut recomputes.
      const graphInstance = new tree.graph.Graph(
        draft.document,
        EDITOR_GRAPH_POLICY
      );
      // update the parent of the current selection
      current_selection.forEach((node_id: string) => {
        //
        const prev_parent_id = dq.getParentId(draft.document_ctx, node_id);

        // Normalize parent IDs for comparison (null means scene)
        const effective_prev_parent = prev_parent_id ?? draft.scene_id!;
        const effective_new_parent = new_parent_id ?? draft.scene_id!;

        if (effective_prev_parent === effective_new_parent) return;

        // Check if the current parent allows hierarchy changes
        // Read node types from original state to avoid Immer proxy creation.
        if (prev_parent_id) {
          const current_parent = orig.document.nodes[prev_parent_id];
          if (current_parent && !allows_hierarchy_change(current_parent.type)) {
            // Current parent doesn't allow hierarchy changes, so prevent escaping
            return;
          }
        }

        // Tray can only be a child of Scene or another Tray
        const moving_node = orig.document.nodes[node_id];
        if (moving_node?.type === "tray" && new_parent_id !== null) {
          const target_node = orig.document.nodes[new_parent_id];
          if (target_node?.type !== "tray") return;
        }

        is_parent_changed = true;

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

  // Pass snap targeting a non-proxied view to avoid Immer overhead.
  // document_ctx may have been updated by hierarchy change above, so read
  // the current value from draft, but use orig.document.nodes for type checks
  // (node types don't change during translate).
  const snap_target_node_ids = getSnapTargets(current_selection, {
    document_ctx: draft.document_ctx,
    document: orig.document,
  });
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
      editor.config.DEFAULT_SNAP_MOVEMENT_THRESHOLD_FACTOR,
      draft.transform
    ),
    should_snap
  );

  draft.surface_snapping = snapping;

  try {
    let i = 0;

    for (const node_id of current_selection) {
      // Must use draft here — updateNodeTransform writes to this node.
      const node = draft.document.nodes[node_id];
      if (!node) continue;
      const r = translated[i++];

      // Use current document_ctx (may have been updated by hierarchy change).
      const parent_id = dq.getParentId(draft.document_ctx, node_id);
      // Read parent type from original to avoid proxying parent nodes.
      const parent_node = parent_id ? orig.document.nodes[parent_id] : null;
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

      updateNodeTransform(
        node,
        {
          type: "position",
          x: relative_position[0],
          y: relative_position[1],
        },
        context.geometry,
        node_id
      );
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
  moving_node.layout_inset_left = moving_rect.x;
  moving_node.layout_inset_top = moving_rect.y;

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
  layout.objects.forEach((obj) => {
    if (obj.id === node_id) return;
    const node = dq.__getNodeById(
      draft,
      obj.id
    ) as grida.program.nodes.i.IPositioning;
    node.layout_inset_left = obj.x;
    node.layout_inset_top = obj.y;
  });
}

function __self_update_gesture_transform_scale(
  draft: Draft<editor.state.IEditorState>,
  context: ReducerContext
) {
  return self_update_gesture_scale(draft, context);
}

function __self_update_gesture_transform_rotate(
  draft: Draft<editor.state.IEditorState>
) {
  assert(draft.gesture.type === "rotate", "Gesture type must be rotate");
  const {
    selection,
    initial_angle,
    initial_rotation,
    initial_bounding_rectangle,
  } = draft.gesture;
  const { rotate_with_quantize } = draft.gesture_modifiers;
  const { rotation_quantize_step } = draft;

  // Compute the center of the node's bounding rectangle.
  const rect = initial_bounding_rectangle!;
  const center: cmath.Vector2 = [
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
  ];

  // Current angle from node center to the pointer position.
  const current_angle = cmath.vector2.angle(center, draft.pointer.position);

  // The rotation delta is the difference between the current pointer angle
  // and the pointer angle at drag start, added to the node's original rotation.
  const _angle = cmath.principalAngle(
    initial_rotation + (current_angle - initial_angle)
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

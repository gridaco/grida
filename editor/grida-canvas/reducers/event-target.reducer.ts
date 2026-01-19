import { type Draft } from "immer";
import { updateState } from "./utils/immer";

import type {
  EventTargetAction,
  //
  EditorEventTarget_PointerMove,
  EditorEventTarget_PointerMoveRaycast,
  EditorEventTarget_PointerDown,
  EditorEventTarget_Click,
  //
  EditorEventTarget_Drag,
  EditorEventTarget_DragStart,
  EditorEventTarget_DragEnd,
  EditorEventTarget_MultipleSelectionLayer_Click,
  NodeChangeAction,
} from "../action";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";
import {
  decidePointerDownSelection,
  decideClickSelection,
  decideDragStartAction,
} from "./methods/selection";
import nodeReducer from "./node.reducer";
import initialNode from "./tools/initial-node";
import assert from "assert";
import {
  self_clearSelection,
  self_try_insert_node,
  self_selectNode,
  self_updateSurfaceHoverState,
  self_update_gesture_transform,
  self_optimizeVectorNetwork,
  self_select_tool,
  self_select_cursor_tool,
} from "./methods";
import { self_moveNode } from "./methods/move";
import { self_updateVectorAreaSelection } from "./methods/vector";
import * as cem_varwidth from "./event-target.cem-width.reducer";
import * as cem_vector from "./event-target.cem-vector.reducer";
import * as cem_bitmap from "./event-target.cem-bitmap.reducer";
import { getMarqueeSelection, getRayTarget } from "./tools/target";
import { snapGuideTranslation, threshold } from "./tools/snap";
import cmath from "@grida/cmath";
import type { ReducerContext } from ".";

function __self_evt_on_pointer_move(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_PointerMove,
  context: ReducerContext
) {
  const {
    position_canvas: { x, y },
    position_client,
  } = <EditorEventTarget_PointerMove>action;

  const surface_space_pointer_position: cmath.Vector2 = [x, y];

  const canvas_space_pointer_position = cmath.vector2.transform(
    surface_space_pointer_position,
    cmath.transform.invert(draft.transform)
  );

  draft.pointer = {
    client: [position_client.x, position_client.y],
    position: canvas_space_pointer_position,
    last: draft.pointer.position,
    logical: canvas_space_pointer_position,
  };

  switch (draft.content_edit_mode?.type) {
    case "vector":
      cem_vector.on_pointer_move(draft, canvas_space_pointer_position, context);
      break;
    case "width":
      cem_varwidth.on_pointer_move(
        draft,
        canvas_space_pointer_position,
        context
      );
      break;
  }
}

function __self_evt_on_pointer_move_raycast(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_PointerMoveRaycast
) {
  const { node_ids_from_point } = <EditorEventTarget_PointerMoveRaycast>action;
  draft.hits = node_ids_from_point;
  self_updateSurfaceHoverState(draft);
}

function __self_evt_on_click(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_Click,
  context: ReducerContext
) {
  const { node_ids_from_point, shiftKey } = <EditorEventTarget_Click>action;
  draft.hits = node_ids_from_point;

  // Handle deferred selection operations using the testable decision function
  const decision = decideClickSelection({
    clicked_node_id: node_ids_from_point[0] ?? null,
    deferred_selection: draft.__deferred_selection,
  });

  if (decision.type === "immediate") {
    if (decision.mode === "clear") {
      self_clearSelection(draft);
    } else {
      self_selectNode(draft, decision.mode, decision.node_id);
    }
    draft.__deferred_selection = undefined;
    // Early return to prevent other click handlers from running
    // (this matches the behavior of immediate selection changes)
    return;
  }

  // Clear deferred marker if no operation was applied
  draft.__deferred_selection = undefined;

  switch (draft.tool.type) {
    case "cursor":
    case "scale":
    case "hand":
      // ignore
      break;
    case "zoom":
      // TODO: also support zoom out (with alt key modifier) - needs to be handled separately
      draft.transform = cmath.transform.scale(
        draft.transform,
        2,
        // map the cursor position back to surface space
        cmath.vector2.transform(draft.pointer.position, draft.transform)
      );
      break;
    case "insert":
      const parent = __get_insertion_target(draft);

      const nnode = initialNode(
        draft.tool.node,
        () => context.idgen.next(),
        {},
        context.paint_constraints
      );

      let relpos: cmath.Vector2;
      if (parent) {
        const parent_rect =
          context.geometry.getNodeAbsoluteBoundingRect(parent)!;
        const p: cmath.Vector2 = [parent_rect.x, parent_rect.y];
        relpos = cmath.vector2.sub(draft.pointer.position, p);
      } else {
        relpos = draft.pointer.position;
      }

      try {
        const _nnode = nnode as grida.program.nodes.UnknownNode;

        // center translate the new node - so it can be positioned centered to the cursor point (width / 2, height / 2)
        const center_translate_delta: cmath.Vector2 =
          // (if width and height is fixed number) - can be 'auto' for text node
          typeof _nnode.layout_target_width === "number" &&
          typeof _nnode.layout_target_height === "number"
            ? [_nnode.layout_target_width / 2, _nnode.layout_target_height / 2]
            : [0, 0];

        const nnode_relative_position = cmath.vector2.quantize(
          cmath.vector2.sub(relpos, center_translate_delta),
          1
        );

        _nnode.layout_positioning = "absolute";
        _nnode.layout_inset_left! = nnode_relative_position[0];
        _nnode.layout_inset_top! = nnode_relative_position[1];
      } catch (e) {
        reportError(e);
      }

      self_try_insert_node(draft, parent, nnode);
      self_select_cursor_tool(draft);
      self_selectNode(draft, "reset", nnode.id);

      // if the node is text, enter content edit mode
      if (nnode.type === "tspan") {
        draft.content_edit_mode = { type: "text", node_id: nnode.id };
      }
      break;
  }
}

function __self_evt_on_double_click(draft: editor.state.IEditorState) {
  // [double click event]
  // - DOES NOT "enter content edit mode" - this is handled by its own action.
  if (draft.gesture.type !== "idle") return; // ignore when gesture is active

  const {
    document_ctx,
    selection,
    hits: surface_raycast_detected_node_ids,
  } = draft;
  // #region [nested selection]
  // - focus on the next descendant (next deep) hit node (if any) relative to the selection

  // the selection is handled by the pointer down event, which is resolved before double click event.
  // if selection is not 1, means its clicked on void.
  // yet, do not assert, since 0 or 1+ is valid state when shift key is pressed. (althouth not handled by double click)
  if (selection.length !== 1) return;
  //

  const current_node_id = selection[0];
  // validate the state - the detected nodes shall include the selection
  if (!surface_raycast_detected_node_ids.includes(current_node_id)) {
    // invalid state - this can happen when double click is triggered on void space, when marquee ends
    return;
  }

  // find the next descendant node (deepest first) relative to the selection
  const next = getRayTarget(
    surface_raycast_detected_node_ids,
    {
      context: draft,
      config: draft.pointer_hit_testing_config,
    },
    true
  );

  // Update the selection if a valid next focus is found
  if (next) {
    self_selectNode(draft, "reset", next);
  }
  // #endregion
  //
}

function __self_pointer_down_selection_like_cursor(
  draft: editor.state.IEditorState,
  shiftKey: boolean,
  context: ReducerContext
) {
  const { hovered_node_id } = self_updateSurfaceHoverState(draft);

  if (draft.content_edit_mode?.type === "vector") {
    if (!shiftKey && draft.content_edit_mode.snapped_vertex_idx === null) {
      // clear the selection for vector content edit mode
      self_clearSelection(draft);
    }
    return;
  }

  // Use the testable decision function
  // TODO: Determine is_empty_space_within_overlay from geometry
  // For now, pass undefined (will be treated as outside overlay, immediate clear)
  // In the future, this should be computed using selection geometry rects and pointer position
  const decision = decidePointerDownSelection({
    hovered_node_id,
    shiftKey,
    current_selection: draft.selection,
    document_ctx: draft.document_ctx,
    is_empty_space_within_overlay: undefined, // TODO: compute from geometry
  });

  // Apply the decision
  switch (decision.type) {
    case "immediate":
      if (decision.mode === "clear") {
        self_clearSelection(draft);
      } else {
        self_selectNode(draft, decision.mode, decision.node_id);
      }
      draft.__deferred_selection = undefined;
      break;
    case "deferred":
      draft.__deferred_selection = {
        node_id: decision.node_id,
        operation: decision.operation,
      };
      break;
    case "none":
      draft.__deferred_selection = undefined;
      break;
  }
}

function __self_evt_on_pointer_down(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_PointerDown,
  context: ReducerContext
) {
  const { node_ids_from_point, shiftKey } = <EditorEventTarget_PointerDown>(
    action
  );
  draft.hits = node_ids_from_point;

  switch (draft.tool.type) {
    case "cursor": {
      __self_pointer_down_selection_like_cursor(draft, shiftKey, context);
      break;
    }
    case "scale": {
      // Scale tool behaves like cursor for selection interactions.
      __self_pointer_down_selection_like_cursor(draft, shiftKey, context);
      break;
    }
    case "insert": {
      // ignore - insert mode will be handled via click or drag
      break;
    }
    case "width": {
      // Handle variable width tool pointer down
      cem_varwidth.on_pointer_down(draft, action, context);
      break;
    }
    case "path": {
      if (draft.content_edit_mode?.type === "vector") {
        cem_vector.on_path_pointer_down(draft, action, context);
      } else {
        cem_vector.create_new_vector_node(draft, context);
      }
      break;
    }
    case "eraser":
    case "brush": {
      cem_bitmap.on_brush(draft, { is_gesture: false }, context);
      break;
    }
    case "flood-fill": {
      assert(draft.content_edit_mode?.type === "bitmap");
      cem_bitmap.on_flood_fill(draft, draft.content_edit_mode.imageRef);
      break;
    }
  }
}

function __self_evt_on_pointer_up(draft: editor.state.IEditorState) {
  draft.gesture = { type: "idle" };
}

function __self_drag_start_selection_like_cursor(
  draft: editor.state.IEditorState,
  shiftKey: boolean,
  context: ReducerContext
) {
  // when vector content edit mode is active, dragging should marquee select
  if (draft.content_edit_mode?.type === "vector") {
    draft.marquee = {
      a: draft.pointer.position,
      b: draft.pointer.position,
      additive: shiftKey,
    };
    return;
  }

  // TODO: move overlay hit-testing into `decideDragStartAction` (selection module).
  // Today, this reducer computes `is_empty_space_within_overlay` via geometry to keep
  // `event-target/event/on-drag-start` clean (no selection-specific payload).
  //
  // In the future, as described in docs/wg/feat-editor/ux-surface/selection.md, the
  // selection module should own this logic by taking selection geometry + pointer
  // position and determining `is_empty_space_within_overlay` internally.
  //
  // Selection overlay hit test (pure math, reducer-local):
  // If pointer is on empty space and there is a selection, determine whether the pointer is
  // inside the selection overlay bounds (union of selected nodes' absolute rects).
  //
  // This is required to distinguish:
  // - Shift + empty space within overlay → drag selection (axis lock)
  // - Shift + empty space outside overlay → marquee selection
  let is_empty_space_within_overlay: boolean | undefined = undefined;
  if (draft.selection.length > 0 && !draft.hovered_node_id) {
    const rects = draft.selection
      .map((id) => context.geometry.getNodeAbsoluteBoundingRect(id))
      .filter((r) => r) as cmath.Rectangle[];
    if (rects.length > 0) {
      const overlay = cmath.rect.union(rects);
      is_empty_space_within_overlay = cmath.rect.containsPoint(
        overlay,
        draft.pointer.position
      );
    }
  }

  // Use the testable decision function
  const action = decideDragStartAction({
    hovered_node_id: draft.hovered_node_id,
    shiftKey,
    current_selection: draft.selection,
    is_empty_space_within_overlay,
  });

  if (action === "drag") {
    __self_start_gesture_translate(draft, context);
  } else {
    // marquee selection
    draft.marquee = {
      a: draft.pointer.position,
      b: draft.pointer.position,
      additive: shiftKey,
    };
  }
}

function __self_evt_on_drag_start(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_DragStart,
  context: ReducerContext
) {
  const { shiftKey } = <EditorEventTarget_DragStart>action;

  draft.dragging = true;

  // if there is already a gesture, ignore
  if (draft.gesture.type !== "idle") return;

  // clear all trasform state
  draft.marquee = undefined;
  draft.lasso = undefined;
  draft.dropzone = undefined;
  draft.surface_snapping = undefined;

  // Cancel deferred selection operations (per docs: "On dragstart → deferred operations cancelled")
  draft.__deferred_selection = undefined;

  switch (draft.tool.type) {
    case "cursor": {
      __self_drag_start_selection_like_cursor(draft, shiftKey, context);
      break;
    }
    case "scale": {
      // Scale tool behaves like cursor for selection drag interactions.
      __self_drag_start_selection_like_cursor(draft, shiftKey, context);
      break;
    }
    case "zoom": {
      // marquee zoom
      draft.marquee = {
        a: draft.pointer.position,
        b: draft.pointer.position,
        additive: shiftKey,
      };
      break;
    }
    case "hand": {
      draft.gesture = {
        type: "pan",
        movement: cmath.vector2.zero,
        first: cmath.vector2.zero,
        last: cmath.vector2.zero,
      };
      break;
    }
    case "lasso": {
      draft.lasso = { points: [draft.pointer.position], additive: shiftKey };
      break;
    }
    case "insert": {
      const parent = __get_insertion_target(draft);

      const initial_rect = {
        x: draft.pointer.position[0],
        y: draft.pointer.position[1],
        width: 1,
        height: 1,
      };
      //
      const nnode = initialNode(
        draft.tool.node,
        () => context.idgen.next(),
        {
          layout_inset_left: initial_rect.x,
          layout_inset_top: initial_rect.y,
          layout_target_width: initial_rect.width,
          layout_target_height: initial_rect.height as 0, // casting for line node
        },
        context.paint_constraints
      );

      let pending: {
        node_id: string;
        prototype: grida.program.nodes.Node;
      } | null = null;
      if (draft.tool.node === "container") {
        pending = {
          node_id: nnode.id,
          prototype: JSON.parse(JSON.stringify(nnode)),
        };
        // UX: temporary remove fill to let user see whats behind.
        (nnode as grida.program.nodes.ContainerNode).fill = undefined;
      }

      self_try_insert_node(draft, parent, nnode);
      self_select_tool(draft, { type: "cursor" }, context);
      self_selectNode(draft, "reset", nnode.id);
      __self_start_gesture_insert_and_resize_draw_new_node(draft, {
        new_node_id: nnode.id,
        new_node_rect: initial_rect,
        pending_insertion: pending,
      });

      break;
    }
    case "draw": {
      cem_vector.on_draw_pointer_down(draft, context);
      break;
    }
    case "path": {
      cem_vector.on_path_drag_start(draft, action, context);
      break;
    }
    case "eraser":
    case "brush": {
      cem_bitmap.on_brush(draft, { is_gesture: true }, context);
      break;
    }
  }
}

function __self_drag_end_marquee_select(
  draft: editor.state.IEditorState,
  node_ids_from_area: string[] | undefined,
  shiftKey: boolean
) {
  if (draft.content_edit_mode?.type !== "vector" && node_ids_from_area) {
    const target_node_ids = getMarqueeSelection(draft, node_ids_from_area);
    self_selectNode(draft, shiftKey ? "toggle" : "reset", ...target_node_ids);
  }
}

function __self_evt_on_drag_end(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_DragEnd,
  context: ReducerContext
) {
  const { node_ids_from_area, shiftKey } = <EditorEventTarget_DragEnd>action;
  draft.dragging = false;

  switch (draft.tool.type) {
    case "draw":
      cem_vector.on_draw_drag_end(draft, context);
      break;
    case "brush":
    case "eraser":
    case "flood-fill":
      // keep for paint mode
      break;
    case "path":
    case "hand":
    case "lasso":
    case "width":
      // keep
      break;
    case "zoom": {
      if (draft.marquee) {
        // update zoom
        const { width, height } = context.viewport;
        const vrect = {
          x: 0,
          y: 0,
          width,
          height,
        };
        const mrect = cmath.rect.fromPoints([draft.marquee.a, draft.marquee.b]);
        const t = cmath.ext.viewport.transformToFit(vrect, mrect);
        draft.transform = t;
      }

      // cancel to default
      self_select_tool(draft, { type: "cursor" }, context);
      break;
    }
    case "cursor": {
      __self_drag_end_marquee_select(draft, node_ids_from_area, shiftKey);
      // cancel to default
      self_select_tool(draft, { type: "cursor" }, context);
      break;
    }
    case "scale": {
      __self_drag_end_marquee_select(draft, node_ids_from_area, shiftKey);
      // keep scale tool active
      self_select_tool(draft, { type: "scale" }, context);
      break;
    }
    case "insert":
    default:
      // cancel to default
      self_select_tool(draft, { type: "cursor" }, context);
      break;
  }

  __self_maybe_end_gesture(draft, context);
  draft.gesture = { type: "idle" };
  draft.marquee = undefined;
  draft.lasso = undefined;
}

function __self_evt_on_drag(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_Drag,
  context: ReducerContext
) {
  const scene = draft.document.nodes[
    draft.scene_id!
  ] as grida.program.nodes.SceneNode;
  const {
    event: { movement, delta },
  } = <EditorEventTarget_Drag>action;

  if (draft.marquee) {
    draft.marquee.b = draft.pointer.position;
    if (draft.content_edit_mode?.type === "vector") {
      const mrect = cmath.rect.fromPoints([draft.marquee.a, draft.marquee.b]);
      self_updateVectorAreaSelection(
        draft,
        context,
        (p) => cmath.rect.containsPoint(mrect, p),
        draft.marquee.additive ?? false,
        mrect
      );
    }
  } else if (draft.lasso) {
    draft.lasso.points.push(draft.pointer.position);
    if (
      draft.content_edit_mode?.type === "vector" &&
      draft.lasso.points.length > 2
    ) {
      self_updateVectorAreaSelection(
        draft,
        context,
        (p) => cmath.polygon.pointInPolygon(p, draft.lasso!.points),
        draft.lasso.additive ?? false
      );
    }
  } else {
    if (draft.gesture.type === "idle") return;
    if (draft.gesture.type === "nudge") return;

    draft.gesture.last = draft.gesture.movement;
    draft.gesture.movement = movement;

    switch (draft.gesture.type) {
      case "pan": {
        // for panning, exceptionaly use the unscaled delta.
        const original_delta = cmath.vector2.multiply(
          action.event.delta,
          cmath.transform.getScale(draft.transform)
        );
        // move the viewport by delta
        draft.transform = cmath.transform.translate(
          draft.transform,
          original_delta
        );
        break;
      }
      case "guide": {
        const { axis, idx: index, initial_offset } = draft.gesture;

        const counter = axis === "x" ? 0 : 1;
        const m = movement[counter];

        // [snap the guide offset]
        // 1. to pixel grid (quantize 1)
        // 2. to objects geometry
        const scene_children = draft.document.links[draft.scene_id!] || [];
        const { translated } = snapGuideTranslation(
          axis,
          initial_offset,
          scene_children.map(
            (id) => context.geometry.getNodeAbsoluteBoundingRect(id)!
          ),
          m,
          threshold(
            editor.config.DEFAULT_SNAP_MOVEMNT_THRESHOLD_FACTOR,
            draft.transform
          )
        );

        const offset = cmath.quantize(translated, 1);

        draft.gesture.offset = offset;
        scene.guides[index].offset = offset;
        break;
      }
      // [insertion mode - resize after insertion]
      case "insert-and-resize":
      case "scale": {
        self_update_gesture_transform(draft, context);
        break;
      }
      // this is to handle "immediately drag move node"
      case "translate": {
        self_update_gesture_transform(draft, context);
        break;
      }
      case "sort": {
        self_update_gesture_transform(draft, context);
        break;
      }
      case "rotate": {
        self_update_gesture_transform(draft, context);
        break;
      }
      case "draw": {
        cem_vector.on_drag_gesture_draw(draft, movement);
        break;
      }

      case "brush": {
        cem_bitmap.on_brush(draft, { is_gesture: true }, context);
        break;
      }
      case "curve": {
        cem_vector.on_drag_gesture_curve(draft, context);
        break;
      }
      case "curve-a": {
        cem_vector.on_drag_gesture_curve_a(draft);
        break;
      }
      case "translate-vector-controls": {
        cem_vector.on_drag_gesture_translate_vector_controls(draft);
        break;
      }
      case "translate-variable-width-stop": {
        cem_varwidth.on_drag_gesture_translate_variable_width_stop(draft);
        break;
      }
      case "resize-variable-width-stop": {
        cem_varwidth.on_drag_resize_variable_width_stop(draft);
        break;
      }
      case "corner-radius": {
        const { node_id, anchor, altKey = false } = draft.gesture;
        const [dx, dy] = delta;
        const node = dq.__getNodeById(draft, node_id);

        if (!("corner_radius" in node)) {
          return;
        }

        // Get width/height from node if available (only check defined values)
        let fixed_width: number | undefined;
        let fixed_height: number | undefined;

        if (
          grida.program.nodes.hasLayoutWidth(node) &&
          grida.program.nodes.hasLayoutHeight(node)
        ) {
          const width = node.layout_target_width;
          const height = node.layout_target_height;
          if (typeof width === "number" && typeof height === "number") {
            fixed_width = width;
            fixed_height = height;
          }
        }

        const maxRadius = Math.min(
          fixed_width ? fixed_width / 2 : Infinity,
          fixed_height ? fixed_height / 2 : Infinity
        );

        let d: number;
        if (anchor) {
          const signX = anchor.includes("w") ? 1 : -1;
          const signY = anchor.includes("n") ? 1 : -1;
          d =
            Math.abs(dx) > Math.abs(dy)
              ? Math.round(signX * dx)
              : Math.round(signY * dy);
        } else {
          d = -Math.round(dx);
        }

        // Only rectangle, container, and component support rectangular corner radius
        // All other node types use unified corner_radius
        switch (node.type) {
          case "rectangle":
          case "container":
          case "component":
          case "image":
          case "video": {
            if (anchor) {
              const keyMap = {
                nw: "rectangular_corner_radius_top_left",
                ne: "rectangular_corner_radius_top_right",
                se: "rectangular_corner_radius_bottom_right",
                sw: "rectangular_corner_radius_bottom_left",
              } as const;

              const key = keyMap[anchor];
              const current = (node as any)[key] ?? 0;
              
              // Check if all corners have the same value
              const tl = node.rectangular_corner_radius_top_left ?? 0;
              const tr = node.rectangular_corner_radius_top_right ?? 0;
              const br = node.rectangular_corner_radius_bottom_right ?? 0;
              const bl = node.rectangular_corner_radius_bottom_left ?? 0;
              const isUniform = tl === tr && tr === br && br === bl;

              const nextRadius = current + d;
              const nextRadiusClamped = Math.floor(
                Math.min(maxRadius, Math.max(0, nextRadius))
              );

              // If Alt key is not pressed and all corners are uniform, adjust all corners
              // Otherwise, adjust only the clicked corner
              if (!altKey && isUniform) {
                draft.document.nodes[node_id] = nodeReducer(node, {
                  type: "node/change/*",
                  corner_radius: nextRadiusClamped,
                  rectangular_corner_radius_top_left: nextRadiusClamped,
                  rectangular_corner_radius_top_right: nextRadiusClamped,
                  rectangular_corner_radius_bottom_right: nextRadiusClamped,
                  rectangular_corner_radius_bottom_left: nextRadiusClamped,
                  node_id,
                });
              } else {
                draft.document.nodes[node_id] = nodeReducer(node, {
                  type: "node/change/*",
                  [key]: nextRadiusClamped,
                  node_id,
                });
              }
            } else {
              const current =
                typeof node.corner_radius == "number" ? node.corner_radius : 0;
              const nextRadius = current + d;
              const nextRadiusClamped = Math.floor(
                Math.min(maxRadius, Math.max(0, nextRadius))
              );
              draft.document.nodes[node_id] = nodeReducer(node, {
                type: "node/change/*",
                corner_radius: nextRadiusClamped,
                rectangular_corner_radius_top_left: nextRadiusClamped,
                rectangular_corner_radius_top_right: nextRadiusClamped,
                rectangular_corner_radius_bottom_right: nextRadiusClamped,
                rectangular_corner_radius_bottom_left: nextRadiusClamped,
                node_id,
              });
            }
            break;
          }
          case "polygon":
          case "star":
          case "vector":
          case "boolean": {
            // These node types use unified corner_radius
            const current =
              typeof node.corner_radius == "number" ? node.corner_radius : 0;
            const nextRadius = current + d;
            const nextRadiusClamped = Math.floor(
              Math.min(maxRadius, Math.max(0, nextRadius))
            );
            draft.document.nodes[node_id] = nodeReducer(node, {
              type: "node/change/*",
              corner_radius: nextRadiusClamped,
              node_id,
            });
            break;
          }
        }

        break;
        //
      }
      case "gap": {
        const { layout, axis, initial_gap, min_gap } = draft.gesture;
        const delta = movement[axis === "x" ? 0 : 1];
        const side: "layout_inset_left" | "layout_inset_top" =
          axis === "x" ? "layout_inset_left" : "layout_inset_top";

        switch (layout.type) {
          case "group": {
            const sorted = layout.objects
              .slice()
              .sort((a, b) => a[axis] - b[axis]);

            const gap = cmath.quantize(
              Math.max(initial_gap + delta, min_gap),
              1
            );

            // start from the first sorted object's position.
            let currentPos = sorted[0][axis];

            // Calculate new positions considering each rect's dimension.
            const transformed = sorted.map((obj) => {
              const next = { ...obj };
              next[axis] = cmath.quantize(currentPos, 1);
              currentPos += cmath.rect.getAxisDimension(next, axis) + gap;
              return next;
            });

            // Update layout objects with new positions.
            draft.gesture.layout.objects = transformed;
            draft.gesture.gap = gap;

            // Apply transform to the actual nodes.
            transformed.forEach((obj) => {
              const node = dq.__getNodeById(
                draft,
                obj.id
              ) as grida.program.nodes.i.IPositioning;

              node[side] = obj[axis];
            });
            break;
          }

          case "flex": {
            const gap = cmath.quantize(
              Math.max(initial_gap + delta, min_gap),
              1
            );

            const container = dq.__getNodeById(draft, layout.group);
            draft.document.nodes[layout.group] = nodeReducer(container, {
              type: "node/change/*",
              node_id: container.id,
              layout_main_axis_gap: gap,
              layout_cross_axis_gap: gap,
            });

            draft.gesture.gap = gap;
            break;
          }
        }

        break;
      }
      case "padding": {
        const { node_id, side, initial_padding, min_padding } = draft.gesture;
        const delta = movement[side === "top" || side === "bottom" ? 1 : 0];

        const padding = cmath.quantize(
          Math.max(initial_padding + delta, min_padding),
          1
        );

        const container = dq.__getNodeById(draft, node_id);
        if (
          container &&
          (container.type === "container" || container.type === "component")
        ) {
          const mirroringEnabled =
            draft.gesture_modifiers.padding_with_axis_mirroring === "on";

          // Update the specific side
          const updates: Partial<
            | grida.program.nodes.ContainerNode
            | grida.program.nodes.ComponentNode
          > = {};

          switch (side) {
            case "top":
              updates.layout_padding_top = padding;
              if (mirroringEnabled) {
                updates.layout_padding_bottom = padding;
              }
              break;
            case "right":
              updates.layout_padding_right = padding;
              if (mirroringEnabled) {
                updates.layout_padding_left = padding;
              }
              break;
            case "bottom":
              updates.layout_padding_bottom = padding;
              if (mirroringEnabled) {
                updates.layout_padding_top = padding;
              }
              break;
            case "left":
              updates.layout_padding_left = padding;
              if (mirroringEnabled) {
                updates.layout_padding_right = padding;
              }
              break;
          }

          draft.document.nodes[node_id] = nodeReducer(container, {
            type: "node/change/*",
            node_id: node_id,
            ...updates,
          } as NodeChangeAction);

          draft.gesture.padding = padding;
        }

        break;
      }
    }
  }
}

function __self_evt_on_multiple_selection_overlay_click(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_MultipleSelectionLayer_Click
) {
  const { selection, node_ids_from_point, shiftKey } = action;
  if (draft.gesture.type === "translate") return;
  draft.hits = node_ids_from_point;
  const { hovered_node_id } = self_updateSurfaceHoverState(draft);
  if (shiftKey) {
    if (hovered_node_id) {
      self_selectNode(draft, "toggle", hovered_node_id);
    }
  } else {
    if (hovered_node_id) {
      self_selectNode(draft, "reset", hovered_node_id);
    } else {
      self_clearSelection(draft);
    }
  }
}

function __self_start_gesture_insert_and_resize_draw_new_node(
  draft: Draft<editor.state.IEditorState>,
  {
    new_node_id,
    new_node_rect,
    pending_insertion,
  }: {
    new_node_id: string;
    new_node_rect: cmath.Rectangle;
    pending_insertion: {
      node_id: string;
      prototype: grida.program.nodes.Node;
    } | null;
  }
) {
  draft.gesture = {
    type: "insert-and-resize",
    initial_snapshot: editor.state.snapshot(draft),
    initial_rects: [new_node_rect],
    movement: cmath.vector2.zero,
    first: cmath.vector2.zero,
    last: cmath.vector2.zero,
    selection: [new_node_id],
    direction: "se",
    pending_insertion,
  };
}

function __self_start_gesture_translate(
  draft: Draft<editor.state.IEditorState>,
  context: ReducerContext
) {
  const selection = draft.selection;
  if (selection.length === 0) return;

  const rects = draft.selection.map(
    (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
  );

  draft.gesture = {
    type: "translate",
    selection: selection,
    initial_clone_ids: selection.map(() => context.idgen.next()),
    initial_selection: selection,
    initial_rects: rects,
    initial_snapshot: editor.state.snapshot(draft),
    movement: cmath.vector2.zero,
    first: cmath.vector2.zero,
    last: cmath.vector2.zero,
    is_currently_cloned: false,
  };
}

/**
 * Optimizes the vector network before a translate-vector-controls gesture ends.
 *
 * This merges duplicated vertices/segments by running `vne.optimize()` on the
 * vector network of the node being edited, ensuring the network stays
 * normalized after user interaction.
 */
function __before_end_translate_vector_controls(
  draft: Draft<editor.state.IEditorState>
) {
  self_optimizeVectorNetwork(draft);
}

function __before_end_insert_and_resize(
  draft: Draft<editor.state.IEditorState>,
  context: ReducerContext
) {
  assert(draft.gesture.type === "insert-and-resize");
  const pending = draft.gesture.pending_insertion;
  if (!pending) return;

  const node = dq.__getNodeById(
    draft,
    pending.node_id
  ) as grida.program.nodes.ContainerNode;

  // UX: for container, the fill is set after insertion
  if (pending.prototype.type === "container") {
    node.fill_paints = pending.prototype.fill_paints;
  }

  if (cmath.vector2.isZero(draft.gesture.movement)) return;

  const container_rect = context.geometry.getNodeAbsoluteBoundingRect(
    pending.node_id
  )!;
  const parent_id = dq.getParentId(draft.document_ctx, pending.node_id);
  const siblings = parent_id
    ? [...(draft.document.links[parent_id] ?? [])]
    : [...(draft.document.links[draft.scene_id!] ?? [])];

  siblings.forEach((id) => {
    if (id === pending.node_id) return;
    const rect = context.geometry.getNodeAbsoluteBoundingRect(id)!;
    if (cmath.rect.contains(container_rect, rect)) {
      self_moveNode(draft, id, pending.node_id);
      const child = dq.__getNodeById(
        draft,
        id
      ) as grida.program.nodes.i.IPositioning;
      if (typeof child.layout_inset_left === "number")
        child.layout_inset_left = rect.x - container_rect.x;
      if (typeof child.layout_inset_top === "number")
        child.layout_inset_top = rect.y - container_rect.y;
    }
  });
}

function __self_maybe_end_gesture(
  draft: Draft<editor.state.IEditorState>,
  context: ReducerContext
) {
  switch (draft.gesture.type) {
    case "brush": {
      cem_bitmap.on_brush_gesture_end();
      break;
    }
    case "insert-and-resize": {
      __before_end_insert_and_resize(draft, context);
      break;
    }
    case "scale": {
      break;
    }
    case "translate": {
      if (draft.gesture.is_currently_cloned) {
        // update the selection as the cloned nodes
        self_selectNode(draft, "reset", ...draft.gesture.selection);
      }
      draft.surface_measurement_targeting_locked = false;
      break;
    }
    case "translate-vector-controls": {
      __before_end_translate_vector_controls(draft);
      break;
    }
    case "sort": {
      const { placement } = draft.gesture;
      const node = draft.document.nodes[
        draft.gesture.node_id
      ] as grida.program.nodes.i.IPositioning;
      node.layout_inset_left = placement.rect.x;
      node.layout_inset_top = placement.rect.y;

      break;
    }
  }

  draft.gesture = { type: "idle" };
  draft.dropzone = undefined;
}

/**
 * Gets the parent container for newly inserting nodes based on pointer-based hit testing.
 *
 * This function returns the first container node found in the hit stack at the current
 * pointer position. It uses a simple pointer-based approach: iterates through nodes
 * detected by raycast at the pointer location and returns the first one that is a
 * container type. This is used by the insert tool when clicking or dragging to place
 * new nodes.
 *
 * **Behavior:**
 * - If the scene has `constraints.children === "single"`, returns the single child container
 * - Otherwise, iterates through `state.hits` (pointer-based raycast results) and returns
 *   the first node that is a container type
 * - Returns `null` if no container is found in the hit stack (insertion at scene level)
 *
 * The function uses the hit stack order (top-to-bottom in z-order) and doesn't perform
 * geometry-based containment checks. It simply returns the first container encountered
 * at the pointer position, which is appropriate for tool-based insertion where the user
 * explicitly clicks or drags at a specific location.
 *
 * @param state - Current editor state
 * @returns The parent container node ID, or `null` if no container is found (scene-level insertion)
 *
 * @remarks
 * - This function relies on `state.hits` being populated from pointer raycast events
 * - Make sure `state.hits` is updated (via `pointermove/raycast` or `click` events) before calling
 * - This is used specifically for tool-based insertion (insert tool click/drag), not for
 *   programmatic insertion via the `insert` action (which takes explicit `target` parameter)
 *
 * @todo TODO: Remove this duplicate function and use a shared implementation.
 *   This function is duplicated in:
 *   - event-target.cem-vector.reducer.ts
 *   - event-target.cem-bitmap.reducer.ts
 *   Future refactoring should extract this to a shared helper that:
 *   1. Filters out locked containers (currently missing)
 *   2. Applies root node filtering for consistency
 *   3. Preserves z-order (top-to-bottom, deepest first)
 */
function __get_insertion_target(
  state: editor.state.IEditorState
): string | null {
  assert(state.scene_id, "scene_id is not set");
  const scene = state.document.nodes[
    state.scene_id
  ] as grida.program.nodes.SceneNode;
  const scene_children = state.document.links[state.scene_id] || [];
  if (scene.constraints.children === "single") {
    return scene_children[0];
  }

  const hits = state.hits.slice();
  for (const hit of hits) {
    const node = dq.__getNodeById(state, hit);
    if (node.type === "container") return hit;
  }
  return null;
}

export default function eventTargetReducer<S extends editor.state.IEditorState>(
  state: S,
  action: EventTargetAction,
  context: ReducerContext
): S {
  assert(state.scene_id, "scene_id is not set");

  // adjust the event by transform
  if ("event" in action) {
    const [scaleX, scaleY] = cmath.transform.getScale(state.transform);
    const factor: cmath.Vector2 = [1 / scaleX, 1 / scaleY];
    const original = { ...action.event };
    const adj = {
      ...original,
      // only delta and movement are scaled
      delta: cmath.vector2.multiply(action.event.delta, factor),
      movement: cmath.vector2.multiply(action.event.movement, factor),
    };

    // replace the action with adjusted event
    action = {
      ...action,
      event: adj,
    };
  }

  switch (action.type) {
    // #region [html backend] canvas event target
    case "event-target/event/on-pointer-move": {
      return updateState(state, (draft) => {
        __self_evt_on_pointer_move(draft, action, context);
      });
    }
    case "event-target/event/on-pointer-move-raycast": {
      return updateState(state, (draft) => {
        __self_evt_on_pointer_move_raycast(draft, action);
      });
    }
    case "event-target/event/on-click": {
      return updateState(state, (draft) => {
        __self_evt_on_click(draft, action, context);
      });
    }
    case "event-target/event/on-double-click": {
      return updateState(state, (draft) => {
        __self_evt_on_double_click(draft);
      });
    }
    case "event-target/event/on-pointer-down": {
      return updateState(state, (draft) => {
        __self_evt_on_pointer_down(draft, action, context);
      });
    }
    case "event-target/event/on-pointer-up": {
      return updateState(state, (draft) => {
        __self_evt_on_pointer_up(draft);
      });
    }
    // #region drag event
    case "event-target/event/on-drag-start": {
      return updateState(state, (draft) => {
        __self_evt_on_drag_start(draft, action, context);
      });
    }
    case "event-target/event/on-drag-end": {
      return updateState(state, (draft) => {
        __self_evt_on_drag_end(draft, action, context);
      });
    }
    case "event-target/event/on-drag": {
      return updateState(state, (draft) => {
        __self_evt_on_drag(draft, action, context);
      });
    }
    //
    case "event-target/event/multiple-selection-overlay/on-click": {
      return updateState(state, (draft) => {
        __self_evt_on_multiple_selection_overlay_click(draft, action);
      });
    }
    // #endregion drag event
    //

    // #endregion [html backend] canvas event target
  }
}

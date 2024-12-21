import { produce, type Draft } from "immer";

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
  //
  EditorEventTarget_NodeOverlayRotationHandle_Drag,
  EditorEventTarget_NodeOverlayRotationHandle_DragEnd,
  EditorEventTarget_NodeOverlayRotationHandle_DragStart,
  EditorEventTarget_Node_PointerEnter,
  EditorEventTarget_Node_PointerLeave,
  //
} from "../action";
import type { IDocumentEditorState } from "../state";
import { grida } from "@/grida";
import { document } from "../document-query";
import nodeReducer from "./node.reducer";
import initialNode from "./tools/initial-node";
import assert from "assert";
import {
  self_clearSelection,
  self_insertNode,
  self_selectNode,
  self_updateSurfaceHoverState,
  self_update_gesture_transform,
} from "./methods";
import { cmath } from "../cmath";
import { domapi } from "../domapi";
import nid from "./tools/id";
import { getDoubleclickTarget, getMarqueeSelection } from "./tools/target";

export default function eventTargetReducer<S extends IDocumentEditorState>(
  state: S,
  action: EventTargetAction
): S {
  // console.log("surfaceReducer", action);
  switch (action.type) {
    // #region [html backend] canvas event target
    case "document/canvas/backend/html/event/on-pointer-move": {
      const {
        position: { x, y },
      } = <EditorEventTarget_PointerMove>action;
      return produce(state, (draft) => {
        draft.surface_cursor_position = [x, y];
        draft.cursor_position = cmath.vector2.subtract(
          draft.surface_cursor_position,
          draft.content_offset ?? cmath.vector2.zero
        );
      });
    }
    case "document/canvas/backend/html/event/on-pointer-move-raycast": {
      const { node_ids_from_point } = <EditorEventTarget_PointerMoveRaycast>(
        action
      );
      return produce(state, (draft) => {
        draft.surface_raycast_detected_node_ids = node_ids_from_point;
        self_updateSurfaceHoverState(draft);
      });
    }
    case "document/canvas/backend/html/event/on-click": {
      const {} = <EditorEventTarget_Click>action;
      return produce(state, (draft) => {
        switch (draft.cursor_mode.type) {
          case "cursor": {
            // ignore
            break;
          }
          case "insert":
            const parent = __get_insert_target(state);

            const nnode = initialNode(draft.cursor_mode.node);

            const parent_rect = domapi.get_node_bounding_rect(parent)!;

            try {
              const _nnode = nnode as grida.program.nodes.AnyNode;

              const { cursor_position } = state;

              // center translate the new node - so it can be positioned centered to the cursor point (width / 2, height / 2)
              const center_translate_delta: cmath.Vector2 =
                // (if width and height is fixed number) - can be 'auto' for text node
                typeof _nnode.width === "number" &&
                typeof _nnode.height === "number"
                  ? [_nnode.width / 2, _nnode.height / 2]
                  : [0, 0];

              const nnode_relative_position = cmath.vector2.subtract(
                cursor_position,
                // parent position relative to content space
                [parent_rect.x, parent_rect.y],
                center_translate_delta
              );

              _nnode.position = "absolute";
              _nnode.left! = nnode_relative_position[0];
              _nnode.top! = nnode_relative_position[1];
            } catch (e) {
              reportError(e);
            }

            self_insertNode(draft, parent, nnode);
            draft.cursor_mode = { type: "cursor" };
            self_selectNode(draft, "reset", nnode.id);

            // if the node is text, enter content edit mode
            if (nnode.type === "text") {
              draft.content_edit_mode = { type: "text", selection: nnode.id };
            }
            break;
        }
      });
    }
    case "document/canvas/backend/html/event/on-double-click": {
      // [double click event]
      // - DOES NOT "enter content edit mode" - this is handled by its own action.
      // - focus on the next descendant (next deep) hit node (if any) relative to the selection
      return produce(state, (draft) => {
        if (state.gesture) return; // ignore when gesture is active

        const { document_ctx, selection, surface_raycast_detected_node_ids } =
          state;
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
        const next = getDoubleclickTarget(
          state,
          surface_raycast_detected_node_ids,
          current_node_id
        );

        // Update the selection if a valid next focus is found
        if (next) {
          self_selectNode(draft, "reset", next);
        }
      });
      break;
    }
    case "document/canvas/backend/html/event/on-pointer-down": {
      const { node_ids_from_point, shiftKey } = <EditorEventTarget_PointerDown>(
        action
      );
      return produce(state, (draft) => {
        switch (draft.cursor_mode.type) {
          case "cursor": {
            draft.surface_raycast_detected_node_ids = node_ids_from_point;
            const { hovered_node_id } = self_updateSurfaceHoverState(draft);
            if (shiftKey) {
              if (hovered_node_id) {
                self_selectNode(draft, "toggle", hovered_node_id);
              } else {
                // do nothing (when shift key is pressed)
              }
            } else {
              if (hovered_node_id) {
                self_selectNode(draft, "reset", hovered_node_id);
              } else {
                self_clearSelection(draft);
              }
            }

            break;
          }
          case "insert":
            // ignore - insert mode will be handled via click or drag
            break;
        }
      });
    }
    case "document/canvas/backend/html/event/on-pointer-up": {
      return produce(state, (draft) => {
        // clear all trasform state

        draft.content_edit_mode = undefined;
        draft.gesture = undefined;
      });
    }
    // #region drag event
    case "document/canvas/backend/html/event/on-drag-start": {
      const { shiftKey } = <EditorEventTarget_DragStart>action;
      return produce(state, (draft) => {
        // clear all trasform state
        draft.content_edit_mode = undefined;
        draft.marquee = undefined;

        switch (draft.cursor_mode.type) {
          case "cursor": {
            // TODO: improve logic
            if (shiftKey) {
              if (draft.hovered_node_id) {
                self_start_gesture_translate(draft);
              } else {
                // marquee selection
                draft.marquee = {
                  x1: draft.surface_cursor_position[0],
                  y1: draft.surface_cursor_position[1],
                  x2: draft.surface_cursor_position[0],
                  y2: draft.surface_cursor_position[1],
                };
              }
            } else {
              if (draft.selection.length === 0) {
                // marquee selection
                draft.marquee = {
                  x1: draft.surface_cursor_position[0],
                  y1: draft.surface_cursor_position[1],
                  x2: draft.surface_cursor_position[0],
                  y2: draft.surface_cursor_position[1],
                };
              } else {
                self_start_gesture_translate(draft);
              }
            }
            break;
          }
          case "insert":
            const { cursor_position } = state;

            const parent = __get_insert_target(state);

            const parent_rect = domapi.get_node_bounding_rect(parent)!;

            const nnode_relative_position = cmath.vector2.subtract(
              cursor_position,
              // parent position relative to content space
              [parent_rect.x, parent_rect.y]
            );

            const initial_rect = {
              x: nnode_relative_position[0],
              y: nnode_relative_position[1],
              width: 1,
              height: draft.cursor_mode.node === "line" ? 0 : 1,
            };
            //
            const nnode = initialNode(draft.cursor_mode.node, {
              left: initial_rect.x,
              top: initial_rect.y,
              width: initial_rect.width,
              height: initial_rect.height as 0, // casting for line node
            });

            self_insertNode(draft, parent, nnode);
            draft.cursor_mode = { type: "cursor" };
            self_selectNode(draft, "reset", nnode.id);
            self_start_gesture_scale_draw_new_node(draft, {
              new_node_id: nnode.id,
              new_node_rect: initial_rect,
            });

            break;
        }
      });
    }
    case "document/canvas/backend/html/event/on-drag-end": {
      const { node_ids_from_area, shiftKey } = <EditorEventTarget_DragEnd>(
        action
      );
      return produce(state, (draft) => {
        self_maybe_end_gesture_translate(draft);
        draft.gesture = undefined;
        draft.marquee = undefined;
        if (node_ids_from_area) {
          const target_node_ids = getMarqueeSelection(
            state,
            node_ids_from_area
          );

          self_selectNode(
            draft,
            shiftKey ? "toggle" : "reset",
            ...target_node_ids
          );
        }
      });
    }
    case "document/canvas/backend/html/event/on-drag": {
      const {
        event: { delta, movement },
      } = <EditorEventTarget_Drag>action;
      if (state.marquee) {
        return produce(state, (draft) => {
          draft.marquee!.x2 = draft.surface_cursor_position[0];
          draft.marquee!.y2 = draft.surface_cursor_position[1];
        });
      } else {
        // [insertion mode - resize after insertion]
        if (state.gesture?.type === "scale") {
          assert(state.selection.length === 1);
          const node_id = state.selection[0];

          return produce(state, (draft) => {
            assert(draft.gesture?.type === "scale");

            draft.gesture.movement = movement;
            self_update_gesture_transform(draft);
          });
        }

        return produce(state, (draft) => {
          if (draft.gesture?.type !== "translate") return;
          // this is to handle "immediately drag move node"
          draft.gesture.movement = movement;
          self_update_gesture_transform(draft);
        });
      }

      break;
    }
    //
    case "document/canvas/backend/html/event/node/on-pointer-enter": {
      const { node_id } = <EditorEventTarget_Node_PointerEnter>action;
      return produce(state, (draft) => {
        draft.hovered_node_id = node_id;
      });
    }
    case "document/canvas/backend/html/event/node/on-pointer-leave": {
      const { node_id } = <EditorEventTarget_Node_PointerLeave>action;
      return produce(state, (draft) => {
        if (draft.hovered_node_id === node_id) {
          draft.hovered_node_id = undefined;
        }
      });
    }
    //
    case "document/canvas/backend/html/event/node-overlay/on-click": {
      const { selection, node_ids_from_point, shiftKey } = action;
      if (state.gesture?.type === "translate") break;
      return produce(state, (draft) => {
        draft.surface_raycast_detected_node_ids = node_ids_from_point;
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
      });
    }
    case "document/canvas/backend/html/event/node-overlay/on-drag-start": {
      const { selection } = action;
      return produce(state, (draft) => {
        self_start_gesture_translate(draft);
      });
    }
    case "document/canvas/backend/html/event/node-overlay/on-drag-end": {
      const { selection } = action;
      return produce(state, (draft) => {
        self_maybe_end_gesture_translate(draft);
      });
    }
    case "document/canvas/backend/html/event/node-overlay/on-drag": {
      const { selection, event } = action;
      const { movement } = event;

      return produce(state, (draft) => {
        assert(
          draft.gesture?.type === "translate",
          `was expecting translate, but got ${draft.gesture?.type}`
        );
        draft.gesture.movement = movement;
        self_update_gesture_transform(draft);
      });
    }
    // #endregion drag event
    // #region resize handle event
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-start": {
      const { selection, direction } = action;
      //

      return produce(state, (draft) => {
        draft.content_edit_mode = undefined;
        draft.hovered_node_id = undefined;

        self_start_gesture_scale(draft, {
          selection: selection,
          direction: direction,
        });
      });
    }
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-end": {
      return produce(state, (draft) => {
        draft.gesture = undefined;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag": {
      const {
        direction: handle,
        event: { movement },
      } = action;

      return produce(state, (draft) => {
        // cancel if invalid state
        if (draft.gesture?.type !== "scale") return;

        draft.gesture.movement = movement;
        self_update_gesture_transform(draft);
      });
      //
    }
    // #endregion resize handle event

    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-start": {
      const { node_id } = action;

      return produce(state, (draft) => {
        self_selectNode(draft, "reset", node_id);
        draft.gesture = {
          type: "corner-radius",
          initial_bounding_rectangle: domapi.get_node_bounding_rect(node_id)!,
        };
      });
    }
    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-end": {
      return produce(state, (draft) => {
        draft.gesture = undefined;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag": {
      const {
        node_id,
        event: { delta, distance },
      } = action;
      const [dx, dy] = delta;
      // cancel if invalid state
      if (state.gesture?.type !== "corner-radius") return state;

      // const distance = Math.sqrt(dx * dx + dy * dy);
      const d = -Math.round(dx);
      return produce(state, (draft) => {
        const node = document.__getNodeById(draft, node_id);

        if (!("cornerRadius" in node)) {
          return;
        }

        // TODO: get accurate fixed width
        // TODO: also handle by height
        const fixed_width =
          typeof node.width === "number" ? node.width : undefined;
        const maxRaius = fixed_width ? fixed_width / 2 : undefined;

        const nextRadius =
          (typeof node.cornerRadius == "number" ? node.cornerRadius : 0) + d;

        const nextRadiusClamped = Math.floor(
          Math.min(maxRaius ?? Infinity, Math.max(0, nextRadius))
        );
        draft.document.nodes[node_id] = nodeReducer(node, {
          type: "node/change/cornerRadius",
          // TODO: resolve by anchor
          cornerRadius: nextRadiusClamped,
          node_id,
        });
      });
      //
    }

    //
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-start": {
      const { node_id } = <
        EditorEventTarget_NodeOverlayRotationHandle_DragStart
      >action;

      return produce(state, (draft) => {
        self_selectNode(draft, "reset", node_id);
        self_start_gesture_rotate(draft, {
          selection: node_id,
          initial_bounding_rectangle: domapi.get_node_bounding_rect(node_id)!,
          // TODO: the offset of rotation handle relative to the center of the rectangle
          offset: cmath.vector2.zero,
        });
      });
    }
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-end": {
      const {} = <EditorEventTarget_NodeOverlayRotationHandle_DragEnd>action;
      return produce(state, (draft) => {
        draft.gesture = undefined;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag": {
      const {
        node_id,
        direction: anchor,
        event: { delta, movement },
      } = <EditorEventTarget_NodeOverlayRotationHandle_Drag>action;

      return produce(state, (draft) => {
        // cancel if invalid state
        if (draft.gesture?.type !== "rotate") return;
        draft.gesture.movement = movement;

        self_update_gesture_transform(draft);
      });
      //
    }

    // #endregion [html backend] canvas event target
  }
  //
  return state;
}

function self_start_gesture_scale_draw_new_node(
  draft: Draft<IDocumentEditorState>,
  {
    new_node_id,
    new_node_rect,
  }: {
    new_node_id: string;
    new_node_rect: cmath.Rectangle;
  }
) {
  draft.gesture = {
    type: "scale",
    initial_rects: [new_node_rect],
    movement: cmath.vector2.zero,
    selection: [new_node_id],
    direction: "se",
  };
}

function self_start_gesture_scale(
  draft: Draft<IDocumentEditorState>,
  {
    selection,
    direction,
  }: {
    selection: string[];
    direction: cmath.CardinalDirection;
  }
) {
  if (selection.length === 0) return;
  const rects = selection.map(
    (node_id) => domapi.get_node_bounding_rect(node_id)!
  );

  draft.gesture = {
    type: "scale",
    initial_rects: rects,
    movement: cmath.vector2.zero,
    selection: selection,
    direction: direction,
  };

  let i = 0;
  for (const node_id of selection) {
    const node = document.__getNodeById(draft, node_id);
    const rect = rects[i++];

    // once the node's measurement mode is set to fixed (from drag start), we may safely cast the width / height sa fixed number
    // need to assign a fixed size if width or height is a variable length
    const _node = node as grida.program.nodes.i.ICSSDimension;
    if (typeof _node.width !== "number") {
      _node.width = rect.width;
    }
    if (typeof _node.height !== "number") {
      if (node.type === "line") {
        _node.height = 0;
      } else {
        _node.height = rect.height;
      }
    }
  }
}

function self_start_gesture_translate(draft: Draft<IDocumentEditorState>) {
  const selection = draft.selection;
  if (selection.length === 0) return;
  const rects = draft.selection.map(
    (node_id) => domapi.get_node_bounding_rect(node_id)!
  );

  draft.gesture = {
    type: "translate",
    selection: selection,
    initial_clone_ids: selection.map(() => nid()),
    initial_selection: selection,
    initial_rects: rects,
    initial_snapshot: JSON.parse(JSON.stringify(draft.document)),
    movement: cmath.vector2.zero,
    is_currently_cloned: false,
  };
}

function self_maybe_end_gesture_translate(draft: Draft<IDocumentEditorState>) {
  if (draft.gesture?.type !== "translate") return;
  if (draft.gesture.is_currently_cloned) {
    // update the selection as the cloned nodes
    self_selectNode(draft, "reset", ...draft.gesture.selection);
  }

  draft.surface_measurement_targeting_locked = false;
  draft.gesture = undefined;
  draft.dropzone_node_id = undefined;
}

function self_start_gesture_rotate(
  draft: Draft<IDocumentEditorState>,
  {
    selection,
    offset,
    initial_bounding_rectangle,
  }: {
    selection: string;
    initial_bounding_rectangle: cmath.Rectangle;
    offset: cmath.Vector2;
  }
) {
  draft.gesture = {
    type: "rotate",
    initial_bounding_rectangle: initial_bounding_rectangle,
    offset: offset,
    selection: selection,
    movement: cmath.vector2.zero,
  };
}

/**
 * get the parent of newly inserting node based on the current state
 * @returns
 */
function __get_insert_target(state: IDocumentEditorState): string {
  const first_hit = state.surface_raycast_detected_node_ids[0];
  const parent = first_hit
    ? document.__getNodeById(state, first_hit).type === "container"
      ? first_hit
      : state.document.root_id
    : state.document.root_id;
  return parent;
}

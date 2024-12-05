import { produce, type Draft } from "immer";

import type {
  BuilderAction,
  EditorSurface_PointerMove,
  EditorSurface_PointerMoveRaycast,
  EditorSurface_PointerDown,
  EditorSurface_Click,
  //
  EditorSurface_Drag,
  EditorSurface_DragStart,
  EditorSurface_DragEnd,
  //
  EditorSurface_NodeOverlayRotationHandle_Drag,
  EditorSurface_NodeOverlayRotationHandle_DragEnd,
  EditorSurface_NodeOverlayRotationHandle_DragStart,
  SurfaceAction,
  //
} from "../action";
import type { IDocumentEditorState, SurfaceRaycastTargeting } from "../types";
import { grida } from "@/grida";
import { v4 } from "uuid";
import { documentquery } from "../document-query";
import nodeReducer from "./node.reducer";
import nodeTransformReducer from "./node-transform.reducer";
import initialNode from "./tools/initial-node";
import assert from "assert";
import {
  self_clearSelection,
  self_deleteNode,
  self_insertNode,
  self_selectNode,
  self_updateSurfaceHoverState,
} from "./methods";
import { cmath } from "../math";

export default function surfaceReducer<S extends IDocumentEditorState>(
  state: S,
  action: SurfaceAction
): S {
  // console.log("surfaceReducer", action);
  switch (action.type) {
    // #region [html backend] canvas event target
    case "document/canvas/backend/html/event/on-pointer-move": {
      const {
        position: { x, y },
      } = <EditorSurface_PointerMove>action;
      return produce(state, (draft) => {
        draft.surface_cursor_position = [x, y];
        draft.cursor_position = cmath.vector2.subtract(
          draft.surface_cursor_position,
          draft.translate ?? [0, 0]
        );
      });
    }
    case "document/canvas/backend/html/event/on-pointer-move-raycast": {
      const { node_ids_from_point } = <EditorSurface_PointerMoveRaycast>action;
      return produce(state, (draft) => {
        draft.surface_raycast_detected_node_ids = node_ids_from_point;
        self_updateSurfaceHoverState(draft);
      });
    }
    case "document/canvas/backend/html/event/on-click": {
      const { position } = <EditorSurface_Click>action;
      return produce(state, (draft) => {
        switch (draft.cursor_mode.type) {
          case "cursor": {
            // ignore
            break;
          }
          case "insert":
            const nnode = initialNode(draft.cursor_mode.node, {
              left: state.cursor_position[0],
              top: state.cursor_position[1],
            });

            // center translate the new node.
            try {
              const _nnode = nnode as grida.program.nodes.RectangleNode;
              _nnode.left! -= _nnode.width / 2;
              _nnode.top! -= _nnode.height / 2;
            } catch (e) {}

            self_insertNode(draft, draft.document.root_id, nnode);
            draft.cursor_mode = { type: "cursor" };
            self_selectNode(draft, "reset", nnode.id);
            break;
        }
      });
    }
    case "document/canvas/backend/html/event/on-pointer-down": {
      const { node_ids_from_point, shiftKey } = <EditorSurface_PointerDown>(
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

        draft.surface_content_edit_mode = false;
        draft.is_gesture_node_drag_move = false;
        draft.is_gesture_node_drag_resize = false;
      });
    }
    // #region drag event
    case "document/canvas/backend/html/event/on-drag-start": {
      const { shiftKey } = <EditorSurface_DragStart>action;
      return produce(state, (draft) => {
        // clear all trasform state
        draft.surface_content_edit_mode = false;
        draft.is_gesture_node_drag_resize = false;
        draft.marquee = undefined;

        switch (draft.cursor_mode.type) {
          case "cursor": {
            // TODO: improve logic
            if (shiftKey) {
              // marquee selection
              draft.marquee = {
                x1: draft.surface_cursor_position[0],
                y1: draft.surface_cursor_position[1],
                x2: draft.surface_cursor_position[0],
                y2: draft.surface_cursor_position[1],
              };
            } else {
              if (draft.selected_node_ids.length === 0) {
                // marquee selection
                draft.marquee = {
                  x1: draft.surface_cursor_position[0],
                  y1: draft.surface_cursor_position[1],
                  x2: draft.surface_cursor_position[0],
                  y2: draft.surface_cursor_position[1],
                };
              } else {
                draft.is_gesture_node_drag_move = true;
              }
            }
            break;
          }
          case "insert":
            //
            const nnode = initialNode(draft.cursor_mode.node, {
              left: draft.cursor_position[0],
              top: draft.cursor_position[1],
              width: 1,
              height: (draft.cursor_mode.node === "line" ? 0 : 1) as 0,
            });
            self_insertNode(draft, draft.document.root_id, nnode);
            draft.cursor_mode = { type: "cursor" };
            self_selectNode(draft, "reset", nnode.id);
            draft.is_gesture_node_drag_resize = true;
            // TODO: after inserting, refresh fonts registry
            break;
        }
      });
    }
    case "document/canvas/backend/html/event/on-drag-end": {
      const { node_ids_from_area, shiftKey } = <EditorSurface_DragEnd>action;
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_move = false;
        draft.marquee = undefined;
        if (node_ids_from_area) {
          // except the root node & locked nodes
          const target_node_ids = node_ids_from_area.filter(
            (node_id) =>
              node_id !== draft.document.root_id &&
              !documentquery.__getNodeById(draft, node_id).locked
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
        event: { delta, distance },
      } = <EditorSurface_Drag>action;
      if (state.marquee) {
        return produce(state, (draft) => {
          draft.marquee!.x2 = draft.surface_cursor_position[0];
          draft.marquee!.y2 = draft.surface_cursor_position[1];
        });
      } else {
        // [insertion mode - resize after insertion]
        if (state.is_gesture_node_drag_resize) {
          assert(state.selected_node_ids.length === 1);
          const node_id = state.selected_node_ids[0];

          const [dx, dy] = delta;
          return produce(state, (draft) => {
            const node = documentquery.__getNodeById(draft, node_id);

            draft.document.nodes[node_id] = nodeTransformReducer(node, {
              type: "resize",
              anchor: "se",
              dx: dx,
              dy: dy,
            });
          });
        }

        if (state.is_gesture_node_drag_move) {
          // this is to handle "immediately drag move node"
          // multiple selection dragging will be handled by node overlay drag event
          if (state.selected_node_ids.length !== 1) break;
        }

        // TODO: support multiple selection
        if (state.selected_node_ids.length !== 1) break;

        const node_id = state.selected_node_ids[0];

        const [dx, dy] = delta;

        return produce(state, (draft) => {
          const node = documentquery.__getNodeById(draft, node_id);
          draft.document.nodes[node_id] = nodeTransformReducer(node, {
            type: "move",
            dx: dx,
            dy: dy,
          });
          //
        });
      }

      break;
    }
    //
    case "document/canvas/backend/html/event/node-overlay/on-click": {
      const { selection, node_ids_from_point, shiftKey } = action;
      if (state.is_gesture_node_drag_move) break;
      return produce(state, (draft) => {
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
      });
    }
    case "document/canvas/backend/html/event/node-overlay/on-drag-start": {
      const { selection } = action;
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_move = true;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/on-drag-end": {
      const { selection } = action;
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_move = false;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/on-drag": {
      const { selection, event } = action;
      const { delta, distance } = event;
      const [dx, dy] = delta;
      if (state.is_gesture_node_drag_move) {
        return produce(state, (draft) => {
          selection.forEach((node_id) => {
            const node = documentquery.__getNodeById(draft, node_id);
            draft.document.nodes[node_id] = nodeTransformReducer(node, {
              type: "move",
              dx: dx,
              dy: dy,
            });
          });
        });
      }
      break;
    }
    // #endregion drag event
    // #region resize handle event
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-start": {
      const { node_id, client_wh } = action;
      //

      return produce(state, (draft) => {
        draft.surface_content_edit_mode = false;
        draft.is_gesture_node_drag_resize = true;
        draft.is_gesture_node_drag_move = false;
        draft.hovered_node_id = undefined;

        const node = documentquery.__getNodeById(draft, node_id);

        // need to assign a fixed size if width or height is a variable length
        (node as grida.program.nodes.i.ICSSDimension).width = client_wh.width;
        // (node as grida.program.nodes.i.ICSSStylable).style.width = client_wh.width;
        (node as grida.program.nodes.i.ICSSDimension).height = client_wh.height;
        // (node as grida.program.nodes.i.ICSSStylable).style.height = client_wh.height;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-end": {
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_resize = false;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag": {
      const {
        node_id,
        anchor,
        event: { delta, distance },
      } = action;
      const [dx, dy] = delta;

      // cancel if invalid state
      if (!state.is_gesture_node_drag_resize) return state;

      return produce(state, (draft) => {
        // once the node's measurement mode is set to fixed (from drag start), we may safely cast the width / height sa fixed number
        const node = documentquery.__getNodeById(draft, node_id);

        draft.document.nodes[node_id] = nodeTransformReducer(node, {
          type: "resize",
          anchor,
          dx: dx,
          dy: dy,
        });
      });
      //
      //
    }
    // #endregion resize handle event

    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-start": {
      const { node_id } = action;

      return produce(state, (draft) => {
        self_selectNode(draft, "reset", node_id);
        draft.is_gesture_node_drag_corner_radius = true;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-end": {
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_corner_radius = false;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag": {
      const {
        node_id,
        event: { delta, distance },
      } = action;
      const [dx, dy] = delta;
      // cancel if invalid state
      if (!state.is_gesture_node_drag_corner_radius) return state;

      // const distance = Math.sqrt(dx * dx + dy * dy);
      const d = -Math.round(dx);
      return produce(state, (draft) => {
        const node = documentquery.__getNodeById(draft, node_id);

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
      const { node_id } = <EditorSurface_NodeOverlayRotationHandle_DragStart>(
        action
      );

      return produce(state, (draft) => {
        self_selectNode(draft, "reset", node_id);
        draft.is_gesture_node_drag_rotation = true;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-end": {
      const {} = <EditorSurface_NodeOverlayRotationHandle_DragEnd>action;
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_rotation = false;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag": {
      const {
        node_id,
        event: { delta, distance },
      } = <EditorSurface_NodeOverlayRotationHandle_Drag>action;

      const [dx, dy] = delta;
      // cancel if invalid state
      if (!state.is_gesture_node_drag_rotation) return state;

      const d = Math.round(dx);
      return produce(state, (draft) => {
        const node = documentquery.__getNodeById(draft, node_id);

        draft.document.nodes[node_id] = nodeReducer(node, {
          type: "node/change/rotation",
          rotation:
            ((node as grida.program.nodes.i.IRotation).rotation ?? 0) + d,
          node_id,
        });
      });
      //
    }

    // #endregion [html backend] canvas event target

    // #region [universal backend] canvas event target
    case "document/canvas/content-edit-mode/try-enter": {
      if (state.selected_node_ids.length !== 1) break;
      const node_id = state.selected_node_ids[0];
      const node = documentquery.__getNodeById(state, node_id);

      // only text node can enter the content edit mode
      if (node.type !== "text") return state;

      // the text node should have a string literal value assigned (we don't support props editing via surface)
      if (typeof node.text !== "string") return state;

      return produce(state, (draft) => {
        draft.surface_content_edit_mode = "text";
      });
      break;
    }
    case "document/canvas/content-edit-mode/try-exit": {
      return produce(state, (draft) => {
        draft.surface_content_edit_mode = false;
      });
    }
    case "document/canvas/cursor-mode": {
      const { cursor_mode } = action;
      return produce(state, (draft) => {
        draft.cursor_mode = cursor_mode;
      });
    }
    // #endregion
  }
  //
  return state;
}

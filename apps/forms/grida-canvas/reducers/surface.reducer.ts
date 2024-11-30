import { produce, type Draft } from "immer";

import type {
  BuilderAction,
  DocumentEditorCanvasEventTargetHtmlBackendKeyDown,
  DocumentEditorCanvasEventTargetHtmlBackendKeyUp,
  //
  DocumentEditorCanvasEventTargetHtmlBackendPointerMove,
  DocumentEditorCanvasEventTargetHtmlBackendPointerMoveRaycast,
  DocumentEditorCanvasEventTargetHtmlBackendPointerDown,
  DocumentEditorCanvasEventTargetHtmlBackendClick,
  //
  DocumentEditorCanvasEventTargetHtmlBackendDrag,
  DocumentEditorCanvasEventTargetHtmlBackendDragStart,
  DocumentEditorCanvasEventTargetHtmlBackendDragEnd,
  //
  DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDrag,
  DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDragEnd,
  DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDragStart,
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
  self_deleteNode,
  self_insertNode,
  self_updateSurfaceHoverState,
} from "./methods";

const keyboard_key_bindings = {
  r: "rectangle",
  t: "text",
  o: "ellipse",
  f: "container",
  a: "container",
} as const;

export default function surfaceReducer<S extends IDocumentEditorState>(
  state: S,
  action: BuilderAction
): S {
  switch (action.type) {
    // #region [html backend] canvas event target
    case "document/canvas/backend/html/event/on-key-down": {
      const { key, altKey, metaKey, shiftKey } = <
        DocumentEditorCanvasEventTargetHtmlBackendKeyDown
      >action;
      return produce(state, (draft) => {
        // Meta key (meta only)
        if (
          metaKey && // Meta key is pressed
          !altKey && // Alt key is not pressed
          !shiftKey && // Shift key is not pressed
          key === "Meta"
        ) {
          draft.surface_raycast_targeting.target = "deepest";
          self_updateSurfaceHoverState(draft);
        }
        if (metaKey && key === "c") {
          // Copy logic
          if (draft.selected_node_id) {
            const selectedNode = documentquery.__getNodeById(
              draft,
              draft.selected_node_id
            );
            draft.clipboard = JSON.parse(JSON.stringify(selectedNode)); // Deep copy the node
          }
        } else if (metaKey && key === "x") {
          // Cut logic
          if (draft.selected_node_id) {
            const selectedNode = documentquery.__getNodeById(
              draft,
              draft.selected_node_id
            );
            draft.clipboard = JSON.parse(JSON.stringify(selectedNode)); // Deep copy the node
            self_deleteNode(draft, draft.selected_node_id);
          }
        } else if (metaKey && key === "v") {
          // Paste logic
          if (draft.clipboard) {
            const newNode = JSON.parse(JSON.stringify(draft.clipboard));
            newNode.id = v4(); // Assign a new unique ID
            const offset = 10; // Offset to avoid overlapping
            if (newNode.left !== undefined) newNode.left += offset;
            if (newNode.top !== undefined) newNode.top += offset;
            self_insertNode(draft, draft.document.root_id, newNode);
            // after
            draft.cursor_mode = { type: "cursor" };
            draft.selected_node_id = newNode.id; // Select the newly pasted node
          }
        }

        switch (key) {
          case "v": {
            draft.cursor_mode = { type: "cursor" };
            break;
          }
          case "r":
          case "t":
          case "o":
          case "f":
          case "a": {
            draft.cursor_mode = {
              type: "insert",
              node: keyboard_key_bindings[key],
            };
            break;
          }
          case "Backspace": {
            if (draft.selected_node_id) {
              if (draft.document.root_id !== draft.selected_node_id) {
                self_deleteNode(draft, draft.selected_node_id);
              }
            }
            break;
          }
        }
      });
    }
    case "document/canvas/backend/html/event/on-key-up": {
      const { key, altKey, metaKey, shiftKey } = <
        DocumentEditorCanvasEventTargetHtmlBackendKeyUp
      >action;
      return produce(state, (draft) => {
        if (key === "Meta") {
          draft.surface_raycast_targeting.target = "shallowest";
          self_updateSurfaceHoverState(draft);
        }
      });
    }
    case "document/canvas/backend/html/event/on-pointer-move": {
      const {
        position: { x, y },
      } = <DocumentEditorCanvasEventTargetHtmlBackendPointerMove>action;
      return produce(state, (draft) => {
        draft.cursor_position.x = x;
        draft.cursor_position.y = y;
      });
    }
    case "document/canvas/backend/html/event/on-pointer-move-raycast": {
      const { node_ids_from_point } = <
        DocumentEditorCanvasEventTargetHtmlBackendPointerMoveRaycast
      >action;
      return produce(state, (draft) => {
        draft.surface_raycast_detected_node_ids = node_ids_from_point;
        self_updateSurfaceHoverState(draft);
      });
    }
    case "document/canvas/backend/html/event/on-pointer-down": {
      const { node_ids_from_point } = <
        DocumentEditorCanvasEventTargetHtmlBackendPointerDown
      >action;
      return produce(state, (draft) => {
        switch (draft.cursor_mode.type) {
          case "cursor": {
            draft.surface_raycast_detected_node_ids = node_ids_from_point;
            const { hovered_node_id } = self_updateSurfaceHoverState(draft);
            draft.selected_node_id = hovered_node_id;
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
    case "document/canvas/backend/html/event/on-click": {
      const { position } = <DocumentEditorCanvasEventTargetHtmlBackendClick>(
        action
      );
      return produce(state, (draft) => {
        switch (draft.cursor_mode.type) {
          case "cursor": {
            // ignore
            break;
          }
          case "insert":
            const nnode = initialNode(draft.cursor_mode.node, {
              // TODO: need to transform to a relative position (to root renderer or parent node
              left: position.x,
              top: position.y,
            });
            self_insertNode(draft, draft.document.root_id, nnode);
            draft.cursor_mode = { type: "cursor" };
            draft.selected_node_id = nnode.id;
            break;
        }
      });
    }
    // #region drag event
    case "document/canvas/backend/html/event/on-drag-start": {
      const {} = <DocumentEditorCanvasEventTargetHtmlBackendDragStart>action;
      return produce(state, (draft) => {
        // clear all trasform state
        draft.surface_content_edit_mode = false;
        draft.is_gesture_node_drag_resize = false;

        switch (draft.cursor_mode.type) {
          case "cursor": {
            if (!draft.selected_node_id) {
              // marquee selection
              draft.marquee = {
                x1: draft.cursor_position.x,
                y1: draft.cursor_position.y,
                x2: draft.cursor_position.x,
                y2: draft.cursor_position.y,
              };
            } else {
              draft.is_gesture_node_drag_move = true;
            }
            break;
          }
          case "insert":
            //
            const nnode = initialNode(draft.cursor_mode.node, {
              // TODO: need to transform to a relative position (to root renderer or parent node
              left: draft.cursor_position.x,
              top: draft.cursor_position.y,
              width: 1,
              height: (draft.cursor_mode.node === "line" ? 0 : 1) as 0,
            });
            self_insertNode(draft, draft.document.root_id, nnode);
            draft.cursor_mode = { type: "cursor" };
            draft.selected_node_id = nnode.id;
            draft.is_gesture_node_drag_resize = true;
            // TODO: after inserting, refresh fonts registry
            break;
        }
      });
    }
    case "document/canvas/backend/html/event/on-drag-end": {
      const {} = <DocumentEditorCanvasEventTargetHtmlBackendDragEnd>action;
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_move = false;
        draft.marquee = undefined;
      });
    }
    case "document/canvas/backend/html/event/on-drag": {
      const {
        event: { delta, distance },
      } = <DocumentEditorCanvasEventTargetHtmlBackendDrag>action;
      if (state.marquee) {
        return produce(state, (draft) => {
          draft.marquee!.x2 = draft.cursor_position.x;
          draft.marquee!.y2 = draft.cursor_position.y;
        });
      } else {
        //
        if (state.is_gesture_node_drag_resize) {
          return produce(state, (draft) => {
            const node_id = state.selected_node_id!;
            const node = documentquery.__getNodeById(draft, node_id);
            const [dx, dy] = delta;

            draft.document.nodes[node_id] = nodeTransformReducer(node, {
              type: "resize",
              anchor: "se",
              dx: dx,
              dy: dy,
            });
          });
        }

        if (state.is_gesture_node_drag_move) {
          const nid = state.selected_node_id!;

          const [dx, dy] = delta;

          return produce(state, (draft) => {
            const node = documentquery.__getNodeById(draft, nid);
            draft.document.nodes[nid] = nodeTransformReducer(node, {
              type: "move",
              dx: dx,
              dy: dy,
            });
            //
          });
        }
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
        draft.selected_node_id = node_id;
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
      const { node_id } = <
        DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDragStart
      >action;

      return produce(state, (draft) => {
        draft.selected_node_id = node_id;
        draft.is_gesture_node_drag_rotation = true;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-end": {
      const {} = <
        DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDragEnd
      >action;
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_rotation = false;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag": {
      const {
        node_id,
        event: { delta, distance },
      } = <
        DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDrag
      >action;

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
      if (!state.selected_node_id) return state;
      const node = documentquery.__getNodeById(state, state.selected_node_id);

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

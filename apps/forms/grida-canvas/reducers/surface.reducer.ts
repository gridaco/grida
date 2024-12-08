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
import { cmath } from "../cmath";
import { domapi } from "../domapi";
import { snapMovementToObjects } from "./tools/snap";

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
        draft.gesture = undefined;
      });
    }
    // #region drag event
    case "document/canvas/backend/html/event/on-drag-start": {
      const { shiftKey } = <EditorSurface_DragStart>action;
      return produce(state, (draft) => {
        // clear all trasform state
        draft.surface_content_edit_mode = false;
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
              if (draft.selection.length === 0) {
                // marquee selection
                draft.marquee = {
                  x1: draft.surface_cursor_position[0],
                  y1: draft.surface_cursor_position[1],
                  x2: draft.surface_cursor_position[0],
                  y2: draft.surface_cursor_position[1],
                };
              } else {
                self_startTranslateGesture(draft);
              }
            }
            break;
          }
          case "insert":
            const initial_rect = {
              x: draft.cursor_position[0],
              y: draft.cursor_position[1],
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

            self_insertNode(draft, draft.document.root_id, nnode);
            draft.cursor_mode = { type: "cursor" };
            self_selectNode(draft, "reset", nnode.id);
            draft.gesture = {
              type: "scale",
              initial_bounding_rectangle: initial_rect,
            };
            break;
        }
      });
    }
    case "document/canvas/backend/html/event/on-drag-end": {
      const { node_ids_from_area, shiftKey } = <EditorSurface_DragEnd>action;
      return produce(state, (draft) => {
        self_endTranslateGesture(draft);
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
        event: { delta, movement },
      } = <EditorSurface_Drag>action;
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
            self_scaleGesture(draft, {
              node_id,
              handle: "se",
              rawMovement: movement,
            });
          });
        }

        return produce(state, (draft) => {
          // this is to handle "immediately drag move node"
          self_translateGesture(draft, movement);
        });
      }

      break;
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
        self_startTranslateGesture(draft);
      });
    }
    case "document/canvas/backend/html/event/node-overlay/on-drag-end": {
      const { selection } = action;
      return produce(state, (draft) => {
        self_endTranslateGesture(draft);
      });
    }
    case "document/canvas/backend/html/event/node-overlay/on-drag": {
      const { selection, event } = action;
      const { movement } = event;

      return produce(state, (draft) => {
        self_translateGesture(draft, movement);
      });
    }
    // #endregion drag event
    // #region resize handle event
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-start": {
      const { node_id } = action;
      //

      return produce(state, (draft) => {
        draft.surface_content_edit_mode = false;
        const node = documentquery.__getNodeById(draft, node_id);
        const node_rect = domapi.get_node_bounding_rect(node_id)!;
        draft.gesture = {
          type: "scale",
          initial_bounding_rectangle: node_rect,
        };
        draft.hovered_node_id = undefined;

        // once the node's measurement mode is set to fixed (from drag start), we may safely cast the width / height sa fixed number
        // need to assign a fixed size if width or height is a variable length
        const _node = node as grida.program.nodes.i.ICSSDimension;
        if (typeof _node.width !== "number") {
          _node.width = node_rect.width;
        }
        if (typeof _node.height !== "number") {
          _node.height = node_rect.height;
        }
      });
    }
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-end": {
      return produce(state, (draft) => {
        draft.gesture = undefined;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag": {
      const {
        node_id,
        direction: handle,
        event: { movement },
      } = action;

      // cancel if invalid state
      if (state.gesture?.type !== "scale") return state;

      return produce(state, (draft) => {
        self_scaleGesture(draft, { node_id, handle, rawMovement: movement });
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
        draft.gesture = {
          type: "rotate",
          initial_bounding_rectangle: domapi.get_node_bounding_rect(node_id)!,
        };
      });
    }
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-end": {
      const {} = <EditorSurface_NodeOverlayRotationHandle_DragEnd>action;
      return produce(state, (draft) => {
        draft.gesture = undefined;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag": {
      const {
        node_id,
        direction: anchor,
        event: { delta, movement },
      } = <EditorSurface_NodeOverlayRotationHandle_Drag>action;

      // cancel if invalid state
      if (state.gesture?.type !== "rotate") return state;

      const angle = cmath.quantize(
        cmath.principalAngle(
          // TODO: need to store the initial angle and subtract
          // TODO: get anchor and calculate the offset
          // TODO: translate the movement (distance) relative to the center of the node
          cmath.vector2.angle([0, 0], movement)
        ),
        1
      );

      return produce(state, (draft) => {
        const node = documentquery.__getNodeById(draft, node_id);

        draft.document.nodes[node_id] = nodeReducer(node, {
          type: "node/change/rotation",
          rotation: angle,
          node_id,
        });
      });
      //
    }

    // #endregion [html backend] canvas event target

    // #region [universal backend] canvas event target
    case "document/canvas/content-edit-mode/try-enter": {
      if (state.selection.length !== 1) break;
      const node_id = state.selection[0];
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

function self_scaleGesture(
  draft: Draft<IDocumentEditorState>,
  {
    node_id,
    handle,
    rawMovement,
  }: {
    node_id: string;
    handle: cmath.CardinalDirection;
    rawMovement: cmath.Vector2;
  }
) {
  if (draft.gesture?.type !== "scale") return;
  const node = documentquery.__getNodeById(draft, node_id);

  const initial = draft.gesture.initial_bounding_rectangle;
  assert(initial);

  // get the origin point based on handle
  const origin = cmath.rect.getCardinalPoint(
    initial,
    __scale_direction_to_transform_origin_point[handle]
  );

  // inverse the delta based on handle
  const movement = cmath.vector2.multiply(
    __resize_handle_to_mouse_direction_multiplier[handle],
    rawMovement
  );

  draft.document.nodes[node_id] = nodeTransformReducer(node, {
    type: "scale",
    initial,
    origin,
    movement,
  });
}

function self_startTranslateGesture(draft: Draft<IDocumentEditorState>) {
  // TODO: handle multiple selection
  const node_id = draft.selection[0];

  // const snapshot = JSON.parse(JSON.stringify(draft)); // TODO: check performance

  draft.gesture = {
    type: "translate",
    initial_bounding_rectangle: domapi.get_node_bounding_rect(node_id)!,
    // initial_node_id: node_id,
    // snapshot: snapshot,
  };
}

function self_translateGesture(
  draft: Draft<IDocumentEditorState>,
  movement: cmath.Vector2
) {
  if (draft.gesture?.type !== "translate") return;
  // selection.forEach((node_id) => {
  //   const node = documentquery.__getNodeById(draft, node_id);
  //   draft.document.nodes[node_id] = nodeTransformReducer(node, {
  //     type: "position",
  //     dx: dx,
  //     dy: dy,
  //   });
  // });
  // multiple selection dragging will be handled by node overlay drag event
  // if (state.selected_node_ids.length !== 1) break;

  //
  const node_id = draft.selection[0];

  if (draft.modifiers.translate_with_clone) {
    //
  }

  //
  const snap_target_node_ids = documentquery
    .getSiblings(draft.document_ctx, node_id)
    .concat(documentquery.getParentId(draft.document_ctx, node_id) ?? []);

  const target_node_rects = snap_target_node_ids.map((node_id) => {
    return domapi.get_node_bounding_rect(node_id)!;
  });

  assert(draft.gesture.initial_bounding_rectangle);

  const {
    position: [x, y],
  } = snapMovementToObjects(
    draft.gesture.initial_bounding_rectangle,
    target_node_rects,
    movement
  );

  const node = documentquery.__getNodeById(draft, node_id);

  draft.document.nodes[node_id] = nodeTransformReducer(node, {
    type: "position",
    x: x,
    y: y,
  });
}

function self_endTranslateGesture(draft: Draft<IDocumentEditorState>) {
  draft.gesture = undefined;
}

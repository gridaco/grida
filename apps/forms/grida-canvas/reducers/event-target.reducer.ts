import { original, produce, type Draft } from "immer";

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
import type { GestureDraw, IDocumentEditorState } from "../state";
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
import { vn } from "@/grida/vn";
import { getInitialCurveGesture } from "./tools/gesture";

export default function eventTargetReducer<S extends IDocumentEditorState>(
  state: S,
  action: EventTargetAction
): S {
  // console.log("surface", action);
  switch (action.type) {
    // #region [html backend] canvas event target
    case "document/canvas/backend/html/event/on-pointer-move": {
      const {
        position: { x, y },
      } = <EditorEventTarget_PointerMove>action;
      const c_surface_pos: cmath.Vector2 = [x, y];
      const c_content_pos = cmath.vector2.sub(
        state.surface_cursor_position,
        state.content_offset ?? cmath.vector2.zero
      );

      return produce(state, (draft) => {
        draft.surface_cursor_position = c_surface_pos;
        draft.cursor_position = c_content_pos;
        if (draft.content_edit_mode?.type === "path") {
          const { a_point, node_id } = draft.content_edit_mode;
          const { tarnslate_with_axis_lock } = state.gesture_modifiers;

          if (
            typeof a_point === "number" &&
            tarnslate_with_axis_lock === "on"
          ) {
            const node = document.__getNodeById(
              state,
              node_id
            ) as grida.program.nodes.PathNode;
            const { left: nx, top: ny } = node;
            const n_offset: cmath.Vector2 = [nx!, ny!];
            const { vertices } = node.vectorNetwork;
            const a = vertices[a_point];

            // mock the movement (movement = cursor pos - anchor pos)
            const movement = cmath.vector2.sub(
              c_content_pos,
              cmath.vector2.add(n_offset, a.p)
            );

            // movement relative to `a` point
            const adj_movement =
              cmath.ext.movement.axisLockedByDominance(movement);

            const adj_pos = cmath.vector2.add(a.p, adj_movement, n_offset);
            draft.content_edit_mode.path_cursor_position = adj_pos;
          } else {
            draft.content_edit_mode.path_cursor_position = c_content_pos;
          }
        }
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

              const nnode_relative_position = cmath.vector2.sub(
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
              draft.content_edit_mode = { type: "text", node_id: nnode.id };
            }
            break;
        }
      });
    }
    case "document/canvas/backend/html/event/on-double-click": {
      // [double click event]
      // - DOES NOT "enter content edit mode" - this is handled by its own action.
      return produce(state, (draft) => {
        if (state.gesture.type !== "idle") return; // ignore when gesture is active

        const { document_ctx, selection, surface_raycast_detected_node_ids } =
          state;
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
        const next = getDoubleclickTarget(
          state,
          surface_raycast_detected_node_ids,
          current_node_id
        );

        // Update the selection if a valid next focus is found
        if (next) {
          self_selectNode(draft, "reset", next);
        }
        // #endregion
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

            // ignore if in content edit mode
            if (draft.content_edit_mode) break;

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
          case "path": {
            if (draft.content_edit_mode?.type === "path") {
              const { hovered_vertex_idx: hovered_point } = state;
              const { node_id, path_cursor_position, a_point } =
                draft.content_edit_mode;

              const node = document.__getNodeById(
                draft,
                node_id
              ) as grida.program.nodes.PathNode;

              const vne = new vn.VectorNetworkEditor(node.vectorNetwork);

              const position =
                typeof hovered_point === "number"
                  ? node.vectorNetwork.vertices[hovered_point].p
                  : // relative position
                    cmath.vector2.sub(path_cursor_position, [
                      node.left!,
                      node.top!,
                    ]);

              const next = vne.addVertex(position, a_point, true);
              const bb_b = vne.getBBox();

              const delta: cmath.Vector2 = [bb_b.x, bb_b.y];
              vne.translate(cmath.vector2.invert(delta));

              const new_pos = cmath.vector2.add([node.left!, node.top!], delta);

              node.left = new_pos[0];
              node.top = new_pos[1];
              node.width = bb_b.width;
              node.height = bb_b.height;

              node.vectorNetwork = vne.value;

              draft.content_edit_mode.selected_vertices = [next];
              draft.content_edit_mode.a_point = next;

              // ...
            } else {
              // create a new node
              const new_node_id = nid();

              const vector = {
                type: "path",
                name: "path",
                id: new_node_id,
                active: true,
                locked: false,
                position: "absolute",
                left: 0,
                top: 0,
                opacity: 1,
                width: 0,
                height: 0,
                rotation: 0,
                zIndex: 0,
                stroke: { type: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
                strokeCap: "butt",
                strokeWidth: 3,
                vectorNetwork: {
                  vertices: [{ p: cmath.vector2.zero }],
                  segments: [],
                },
              } satisfies grida.program.nodes.PathNode;

              const pos = draft.cursor_position;

              vector.left = pos[0];
              vector.top = pos[1];

              const parent = __get_insert_target(state);
              self_insertNode(draft, parent, vector);
              self_selectNode(draft, "reset", vector.id);

              draft.content_edit_mode = {
                type: "path",
                node_id: new_node_id,
                selected_vertices: [0], // select the first point
                a_point: 0,
                path_cursor_position: pos,
              };
            }

            //
            break;
          }
        }
      });
    }
    case "document/canvas/backend/html/event/on-pointer-up": {
      return produce(state, (draft) => {
        draft.gesture = { type: "idle" };
      });
    }
    // #region drag event
    case "document/canvas/backend/html/event/on-drag-start": {
      const { shiftKey } = <EditorEventTarget_DragStart>action;

      // if there is already a gesture, ignore
      if (state.gesture.type !== "idle") return state;

      return produce(state, (draft) => {
        // clear all trasform state
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
          case "insert": {
            const { cursor_position } = state;

            const parent = __get_insert_target(state);

            const initial_rect = {
              x: cursor_position[0],
              y: cursor_position[1],
              width: 1,
              height: 1,
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
          case "draw": {
            const tool = draft.cursor_mode.tool;

            const { cursor_position } = state;

            let vector:
              | grida.program.nodes.PathNode
              | grida.program.nodes.LineNode;

            const new_node_id = nid();
            const __base = {
              id: new_node_id,
              active: true,
              locked: false,
              position: "absolute",
              left: 0,
              top: 0,
              opacity: 1,
              width: 0,
              height: 0,
              rotation: 0,
              zIndex: 0,
              stroke: { type: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
              strokeCap: "butt",
            } as const;

            switch (tool) {
              case "pencil": {
                vector = {
                  ...__base,
                  type: "path",
                  name: "path",
                  strokeWidth: 3,
                  vectorNetwork: vn.polyline([cmath.vector2.zero]),
                } satisfies grida.program.nodes.PathNode;
                break;
              }
              case "line": {
                // vector = {
                //   ...__base,
                //   type: "line",
                //   name: "line",
                // } satisfies grida.program.nodes.LineNode;

                vector = {
                  ...__base,
                  type: "path",
                  name: "line",
                  strokeWidth: 1,
                  vectorNetwork: vn.polyline([cmath.vector2.zero]),
                } satisfies grida.program.nodes.PathNode;
                break;
              }
            }

            // insert a new vector node
            const parent = __get_insert_target(state);
            self_insertNode(draft, parent, vector);

            // position relative to the parent
            const parent_rect = domapi.get_node_bounding_rect(parent)!;
            const node_relative_pos = cmath.vector2.sub(cursor_position, [
              parent_rect.x,
              parent_rect.y,
            ]);
            vector.left = node_relative_pos[0];
            vector.top = node_relative_pos[1];

            draft.gesture = {
              type: "draw",
              mode: tool,
              origin: node_relative_pos,
              movement: cmath.vector2.zero,
              points: [cmath.vector2.zero],
              node_id: vector.id,
            };

            // selection & hover state
            switch (tool) {
              case "line":
                // self_selectNode(draft, "reset", vector.id);
                self_clearSelection(draft);
                break;
              case "pencil":
                // clear selection for pencil mode
                self_clearSelection(draft);
                break;
            }
            break;
          }
          case "path": {
            // [path tool, drag start]
            assert(state.content_edit_mode?.type === "path");
            const { node_id, selected_vertices } = state.content_edit_mode;
            assert(selected_vertices.length === 1);
            const vertex = selected_vertices[0];

            const node = document.__getNodeById(
              state,
              node_id
            ) as grida.program.nodes.PathNode;

            const vne = new vn.VectorNetworkEditor(node.vectorNetwork);
            const segments = vne.findSegments(vertex);

            assert(segments.length === 1);
            const segment_idx = segments[0];

            const gesture = getInitialCurveGesture(state, {
              node_id,
              segment: segment_idx,
              control: "tb",
              invert: true,
            });

            draft.gesture = gesture;
            break;
          }
        }
      });
    }
    case "document/canvas/backend/html/event/on-drag-end": {
      const { node_ids_from_area, shiftKey } = <EditorEventTarget_DragEnd>(
        action
      );
      return produce(state, (draft) => {
        self_maybe_end_gesture_translate(draft);
        // reset the cursor mode (unless pencil mode)
        if (
          !(
            (draft.cursor_mode.type === "draw" &&
              draft.cursor_mode.tool === "pencil") ||
            draft.cursor_mode.type === "path"
          )
        ) {
          draft.cursor_mode = { type: "cursor" };
        }

        draft.gesture = { type: "idle" };
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
        event: { movement },
      } = <EditorEventTarget_Drag>action;
      if (state.marquee) {
        return produce(state, (draft) => {
          draft.marquee!.x2 = draft.surface_cursor_position[0];
          draft.marquee!.y2 = draft.surface_cursor_position[1];
        });
      } else {
        return produce(state, (draft) => {
          switch (draft.gesture.type) {
            // [insertion mode - resize after insertion]
            case "scale": {
              assert(state.selection.length === 1);

              draft.gesture.movement = movement;
              self_update_gesture_transform(draft);
              break;
            }
            // this is to handle "immediately drag move node"
            case "translate": {
              draft.gesture.movement = movement;
              self_update_gesture_transform(draft);
              break;
            }
            case "draw": {
              draft.gesture.movement = movement;
              const mode = draft.gesture.mode;

              const {
                origin: origin,
                points,
                node_id,
              } = state.gesture as GestureDraw;

              const node = document.__getNodeById(
                draft,
                node_id
              ) as grida.program.nodes.PathNode;

              const point = movement;

              const vne = new vn.VectorNetworkEditor({
                vertices: points.map((p) => ({ p })),
                segments: node.vectorNetwork.segments,
              });

              switch (mode) {
                case "line":
                  vne.extendLine(point);
                  break;
                case "pencil":
                  vne.extendPolyline(point);
                  break;
              }

              draft.gesture.points = vne.value.vertices.map((v) => v.p);

              // get the box of the points
              const bb = vne.getBBox();

              // delta is the x, y of the new bounding box - as it started from [0, 0]
              const delta: cmath.Vector2 = [bb.x, bb.y];

              // update the points with the delta (so the most left top point is to be [0, 0])
              vne.translate(cmath.vector2.invert(delta));

              const new_pos = cmath.vector2.add(origin, delta);

              // update the node position & dimension
              node.left = new_pos[0];
              node.top = new_pos[1];
              node.width = bb.width;
              node.height = bb.height;

              // finally, update the node's vector network
              node.vectorNetwork = vne.value;

              break;
            }
            case "curve": {
              //
              draft.gesture.movement = movement;
              const { node_id, segment, initial, control, invert } =
                draft.gesture;
              // const { node_id } = draft.content_edit_mode!;
              const node = document.__getNodeById(
                draft,
                node_id
              ) as grida.program.nodes.PathNode;

              const { vectorNetwork } = node;
              const vne = new vn.VectorNetworkEditor(vectorNetwork);

              const tangentPos = cmath.vector2.add(
                initial,
                invert ? cmath.vector2.invert(movement) : movement
              );

              vne.updateTangent(segment, control, tangentPos, true);

              // TODO: try consider updating the transform on drag end as it could be expensive

              const bb = vne.getBBox();
              const delta: cmath.Vector2 = [bb.x, bb.y];

              vne.translate(cmath.vector2.invert(delta));

              const new_pos = cmath.vector2.add([node.left!, node.top!], delta);

              node.left = new_pos[0];
              node.top = new_pos[1];
              node.width = bb.width;
              node.height = bb.height;

              node.vectorNetwork = vne.value;

              //
            }
          }
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
          draft.hovered_node_id = null;
        }
      });
    }
    //
    case "document/canvas/backend/html/event/node-overlay/on-click": {
      const { selection, node_ids_from_point, shiftKey } = action;
      if (state.gesture.type === "translate") break;
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
          draft.gesture.type === "translate",
          `was expecting translate, but got ${draft.gesture.type}`
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
        draft.hovered_node_id = null;

        self_start_gesture_scale(draft, {
          selection: selection,
          direction: direction,
        });
      });
    }
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-end": {
      return produce(state, (draft) => {
        draft.gesture = { type: "idle" };
      });
    }
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag": {
      const {
        direction: handle,
        event: { movement },
      } = action;

      return produce(state, (draft) => {
        // cancel if invalid state
        if (draft.gesture.type !== "scale") return;

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
        draft.gesture = { type: "idle" };
      });
    }
    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag": {
      const {
        node_id,
        event: { delta, distance },
      } = action;
      const [dx, dy] = delta;
      // cancel if invalid state
      if (state.gesture.type !== "corner-radius") return state;

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
        draft.gesture = { type: "idle" };
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
        if (draft.gesture.type !== "rotate") return;
        draft.gesture.movement = movement;

        self_update_gesture_transform(draft);
      });
      //
    }
    case "document/canvas/backend/html/event/vertex/on-drag":
    case "document/canvas/backend/html/event/vertex/on-drag-end":
    case "document/canvas/backend/html/event/vertex/on-drag-start": {
      return produce(state, (draft) => {
        const { content_edit_mode } = draft;
        assert(content_edit_mode && content_edit_mode.type === "path");
        const { node_id } = content_edit_mode;
        const node = document.__getNodeById(
          draft,
          node_id
        ) as grida.program.nodes.PathNode;

        switch (action.type) {
          case "document/canvas/backend/html/event/vertex/on-drag-start": {
            const { vertex: index } = action;

            const verticies = node.vectorNetwork.vertices.map((v) => v.p);

            content_edit_mode.selected_vertices = [index];
            content_edit_mode.a_point = index;

            draft.gesture = {
              type: "translate-vertex",
              node_id: node_id,
              initial_verticies: verticies,
              initial_position: [node.left!, node.top!],
            };
            break;
          }
          case "document/canvas/backend/html/event/vertex/on-drag-end": {
            const {} = action;
            draft.gesture = { type: "idle" };
            break;
          }
          case "document/canvas/backend/html/event/vertex/on-drag": {
            const {
              event: { movement: _movement },
            } = action;

            assert(draft.gesture.type === "translate-vertex");
            const { tarnslate_with_axis_lock } = state.gesture_modifiers;
            // axis lock movement with dominant axis
            const adj_movement =
              tarnslate_with_axis_lock === "on"
                ? cmath.ext.movement.axisLockedByDominance(_movement)
                : _movement;

            const { initial_verticies, initial_position } = draft.gesture;

            const vne = new vn.VectorNetworkEditor({
              vertices: initial_verticies.map((p) => ({ p })),
              segments: node.vectorNetwork.segments,
            });

            const bb_a = vne.getBBox();

            for (const i of content_edit_mode.selected_vertices) {
              vne.translateVertex(i, adj_movement);
            }

            const bb_b = vne.getBBox();

            const delta = cmath.vector2.sub([bb_b.x, bb_b.y], [bb_a.x, bb_a.y]);

            vne.translate(cmath.vector2.invert(delta));

            // position & dimension
            const new_pos = cmath.vector2.add(initial_position, delta);
            node.left = new_pos[0];
            node.top = new_pos[1];
            node.width = bb_b.width;
            node.height = bb_b.height;

            // update the node's vector network
            node.vectorNetwork = vne.value;

            break;
          }
        }
      });
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
  if (draft.gesture.type !== "translate") return;
  if (draft.gesture.is_currently_cloned) {
    // update the selection as the cloned nodes
    self_selectNode(draft, "reset", ...draft.gesture.selection);
  }

  draft.surface_measurement_targeting_locked = false;
  draft.gesture = { type: "idle" };
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

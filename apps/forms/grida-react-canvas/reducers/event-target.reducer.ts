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
} from "../action";
import type {
  GestureDraw,
  IDocumentEditorState,
  IMinimalDocumentState,
} from "../state";
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
import { cmath } from "@grida/cmath";
import { domapi } from "../domapi";
import nid from "./tools/id";
import { getMarqueeSelection, getSurfaceRayTarget } from "./tools/target";
import { vn } from "@/grida/vn";
import { getInitialCurveGesture } from "./tools/gesture";
import { createMinimalDocumentStateSnapshot } from "./tools/snapshot";
import { pointToSurfaceSpace, toCanvasSpace } from "../utils/transform";

export default function eventTargetReducer<S extends IDocumentEditorState>(
  state: S,
  action: EventTargetAction
): S {
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
      const {
        position: { x, y },
      } = <EditorEventTarget_PointerMove>action;

      const surface_space_pointer_position: cmath.Vector2 = [x, y];
      const canvas_transform = state.transform;
      const canvas_space_pointer_position = toCanvasSpace(
        surface_space_pointer_position,
        canvas_transform
      );

      return produce(state, (draft) => {
        draft.pointer = {
          position: canvas_space_pointer_position,
        };

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
              draft.pointer.position,
              cmath.vector2.add(n_offset, a.p)
            );

            // movement relative to `a` point
            const adj_movement =
              cmath.ext.movement.axisLockedByDominance(movement);

            const adj_pos = cmath.vector2.add(a.p, adj_movement, n_offset);
            draft.content_edit_mode.path_cursor_position = adj_pos;
          } else {
            draft.content_edit_mode.path_cursor_position =
              canvas_space_pointer_position;
          }
        }
      });
    }
    case "event-target/event/on-pointer-move-raycast": {
      const { node_ids_from_point } = <EditorEventTarget_PointerMoveRaycast>(
        action
      );
      return produce(state, (draft) => {
        draft.surface_raycast_detected_node_ids = node_ids_from_point;
        self_updateSurfaceHoverState(draft);
      });
    }
    case "event-target/event/on-click": {
      const { node_ids_from_point } = <EditorEventTarget_Click>action;
      return produce(state, (draft) => {
        draft.surface_raycast_detected_node_ids = node_ids_from_point;
        switch (draft.cursor_mode.type) {
          case "cursor":
          case "hand":
            // ignore
            break;
          case "zoom":
            // TODO: also support zoom out (with alt key modifier) - needs to be handled separately
            draft.transform = cmath.transform.scale(
              2,
              draft.transform,
              // map the cursor position back to surface space
              pointToSurfaceSpace(draft.pointer.position, draft.transform)
            );
            break;
          case "insert":
            const parent = __get_insert_target(draft);

            const nnode = initialNode(draft.cursor_mode.node);

            const cdom = new domapi.CanvasDOM(draft.transform);
            const parent_rect = cdom.getNodeBoundingRect(parent)!;

            try {
              const _nnode = nnode as grida.program.nodes.AnyNode;

              // center translate the new node - so it can be positioned centered to the cursor point (width / 2, height / 2)
              const center_translate_delta: cmath.Vector2 =
                // (if width and height is fixed number) - can be 'auto' for text node
                typeof _nnode.width === "number" &&
                typeof _nnode.height === "number"
                  ? [_nnode.width / 2, _nnode.height / 2]
                  : [0, 0];

              const nnode_relative_position = cmath.vector2.quantize(
                cmath.vector2.sub(
                  state.pointer.position,
                  // parent position relative to content space
                  [parent_rect.x, parent_rect.y],
                  center_translate_delta
                ),
                1
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
    case "event-target/event/on-double-click": {
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
        const next = getSurfaceRayTarget(
          surface_raycast_detected_node_ids,
          {
            context: state,
            config: state.surface_raycast_targeting,
          },
          true
        );

        // Update the selection if a valid next focus is found
        if (next) {
          self_selectNode(draft, "reset", next);
        }
        // #endregion
      });
      break;
    }
    case "event-target/event/on-pointer-down": {
      const { node_ids_from_point, shiftKey } = <EditorEventTarget_PointerDown>(
        action
      );
      return produce(state, (draft) => {
        draft.surface_raycast_detected_node_ids = node_ids_from_point;

        switch (draft.cursor_mode.type) {
          case "cursor": {
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
              const { node_id, path_cursor_position, a_point, next_ta } =
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

              const new_vertex_idx = vne.addVertex(
                position,
                a_point,
                next_ta ?? undefined
              );

              // clear the next ta as it's used
              draft.content_edit_mode.next_ta = null;

              const bb_b = vne.getBBox();

              const delta: cmath.Vector2 = [bb_b.x, bb_b.y];
              vne.translate(cmath.vector2.invert(delta));

              const new_pos = cmath.vector2.add([node.left!, node.top!], delta);

              node.left = new_pos[0];
              node.top = new_pos[1];
              node.width = bb_b.width;
              node.height = bb_b.height;

              node.vectorNetwork = vne.value;

              draft.content_edit_mode.selected_vertices = [new_vertex_idx];
              draft.content_edit_mode.a_point = new_vertex_idx;

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
                strokeWidth: 1,
                vectorNetwork: {
                  vertices: [{ p: cmath.vector2.zero }],
                  segments: [],
                },
              } satisfies grida.program.nodes.PathNode;

              const pos = draft.pointer.position;

              vector.left = pos[0];
              vector.top = pos[1];

              const parent = __get_insert_target(draft);
              self_insertNode(draft, parent, vector);
              self_selectNode(draft, "reset", vector.id);

              draft.content_edit_mode = {
                type: "path",
                node_id: new_node_id,
                selected_vertices: [0], // select the first point
                a_point: 0,
                next_ta: null,
                path_cursor_position: pos,
              };
            }

            //
            break;
          }
        }
      });
    }
    case "event-target/event/on-pointer-up": {
      return produce(state, (draft) => {
        draft.gesture = { type: "idle" };
      });
    }
    // #region drag event
    case "event-target/event/on-drag-start": {
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
                  a: state.pointer.position,
                  b: state.pointer.position,
                };
              }
            } else {
              if (draft.selection.length === 0) {
                // marquee selection
                draft.marquee = {
                  a: state.pointer.position,
                  b: state.pointer.position,
                };
              } else {
                self_start_gesture_translate(draft);
              }
            }
            break;
          }
          case "zoom": {
            // marquee zoom
            draft.marquee = {
              a: state.pointer.position,
              b: state.pointer.position,
            };
            break;
          }
          case "hand": {
            draft.gesture = {
              type: "pan",
              movement: cmath.vector2.zero,
            };
            break;
          }
          case "insert": {
            const parent = __get_insert_target(draft);

            const initial_rect = {
              x: state.pointer.position[0],
              y: state.pointer.position[1],
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
            const parent = __get_insert_target(draft);
            self_insertNode(draft, parent, vector);

            const cdom = new domapi.CanvasDOM(draft.transform);
            // position relative to the parent
            const parent_rect = cdom.getNodeBoundingRect(parent)!;
            const node_relative_pos = cmath.vector2.sub(
              state.pointer.position,
              [parent_rect.x, parent_rect.y]
            );
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

            if (segments.length === 0) {
              draft.gesture = {
                type: "curve-a",
                node_id,
                vertex,
                control: "ta",
                initial: cmath.vector2.zero,
                movement: cmath.vector2.zero,
                invert: false,
              };
            } else if (segments.length === 1) {
              const segment_idx = segments[0];

              const gesture = getInitialCurveGesture(state, {
                node_id,
                segment: segment_idx,
                control: "tb",
                invert: true,
              });

              draft.gesture = gesture;
            } else {
              reportError(
                "invalid vector network path editing state. multiple segments found"
              );
            }

            break;
          }
        }
      });
    }
    case "event-target/event/on-drag-end": {
      const { node_ids_from_area, shiftKey } = <EditorEventTarget_DragEnd>(
        action
      );
      return produce(state, (draft) => {
        switch (draft.cursor_mode.type) {
          case "draw":
            // keep if pencil mode
            if (draft.cursor_mode.tool === "pencil") break;
          case "path":
          case "hand":
            // keep
            break;
          case "zoom": {
            if (state.marquee) {
              // update zoom
              const _vrect = domapi.get_viewport_rect();
              const vrect = {
                x: 0,
                y: 0,
                width: _vrect.width,
                height: _vrect.height,
              };
              const mrect = cmath.rect.fromPoints([
                state.marquee.a,
                state.marquee.b,
              ]);
              const t = cmath.ext.viewport.transformToFit(vrect, mrect);
              draft.transform = t;
            }

            // cancel to default
            draft.cursor_mode = { type: "cursor" };
            break;
          }
          case "cursor": {
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

            // cancel to default
            draft.cursor_mode = { type: "cursor" };
            break;
          }
          case "insert":
          default:
            // cancel to default
            draft.cursor_mode = { type: "cursor" };
            break;
        }

        self_maybe_end_gesture_translate(draft);
        draft.gesture = { type: "idle" };
        draft.marquee = undefined;
      });
    }
    case "event-target/event/on-drag": {
      const {
        event: { movement, delta },
      } = <EditorEventTarget_Drag>action;
      if (state.marquee) {
        return produce(state, (draft) => {
          draft.marquee!.b = state.pointer.position;
        });
      } else {
        return produce(state, (draft) => {
          if (draft.gesture.type === "idle") return;
          if (draft.gesture.type === "nudge") return;

          draft.gesture.movement = movement;

          switch (draft.gesture.type) {
            case "pan": {
              // for panning, exceptionaly use the unscaled delta.
              const original_delta = cmath.vector2.multiply(
                action.event.delta,
                cmath.transform.getScale(state.transform)
              );
              // move the viewport by delta
              draft.transform = cmath.transform.translate(
                draft.transform,
                original_delta
              );
              break;
            }
            // [insertion mode - resize after insertion]
            case "scale": {
              self_update_gesture_transform(draft);
              break;
            }
            // this is to handle "immediately drag move node"
            case "translate": {
              self_update_gesture_transform(draft);
              break;
            }
            case "rotate": {
              self_update_gesture_transform(draft);
              break;
            }
            case "draw": {
              const {
                gesture_modifiers: { tarnslate_with_axis_lock },
              } = state;
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

              const adj_movement =
                tarnslate_with_axis_lock === "on"
                  ? cmath.ext.movement.axisLockedByDominance(movement)
                  : movement;

              const point = adj_movement;

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
              assert(draft.content_edit_mode?.type === "path");
              const { node_id, segment, initial, control, invert } =
                draft.gesture;

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

              if (segment === vne.segments.length - 1) {
                // TODO: add a new "curve-b" and make it isolated from control point editing.
                // on drawing mode - this should be true.
                // on control point edit mode, this should be false
                // if last segment, update the next ta as mirror of the tangent
                draft.content_edit_mode.next_ta =
                  cmath.vector2.invert(tangentPos);
              }

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
              break;
              //
            }
            case "curve-a": {
              assert(draft.content_edit_mode?.type === "path");
              const { node_id, vertex, initial, control, invert } =
                draft.gesture;

              const tangentPos = cmath.vector2.add(
                initial,
                invert ? cmath.vector2.invert(movement) : movement
              );

              draft.content_edit_mode.next_ta = tangentPos;

              break;
            }
            case "translate-vertex": {
              assert(draft.content_edit_mode?.type === "path");
              const { content_edit_mode } = draft;
              const { node_id } = content_edit_mode;
              const node = document.__getNodeById(
                draft,
                node_id
              ) as grida.program.nodes.PathNode;

              const { movement: _movement } = draft.gesture;

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

              const delta = cmath.vector2.sub(
                [bb_b.x, bb_b.y],
                [bb_a.x, bb_a.y]
              );

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
            case "corner-radius": {
              const { node_id, direction } = draft.gesture;
              const [dx, dy] = delta;
              const d = (direction.includes("e") ? -1 : 1 ) * Math.round(dx);
              const node = document.__getNodeById(draft, node_id);

              if (!("cornerRadius" in node)) {
                return;
              }

              const fixed_width =
                typeof node.width === "number" ? node.width : 0;
              const fixed_height =
                typeof node.height === "number" ? node.height : 0;
              const maxRadius = Math.min(fixed_width, fixed_height) / 2;

              const nextRadius =
                (typeof node.cornerRadius == "number" ? node.cornerRadius : 0) +
                d;

              const nextRadiusClamped = Math.floor(
                Math.min(maxRadius ?? Infinity, Math.max(0, nextRadius))
              );
              draft.document.nodes[node_id] = nodeReducer(node, {
                type: "node/change/cornerRadius",
                // TODO: resolve by anchor
                cornerRadius: nextRadiusClamped,
                node_id,
              });

              break;
              //
            }
          }
        });
      }

      break;
    }
    //
    case "event-target/event/multiple-selection-overlay/on-click": {
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
    // #endregion drag event
    //

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
    initial_snapshot: createMinimalDocumentStateSnapshot(draft),
    initial_rects: [new_node_rect],
    movement: cmath.vector2.zero,
    selection: [new_node_id],
    direction: "se",
  };
}

function self_start_gesture_translate(draft: Draft<IDocumentEditorState>) {
  const selection = draft.selection;
  if (selection.length === 0) return;

  const cdom = new domapi.CanvasDOM(draft.transform);

  const rects = draft.selection.map(
    (node_id) => cdom.getNodeBoundingRect(node_id)!
  );

  draft.gesture = {
    type: "translate",
    selection: selection,
    initial_clone_ids: selection.map(() => nid()),
    initial_selection: selection,
    initial_rects: rects,
    initial_snapshot: createMinimalDocumentStateSnapshot(draft),
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

/**
 * get the parent of newly inserting node based on the current state
 *
 * this relies on `surface_raycast_detected_node_ids`, make sure it's updated before calling this function
 *
 * @returns the parent node id
 */
function __get_insert_target(state: IDocumentEditorState): string {
  const hits = state.surface_raycast_detected_node_ids.slice();
  for (const hit of hits) {
    const node = document.__getNodeById(state, hit);
    if (node.type === "container") return hit;
  }
  return state.document.root_id;
}

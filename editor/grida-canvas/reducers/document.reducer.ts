import { produce, type Draft } from "immer";
import type {
  DocumentAction,
  EditorSelectAction,
  NodeChangeAction,
  TemplateEditorSetTemplatePropsAction,
  TemplateNodeOverrideChangeAction,
  NodeToggleBoldAction,
  NodeToggleUnderlineAction,
  EditorSelectGradientStopAction,
  EditorVectorBendOrClearCornerAction,
  EditorVariableWidthSelectStopAction,
  EditorVariableWidthDeleteStopAction,
  EditorVariableWidthAddStopAction,
} from "@/grida-canvas/action";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";
import assert from "assert";
import nodeReducer from "./node.reducer";
import surfaceReducer from "./surface.reducer";
import nodeTransformReducer from "./node-transform.reducer";
import {
  self_clearSelection,
  self_try_remove_node,
  self_duplicateNode,
  self_insertSubDocument,
  self_try_insert_node,
  self_selectNode,
  self_updateVectorNodeVectorNetwork,
  reduceVectorContentSelection,
  getUXNeighbouringVertices,
  encodeTranslateVectorCommand,
  self_flattenNode,
  normalizeVectorNodeBBox,
  supportsFlatten,
  self_select_tool,
  getVectorSelectionStartPoint,
  self_nudge_transform,
} from "./methods";
import {
  self_wrapNodes,
  self_ungroup,
  self_wrapNodesAsBooleanOperation,
} from "./methods/wrap";
import cmath from "@grida/cmath";
import { layout } from "@grida/cmath/_layout";
import { snapMovement } from "./tools/snap";
import nid from "./tools/id";
import schemaReducer from "./schema.reducer";
import { self_moveNode } from "./methods/move";
import { v4 } from "uuid";
import type { ReducerContext } from ".";
import cg from "@grida/cg";
import vn from "@grida/vn";
import "core-js/features/object/group-by";

/**
 * the padding applied to the anchors (siblings) for dynamic next placement
 *
 * commonly known as 'minimal space between artboards'
 */
const PLACEMENT_ANCHORS_PADDING = 40;

/**
 * the inset applied to the viewport for dynamic placement
 *
 * the inset is inteded to be applied **before** being converted to canvas space (for better visual consistency)
 */
const PLACEMENT_VIEWPORT_INSET = 40;

export default function documentReducer<S extends editor.state.IEditorState>(
  state: S,
  action: DocumentAction,
  context: ReducerContext
): S {
  if (!state.editable) return state;

  assert(state.scene_id, "scene_id is required for autolayout");
  const scene = state.document.scenes[state.scene_id];

  switch (action.type) {
    case "select": {
      return produce(state, (draft) => {
        const { selection } = <EditorSelectAction>action;
        self_selectNode(draft, "reset", ...selection);
      });
    }
    case "blur": {
      return produce(state, (draft) => {
        self_clearSelection(draft);
      });
    }
    case "hover": {
      const { event, target } = action;
      switch (event) {
        case "enter": {
          return produce(state, (draft) => {
            draft.hovered_node_id = target;
          });
        }
        case "leave": {
          return produce(state, (draft) => {
            if (draft.hovered_node_id === target) {
              draft.hovered_node_id = null;
            }
          });
        }
      }
      //
    }
    case "copy":
    case "cut": {
      if (state.content_edit_mode?.type === "vector") {
        if (action.type === "cut") break; // not supported yet
        const {
          node_id,
          selection: {
            selected_vertices,
            selected_segments,
            selected_tangents,
          },
        } = state.content_edit_mode;
        const node = dq.__getNodeById(
          state,
          node_id
        ) as grida.program.nodes.VectorNode;
        const vne = new vn.VectorNetworkEditor(node.vectorNetwork);
        const vertices = Array.from(
          new Set([...selected_vertices, ...selected_tangents.map(([v]) => v)])
        );
        const copied = vne.copy({
          vertices,
          segments: selected_segments,
        });
        return produce(state, (draft) => {
          const mode =
            draft.content_edit_mode as editor.state.VectorContentEditMode;
          mode.clipboard = copied;
          mode.clipboard_node_position = [node.left ?? 0, node.top ?? 0];
          draft.user_clipboard = undefined;
        });
      }

      const { target } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];

      return produce(state, (draft) => {
        // [copy]
        draft.user_clipboard = {
          payload_id: v4(),
          ids: target_node_ids,
          prototypes: target_node_ids.map((id) =>
            grida.program.nodes.factory.createPrototypeFromSnapshot(
              draft.document,
              id
            )
          ),
        };

        if (action.type === "cut") {
          target_node_ids.forEach((node_id) => {
            self_try_remove_node(draft, node_id);
          });
        }
      });
    }
    case "paste": {
      if (action.vector_network) {
        if (state.content_edit_mode?.type === "vector") {
          const net = action.vector_network;
          return produce(state, (draft) => {
            const mode =
              draft.content_edit_mode as editor.state.VectorContentEditMode;
            const node = dq.__getNodeById(
              draft,
              mode.node_id
            ) as grida.program.nodes.VectorNode;
            const vertex_offset = node.vectorNetwork.vertices.length;
            const segment_offset = node.vectorNetwork.segments.length;

            let net_to_union = net;
            if (mode.clipboard && mode.clipboard_node_position) {
              const delta: [number, number] = [
                mode.clipboard_node_position[0] - (node.left ?? 0),
                mode.clipboard_node_position[1] - (node.top ?? 0),
              ];
              if (JSON.stringify(mode.clipboard) === JSON.stringify(net)) {
                net_to_union = vn.VectorNetworkEditor.translate(net, delta);
              }
            }

            node.vectorNetwork = vn.VectorNetworkEditor.union(
              node.vectorNetwork,
              net_to_union,
              null
            );
            normalizeVectorNodeBBox(node);
            const new_vertices = Array.from(
              { length: net.vertices.length },
              (_, i) => i + vertex_offset
            );
            const new_segments = Array.from(
              { length: net.segments.length },
              (_, i) => i + segment_offset
            );
            mode.selection = {
              selected_vertices: new_vertices,
              selected_segments: new_segments,
              selected_tangents: [],
            };
            mode.selection_neighbouring_vertices = getUXNeighbouringVertices(
              node.vectorNetwork,
              {
                selected_vertices: new_vertices,
                selected_segments: new_segments,
                selected_tangents: [],
              }
            );
            mode.a_point = getVectorSelectionStartPoint({
              selected_vertices: new_vertices,
              selected_tangents: [],
            });
            mode.clipboard = net;
          });
        }

        return produce(state, (draft) => {
          const net = action.vector_network!;
          const id = nid();
          const black = { r: 0, g: 0, b: 0, a: 1 };
          const node: grida.program.nodes.VectorNode = {
            type: "vector",
            name: "vector",
            id,
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
            stroke: { type: "solid", color: black },
            strokeCap: "butt",
            strokeWidth: 1,
            vectorNetwork: net,
          };

          normalizeVectorNodeBBox(node);

          const valid_target_selection = state.selection.filter((node_id) => {
            const n = dq.__getNodeById(draft, node_id);
            return n.type === "container";
          });

          const target = valid_target_selection[0] ?? null;

          self_try_insert_node(draft, target, node);

          self_select_tool(draft, { type: "cursor" }, context);
          self_selectNode(draft, "reset", node.id);
        });
      }

      if (state.content_edit_mode?.type === "vector") {
        const net = state.content_edit_mode.clipboard;
        if (!net) break;
        return produce(state, (draft) => {
          const mode =
            draft.content_edit_mode as editor.state.VectorContentEditMode;
          const node = dq.__getNodeById(
            draft,
            mode.node_id
          ) as grida.program.nodes.VectorNode;
          const vertex_offset = node.vectorNetwork.vertices.length;
          const segment_offset = node.vectorNetwork.segments.length;

          let net_to_union = net;
          if (mode.clipboard_node_position) {
            const delta: [number, number] = [
              mode.clipboard_node_position[0] - (node.left ?? 0),
              mode.clipboard_node_position[1] - (node.top ?? 0),
            ];
            net_to_union = vn.VectorNetworkEditor.translate(net, delta);
          }

          node.vectorNetwork = vn.VectorNetworkEditor.union(
            node.vectorNetwork,
            net_to_union,
            null
          );
          normalizeVectorNodeBBox(node);
          const new_vertices = Array.from(
            { length: net.vertices.length },
            (_, i) => i + vertex_offset
          );
          const new_segments = Array.from(
            { length: net.segments.length },
            (_, i) => i + segment_offset
          );
          mode.selection = {
            selected_vertices: new_vertices,
            selected_segments: new_segments,
            selected_tangents: [],
          };
          mode.selection_neighbouring_vertices = getUXNeighbouringVertices(
            node.vectorNetwork,
            {
              selected_vertices: new_vertices,
              selected_segments: new_segments,
              selected_tangents: [],
            }
          );
          mode.a_point = getVectorSelectionStartPoint({
            selected_vertices: new_vertices,
            selected_tangents: [],
          });
          mode.clipboard = net;
        });
      }

      if (!state.user_clipboard) break;
      const { user_clipboard, selection } = state;
      const { ids, prototypes } = user_clipboard;

      return produce(state, (draft) => {
        const new_top_ids: string[] = [];

        const valid_target_selection =
          // 1. the target shall not be an original node
          // 2. the target shall be a container
          selection
            .filter((node_id) => !ids.includes(node_id))
            .filter((node_id) => {
              const node = dq.__getNodeById(draft, node_id);
              return node.type === "container";
            });

        const targets: string[] | null =
          valid_target_selection.length > 0 ? valid_target_selection : null; // default to root

        // the target (parent) node that will be pasted under
        for (const target of targets ?? [null]) {
          // to be pasted
          for (const prototype of prototypes) {
            const sub =
              grida.program.nodes.factory.create_packed_scene_document_from_prototype(
                prototype,
                nid
              );

            const top_ids = self_insertSubDocument(draft, target, sub);
            new_top_ids.push(...top_ids);
          }
        }

        // after
        self_select_tool(draft, { type: "cursor" }, context);
        self_selectNode(draft, "reset", ...new_top_ids);
      });
    }
    case "duplicate": {
      const { target } = action;
      return produce(state, (draft) => {
        const target_node_ids =
          target === "selection" ? state.selection : [target];
        self_duplicateNode(draft, new Set(target_node_ids), context);
      });
      break;
    }
    case "flatten": {
      const { target } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];

      const flattenable: string[] = [];
      const ignored: string[] = [];
      for (const node_id of target_node_ids) {
        const node = dq.__getNodeById(state, node_id);
        if (node && supportsFlatten(node)) {
          flattenable.push(node_id);
        } else {
          ignored.push(node_id);
        }
      }

      return produce(state, (draft) => {
        const flattened = flatten_with_union(draft, flattenable, context);
        draft.selection = [...flattened, ...ignored];
      });
    }
    case "delete": {
      const { target } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];

      return produce(state, (draft) => {
        __self_delete_nodes(draft, target_node_ids);
      });
    }
    case "a11y/delete": {
      const target_node_ids = state.selection;

      if (state.content_edit_mode?.type === "fill/gradient") {
        const { node_id } = state.content_edit_mode;

        return produce(state, (draft) => {
          const mode =
            draft.content_edit_mode as editor.state.FillGradientContentEditMode;
          const node = dq.__getNodeById(draft, node_id)!;
          if (
            node &&
            "fill" in node &&
            cg.isGradientPaint(node.fill as cg.Paint)
          ) {
            const fill = node.fill as cg.GradientPaint;
            if (fill.stops.length > 2) {
              fill.stops.splice(mode.selected_stop, 1);
              mode.selected_stop = Math.min(
                mode.selected_stop,
                fill.stops.length - 1
              );
            }
          }
        });
      }

      if (state.content_edit_mode?.type === "width") {
        const { node_id } = state.content_edit_mode;
        const mode =
          state.content_edit_mode as editor.state.VariableWidthContentEditMode;

        // Only delete if there's a selected stop and more than 2 stops
        if (
          mode.variable_width_selected_stop !== null &&
          mode.variable_width_profile.stops.length > 2
        ) {
          // Dispatch the existing variable-width/delete-stop action
          return documentReducer(
            state,
            {
              type: "variable-width/delete-stop",
              target: {
                node_id,
                stop: mode.variable_width_selected_stop,
              },
            },
            context
          );
        }
      }

      if (state.content_edit_mode?.type === "vector") {
        return produce(state, (draft) => {
          __self_delete_vector_network_selection(
            draft,
            draft.content_edit_mode as editor.state.VectorContentEditMode
          );
        });
      }

      return produce(state, (draft) => {
        __self_delete_nodes(draft, target_node_ids);
      });
    }
    case "insert": {
      let sub: grida.program.document.IPackedSceneDocument;
      if ("prototype" in action) {
        const { id, prototype } = action;
        sub =
          grida.program.nodes.factory.create_packed_scene_document_from_prototype(
            prototype,
            (_, depth) => (depth === 0 ? (id ?? nid()) : nid())
          );
      } else if ("document" in action) {
        sub = action.document;
      } else {
        throw new Error(
          "Invalid action - prototype or document is required for `insert()`"
        );
      }

      // calculate sub document's bounding box (we won't be using x, y - set as 0 for fallback)
      const box = sub.scene.children.reduce(
        (bb, node_id) => {
          const node = sub.nodes[node_id];

          return cmath.rect.union([
            bb,
            {
              x: "left" in node ? (node.left ?? 0) : 0,
              y: "top" in node ? (node.top ?? 0) : 0,
              width:
                "width" in node
                  ? typeof node.width === "number"
                    ? node.width
                    : 0
                  : 0,
              height:
                "height" in node
                  ? typeof node.height === "number"
                    ? node.height
                    : 0
                  : 0,
            },
          ]);
        },
        { x: 0, y: 0, width: 0, height: 0 }
      );

      // [root rect for calculating next placement]
      // if the insertion parent is null (root), use viewport rect (canvas space)
      // otherwise, use the parent's bounding rect (canvas space) (TODO:)
      const { width, height } = context.viewport;

      // apply the inset before convering to canvas space
      const _inset_rect = cmath.rect.inset(
        {
          x: 0,
          y: 0,
          width,
          height,
        },
        PLACEMENT_VIEWPORT_INSET
      );

      const viewport_rect = cmath.rect.transform(
        _inset_rect,
        cmath.transform.invert(state.transform)
      );

      // use target's children as siblings (if null, root children) // TODO: parent siblings are not supported
      assert(state.scene_id, "scene_id is required for insertion");
      const scene = state.document.scenes[state.scene_id];
      const siblings = scene.children;
      const anchors = siblings
        .map((node_id) => {
          const r = context.geometry.getNodeAbsoluteBoundingRect(node_id);
          if (!r) return null;
          return cmath.rect.pad(
            { x: r.x, y: r.y, width: r.width, height: r.height },
            PLACEMENT_ANCHORS_PADDING
          );
        })
        .filter((r) => r !== null) as cmath.Rectangle[];

      const placement = cmath.packing.ext.walk_to_fit(
        viewport_rect,
        box,
        anchors
      );

      assert(placement); // placement is always expected since allowOverflow is true

      // TODO: make it clean and reusable
      sub.scene.children.forEach((node_id) => {
        const node = sub.nodes[node_id];
        if ("position" in node && node.position === "absolute") {
          node.left = (node.left ?? 0) + placement.x;
          node.top = (node.top ?? 0) + placement.y;
        }
      });

      return produce(state, (draft) => {
        const new_top_ids = self_insertSubDocument(
          draft,
          // TODO: get the correct insert target
          null,
          sub
        );

        // after
        self_select_tool(draft, { type: "cursor" }, context);
        self_selectNode(draft, "reset", ...new_top_ids);
      });
    }
    case "order": {
      const { target, order } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];

      return produce(state, (draft) => {
        for (const node_id of target_node_ids) {
          __self_order(draft, node_id, order);
        }
      });
      break;
    }
    case "mv": {
      const { source, target, index } = action;
      return produce(state, (draft) => {
        for (const node_id of source) {
          self_moveNode(draft, node_id, target, index);
        }
      });
      break;
    }
    case "nudge": {
      const { target, axis, delta } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];
      const dx = axis === "x" ? delta : 0;
      const dy = axis === "y" ? delta : 0;

      if (target_node_ids.length === 0) return state;
      return produce(state, (draft) => {
        self_nudge_transform(draft, target_node_ids, dx, dy, context);
      });
    }
    case "nudge-resize": {
      const { target, axis, delta } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];
      const dx = axis === "x" ? delta : 0;
      const dy = axis === "y" ? delta : 0;

      return produce(state, (draft) => {
        for (const node_id of target_node_ids) {
          const node = dq.__getNodeById(draft, node_id);

          draft.document.nodes[node_id] = nodeTransformReducer(node, {
            type: "resize",
            delta: [dx, dy],
          });
        }
      });
    }
    case "a11y/up":
    case "a11y/right":
    case "a11y/down":
    case "a11y/left": {
      const { target, shiftKey } = action;
      const direction = action.type as
        | "a11y/up"
        | "a11y/right"
        | "a11y/down"
        | "a11y/left";

      const direction_1d =
        direction === "a11y/right" || direction === "a11y/down" ? 1 : -1;

      const nudge_mod = shiftKey ? 10 : 1;

      const target_node_ids =
        target === "selection" ? state.selection : [target];

      // handle a11y for content edit mode
      if (state.content_edit_mode) {
        switch (state.content_edit_mode.type) {
          case "fill/gradient": {
            const { node_id, selected_stop } = state.content_edit_mode;
            return produce(state, (draft) => {
              const node = dq.__getNodeById(draft, node_id);
              const fill: cg.GradientPaint | undefined =
                "fill" in node && cg.isGradientPaint(node?.fill as cg.Paint)
                  ? (node.fill as cg.GradientPaint)
                  : undefined;
              const mod = shiftKey ? 0.1 : 0.01;

              if (!fill) return;

              const stop = fill.stops[selected_stop];
              stop.offset = Math.min(
                1,
                Math.max(0, stop.offset + direction_1d * mod)
              );
            });
            break;
          }
          case "vector": {
            const base_movement: cmath.ext.movement.Movement = [
              nudge_mod * editor.a11y.a11y_direction_to_vector[direction][0],
              nudge_mod * editor.a11y.a11y_direction_to_vector[direction][1],
            ];
            return produce(state, (draft) => {
              const { node_id, selection } =
                draft.content_edit_mode as editor.state.VectorContentEditMode;

              const node = dq.__getNodeById(
                draft,
                node_id
              ) as grida.program.nodes.VectorNode;

              const { vertices, tangents } = encodeTranslateVectorCommand(
                node.vectorNetwork,
                selection
              );

              const scene = draft.document.scenes[draft.scene_id!];
              const agent_points = vertices.map((i) =>
                cmath.vector2.add(node.vectorNetwork.vertices[i], [
                  node.left!,
                  node.top!,
                ])
              );
              const anchor_points = node.vectorNetwork.vertices
                .map((v, i) => ({ p: v, i }))
                .filter(({ i }) => !vertices.includes(i))
                .map(({ p }) => cmath.vector2.add(p, [node.left!, node.top!]));

              const should_snap =
                draft.gesture_modifiers.translate_with_force_disable_snap !==
                "on";

              const { movement: snappedMovement, snapping } = snapMovement(
                agent_points,
                { points: anchor_points, guides: scene.guides },
                base_movement,
                editor.config.DEFAULT_SNAP_NUDGE_THRESHOLD,
                should_snap
              );

              draft.surface_snapping = snapping;

              const delta_vec = cmath.ext.movement.normalize(snappedMovement);

              self_updateVectorNodeVectorNetwork(node, (vne) => {
                for (const v of vertices) {
                  vne.translateVertex(v, delta_vec);
                }
                for (const [vi, ti] of tangents) {
                  const point = ti === 0 ? "a" : "b";
                  const control = ti === 0 ? "ta" : "tb";
                  for (const si of vne.findSegments(vi, point)) {
                    const next = cmath.vector2.add(
                      vne.segments[si][control],
                      delta_vec
                    );
                    vne.updateTangent(si, control, next, "none");
                  }
                }
              });
            });
            break;
          }
        }
      }
      // if movement target exists, nudge the nodes
      else if (target_node_ids.length > 0) {
        const nodes = target_node_ids.map((node_id) =>
          dq.__getNodeById(state, node_id)
        );

        const in_flow_node_ids = nodes
          .filter((node) => {
            if ("position" in node) {
              return (
                node.position === "relative" &&
                node.top === undefined &&
                node.right === undefined &&
                node.bottom === undefined &&
                node.left === undefined
              );
            }
          })
          .map((node) => node.id);

        const out_flow_node_ids = nodes
          .filter((node) => {
            return !in_flow_node_ids.includes(node.id);
          })
          .map((node) => node.id);

        return produce(state, (draft) => {
          for (const node_id of in_flow_node_ids) {
            __self_order(
              draft,
              node_id,
              editor.a11y.a11y_direction_to_order[direction]
            );
          }

          if (out_flow_node_ids.length > 0) {
            const [dx, dy] = cmath.vector2.multiply(
              editor.a11y.a11y_direction_to_vector[direction],
              [nudge_mod, nudge_mod]
            );

            self_nudge_transform(draft, out_flow_node_ids, dx, dy, context);
          }
        });
      }
      // delta transform the camera (pan)
      else {
        return produce(state, (draft) => {
          const [scaleX, scaleY] = cmath.transform.getScale(draft.transform);
          const delta: cmath.Vector2 = [
            -nudge_mod *
              editor.config.DEFAULT_CAMERA_KEYBOARD_MOVEMENT *
              editor.a11y.a11y_direction_to_vector[direction][0] *
              scaleX,
            -nudge_mod *
              editor.config.DEFAULT_CAMERA_KEYBOARD_MOVEMENT *
              editor.a11y.a11y_direction_to_vector[direction][1] *
              scaleY,
          ];

          draft.transform = cmath.transform.translate(draft.transform, delta);
        });
      }

      //
      //
      break;
    }
    case "a11y/align": {
      const { alignment } = action;
      return documentReducer(
        state,
        {
          type: "align",
          target: "selection",
          alignment,
        },
        context
      );
    }
    case "align": {
      const {
        target,
        alignment: { horizontal, vertical },
      } = action;

      const target_node_ids =
        target === "selection" ? state.selection : [target];

      if (target_node_ids.length === 1) {
        // if a single node is selected, align it with its container. (if not root)
        const node_id = target_node_ids[0];
        const top_id = dq.getTopId(state.document_ctx, node_id);
        if (node_id !== top_id) {
          const parent_node_id = dq.getParentId(state.document_ctx, node_id);
          assert(parent_node_id, "parent node not found");

          const rect = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;
          const parent_rect =
            context.geometry.getNodeAbsoluteBoundingRect(parent_node_id)!;

          const aligned = cmath.rect.alignA(rect, parent_rect, {
            horizontal,
            vertical,
          });

          const dx = aligned.x - rect.x;
          const dy = aligned.y - rect.y;

          return produce(state, (draft) => {
            const node = dq.__getNodeById(state, node_id);
            const moved = nodeTransformReducer(node, {
              type: "translate",
              dx,
              dy,
            });
            draft.document.nodes[node_id] = moved;
          });
        }

        return state;
      }

      const rects = target_node_ids.map(
        (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
      );

      const transformed = cmath.rect.align(rects, { horizontal, vertical });
      const deltas = transformed.map((rect, i) => {
        const target_rect = rects[i];
        const dx = rect.x - target_rect.x;
        const dy = rect.y - target_rect.y;

        return { dx, dy };
      });

      return produce(state, (draft) => {
        let i = 0;
        for (const node_id of target_node_ids) {
          const node = dq.__getNodeById(state, node_id);
          const moved = nodeTransformReducer(node, {
            type: "translate",
            dx: deltas[i].dx,
            dy: deltas[i].dy,
          });
          draft.document.nodes[node_id] = moved;
          i++;
        }
      });

      break;
    }
    case "distribute-evenly": {
      const { target, axis } = action;
      const target_node_ids = target === "selection" ? state.selection : target;

      const rects = target_node_ids.map(
        (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
      );

      // Only allow distribute-evenly of 3 or more nodes
      if (target_node_ids.length < 3) return state;

      //
      const transformed = cmath.rect.distributeEvenly(rects, axis);

      const deltas = transformed.map((rect, i) => {
        const target_rect = rects[i];
        const dx = rect.x - target_rect.x;
        const dy = rect.y - target_rect.y;

        return { dx, dy };
      });

      return produce(state, (draft) => {
        let i = 0;
        for (const node_id of target_node_ids) {
          const node = dq.__getNodeById(state, node_id);
          const moved = nodeTransformReducer(node, {
            type: "translate",
            dx: deltas[i].dx,
            dy: deltas[i].dy,
          });
          draft.document.nodes[node_id] = moved;
          i++;
        }
      });

      break;
    }
    case "autolayout": {
      const { target } = action;
      const target_node_ids = target === "selection" ? state.selection : target;

      // group by parent, including root nodes
      const groups = Object.groupBy(
        target_node_ids,
        (node_id) => dq.getParentId(state.document_ctx, node_id) ?? "<root>"
      );

      const layouts = Object.keys(groups).map((parent_id) => {
        const g = groups[parent_id]!;
        const is_root = parent_id === "<root>";

        let delta: cmath.Vector2;
        if (is_root) {
          delta = [0, 0];
        } else {
          const parent_rect =
            context.geometry.getNodeAbsoluteBoundingRect(parent_id)!;
          delta = [-parent_rect.x, -parent_rect.y];
        }

        const rects = g
          .map(
            (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
          )
          // make the rects relative to the parent
          .map((rect) => cmath.rect.translate(rect, delta))
          .map((rect) => cmath.rect.quantize(rect, 1));

        // guess the layout
        const lay = layout.flex.guess(rects);

        return {
          parent: is_root ? null : parent_id,
          layout: lay,
          children: g,
        };
      });

      return produce(state, (draft) => {
        const insertions: grida.program.nodes.NodeID[] = [];
        layouts.forEach(({ parent, layout, children }) => {
          const container_prototype: grida.program.nodes.NodePrototype = {
            type: "container",
            // layout
            layout: "flex",
            width: "auto",
            height: "auto",
            top: cmath.quantize(layout.union.y, 1),
            left: cmath.quantize(layout.union.x, 1),
            direction: layout.direction,
            mainAxisGap: cmath.quantize(layout.spacing, 1),
            crossAxisGap: cmath.quantize(layout.spacing, 1),
            mainAxisAlignment: layout.mainAxisAlignment,
            crossAxisAlignment: layout.crossAxisAlignment,
            padding: children.length === 1 ? 16 : 0,
            // children (empty when init)
            children: [],
            // position
            position: "absolute",
          };

          const container_id = self_insertSubDocument(
            draft,
            parent,
            grida.program.nodes.factory.create_packed_scene_document_from_prototype(
              container_prototype,
              nid
            )
          )[0];

          // [move children to container]
          const ordered = layout.orders.map((i) => children[i]);
          ordered.forEach((child_id) => {
            self_moveNode(draft, child_id, container_id);
          });

          // [reset children position]
          ordered.forEach((child_id) => {
            const child = dq.__getNodeById(draft, child_id);
            (draft.document.nodes[
              child_id
            ] as grida.program.nodes.i.IPositioning) = {
              ...child,
              position: "relative",
              top: undefined,
              right: undefined,
              bottom: undefined,
              left: undefined,
            };
          });

          insertions.push(container_id);
        });

        self_selectNode(draft, "reset", ...insertions);
      });

      break;
    }
    case "contain": {
      const { target } = action;
      const target_node_ids = target === "selection" ? state.selection : target;

      return produce(state, (draft) => {
        const insertions = self_wrapNodes(
          draft,
          target_node_ids,
          "container",
          context.geometry
        );
        self_selectNode(draft, "reset", ...insertions);
      });
      break;
    }
    case "group": {
      const { target } = action;
      const target_node_ids = target === "selection" ? state.selection : target;

      return produce(state, (draft) => {
        const insertions = self_wrapNodes(
          draft,
          target_node_ids,
          "group",
          context.geometry
        );
        self_selectNode(draft, "reset", ...insertions);
      });
      break;
    }
    case "ungroup": {
      const { target } = action;
      const target_node_ids = target === "selection" ? state.selection : target;

      return produce(state, (draft) => {
        self_ungroup(draft, target_node_ids, context.geometry);
      });
      break;
    }
    case "group-op": {
      const { target, op } = action;
      const target_node_ids = target;

      // Check if we have exactly one target and it's already a boolean operation node
      if (target_node_ids.length === 1) {
        const node = dq.__getNodeById(state, target_node_ids[0]);
        if (node && node.type === "boolean") {
          // Simply change the op value of the existing boolean operation node
          return produce(state, (draft) => {
            const booleanNode = dq.__getNodeById(
              draft,
              target_node_ids[0]
            ) as grida.program.nodes.BooleanPathOperationNode;
            booleanNode.op = op;
          });
        }
      }

      // Original behavior: wrap multiple nodes in a new boolean operation
      const flattenable: string[] = [];
      const ignored: string[] = [];
      for (const node_id of target_node_ids) {
        const node = dq.__getNodeById(state, node_id);
        if (node && supportsFlatten(node)) {
          flattenable.push(node_id);
        } else {
          ignored.push(node_id);
        }
      }

      return produce(state, (draft) => {
        const insertions = self_wrapNodesAsBooleanOperation(
          draft,
          flattenable,
          op,
          context.geometry
        );
        self_selectNode(draft, "reset", ...insertions);
      });
      break;
    }
    //
    case "select-vertex":
    case "delete-vertex":
    case "select-segment":
    case "delete-segment":
    case "translate-segment":
    case "bend-segment":
    case "select-tangent":
    case "delete-tangent":
    case "translate-vertex":
    case "split-segment": {
      return produce(state, (draft) => {
        const { node_id } = action.target;
        const vertex = (action as any).target.vertex;
        const segment = (action as any).target.segment;
        const node = dq.__getNodeById(draft, node_id);

        switch (action.type) {
          case "select-vertex": {
            assert(draft.content_edit_mode?.type === "vector");
            draft.selection = [node_id];
            const next = reduceVectorContentSelection(
              draft.content_edit_mode.selection,
              { type: "vertex", index: vertex, additive: action.additive }
            );
            draft.content_edit_mode.selection = next;
            draft.content_edit_mode.selection_neighbouring_vertices =
              getUXNeighbouringVertices(
                (node as grida.program.nodes.VectorNode).vectorNetwork,
                {
                  selected_vertices: next.selected_vertices,
                  selected_segments: next.selected_segments,
                  selected_tangents: next.selected_tangents,
                }
              );
            draft.content_edit_mode.a_point =
              getVectorSelectionStartPoint(next);
            break;
          }
          case "delete-vertex": {
            assert(node.type === "vector");

            self_updateVectorNodeVectorNetwork(node, (vne) => {
              vne.deleteVertex(vertex);
            });

            if (draft.content_edit_mode?.type === "vector") {
              if (
                draft.content_edit_mode.selection.selected_vertices.includes(
                  vertex
                ) ||
                draft.content_edit_mode.selection.selected_tangents.some(
                  ([v]) => v === vertex
                )
              ) {
                // clear the selection as deleted
                draft.content_edit_mode.selection = {
                  selected_vertices: [],
                  selected_segments: [],
                  selected_tangents: [],
                };
                draft.content_edit_mode.a_point = null;
              }
            }
            break;
          }
          case "select-segment": {
            assert(draft.content_edit_mode?.type === "vector");
            draft.selection = [node_id];
            const next = reduceVectorContentSelection(
              draft.content_edit_mode.selection,
              { type: "segment", index: segment, additive: action.additive }
            );
            draft.content_edit_mode.selection = next;
            draft.content_edit_mode.selection_neighbouring_vertices =
              getUXNeighbouringVertices(
                (node as grida.program.nodes.VectorNode).vectorNetwork,
                {
                  selected_vertices: next.selected_vertices,
                  selected_segments: next.selected_segments,
                  selected_tangents: next.selected_tangents,
                }
              );
            draft.content_edit_mode.a_point =
              getVectorSelectionStartPoint(next);
            break;
          }
          case "select-tangent": {
            assert(draft.content_edit_mode?.type === "vector");
            draft.selection = [node_id];
            const next = reduceVectorContentSelection(
              draft.content_edit_mode.selection,
              {
                type: "tangent",
                index: [vertex, action.target.tangent],
                additive: action.additive,
              }
            );
            draft.content_edit_mode.selection = next;
            draft.content_edit_mode.selection_neighbouring_vertices =
              getUXNeighbouringVertices(
                (node as grida.program.nodes.VectorNode).vectorNetwork,
                next
              );
            draft.content_edit_mode.a_point =
              getVectorSelectionStartPoint(next);
            break;
          }
          case "delete-tangent": {
            assert(node.type === "vector");

            self_updateVectorNodeVectorNetwork(node, (vne) => {
              const point = action.target.tangent === 0 ? "a" : "b";
              for (const si of vne.findSegments(vertex, point)) {
                const control = action.target.tangent === 0 ? "ta" : "tb";
                vne.deleteTangent(si, control);
              }
            });

            if (draft.content_edit_mode?.type === "vector") {
              draft.content_edit_mode.selection.selected_tangents =
                draft.content_edit_mode.selection.selected_tangents.filter(
                  ([v, t]) => !(v === vertex && t === action.target.tangent)
                );
              draft.content_edit_mode.a_point = null;
            }
            break;
          }
          case "translate-vertex": {
            assert(node.type === "vector");

            self_updateVectorNodeVectorNetwork(node, (vne) => {
              const bb_a = vne.getBBox();
              vne.translateVertex(vertex, action.delta);
              const bb_b = vne.getBBox();
              const delta_vec: cmath.Vector2 = [
                bb_b.x - bb_a.x,
                bb_b.y - bb_a.y,
              ];
              vne.translate(cmath.vector2.invert(delta_vec));
            });
            break;
          }
          case "translate-segment": {
            assert(node.type === "vector");
            self_updateVectorNodeVectorNetwork(node, (vne) => {
              const bb_a = vne.getBBox();
              vne.translateSegment(segment, action.delta);
              const bb_b = vne.getBBox();
              const delta_vec: cmath.Vector2 = [
                bb_b.x - bb_a.x,
                bb_b.y - bb_a.y,
              ];
              vne.translate(cmath.vector2.invert(delta_vec));
            });
            break;
          }
          case "bend-segment": {
            assert(node.type === "vector");
            self_updateVectorNodeVectorNetwork(node, (vne) => {
              vne.bendSegment(segment, action.ca, action.cb, action.frozen);
            });
            break;
          }
          case "delete-segment": {
            assert(node.type === "vector");

            self_updateVectorNodeVectorNetwork(node, (vne) => {
              vne.deleteSegment(segment);
            });

            if (draft.content_edit_mode?.type === "vector") {
              // Clear segment selection since the segment was deleted
              draft.content_edit_mode.selection = {
                selected_vertices: [],
                selected_segments: [],
                selected_tangents: [],
              };
              draft.content_edit_mode.a_point = null;
            }
            break;
          }
          case "split-segment": {
            if (node.type === "vector") {
              const newIndex = self_updateVectorNodeVectorNetwork(node, (vne) =>
                vne.splitSegment(segment, action.target.point)
              );

              if (draft.content_edit_mode?.type === "vector") {
                draft.content_edit_mode.selection = {
                  selected_vertices: [newIndex],
                  selected_segments: [],
                  selected_tangents: [],
                };
                draft.content_edit_mode.a_point = newIndex;
              }
              break;
            }
            break;
          }
        }
      });
    }
    case "vector/planarize": {
      const { target } = action;
      const target_node_ids =
        target === "selection"
          ? state.selection
          : Array.isArray(target)
            ? target
            : [target];

      return produce(state, (draft) => {
        for (const node_id of target_node_ids) {
          const node = dq.__getNodeById(draft, node_id);

          if (node.type === "vector") {
            self_updateVectorNodeVectorNetwork(node, (vne) => {
              vne.planarize();
            });
          }
        }
      });
    }
    case "vector/update-hovered-control": {
      return produce(state, (draft) => {
        if (draft.content_edit_mode?.type === "vector") {
          draft.content_edit_mode.hovered_control = action.hoveredControl;
        }
      });
    }
    //
    case "bend-or-clear-corner": {
      const { target, tangent } = <EditorVectorBendOrClearCornerAction>action;
      const { node_id, vertex, ref } = target;
      return produce(state, (draft) => {
        const node = dq.__getNodeById(
          draft,
          node_id
        ) as grida.program.nodes.VectorNode;
        self_updateVectorNodeVectorNetwork(node, (vne) => {
          if (typeof tangent !== "undefined") {
            vne.setCornerTangents(vertex, tangent);
            return;
          }

          const segs = vne.findSegments(vertex);
          if (segs.length === 2) {
            const segA = vne.segments[segs[0]];
            const segB = vne.segments[segs[1]];
            const controlA = segA.a === vertex ? "ta" : "tb";
            const controlB = segB.a === vertex ? "ta" : "tb";
            const tA = segA[controlA];
            const tB = segB[controlB];
            const tAExists = !cmath.vector2.isZero(tA);
            const tBExists = !cmath.vector2.isZero(tB);

            if (tAExists && tBExists) {
              vne.setCornerTangents(vertex, 0);
              return;
            }

            if (tAExists || tBExists) {
              const src = tAExists ? tA : tB;
              vne.setCornerTangents(vertex, src);
              return;
            }
          }

          vne.bendCorner(vertex, ref);
        });
      });
    }
    //
    case "select-gradient-stop": {
      return produce(state, (draft) => {
        const { target } = <EditorSelectGradientStopAction>action;
        const { node_id, stop } = target;
        const node = dq.__getNodeById(draft, node_id);
        assert(node);
        if (draft.content_edit_mode?.type === "fill/gradient") {
          draft.content_edit_mode.node_id = node_id;
          draft.content_edit_mode.selected_stop = stop;
        }
      });
    }
    //
    case "variable-width/select-stop": {
      return produce(state, (draft) => {
        const { target } = <EditorVariableWidthSelectStopAction>action;
        const { node_id, stop } = target;
        const node = dq.__getNodeById(draft, node_id);
        assert(node);
        if (draft.content_edit_mode?.type === "width") {
          draft.content_edit_mode.variable_width_selected_stop = stop;
        }
      });
    }
    case "variable-width/delete-stop": {
      return produce(state, (draft) => {
        const { target } = <EditorVariableWidthDeleteStopAction>action;
        const { node_id, stop } = target;
        const node = dq.__getNodeById(draft, node_id);
        assert(node);
        if (draft.content_edit_mode?.type === "width") {
          // Remove the stop from the profile
          const profile = draft.content_edit_mode.variable_width_profile;
          profile.stops.splice(stop, 1);

          // Clear selection if the deleted stop was selected
          if (draft.content_edit_mode.variable_width_selected_stop === stop) {
            draft.content_edit_mode.variable_width_selected_stop = null;
          } else if (
            draft.content_edit_mode.variable_width_selected_stop !== null &&
            draft.content_edit_mode.variable_width_selected_stop > stop
          ) {
            // Adjust selection index if it was after the deleted stop
            draft.content_edit_mode.variable_width_selected_stop--;
          }

          // Also update the node's strokeWidthProfile property
          if (node.type === "vector") {
            node.strokeWidthProfile = profile;
          }
        }
      });
    }
    case "variable-width/add-stop": {
      return produce(state, (draft) => {
        const { target } = <EditorVariableWidthAddStopAction>action;
        const { node_id, u, r } = target;
        const node = dq.__getNodeById(draft, node_id);
        assert(node);
        if (draft.content_edit_mode?.type === "width") {
          const profile = draft.content_edit_mode.variable_width_profile;

          // TODO: need to compute the correct initial r at the point, based on its neighbors
          // For now, we will simply be using the middle value of the neighbor, not caring the position diff of them

          // Find the correct position to insert the new stop (maintain sorted order by u)
          const insertIndex = profile.stops.findIndex((stop) => stop.u > u);
          const newStopIndex =
            insertIndex === -1 ? profile.stops.length : insertIndex;

          // Insert the new stop
          profile.stops.splice(newStopIndex, 0, { u, r });

          // Select the newly added stop
          draft.content_edit_mode.variable_width_selected_stop = newStopIndex;

          // Also update the node's strokeWidthProfile property
          if (node.type === "vector") {
            node.strokeWidthProfile = profile;
          }
        }
      });
    }
    //
    case "surface/ruler":
    case "surface/guide/delete":
    case "surface/pixel-grid":
    case "surface/content-edit-mode/try-enter":
    case "surface/content-edit-mode/fill/gradient":
    case "surface/content-edit-mode/try-exit":
    case "surface/tool":
    case "surface/brush":
    case "surface/brush/size":
    case "surface/brush/opacity":
    case "surface/gesture/start": {
      return surfaceReducer(state, action, context);
    }
    case "document/template/set/props": {
      const { data } = <TemplateEditorSetTemplatePropsAction>action;

      return produce(state, (draft) => {
        const root_template_instance = dq.__getNodeById(
          draft,
          // FIXME: update api interface
          scene.children[0]
        );
        assert(root_template_instance.type === "template_instance");
        root_template_instance.props = data;
      });
    }
    // case "document/template/change/props": {
    //   const { props: partialProps } = <TemplateEditorChangeTemplatePropsAction>(
    //     action
    //   );

    //   return produce(state, (draft) => {
    //     draft.template.props = {
    //       ...(draft.template.props || {}),
    //       ...partialProps,
    //     } as grida.program.schema.Props;
    //   });
    // }

    case "node/change/*":
    case "node/change/positioning":
    case "node/change/positioning-mode":
    case "node/change/component":
    case "node/change/props":
    case "node/change/style":
    case "node/change/fontFamily": {
      const { node_id } = <NodeChangeAction>action;
      return produce(state, (draft) => {
        const node = dq.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        draft.document.nodes[node_id] = nodeReducer(node, action);

        // font family specific hook
        if (action.type === "node/change/fontFamily") {
          if (action.fontFamily) {
            draft.googlefonts.push({ family: action.fontFamily });
          }
        }
      });
    }
    //
    case "node/toggle/bold": {
      return produce(state, (draft) => {
        const { node_id } = <NodeToggleBoldAction>action;
        const node = dq.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        if (node.type !== "text") return;

        const isBold = node.fontWeight === 700;
        if (isBold) {
          node.fontWeight = 400;
        } else {
          node.fontWeight = 700;
        }
      });
      //
    }
    //
    case "node/toggle/underline": {
      return produce(state, (draft) => {
        const { node_id } = <NodeToggleUnderlineAction>action;
        const node = dq.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        if (node.type !== "text") return;

        const isUnderline = node.textDecorationLine === "underline";
        node.textDecorationLine = isUnderline ? "none" : "underline";
      });
      //
    }
    //
    case "document/template/override/change/*": {
      const { template_instance_node_id, action: __action } = <
        TemplateNodeOverrideChangeAction
      >action;

      return produce(state, (draft) => {
        const { node_id } = __action;
        const template_instance_node = dq.__getNodeById(
          draft,
          template_instance_node_id
        );

        assert(
          template_instance_node &&
            template_instance_node.type === "template_instance"
        );

        const nodedata = template_instance_node.overrides[node_id] || {};
        template_instance_node.overrides[node_id] = nodeReducer(
          nodedata,
          __action
        );
      });
    }
    //
    //
    //
    case "document/properties/define":
    case "document/properties/rename":
    case "document/properties/update":
    case "document/properties/put":
    case "document/properties/delete": {
      return produce(state, (draft) => {
        // TODO:
        // const root_node = document.__getNodeById(draft, draft.document.root_id);
        // assert(root_node.type === "component");
        draft.document.properties = schemaReducer(
          state.document.properties,
          action
        );
        //
      });
    }

    default: {
      throw new Error(
        `unknown action type: "${(action as DocumentAction).type}"`
      );
    }
  }

  return state;
}

/**
 * Flattens nodes into unioned vector nodes grouped by their parent hierarchy.
 * Each group of sibling nodes is merged into a single vector node, inserted at
 * the earliest sibling order, and the originals are removed. The resulting
 * nodes are positioned relative to their parent using the shapes' real bounding
 * boxes so visuals remain unchanged.
 *
 * @returns ids of newly created vector nodes.
 */
function flatten_with_union<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  supported_node_ids: string[],
  context: ReducerContext
): string[] {
  if (supported_node_ids.length === 0) return [];

  const groups = Object.groupBy(
    supported_node_ids,
    (id) => dq.getParentId(draft.document_ctx, id) ?? "<root>"
  );

  const ids: string[] = [];

  Object.entries(groups).forEach(([parent, group]) => {
    if (!group) return;
    const inserted = __flatten_group_with_union(
      draft,
      group,
      parent === "<root>" ? null : parent,
      context
    );
    if (inserted) ids.push(inserted);
  });

  return ids;
}

function __flatten_group_with_union<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  group: string[],
  parent_id: string | null,
  context: ReducerContext
): string | null {
  if (group.length === 0) return null;

  const scene = draft.document.scenes[draft.scene_id!];
  const siblings = parent_id
    ? draft.document_ctx.__ctx_nid_to_children_ids[parent_id] || []
    : scene.children;
  const order = Math.min(
    ...group.map((id) => siblings.indexOf(id)).filter((i) => i >= 0)
  );

  const parent_rect = parent_id
    ? context.geometry.getNodeAbsoluteBoundingRect(parent_id)!
    : { x: 0, y: 0, width: 0, height: 0 };

  let union_net: vn.VectorNetwork | null = null;
  for (const node_id of group) {
    const rect = context.geometry.getNodeAbsoluteBoundingRect(node_id);
    const flattened = self_flattenNode(draft, node_id, context);
    if (!rect || !flattened) continue;
    const { node: v, delta } = flattened;
    const abs_pos: cmath.Vector2 = [rect.x + delta[0], rect.y + delta[1]];
    const vne = new vn.VectorNetworkEditor(v.vectorNetwork);
    vne.translate(abs_pos);
    union_net = union_net
      ? vn.VectorNetworkEditor.union(union_net, vne.value)
      : vne.value;
  }

  if (!union_net) return null;

  const base = dq.__getNodeById(
    draft,
    group[0]
  ) as grida.program.nodes.VectorNode;
  const id = nid();
  const node: grida.program.nodes.VectorNode = {
    ...base,
    id,
    vectorNetwork: union_net,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  };

  normalizeVectorNodeBBox(node);
  node.left! -= parent_rect.x;
  node.top! -= parent_rect.y;

  self_try_insert_node(draft, parent_id, node);
  __self_delete_nodes(draft, group);
  self_moveNode(draft, id, parent_id ?? "<root>", order);

  return id;
}

function __self_delete_nodes<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  target_node_ids: string[]
) {
  // Collect parent IDs before deletion
  const parent_ids_to_check = new Set<string>();
  for (const node_id of target_node_ids) {
    const parent_id = dq.getParentId(draft.document_ctx, node_id);
    if (parent_id) {
      parent_ids_to_check.add(parent_id);
    }
  }

  for (const node_id of target_node_ids) {
    if (
      // the deleting node cannot be.. in content edit mode
      node_id !== draft.content_edit_mode?.node_id
    ) {
      self_try_remove_node(draft, node_id);
    }
  }

  // Clean up empty boolean/group nodes after deletion
  __self_post_hierarchy_change_commit(draft, Array.from(parent_ids_to_check));
}

/**
 * Post-deletion cleanup function that removes empty boolean and group nodes.
 * Boolean and group nodes are not allowed to have no children in the editor.
 */
function __self_post_hierarchy_change_commit<
  S extends editor.state.IEditorState,
>(draft: Draft<S>, parent_ids_to_check: string[]) {
  const nodes_to_check = new Set<string>(parent_ids_to_check);

  // Check each parent node to see if it's now empty
  for (const parent_id of nodes_to_check) {
    const parent_node = dq.__getNodeById(draft, parent_id);
    if (!parent_node) continue;

    // Only check boolean and group nodes
    if (parent_node.type === "boolean" || parent_node.type === "group") {
      // Check if the node has children property and if it's empty
      if ("children" in parent_node && Array.isArray(parent_node.children)) {
        if (parent_node.children.length === 0) {
          // Remove the empty boolean/group node
          self_try_remove_node(draft, parent_id);

          // Recursively check the parent of this removed node
          const grandparent_id = dq.getParentId(draft.document_ctx, parent_id);
          if (grandparent_id) {
            nodes_to_check.add(grandparent_id);
          }
        }
      }
    }
  }
}

function __self_delete_vector_network_selection(
  draft: Draft<editor.state.IEditorState>,
  ved: editor.state.VectorContentEditMode
) {
  assert(draft.content_edit_mode?.type === "vector");
  const {
    node_id,
    selection: { selected_vertices, selected_segments, selected_tangents },
  } = ved;

  const node = dq.__getNodeById(
    draft,
    node_id
  ) as grida.program.nodes.VectorNode;

  self_updateVectorNodeVectorNetwork(node, (vne) => {
    // delete tangents
    for (const [v_idx, t_idx] of selected_tangents) {
      const point = t_idx === 0 ? "a" : "b";
      const control = t_idx === 0 ? "ta" : "tb";
      for (const si of vne.findSegments(v_idx, point)) {
        vne.deleteTangent(si, control);
      }
    }

    // delete segments
    const segs = [...selected_segments].sort((a, b) => b - a);
    for (const si of segs) {
      vne.deleteSegment(si);
    }

    // delete vertices
    const verts = [...selected_vertices].sort((a, b) => b - a);
    for (const vi of verts) {
      vne.deleteVertex(vi);
    }
  });

  draft.content_edit_mode.selection = {
    selected_vertices: [],
    selected_segments: [],
    selected_tangents: [],
  };
  draft.content_edit_mode.a_point = null;
}

function __self_order(
  draft: Draft<editor.state.IEditorState>,
  node_id: string,
  order: "back" | "front" | "backward" | "forward" | number
) {
  assert(draft.scene_id, "scene_id is required for order");
  const scene = draft.document.scenes[draft.scene_id];

  const parent_id = dq.getParentId(draft.document_ctx, node_id);
  // if (!parent_id) return; // root node case
  let ichildren: grida.program.nodes.i.IChildrenReference;
  if (parent_id) {
    ichildren = dq.__getNodeById(
      draft,
      parent_id
    ) as grida.program.nodes.i.IChildrenReference;
  } else {
    ichildren = scene;
  }

  const childIndex = ichildren.children.indexOf(node_id);
  assert(childIndex !== -1, "node not found in children");

  const before = [...ichildren.children];
  const reordered = [...before];
  switch (order) {
    case "back": {
      // change the children id order - move the node_id to the first (first is the back)
      reordered.splice(childIndex, 1);
      reordered.unshift(node_id);
      break;
    }
    case "backward": {
      // change the children id order - move the node_id to the previous
      if (childIndex === 0) return;
      reordered.splice(childIndex, 1);
      reordered.splice(childIndex - 1, 0, node_id);
      break;
    }
    case "front": {
      // change the children id order - move the node_id to the last (last is the front)
      reordered.splice(childIndex, 1);
      reordered.push(node_id);
      break;
    }
    case "forward": {
      // change the children id order - move the node_id to the next
      if (childIndex === ichildren.children.length - 1) return;
      reordered.splice(childIndex, 1);
      reordered.splice(childIndex + 1, 0, node_id);
      break;
    }
    default: {
      // shift order
      reordered.splice(childIndex, 1);
      reordered.splice(order, 0, node_id);
    }
  }

  ichildren.children = reordered;

  // update the hierarchy graph
  const context = dq.Context.from(draft.document);
  draft.document_ctx = context.snapshot();
}

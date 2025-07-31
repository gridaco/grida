import { produce, type Draft } from "immer";

import type {
  DocumentAction,
  EditorSelectAction,
  NodeChangeAction,
  TemplateEditorSetTemplatePropsAction,
  TemplateNodeOverrideChangeAction,
  NodeToggleBoldAction,
  EditorSelectGradientStopAction,
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
  self_selectNode,
} from "./methods";
import cmath from "@grida/cmath";
import { layout } from "@grida/cmath/_layout";
import { getSnapTargets, snapObjectsTranslation } from "./tools/snap";
import nid from "./tools/id";
import vn from "@grida/vn";
import schemaReducer from "./schema.reducer";
import { self_moveNode } from "./methods/move";
import { v4 } from "uuid";
import type { ReducerContext } from ".";
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
      if (!state.user_clipboard) break;
      const { user_clipboard, selection } = state;
      const { ids, prototypes } = user_clipboard;
      // const clipboard_nodes: grida.program.nodes.Node[] =
      //   user_clipboard.prototypes;
      // const clipboard_node_ids = clipboard_nodes.map((node) => node.id);

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

            // const offset = 10; // Offset to avoid overlapping
            // if (newNode.left !== undefined) newNode.left += offset;
            // if (newNode.top !== undefined) newNode.top += offset;
          }
        }

        // after
        draft.tool = { type: "cursor" };
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
    case "delete": {
      const { target } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];

      return produce(state, (draft) => {
        for (const node_id of target_node_ids) {
          if (
            // the deleting node cannot be..
            // - in content edit mode
            node_id !== state.content_edit_mode?.node_id
          ) {
            self_try_remove_node(draft, node_id);
          }
        }
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
        draft.tool = { type: "cursor" };
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
        __self_nudge(draft, target_node_ids, dx, dy, context);
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
      const { type: direction, target, shiftKey } = action;

      const nudge_mod = shiftKey ? 10 : 1;

      const target_node_ids =
        target === "selection" ? state.selection : [target];

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
          const nudge_dx =
            nudge_mod * editor.a11y.a11y_direction_to_vector[direction][0];
          const nudge_dy =
            nudge_mod * editor.a11y.a11y_direction_to_vector[direction][1];
          __self_nudge(draft, out_flow_node_ids, nudge_dx, nudge_dy, context);
        }
      });
      //
      //
      break;
    }
    case "align": {
      const {
        target,
        alignment: { horizontal, vertical },
      } = action;

      const target_node_ids =
        target === "selection" ? state.selection : [target];

      // clone the target_node_ids
      const bounding_node_ids = Array.from(target_node_ids);

      if (target_node_ids.length === 1) {
        // if a single node is selected, align it with its container. (if not root)
        // TODO: Knwon issue: this does not work accurately if the node overflows the container
        const node_id = target_node_ids[0];
        const top_id = dq.getTopId(state.document_ctx, node_id);
        if (node_id !== top_id) {
          // get container (parent)
          const parent_node_id = dq.getParentId(state.document_ctx, node_id);
          assert(parent_node_id, "parent node not found");
          bounding_node_ids.push(parent_node_id);
        }
        //
      }

      const rects = bounding_node_ids.map(
        (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
      );

      //
      const transformed = cmath.rect.align(rects, { horizontal, vertical });
      const deltas = transformed.map((rect, i) => {
        const target_rect = rects[i];
        const dx = rect.x - target_rect.x;
        const dy = rect.y - target_rect.y;

        return { dx, dy };
      });

      return produce(state, (draft) => {
        let i = 0;
        for (const node_id of bounding_node_ids) {
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

      // group by parent
      const groups = Object.groupBy(
        // omit root node
        target_node_ids.filter((id) => !scene.children.includes(id)),
        (node_id) => {
          return dq.getParentId(state.document_ctx, node_id)!;
        }
      );

      const layouts = Object.keys(groups).map((parent_id) => {
        const g = groups[parent_id]!;

        const parent_rect =
          context.geometry.getNodeAbsoluteBoundingRect(parent_id)!;

        const rects = g
          .map(
            (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
          )
          // make the rects relative to the parent
          .map((rect) =>
            cmath.rect.translate(rect, [-parent_rect.x, -parent_rect.y])
          )
          .map((rect) => cmath.rect.quantize(rect, 1));

        // guess the layout
        const lay = layout.flex.guess(rects);

        return {
          parent: parent_id,
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
          children = layout.orders.map((i) => children[i]);
          children.forEach((child_id) => {
            self_moveNode(draft, child_id, container_id);
          });

          // [reset children position]
          children.forEach((child_id) => {
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

      // group by parent, considering root nodes when scene allows
      const groups = Object.groupBy(
        target_node_ids.filter((id) => {
          const is_root = scene.children.includes(id);
          return scene.constraints.children !== "single" || !is_root;
        }),
        (node_id) => dq.getParentId(state.document_ctx, node_id) ?? "<root>"
      );

      return produce(state, (draft) => {
        const insertions: grida.program.nodes.NodeID[] = [];
        Object.keys(groups).forEach((parent_id) => {
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
              (node_id) =>
                context.geometry.getNodeAbsoluteBoundingRect(node_id)!
            )
            // make the rects relative to the parent
            .map((rect) => cmath.rect.translate(rect, delta))
            .map((rect) => cmath.rect.quantize(rect, 1));

          const union = cmath.rect.union(rects);

          const container_prototype: grida.program.nodes.NodePrototype = {
            type: "container",
            // layout
            top: cmath.quantize(union.y, 1),
            left: cmath.quantize(union.x, 1),
            width: union.width,
            height: union.height,
            // children (empty when init)
            children: [],
            // position
            position: "absolute",
          };

          const container_id = self_insertSubDocument(
            draft,
            is_root ? null : parent_id,
            grida.program.nodes.factory.create_packed_scene_document_from_prototype(
              container_prototype,
              nid
            )
          )[0];

          // [move children to container]
          g.forEach((id) => {
            self_moveNode(draft, id, container_id);
          });

          // [adjust children position]
          g.forEach((id) => {
            const child = dq.__getNodeById(draft, id);
            if ("left" in child && typeof child.left === "number")
              child.left -= union.x;
            if ("top" in child && typeof child.top === "number")
              child.top -= union.y;
          });

          insertions.push(container_id);
        });

        self_selectNode(draft, "reset", ...insertions);
      });
      break;
    }
    //
    case "hover-vertex":
    case "select-vertex":
    case "delete-vertex":
    case "select-segment":
    case "delete-segment":
    case "insert-middle-vertex": {
      return produce(state, (draft) => {
        const { node_id } = action.target;
        const vertex = (action as any).target.vertex;
        const segment = (action as any).target.segment;
        const node = dq.__getNodeById(draft, node_id);

        switch (action.type) {
          case "hover-vertex": {
            assert(
              draft.selection[0] === node_id,
              "hovered vertex should be in the selected node"
            );
            switch (action.event) {
              case "enter":
                draft.hovered_vertex_idx = vertex;
                break;
              case "leave":
                draft.hovered_vertex_idx = null;
                break;
            }
            break;
          }
          case "select-vertex": {
            assert(draft.content_edit_mode?.type === "vector");
            draft.selection = [node_id];
            draft.content_edit_mode.selected_vertices = [vertex];
            draft.content_edit_mode.selected_segments = [];
            draft.content_edit_mode.a_point = vertex;
            break;
          }
          case "delete-vertex": {
            assert(node.type === "vector");

            const vne = new vn.VectorNetworkEditor(node.vectorNetwork);
            vne.deleteVertex(vertex);
            const bb_b = vne.getBBox();
            const delta: cmath.Vector2 = [bb_b.x, bb_b.y];
            vne.translate(cmath.vector2.invert(delta));
            const new_pos = cmath.vector2.add([node.left!, node.top!], delta);

            node.left = new_pos[0];
            node.top = new_pos[1];
            node.width = bb_b.width;
            node.height = bb_b.height;

            node.vectorNetwork = vne.value;

            if (draft.content_edit_mode?.type === "vector") {
              if (draft.content_edit_mode.selected_vertices.includes(vertex)) {
                // clear the selection as deleted
                draft.content_edit_mode.selected_vertices = [];
                draft.content_edit_mode.selected_segments = [];
              }
            }
            break;
          }
          case "select-segment": {
            assert(draft.content_edit_mode?.type === "vector");
            draft.selection = [node_id];
            draft.content_edit_mode.selected_vertices = [];
            draft.content_edit_mode.selected_segments = [segment];
            draft.content_edit_mode.a_point = segment;
            break;
          }
          case "delete-segment": {
            assert(node.type === "vector");
            // TODO: delete segment in vne
            break;
          }
          case "insert-middle-vertex": {
            if (node.type === "vector") {
              const vne = new vn.VectorNetworkEditor(node.vectorNetwork);
              const newIndex = vne.insertMiddleVertex(segment);
              const bb_b = vne.getBBox();
              const delta: cmath.Vector2 = [bb_b.x, bb_b.y];
              vne.translate(cmath.vector2.invert(delta));
              const new_pos = cmath.vector2.add([node.left!, node.top!], delta);

              node.left = new_pos[0];
              node.top = new_pos[1];
              node.width = bb_b.width;
              node.height = bb_b.height;

              node.vectorNetwork = vne.value;

              if (draft.content_edit_mode?.type === "vector") {
                draft.content_edit_mode.selected_vertices = [newIndex];
                draft.content_edit_mode.selected_segments = [];
                draft.content_edit_mode.a_point = newIndex;
              }
              break;
            }
            break;
          }
        }
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

function __self_nudge(
  draft: Draft<editor.state.IEditorState>,
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

    draft.document.nodes[node_id] = nodeTransformReducer(node, {
      type: "translate",
      dx: dx,
      dy: dy,
    });
  }
}

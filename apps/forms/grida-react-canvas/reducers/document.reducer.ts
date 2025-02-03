import { produce, type Draft } from "immer";

import type {
  DocumentAction,
  //
  EditorSelectAction,
  NodeChangeAction,
  NodeToggleBasePropertyAction,
  TemplateEditorSetTemplatePropsAction,
  TemplateNodeOverrideChangeAction,
  NodeToggleBoldAction,
} from "../action";
import {
  DEFAULT_SNAP_NUDGE_THRESHOLD,
  type IDocumentEditorState,
} from "../state";
import { grida } from "@/grida";
import assert from "assert";
import { document } from "../document-query";
import nodeReducer from "./node.reducer";
import surfaceReducer from "./surface.reducer";
import nodeTransformReducer from "./node-transform.reducer";
import {
  self_clearSelection,
  self_deleteNode,
  self_duplicateNode,
  self_insertSubDocument,
  self_selectNode,
} from "./methods";
import { cmath } from "@grida/cmath";
import { layout } from "@grida/cmath/_layout";
import { domapi } from "../domapi";
import { getSnapTargets, snapObjectsTranslation } from "./tools/snap";
import nid from "./tools/id";
import { vn } from "@/grida/vn";
import { self_moveNode } from "./methods/move";

export default function documentReducer<S extends IDocumentEditorState>(
  state: S,
  action: DocumentAction
): S {
  if (!state.editable) return state;
  switch (action.type) {
    case "select": {
      const { document_ctx, selection } = state;
      const { selectors } = <EditorSelectAction>action;
      return produce(state, (draft) => {
        const ids = Array.from(
          new Set(
            selectors.flatMap((selector) =>
              document.querySelector(document_ctx, selection, selector)
            )
          )
        );

        if (ids.length === 0) {
          // if no ids found, keep the current selection
          // e.g. this can happen whe `>` (select children) is used but no children found
          return;
        } else {
          self_selectNode(draft, "reset", ...ids);
        }
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
            self_deleteNode(draft, node_id);
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
        const new_top_ids = [];

        const valid_target_selection =
          // 1. the target shall not be an original node
          // 2. the target shall be a container
          selection
            .filter((node_id) => !ids.includes(node_id))
            .filter((node_id) => {
              const node = document.__getNodeById(draft, node_id);
              return node.type === "container";
            });

        const targets =
          valid_target_selection.length > 0
            ? valid_target_selection
            : [state.document.root_id]; // default to root

        // the target (parent) node that will be pasted under
        for (const target of targets) {
          // to be pasted
          for (const prototype of prototypes) {
            const sub =
              grida.program.nodes.factory.createSubDocumentDefinitionFromPrototype(
                prototype,
                nid
              );

            const top_id = self_insertSubDocument(draft, target, sub);
            new_top_ids.push(top_id);

            // const offset = 10; // Offset to avoid overlapping
            // if (newNode.left !== undefined) newNode.left += offset;
            // if (newNode.top !== undefined) newNode.top += offset;
          }
        }

        // after
        draft.cursor_mode = { type: "cursor" };
        self_selectNode(draft, "reset", ...new_top_ids);
      });
    }
    case "duplicate": {
      const { target } = action;
      return produce(state, (draft) => {
        const target_node_ids =
          target === "selection" ? state.selection : [target];
        self_duplicateNode(draft, new Set(target_node_ids));
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
            // 1. a root node
            node_id !== draft.document.root_id &&
            // 2. in content edit mode
            node_id !== state.content_edit_mode?.node_id
          ) {
            self_deleteNode(draft, node_id);
          }
        }
      });
    }
    case "insert": {
      const { prototype } = action;

      return produce(state, (draft) => {
        const sub =
          grida.program.nodes.factory.createSubDocumentDefinitionFromPrototype(
            prototype,
            nid
          );

        const new_top_id = self_insertSubDocument(
          draft,
          draft.document.root_id,
          sub
        );

        // after
        draft.cursor_mode = { type: "cursor" };
        self_selectNode(draft, "reset", new_top_id);
      });
    }
    case "order": {
      const { target, order } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];

      return produce(state, (draft) => {
        for (const node_id of target_node_ids) {
          self_order(draft, node_id, order);
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
        self_nudge(draft, target_node_ids, dx, dy);
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
          const node = document.__getNodeById(draft, node_id);

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
        document.__getNodeById(state, node_id)
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
          self_order(draft, node_id, a11y_direction_to_order[direction]);
        }

        if (out_flow_node_ids.length > 0) {
          const nudge_dx = nudge_mod * a11y_direction_to_vector[direction][0];
          const nudge_dy = nudge_mod * a11y_direction_to_vector[direction][1];
          self_nudge(draft, out_flow_node_ids, nudge_dx, nudge_dy);
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
        if (state.document.root_id !== node_id) {
          // get container (parent)
          const parent_node_id = document.getParentId(
            state.document_ctx,
            node_id
          );
          assert(parent_node_id, "parent node not found");
          bounding_node_ids.push(parent_node_id);
        }
        //
      }

      const cdom = new domapi.CanvasDOM(state.transform);
      const rects = bounding_node_ids.map(
        (node_id) => cdom.getNodeBoundingRect(node_id)!
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
          const node = document.__getNodeById(state, node_id);
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

      const cdom = new domapi.CanvasDOM(state.transform);
      const rects = target_node_ids.map(
        (node_id) => cdom.getNodeBoundingRect(node_id)!
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
          const node = document.__getNodeById(state, node_id);
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
        target_node_ids.filter((id) => id !== state.document.root_id),
        (node_id) => {
          return document.getParentId(state.document_ctx, node_id)!;
        }
      );

      const cdom = new domapi.CanvasDOM(state.transform);

      const layouts = Object.keys(groups).map((parent_id) => {
        const g = groups[parent_id]!;

        const parent_rect = cdom.getNodeBoundingRect(parent_id)!;

        const rects = g
          .map((node_id) => cdom.getNodeBoundingRect(node_id)!)
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
            grida.program.nodes.factory.createSubDocumentDefinitionFromPrototype(
              container_prototype,
              nid
            )
          );

          // [move children to container]
          children = layout.orders.map((i) => children[i]);
          children.forEach((child_id) => {
            self_moveNode(draft, child_id, container_id);
          });

          // [reset children position]
          children.forEach((child_id) => {
            const child = document.__getNodeById(draft, child_id);
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

      // group by parent
      const groups = Object.groupBy(
        // omit root node
        target_node_ids.filter((id) => id !== state.document.root_id),
        (node_id) => {
          return document.getParentId(state.document_ctx, node_id)!;
        }
      );

      return produce(state, (draft) => {
        const insertions: grida.program.nodes.NodeID[] = [];
        Object.keys(groups).forEach((parent_id) => {
          const g = groups[parent_id]!;
          const cdom = new domapi.CanvasDOM(state.transform);

          const parent_rect = cdom.getNodeBoundingRect(parent_id)!;

          const rects = g
            .map((node_id) => cdom.getNodeBoundingRect(node_id)!)
            // make the rects relative to the parent
            .map((rect) =>
              cmath.rect.translate(rect, [-parent_rect.x, -parent_rect.y])
            )
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
            parent_id,
            grida.program.nodes.factory.createSubDocumentDefinitionFromPrototype(
              container_prototype,
              nid
            )
          );

          // [move children to container]
          g.forEach((id) => {
            self_moveNode(draft, id, container_id);
          });

          // [adjust children position]
          g.forEach((id) => {
            const child = document.__getNodeById(draft, id);
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
    case "delete-vertex":
    case "select-vertex":
    case "hover-vertex": {
      return produce(state, (draft) => {
        const {
          target: { node_id, vertex },
        } = action;
        const node = document.__getNodeById(draft, node_id);

        switch (action.type) {
          case "delete-vertex": {
            if (node.type === "path") {
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

              if (draft.content_edit_mode?.type === "path") {
                if (
                  draft.content_edit_mode.selected_vertices.includes(vertex)
                ) {
                  // clear the selection as deleted
                  draft.content_edit_mode.selected_vertices = [];
                }
              }
              break;
            }
            break;
          }
          case "select-vertex": {
            assert(draft.content_edit_mode?.type === "path");
            draft.selection = [node_id];
            draft.content_edit_mode.selected_vertices = [vertex];
            draft.content_edit_mode.a_point = vertex;
            break;
          }
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
        }
      });
    }
    //
    case "surface/ruler":
    case "surface/guide/delete":
    case "surface/pixel-grid":
    case "surface/content-edit-mode/try-enter":
    case "surface/content-edit-mode/try-exit":
    case "surface/cursor-mode":
    case "surface/brush":
    case "surface/brush/size":
    case "surface/brush/opacity":
    case "surface/gesture/start": {
      return surfaceReducer(state, action);
    }
    case "document/template/set/props": {
      const { data } = <TemplateEditorSetTemplatePropsAction>action;

      return produce(state, (draft) => {
        const root_template_instance = document.__getNodeById(
          draft,
          draft.document.root_id!
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

    case "node/change/active":
    case "node/change/locked":
    case "node/change/name":
    case "node/change/userdata":
    case "node/change/positioning":
    case "node/change/positioning-mode":
    case "node/change/size":
    case "node/change/component":
    case "node/change/href":
    case "node/change/target":
    case "node/change/mouse-cursor":
    case "node/change/src":
    case "node/change/props":
    case "node/change/opacity":
    case "node/change/rotation":
    case "node/change/cornerRadius":
    case "node/change/fill":
    case "node/change/border":
    case "node/change/stroke":
    case "node/change/stroke-width":
    case "node/change/stroke-cap":
    case "node/change/fit":
    case "node/change/padding":
    case "node/change/box-shadow":
    case "node/change/layout":
    case "node/change/direction":
    case "node/change/mainAxisAlignment":
    case "node/change/crossAxisAlignment":
    case "node/change/gap":
    case "node/change/mainAxisGap":
    case "node/change/crossAxisGap":
    case "node/change/style":
    case "node/change/fontSize":
    case "node/change/fontWeight":
    case "node/change/fontFamily":
    case "node/change/letterSpacing":
    case "node/change/lineHeight":
    case "node/change/textAlign":
    case "node/change/textAlignVertical":
    case "node/change/maxlength":
    case "node/change/text": {
      const { node_id } = <NodeChangeAction>action;
      return produce(state, (draft) => {
        const node = document.__getNodeById(draft, node_id);
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
    case "node/toggle/locked": {
      return produce(state, (draft) => {
        const { node_id } = <NodeToggleBasePropertyAction>action;
        const node = document.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        node.locked = !node.locked;
      });
    }
    case "node/toggle/active": {
      return produce(state, (draft) => {
        const { node_id } = <NodeToggleBasePropertyAction>action;
        const node = document.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        node.active = !node.active;
      });
    }
    case "node/toggle/bold": {
      return produce(state, (draft) => {
        const { node_id } = <NodeToggleBoldAction>action;
        const node = document.__getNodeById(draft, node_id);
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
        const template_instance_node = document.__getNodeById(
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
    case "document/schema/property/define": {
      return produce(state, (draft) => {
        const root_node = document.__getNodeById(draft, draft.document.root_id);
        assert(root_node.type === "component");

        const property_name =
          action.name ??
          "new_property_" + Object.keys(root_node.properties).length + 1;
        root_node.properties[property_name] = action.definition ?? {
          type: "string",
        };
      });
    }
    case "document/schema/property/rename": {
      const { name, newName } = action;
      return produce(state, (draft) => {
        const root_node = document.__getNodeById(draft, draft.document.root_id);
        assert(root_node.type === "component");

        // check for conflict
        if (root_node.properties[newName]) {
          return;
        }

        root_node.properties[newName] = root_node.properties[name];
        delete root_node.properties[name];
      });
    }
    case "document/schema/property/update": {
      return produce(state, (draft) => {
        const root_node = document.__getNodeById(draft, draft.document.root_id);
        assert(root_node.type === "component");

        root_node.properties[action.name] = action.definition;
      });
    }
    case "document/schema/property/delete": {
      return produce(state, (draft) => {
        const root_node = document.__getNodeById(draft, draft.document.root_id);
        assert(root_node.type === "component");

        delete root_node.properties[action.name];
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

const a11y_direction_to_order = {
  "a11y/up": "backward",
  "a11y/right": "forward",
  "a11y/down": "forward",
  "a11y/left": "backward",
} as const;

const a11y_direction_to_vector = {
  "a11y/up": [0, -1],
  "a11y/right": [1, 0],
  "a11y/down": [0, 1],
  "a11y/left": [-1, 0],
} as const;

function self_order(
  draft: Draft<IDocumentEditorState>,
  node_id: string,
  order: "back" | "front" | "backward" | "forward" | number
) {
  const parent_id = document.getParentId(draft.document_ctx, node_id);
  if (!parent_id) return; // root node case
  const parent_node: Draft<grida.program.nodes.i.IChildrenReference> =
    document.__getNodeById(
      draft,
      parent_id
    ) as grida.program.nodes.i.IChildrenReference;

  const childIndex = parent_node.children.indexOf(node_id);
  assert(childIndex !== -1, "node not found in children");

  const before = [...parent_node.children];
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
      if (childIndex === parent_node.children.length - 1) return;
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

  parent_node.children = reordered;
  draft.document_ctx.__ctx_nid_to_children_ids[parent_id] = reordered;
}

function self_nudge(
  draft: Draft<IDocumentEditorState>,
  targets: string[],
  dx: number,
  dy: number
) {
  // clear the previous surface snapping
  draft.surface_snapping = undefined;

  // for nudge, gesture is not required, but only for surface ux.
  if (draft.gesture.type === "nudge") {
    const cdpm = new domapi.CanvasDOM(draft.transform);

    const snap_target_node_ids = getSnapTargets(draft.selection, draft);
    const snap_target_node_rects = snap_target_node_ids.map(
      (node_id) => cdpm.getNodeBoundingRect(node_id)!
    );
    const origin_rects = targets.map(
      (node_id) => cdpm.getNodeBoundingRect(node_id)!
    );
    const { snapping } = snapObjectsTranslation(
      origin_rects,
      { objects: snap_target_node_rects },
      [dx, dy],
      DEFAULT_SNAP_NUDGE_THRESHOLD
    );
    draft.surface_snapping = snapping;
  }

  for (const node_id of targets) {
    const node = document.__getNodeById(draft, node_id);

    draft.document.nodes[node_id] = nodeTransformReducer(node, {
      type: "translate",
      dx: dx,
      dy: dy,
    });
  }
}

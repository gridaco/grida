import { produce, type Draft } from "immer";

import type {
  DocumentAction,
  //
  EditorSelectAction,
  NodeChangeAction,
  NodeOrderAction,
  NodeToggleBasePropertyAction,
  TemplateEditorSetTemplatePropsAction,
  TemplateNodeOverrideChangeAction,
  NodeToggleBoldAction,
} from "../action";
import type { IDocumentEditorState } from "../state";
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
  self_insertNode,
  self_selectNode,
} from "./methods";
import { cmath } from "../cmath";
import { domapi } from "../domapi";
import { getSnapTargets, snapMovementToObjects } from "./tools/snap";
import nid from "./tools/id";

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
    case "copy":
    case "cut": {
      const { target } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];

      return produce(state, (draft) => {
        const nodes = target_node_ids.map((node_id) =>
          document.__getNodeById(draft, node_id)
        );

        // [copy]
        draft.user_clipboard = {
          nodes: JSON.parse(JSON.stringify(nodes)),
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
      const clipboard_nodes: grida.program.nodes.Node[] = user_clipboard.nodes;
      const clipboard_node_ids = clipboard_nodes.map((node) => node.id);

      return produce(state, (draft) => {
        const new_ids = [];

        const valid_target_selection =
          // 1. the target shall not be an original node
          // 2. the target shall be a container
          selection
            .filter((node_id) => !clipboard_node_ids.includes(node_id))
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
          for (const data of clipboard_nodes) {
            //
            const new_id = nid();
            const newNode = {
              ...data,
              id: new_id,
            } as grida.program.nodes.AnyNode;

            const offset = 10; // Offset to avoid overlapping

            if (newNode.left !== undefined) newNode.left += offset;
            if (newNode.top !== undefined) newNode.top += offset;

            self_insertNode(draft, target, newNode as grida.program.nodes.Node);

            new_ids.push(new_id);
          }
        }

        // after
        draft.cursor_mode = { type: "cursor" };
        self_selectNode(draft, "reset", ...new_ids);
      });
    }
    case "duplicate": {
      const { target } = action;
      return produce(state, (draft) => {
        const target_node_ids =
          target === "selection" ? state.selection : [target];
        self_duplicateNode(draft, ...target_node_ids);
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
    case "nudge": {
      const { target, axis, delta } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];
      const dx = axis === "x" ? delta : 0;
      const dy = axis === "y" ? delta : 0;

      return produce(state, (draft) => {
        // for nudge, gesture is not required, but only for surface ux.
        if (draft.gesture.type === "nudge") {
          const snap_target_node_ids = getSnapTargets(state.selection, state);
          const snap_target_node_rects = snap_target_node_ids.map(
            (node_id) => domapi.get_node_bounding_rect(node_id)!
          );
          const origin_rects = target_node_ids.map(
            (node_id) => domapi.get_node_bounding_rect(node_id)!
          );
          const { snapping } = snapMovementToObjects(
            origin_rects,
            snap_target_node_rects,
            [dx, dy],
            [0.1, 0.1]
          );
          draft.gesture.surface_snapping = snapping;
        }

        for (const node_id of target_node_ids) {
          const node = document.__getNodeById(draft, node_id);

          draft.document.nodes[node_id] = nodeTransformReducer(node, {
            type: "translate",
            dx: dx,
            dy: dy,
          });
        }
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

      const rects = bounding_node_ids.map((node_id) =>
        // FIXME: do not use domapi in reducer
        domapi.get_node_element(node_id)!.getBoundingClientRect()
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

      const rects = target_node_ids.map((node_id) =>
        // FIXME: do not use domapi in reducer
        domapi.get_node_element(node_id)!.getBoundingClientRect()
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
    case "delete-point": {
      return produce(state, (draft) => {
        const {
          target: { node_id, point_index },
        } = action;
        const node = document.__getNodeById(draft, node_id);

        // TODO: update the node transform as the points are changed
        if ("points" in node) {
          const points = node.points;
          points.splice(point_index, 1);
        }
      });
    }
    case "document/insert": {
      const { prototype } = action;

      return produce(state, (draft) => {
        function self_instanciateNodePrototype<S extends IDocumentEditorState>(
          draft: Draft<S>,
          parentNodeId: string,
          nodePrototype: grida.program.nodes.NodePrototype
        ): string {
          const nodeId = nid();

          // Create the parent node
          // @ts-expect-error
          const newNode: grida.program.nodes.Node = {
            ...nodePrototype,
            id: nodeId,
            name: nodePrototype.name ?? nodePrototype.type,
            locked: nodePrototype.locked ?? false,
            active: nodePrototype.active ?? true,
            type: nodePrototype.type,
            children:
              nodePrototype.type === "container" ||
              nodePrototype.type === "component" ||
              nodePrototype.type === "template_instance" ||
              nodePrototype.type === "instance"
                ? []
                : undefined,
          };

          // Insert the parent node into the document first
          self_insertNode(draft, parentNodeId, newNode);

          // Recursively process children and register them after the parent
          if ("children" in nodePrototype) {
            (newNode as grida.program.nodes.i.IChildren).children =
              nodePrototype.children.map((childPrototype) =>
                self_instanciateNodePrototype(draft, nodeId, childPrototype)
              );
          }

          return nodeId;
        }

        // Insert the prototype as the root node under the document's root
        self_instanciateNodePrototype(draft, draft.document.root_id, prototype);

        // after
        draft.cursor_mode = { type: "cursor" };
        // TODO:
        self_clearSelection(draft);
      });
    }
    case "document/surface/content-edit-mode/try-enter":
    case "document/surface/content-edit-mode/try-exit":
    case "document/surface/cursor-mode": {
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
    case "node/order/back":
    case "node/order/front": {
      const { node_id } = <NodeOrderAction>action;
      return produce(state, (draft) => {
        const parent_id = document.getParentId(draft.document_ctx, node_id);
        if (!parent_id) return; // root node case
        const parent_node: Draft<grida.program.nodes.i.IChildren> =
          document.__getNodeById(
            draft,
            parent_id
          ) as grida.program.nodes.i.IChildren;

        const childIndex = parent_node.children!.indexOf(node_id);
        assert(childIndex !== -1, "node not found in children");

        const before = [...parent_node.children!];
        const reordered = [...before];
        switch (action.type) {
          case "node/order/back": {
            // change the children id order - move the node_id to the first (first is the back)
            reordered.splice(childIndex, 1);
            reordered.unshift(node_id);
            break;
          }
          case "node/order/front": {
            // change the children id order - move the node_id to the last (last is the front)
            reordered.splice(childIndex, 1);
            reordered.push(node_id);
            break;
          }
        }

        parent_node.children = reordered;
        draft.document_ctx.__ctx_nid_to_children_ids[parent_id] = reordered;
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

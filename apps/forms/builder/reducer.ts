import { produce, type Draft } from "immer";

import type {
  BuilderAction,
  TemplateEditorSetTemplatePropsAction,
  DocumentEditorNodeSelectAction,
  DocumentEditorNodePointerEnterAction,
  DocumentEditorNodePointerLeaveAction,
  NodeChangeAction,
  TemplateNodeOverrideChangeAction,
  TemplateEditorChangeTemplatePropsAction,
} from "./action";
import type { ITemplateEditorState } from "./types";
import { grida } from "@/grida";
import assert from "assert";

export default function reducer(
  state: ITemplateEditorState,
  action: BuilderAction
): ITemplateEditorState {
  switch (action.type) {
    case "document/template/set/props": {
      const { data } = <TemplateEditorSetTemplatePropsAction>action;
      return produce(state, (draft) => {
        draft.template.props = data;
      });
    }
    case "document/node/select": {
      const { node_id } = <DocumentEditorNodeSelectAction>action;

      return produce(state, (draft) => {
        draft.selected_node_id = node_id;
      });
    }
    case "document/node/on-pointer-enter": {
      const { node_id } = <DocumentEditorNodePointerEnterAction>action;
      return produce(state, (draft) => {
        draft.hovered_node_id = node_id;
      });
    }
    case "document/node/on-pointer-leave": {
      const { node_id } = <DocumentEditorNodePointerLeaveAction>action;
      return produce(state, (draft) => {
        if (draft.hovered_node_id === node_id) {
          draft.hovered_node_id = undefined;
        }
      });
    }
    case "document/template/change/props": {
      const { props: data } = <TemplateEditorChangeTemplatePropsAction>action;
      return produce(state, (draft) => {
        draft.template.props = {
          ...(draft.template.props || {}),
          ...data,
        } as grida.program.schema.Props;
      });
    }

    case "node/change/active":
    case "node/change/name":
    case "node/change/component":
    case "node/change/href":
    case "node/change/target":
    case "node/change/src":
    case "node/change/props":
    case "node/change/style":
    case "node/change/text": {
      throw new Error("Not implemented");
      // nodes[node_id] = nodeReducer(node, __action);
    }
    case "document/template/override/change/*": {
      const { action: __action } = <TemplateNodeOverrideChangeAction>action;

      return produce(state, (draft) => {
        const { node_id } = __action;
        const nodedata = draft.template.overrides[node_id];
        assert(nodedata);
        draft.template.overrides[node_id] = nodeReducer(nodedata, __action);
      });
    }
  }

  return state;
}

function nodeReducer(node: grida.program.nodes.Node, action: NodeChangeAction) {
  return produce(node, (draft) => {
    switch (action.type) {
      case "node/change/active": {
        node.active = action.active;
        break;
      }
      case "node/change/name": {
        node.name = action.name;
        break;
      }
      case "node/change/href": {
        node.href = action.href;
        break;
      }
      case "node/change/target": {
        node.target = action.target;
        break;
      }
      case "node/change/component": {
        assert(node.type === "instance");
        node.component_id = action.component_id;
        break;
      }
      case "node/change/src": {
        assert(node.type === "image");
        node.src = action.src;
        break;
      }
      case "node/change/props": {
        assert(node.type === "instance");
        node.props = Object.assign({}, node.props, action.props);
        break;
      }
      case "node/change/style": {
        node.style = Object.assign({}, node.style, action.style);
        break;
      }
      case "node/change/text": {
        assert(node.type === "text");
        node.text = action.text ?? null;
        break;
      }
    }
  });
}

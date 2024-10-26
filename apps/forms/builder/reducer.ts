import { produce, type Draft } from "immer";

import type {
  BuilderAction,
  BuilderSetDataAction,
  BuilderSelectNodeAction,
  BuilderNodePointerEnterAction,
  BuilderNodePointerLeaveAction,
  BuilderNodeSwitchComponentAction,
  BuilderNodeUpdateStyleAction,
  BuilderNodeUpdateAttributeAction,
  BuilderNodeUpdatePropertyAction,
  BuilderNodeChangeTextAction,
  BuilderTemplateNodeUpdatePropertyAction,
  BuilderNodeHiddenAction,
  BuilderNodeChangeSrcAction,
} from "./action";
import type { ITemplateEditorState, Values } from "./types";
import { grida } from "@/grida";

export default function reducer(
  state: ITemplateEditorState,
  action: BuilderAction
): ITemplateEditorState {
  switch (action.type) {
    case "editor/document/data": {
      const { data } = <BuilderSetDataAction>action;
      return produce(state, (draft) => {
        draft.template.values = data;
      });
    }
    case "editor/document/node/select": {
      const { node_id, meta } = <BuilderSelectNodeAction>action;

      return produce(state, (draft) => {
        draft.selected_node_id = node_id;
        draft.selected_node_meta = meta;
      });
    }
    case "editor/document/node/hidden": {
      const { node_id, hidden } = <BuilderNodeHiddenAction>action;
      return produce(state, (draft) => {
        draft.template.overrides[node_id] = {
          ...(draft.template.overrides[node_id] || {}),
          hidden,
        } as grida.program.nodes.InstanceNode;
      });
    }
    case "editor/document/node/pointer-enter": {
      const { node_id } = <BuilderNodePointerEnterAction>action;
      return produce(state, (draft) => {
        draft.hovered_node_id = node_id;
      });
    }
    case "editor/document/node/pointer-leave": {
      const { node_id } = <BuilderNodePointerLeaveAction>action;
      return produce(state, (draft) => {
        if (draft.hovered_node_id === node_id) {
          draft.hovered_node_id = undefined;
        }
      });
    }
    case "editor/document/node/switch-component": {
      const { node_id, component_id } = <BuilderNodeSwitchComponentAction>(
        action
      );

      return produce(state, (draft) => {
        draft.template.overrides[node_id] = {
          ...(draft.template.overrides[node_id] || {}),
          type: "instance",
          component_id,
        } as grida.program.nodes.InstanceNode;
      });
    }
    case "editor/document/node/text": {
      const { node_id, text } = <BuilderNodeChangeTextAction>action;
      return produce(state, (draft) => {
        draft.template.overrides[node_id] = {
          ...(draft.template.overrides[node_id] || {}),
          text,
        } as grida.program.nodes.TextNode;
      });
    }
    case "editor/document/node/src": {
      const { node_id, src } = <BuilderNodeChangeSrcAction>action;
      return produce(state, (draft) => {
        (
          draft.template.overrides[node_id] as grida.program.nodes.ImageNode
        ).src = src;
      });
    }
    case "editor/document/node/style": {
      const { node_id, data } = <BuilderNodeUpdateStyleAction>action;
      return produce(state, (draft) => {
        draft.template.overrides[node_id] = {
          ...(draft.template.overrides[node_id] || {}),
          style: {
            ...(draft.template.overrides[node_id]?.style || {}),
            ...data,
          },
        };
      });
    }
    // case "editor/document/node/attribute": {
    //   const { node_id, data } = <BuilderNodeUpdateAttributeAction>action;
    //   return produce(state, (draft) => {
    //     draft.template.overrides[node_id] = {
    //       ...(draft.template.overrides[node_id] || {}),
    //       attributes: {
    //         ...(draft.template.overrides[node_id]?.attributes || {}),
    //         ...data,
    //       },
    //     };
    //   });
    // }
    case "editor/document/node/property": {
      const { node_id, values: data } = <BuilderNodeUpdatePropertyAction>action;
      return produce(state, (draft) => {
        draft.template.overrides[node_id] = {
          ...(draft.template.overrides[node_id] || {}),
          props: {
            ...((
              draft.template.overrides[
                node_id
              ] as grida.program.nodes.InstanceNode
            )?.props || {}),
            ...data,
          },
        } as grida.program.nodes.InstanceNode;
      });
    }
    case "editor/template/node/property": {
      const { values: data } = <BuilderTemplateNodeUpdatePropertyAction>action;
      return produce(state, (draft) => {
        draft.template.values = {
          ...(draft.template.values || {}),
          ...data,
        } as Values;
      });
    }
  }

  return state;
}

import { produce, type Draft } from "immer";

import type {
  BuilderAction,
  BuilderSetDataAction,
  BuilderSelectNodeAction,
  BuilderNodeSwitchComponentAction,
  BuilderNodeUpdateStyleAction,
  BuilderNodeUpdateAttributeAction,
  BuilderNodeUpdatePropertyAction,
  BuilderNodeChangeTextAction,
  BuilderTemplateNodeUpdatePropertyAction,
} from "./action";
import type {
  InstanceNode,
  ITemplateEditorState,
  Values,
  TextNode,
} from "./types";
import assert from "assert";

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
      const {
        node_id,
        node_type,
        schema,
        context,
        default_properties,
        default_style,
        default_text,
      } = <BuilderSelectNodeAction>action;
      return produce(state, (draft) => {
        draft.selected_node_id = node_id;
        draft.selected_node_type = node_type;
        draft.selected_node_schema = schema || null;
        draft.selected_node_context = context;
        draft.selected_node_default_properties = default_properties;
        draft.selected_node_default_style = default_style;
        draft.selected_node_default_text = default_text;
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
        } as InstanceNode;
      });
    }
    case "editor/document/node/text": {
      const { node_id, text } = <BuilderNodeChangeTextAction>action;
      return produce(state, (draft) => {
        draft.template.overrides[node_id] = {
          ...(draft.template.overrides[node_id] || {}),
          text,
        } as TextNode;
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
    case "editor/document/node/attribute": {
      const { node_id, data } = <BuilderNodeUpdateAttributeAction>action;
      return produce(state, (draft) => {
        draft.template.overrides[node_id] = {
          ...(draft.template.overrides[node_id] || {}),
          attributes: {
            ...(draft.template.overrides[node_id]?.attributes || {}),
            ...data,
          },
        };
      });
    }
    case "editor/document/node/property": {
      const { node_id, values: data } = <BuilderNodeUpdatePropertyAction>action;
      return produce(state, (draft) => {
        draft.template.overrides[node_id] = {
          ...(draft.template.overrides[node_id] || {}),
          properties: {
            ...((draft.template.overrides[node_id] as InstanceNode)
              ?.properties || {}),
            ...data,
          },
        } as InstanceNode;
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

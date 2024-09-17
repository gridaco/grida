import { produce, type Draft } from "immer";

import {
  DocumentAction,
  DocumentSelectPageAction,
  DocumentSelectNodeAction,
  DocumentNodeChangeTemplateAction,
  DocumentNodeUpdateStyleAction,
  DocumentNodeUpdateAttributeAction,
  DocumentNodeUpdatePropertyAction,
  DocumentNodeChangeTextAction,
  DocumentTemplateSampleDataAction,
} from "../action";
import { EditorState } from "../state";

export default function documentReducer(
  state: EditorState,
  action: DocumentAction
): EditorState {
  switch (action.type) {
    case "editor/document/select-page": {
      const { page_id } = <DocumentSelectPageAction>action;

      return produce(state, (draft) => {
        draft.document.selected_page_id = page_id;
      });
    }
    case "editor/document/sampledata": {
      const { sampledata } = <DocumentTemplateSampleDataAction>action;
      return produce(state, (draft) => {
        draft.document.templatesample = sampledata;
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
      } = <DocumentSelectNodeAction>action;
      return produce(state, (draft) => {
        draft.document.selected_node_id = node_id;
        draft.document.selected_node_type = node_type;
        draft.document.selected_node_schema = schema || null;
        draft.document.selected_node_context = context;
        draft.document.selected_node_default_properties = default_properties;
        draft.document.selected_node_default_style = default_style;
        draft.document.selected_node_default_text = default_text;
      });
    }
    case "editor/document/node/template": {
      const { node_id, template_id } = <DocumentNodeChangeTemplateAction>action;
      return produce(state, (draft) => {
        draft.document.templatedata[node_id] = {
          ...(draft.document.templatedata[node_id] || {}),
          template_id,
        };
      });
    }
    case "editor/document/node/text": {
      const { node_id, text } = <DocumentNodeChangeTextAction>action;
      return produce(state, (draft) => {
        draft.document.templatedata[node_id] = {
          ...(draft.document.templatedata[node_id] || {}),
          text,
        };
      });
    }
    case "editor/document/node/style": {
      const { node_id, data } = <DocumentNodeUpdateStyleAction>action;
      return produce(state, (draft) => {
        draft.document.templatedata[node_id] = {
          ...(draft.document.templatedata[node_id] || {}),
          style: {
            ...(draft.document.templatedata[node_id]?.style || {}),
            ...data,
          },
        };
      });
    }
    case "editor/document/node/attribute": {
      const { node_id, data } = <DocumentNodeUpdateAttributeAction>action;
      return produce(state, (draft) => {
        draft.document.templatedata[node_id] = {
          ...(draft.document.templatedata[node_id] || {}),
          attributes: {
            ...(draft.document.templatedata[node_id]?.attributes || {}),
            ...data,
          },
        };
      });
    }
    case "editor/document/node/property": {
      const { node_id, data } = <DocumentNodeUpdatePropertyAction>action;
      return produce(state, (draft) => {
        draft.document.templatedata[node_id] = {
          ...(draft.document.templatedata[node_id] || {}),
          properties: {
            ...(draft.document.templatedata[node_id]?.properties || {}),
            ...data,
          },
        };
      });
    }
  }

  return state;
}

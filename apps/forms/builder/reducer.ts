import { produce, type Draft } from "immer";

import type {
  BuilderAction,
  BuilderSetDataAction,
  BuilderSelectNodeAction,
  BuilderNodePointerEnterAction,
  BuilderNodePointerLeaveAction,
  TemplateEditorNodeChangeComponentAction,
  TemplateEditorNodeChangeStyleAction,
  TemplateEditorNodeChangePropsAction,
  TemplateEditorNodeChangeTextAction,
  TemplateEditorChangeTemplatePropsAction,
  TemplateEditorNodeChangeHiddenAction,
  TemplateEditorNodeChangeSrcAction,
  TemplateEditorNodeChangeHrefAction,
  TemplateEditorNodeChangeTargetAction,
} from "./action";
import type { ITemplateEditorState } from "./types";
import { grida } from "@/grida";
import { deepAssign } from "@/utils";

export default function reducer(
  state: ITemplateEditorState,
  action: BuilderAction
): ITemplateEditorState {
  switch (action.type) {
    case "editor/document/data": {
      const { data } = <BuilderSetDataAction>action;
      return produce(state, (draft) => {
        draft.template.props = data;
      });
    }
    case "document/node/select": {
      const { node_id } = <BuilderSelectNodeAction>action;

      return produce(state, (draft) => {
        draft.selected_node_id = node_id;
      });
    }
    case "document/node/on-pointer-enter": {
      const { node_id } = <BuilderNodePointerEnterAction>action;
      return produce(state, (draft) => {
        draft.hovered_node_id = node_id;
      });
    }
    case "document/node/on-pointer-leave": {
      const { node_id } = <BuilderNodePointerLeaveAction>action;
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
    case "document/template/override/node/change/active": {
      const { node_id, active } = <TemplateEditorNodeChangeHiddenAction>action;
      return produce(state, (draft) => {
        override(draft, { node_id, payload: { active } });
      });
    }
    case "document/template/override/node/change/component": {
      const { node_id, component_id } = <
        TemplateEditorNodeChangeComponentAction
      >action;

      return produce(state, (draft) => {
        override(draft, { node_id, payload: { component_id } });
      });
    }
    case "document/template/override/node/change/text": {
      const { node_id, text } = <TemplateEditorNodeChangeTextAction>action;
      return produce(state, (draft) => {
        override(draft, { node_id, payload: { text } });
      });
    }
    case "document/template/override/node/change/src": {
      const { node_id, src } = <TemplateEditorNodeChangeSrcAction>action;
      return produce(state, (draft) => {
        override(draft, { node_id, payload: { src } });
      });
    }
    case "document/template/override/node/change/href": {
      const { node_id, href } = <TemplateEditorNodeChangeHrefAction>action;
      return produce(state, (draft) => {
        override(draft, { node_id, payload: { href } });
      });
    }
    case "document/template/override/node/change/target": {
      const { node_id, target } = <TemplateEditorNodeChangeTargetAction>action;
      return produce(state, (draft) => {
        override(draft, { node_id, payload: { target } });
      });
    }
    case "document/template/override/node/change/style": {
      const { node_id, style } = <TemplateEditorNodeChangeStyleAction>action;
      return produce(state, (draft) => {
        override(draft, { node_id, payload: { style } });
      });
    }
    case "document/template/override/node/change/props": {
      const { node_id, props } = <TemplateEditorNodeChangePropsAction>action;
      return produce(state, (draft) => {
        override(draft, { node_id, payload: { props } });
      });
    }
  }

  return state;
}

function override(
  draft: Draft<ITemplateEditorState>,
  { node_id, payload }: { node_id: string; payload: {} }
) {
  draft.template.overrides[node_id] =
    draft.template.overrides[node_id] ||
    ({ id: node_id, style: {} } as grida.program.nodes.Node);

  deepAssign(draft.template.overrides[node_id], payload);
}

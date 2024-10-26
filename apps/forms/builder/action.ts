import type { Tokens } from "@/ast";
import { NodeSlotMeta } from "./types";
import { grida } from "@/grida";

export type BuilderAction =
  | BuilderSetDataAction
  | TemplateEditorNodeChangeHiddenAction
  | BuilderSelectNodeAction
  | BuilderNodePointerEnterAction
  | BuilderNodePointerLeaveAction
  | TemplateEditorNodeChangeComponentAction
  | TemplateEditorNodeChangeTextAction
  | TemplateEditorNodeChangeSrcAction
  | TemplateEditorNodeChangeStyleAction
  | TemplateEditorNodeChangePropsAction
  | TemplateEditorChangeTemplatePropsAction;

export interface BuilderSetDataAction {
  type: "editor/document/data";
  data: Record<string, any>;
}

export interface BuilderSelectNodeAction {
  type: "document/node/select";
  node_id?: string;
  meta?: NodeSlotMeta;
}

interface INodeAction {
  node_id: string;
}

export type BuilderNodePointerEnterAction = INodeAction & {
  type: "document/node/on-pointer-enter";
};

export type BuilderNodePointerLeaveAction = INodeAction & {
  type: "document/node/on-pointer-leave";
};

interface INodeChangeHiddenAction extends INodeAction {
  hidden: boolean;
}

interface INodeChangeComponentAction extends INodeAction {
  component_id: string;
}

interface INodeChangeTextAction extends INodeAction {
  text?: Tokens.StringValueExpression;
}

interface INodeChangeStyleAction extends INodeAction {
  style: Partial<React.CSSProperties>;
}

interface INodeChangeSrcAction extends INodeAction {
  src?: string;
}

interface INodeChangePropsAction extends INodeAction {
  props: Partial<grida.program.nodes.i.IProps["props"]>;
}

export type TemplateEditorNodeChangeComponentAction =
  INodeChangeComponentAction & {
    type: "document/template/override/node/change/component";
  };

export type TemplateEditorNodeChangeTextAction = INodeChangeTextAction & {
  type: "document/template/override/node/change/text";
};

export type TemplateEditorNodeChangeStyleAction = INodeChangeStyleAction & {
  type: "document/template/override/node/change/style";
};

export type TemplateEditorNodeChangeSrcAction = INodeChangeSrcAction & {
  type: "document/template/override/node/change/src";
};

export type TemplateEditorNodeChangePropsAction = INodeChangePropsAction & {
  type: "document/template/override/node/change/props";
};

export type TemplateEditorNodeChangeHiddenAction = INodeChangeHiddenAction & {
  type: "document/template/override/node/change/hidden";
};

export type TemplateEditorChangeTemplatePropsAction = Omit<
  INodeChangePropsAction,
  "node_id"
> & {
  type: "document/template/change/props";
};

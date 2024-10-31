import type { Tokens } from "@/ast";
import { grida } from "@/grida";

export type BuilderAction =
  | DocumentEditorNodeSelectAction
  | DocumentEditorNodePointerEnterAction
  | DocumentEditorNodePointerLeaveAction
  | NodeChangeAction
  | TemplateNodeOverrideChangeAction
  | TemplateEditorSetTemplatePropsAction
  | TemplateEditorChangeTemplatePropsAction;

export interface DocumentEditorNodeSelectAction {
  type: "document/node/select";
  node_id?: string;
}

interface INodeID {
  node_id: string;
}

export type DocumentEditorNodePointerEnterAction = INodeID & {
  type: "document/node/on-pointer-enter";
};

export type DocumentEditorNodePointerLeaveAction = INodeID & {
  type: "document/node/on-pointer-leave";
};

interface INodeChangeNameAction extends INodeID {
  name: string;
}

interface INodeChangeActiveAction extends INodeID {
  active: boolean;
}

interface INodeChangeComponentAction extends INodeID {
  component_id: string;
}

interface INodeChangeTextAction extends INodeID {
  text?: Tokens.StringValueExpression;
}

interface INodeChangeStyleAction extends INodeID {
  style: Partial<React.CSSProperties>;
}

interface INodeChangeSrcAction extends INodeID {
  src?: Tokens.StringValueExpression;
}

interface INodeChangeHrefAction extends INodeID {
  href?: grida.program.nodes.i.IHrefable["href"];
}

interface INodeChangeTargetAction extends INodeID {
  target?: grida.program.nodes.i.IHrefable["target"];
}

interface INodeChangePropsAction extends INodeID {
  props: Partial<grida.program.nodes.i.IProps["props"]>;
}

export type NodeChangeAction =
  | ({ type: "node/change/name" } & INodeChangeNameAction)
  | ({ type: "node/change/active" } & INodeChangeActiveAction)
  | ({ type: "node/change/component" } & INodeChangeComponentAction)
  | ({ type: "node/change/text" } & INodeChangeTextAction)
  | ({ type: "node/change/style" } & INodeChangeStyleAction)
  | ({ type: "node/change/src" } & INodeChangeSrcAction)
  | ({ type: "node/change/href" } & INodeChangeHrefAction)
  | ({ type: "node/change/target" } & INodeChangeTargetAction)
  | ({ type: "node/change/props" } & INodeChangePropsAction);

export type TemplateNodeOverrideChangeAction = {
  type: "document/template/override/change/*";
  action: NodeChangeAction;
};

export type TemplateEditorChangeTemplatePropsAction = Omit<
  INodeChangePropsAction,
  "node_id"
> & {
  type: "document/template/change/props";
};

export interface TemplateEditorSetTemplatePropsAction {
  type: "document/template/set/props";
  data: Record<string, any>;
}

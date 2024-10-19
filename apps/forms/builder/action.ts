import type { ZodObject } from "zod";
import type { Tokens } from "@/ast";

export type BuilderAction =
  | BuilderTemplateSampleDataAction
  | BuilderSelectNodeAction
  | BuilderNodeSwitchComponentAction
  | BuilderNodeChangeTextAction
  | BuilderNodeUpdateStyleAction
  | BuilderNodeUpdateAttributeAction
  | BuilderNodeUpdatePropertyAction;

// TODO: consider removing this
export interface BuilderTemplateSampleDataAction {
  type: "editor/document/sampledata";
  sampledata: string;
}

export interface BuilderSelectNodeAction {
  type: "editor/document/node/select";
  node_id?: string;
  node_type?: string;
  schema?: ZodObject<any>;
  context?: any;
  default_properties?: Record<string, any>;
  default_style?: React.CSSProperties;
  default_text?: Tokens.StringValueExpression;
}

export interface BuilderNodeSwitchComponentAction {
  type: "editor/document/node/switch-component";
  node_id: string;
  component_id: string;
}

export interface BuilderNodeChangeTextAction {
  type: "editor/document/node/text";
  node_id: string;
  text?: Tokens.StringValueExpression;
}

export interface BuilderNodeUpdateStyleAction {
  type: "editor/document/node/style";
  node_id: string;
  data: { [key: string]: any };
}

export interface BuilderNodeUpdateAttributeAction {
  type: "editor/document/node/attribute";
  node_id: string;
  data: { [key: string]: any };
}

export interface BuilderNodeUpdatePropertyAction {
  type: "editor/document/node/property";
  node_id: string;
  data: { [key: string]: any };
}

import type { ZodObject } from "zod";
import type { Tokens } from "@/ast";
import { UnknwonNodeMeta, Values } from "./types";

export type BuilderAction =
  | BuilderSetDataAction
  | BuilderSelectNodeAction
  | BuilderNodeSwitchComponentAction
  | BuilderNodeChangeTextAction
  | BuilderNodeUpdateStyleAction
  | BuilderNodeUpdateAttributeAction
  | BuilderNodeUpdatePropertyAction
  | BuilderTemplateNodeUpdatePropertyAction;

export interface BuilderSetDataAction {
  type: "editor/document/data";
  data: Record<string, any>;
}

export interface BuilderSelectNodeAction {
  type: "editor/document/node/select";
  node_id?: string;
  meta?: UnknwonNodeMeta;
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
  values: Partial<Values>;
}

export interface BuilderTemplateNodeUpdatePropertyAction {
  type: "editor/template/node/property";
  values: Partial<Values>;
}

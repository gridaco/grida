import type { ZodObject } from "zod";
import type { Tokens } from "@/ast";
import { grida } from "@/grida";

export interface IDocumentSelectedNodeState {
  selected_node_id?: string;
  selected_node_meta?: UnknwonNodeMeta;
}

export interface UnknwonNodeMeta {
  selected_node_type?: string;
  selected_node_schema?: ZodObject<any>;
  /**
   * @deprecated use properties instead (when ready)
   */
  selected_node_context?: any;
  selected_node_default_properties?: Record<string, any>;
  selected_node_default_style?: React.CSSProperties;
  selected_node_default_text?: Tokens.StringValueExpression;
}

export type Values = {
  [key: string]: grida.program.schema.Value;
};

export interface ITemplateEditorState extends IDocumentSelectedNodeState {
  template: grida.program.template.TemplateInstance;
}

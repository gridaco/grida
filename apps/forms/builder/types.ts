import type { ZodObject } from "zod";
import type { Tokens } from "@/ast";

export interface IDocumentSelectedNodeState {
  selected_node_id?: string;
  selected_node_type?: string;
  selected_node_schema?: ZodObject<any> | null;
  selected_node_default_properties?: Record<string, any>;
  selected_node_default_style?: React.CSSProperties;
  selected_node_default_text?: Tokens.StringValueExpression;
  selected_node_context?: Record<string, any>;
}

interface TemplateNode {
  text?: Tokens.StringValueExpression;
  /**
   * ID of component that this instance came from, refers to components table
   */
  component_id: string;
  attributes?: {
    hidden?: boolean;
  };
  /**
   * properties - props data
   *
   * expression that will be passed to this instance
   */
  properties?: { [key: string]: Tokens.StringValueExpression };
  style?: React.CSSProperties;
}

export interface ITemplateEditorState extends IDocumentSelectedNodeState {
  data: Record<string, any>;
  overrides: {
    [node_id: string]: TemplateNode;
  };
}

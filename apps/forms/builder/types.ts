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

export interface IDocumentState extends IDocumentSelectedNodeState {
  nodes: any[];
  templatesample?: string;
  templatedata: {
    [key: string]: {
      text?: Tokens.StringValueExpression;
      template_id: string;
      attributes?: Omit<
        React.HtmlHTMLAttributes<HTMLDivElement>,
        "style" | "className"
      >;
      properties?: { [key: string]: Tokens.StringValueExpression };
      style?: React.CSSProperties;
    };
  };
}

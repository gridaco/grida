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

type Node = TextNode | InstanceNode;

interface IStylable {
  attributes?: {
    hidden?: boolean;
  };
  style?: React.CSSProperties;
}

interface IText {
  text: Tokens.StringValueExpression;
}

export type Properties = {
  [key: string]:
    | Tokens.NumericValueExpression
    | Tokens.StringValueExpression
    | Tokens.StringValueExpression[]
    | Properties;
};

interface IProperties {
  /**
   * properties - props data
   *
   * expression that will be passed to this instance
   */
  properties: Properties;
}

export interface TextNode extends IStylable, IText {
  type: "text";
}

export interface InstanceNode extends IStylable, IProperties {
  type: "instance";
  /**
   * ID of component that this instance came from, refers to components table
   */
  component_id: string;
}

/**
 * [Template Node] Template node is a static, hand crafted template that does not have a intrinsic tree, only a root properties [data] and [overrides] to each customizable node
 *
 * Template Node cannot be used as a child node.
 *
 * This will be used until we have a fully working tree editor.
 */
interface TemplateNode extends IProperties {
  type: "template";

  /**
   * ID of template that this instance came from
   */
  template_id: string;

  /**
   * children override data
   */
  overrides: {
    [node_id: string]: Node;
  };
}

export interface ITemplateEditorState extends IDocumentSelectedNodeState {
  template: TemplateNode;
}

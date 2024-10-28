import type { Tokens } from "@/ast";
import type { BuilderAction } from "./action";
import type { grida } from "@/grida";

export type DocumentDispatcher = (action: BuilderAction) => void;

export interface IDocumentCursorState {
  selected_node_id?: string;
  selected_node_meta?: NodeSlotMeta;
  hovered_node_id?: string;
}

export interface NodeSlotMeta {
  type: string;
  properties?: grida.program.schema.Properties;
  default?: Record<string, any>;
  default_style?: React.CSSProperties;
  default_text?: Tokens.StringValueExpression;
}

export interface ITemplateEditorState extends IDocumentCursorState {
  template: grida.program.template.TemplateInstance;
  readonly: boolean;
}

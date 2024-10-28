import type { Tokens } from "@/ast";
import type { BuilderAction } from "./action";
import type { grida } from "@/grida";

export type DocumentDispatcher = (action: BuilderAction) => void;

export interface IDocumentCursorState {
  selected_node_id?: string;
  hovered_node_id?: string;
}

export interface ITemplateEditorState extends IDocumentCursorState {
  template: grida.program.template.TemplateInstance;
  readonly: boolean;
}

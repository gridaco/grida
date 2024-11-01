import type { Tokens } from "@/ast";
import type { BuilderAction } from "./action";
import type { grida } from "@/grida";

export type DocumentDispatcher = (action: BuilderAction) => void;

export interface IDocumentEditorInteractionCursorState {
  selected_node_id?: string;
  hovered_node_id?: string;
}

export interface ITemplateEditorState
  extends IDocumentEditorInteractionCursorState {
  template: grida.program.document.template.TemplateInstance;
  editable: boolean;
}

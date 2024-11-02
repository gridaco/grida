import type { Tokens } from "@/ast";
import type { BuilderAction } from "./action";
import type { grida } from "@/grida";

export type DocumentDispatcher = (action: BuilderAction) => void;

export interface IDocumentEditorInteractionCursorState {
  selected_node_id?: string;
  hovered_node_id?: string;
  is_node_transforming?: boolean;
}

export interface IDocumentEditorState
  extends IDocumentEditorInteractionCursorState {
  /**
   *
   * when editable is false, the document definition is not editable
   * set editable false on production context - end-user-facing context
   */
  editable: boolean;

  document: grida.program.document.IDocumentDefinition;

  /**
   * user registered templates
   */
  templates?: Record<
    string,
    grida.program.document.template.TemplateDocumentDefinition
  >;
}

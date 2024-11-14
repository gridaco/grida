import type { Tokens } from "@/ast";
import type { BuilderAction } from "./action";
import { grida } from "@/grida";

export type DocumentDispatcher = (action: BuilderAction) => void;

export interface IDocumentEditorInteractionCursorState {
  selected_node_id?: string;
  hovered_node_id?: string;

  /**
   * @private - internal use only
   *
   * is gesture node-move and should hide the overlay ui
   */
  is_gesture_node_drag_move?: boolean;

  /**
   * @private - internal use only
   *
   * is gesture node-resize
   */
  is_gesture_node_drag_resize?: boolean;

  /**
   * @private - internal use only
   *
   * is gesture node-corner-radius
   */
  is_gesture_node_drag_corner_radius?: boolean;

  /**
   * @private - internal use only
   *
   * is gesture node-rotation
   */
  is_gesture_node_drag_rotation?: boolean;

  /**
   * @private - internal use only
   *
   * current content edit mode
   *
   * @default false
   */
  content_edit_mode?: false | "text" | "path";

  /**
   * @private - internal use only
   *
   * @default {x: 0, y: 0}
   */
  cursor_position: {
    x: number;
    y: number;
  };

  /**
   * @private - internal use only
   *
   * refresh key
   */
  // __r: number;
  // selectedTextRange;
}

export interface IDocumentEditorInit
  extends grida.program.document.IDocumentTemplatesRepository {
  /**
   *
   * when editable is false, the document definition is not editable
   * set editable false on production context - end-user-facing context
   */
  editable: boolean;

  document: grida.program.document.IDocumentDefinition;
}

export interface IDocumentEditorState
  extends IDocumentEditorInit,
    IDocumentEditorInteractionCursorState,
    grida.program.document.internal.IDocumentEditorState {}

export function initDocumentEditorState(
  init: IDocumentEditorInit
): IDocumentEditorState {
  return {
    ...init,
    cursor_position: { x: 0, y: 0 },
    document_ctx:
      grida.program.document.internal.createDocumentDefinitionRuntimeHierarchyContext(
        init.document
      ),
  };
}

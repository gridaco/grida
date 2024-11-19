import type { BuilderAction } from "./action";
import { grida } from "@/grida";

export type DocumentDispatcher = (action: BuilderAction) => void;

export type CursorMode =
  | {
      type: "cursor";
    }
  | {
      type: "insert";
      node: "text" | "image" | "container" | "rectangle" | "ellipse";
    };

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

  /**
   * @private - internal use only
   *
   * cursor mode
   *
   * @default {type: "cursor"}
   */
  cursor_mode: CursorMode;
}

interface IDocumentEditorConfig {
  /**
   *
   * when editable is false, the document definition is not editable
   * set editable false on production context - end-user-facing context
   */
  editable: boolean;
}

interface IDocumentGoogleFontsState {
  googlefonts: { family: string }[];
}

export interface IDocumentEditorInit
  extends IDocumentEditorConfig,
    grida.program.document.IDocumentTemplatesRepository {
  document: grida.program.document.IDocumentDefinition;
}

export interface IDocumentEditorState
  extends IDocumentEditorConfig,
    IDocumentEditorInteractionCursorState,
    IDocumentGoogleFontsState,
    grida.program.document.IDocumentTemplatesRepository,
    grida.program.document.internal.IDocumentEditorState {}

export function initDocumentEditorState({
  ...init
}: IDocumentEditorInit): IDocumentEditorState {
  const s = new DocumentState(init);

  return {
    cursor_position: { x: 0, y: 0 },
    document_ctx:
      grida.program.document.internal.createDocumentDefinitionRuntimeHierarchyContext(
        init.document
      ),
    googlefonts: s.fonts().map((family) => ({ family })),
    cursor_mode: { type: "cursor" },
    ...init,
  };
}

class DocumentState {
  constructor(private readonly init: IDocumentEditorInit) {}

  private get nodes(): grida.program.document.IDocumentNodesRepository["nodes"] {
    return this.init.document.nodes;
  }

  private get nodeids(): Array<string> {
    return Object.keys(this.nodes);
  }

  textnodes(): Array<grida.program.nodes.TextNode> {
    return this.nodeids
      .map((id) => this.nodes[id])
      .filter((node) => node.type === "text") as grida.program.nodes.TextNode[];
  }

  fonts(): Array<string> {
    return this.textnodes()
      .map((node) => node.fontFamily)
      .filter(Boolean) as Array<string>;
  }
}

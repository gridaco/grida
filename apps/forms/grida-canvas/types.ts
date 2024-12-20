import type { BuilderAction } from "./action";
import { grida } from "@/grida";

type Vector2 = [number, number];

export type DocumentDispatcher = (action: BuilderAction) => void;

export type CursorMode =
  | {
      type: "cursor";
    }
  | {
      type: "insert";
      node: "text" | "image" | "container" | "rectangle" | "ellipse" | "line";
    };

export type Marquee = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const DEFAULT_RAY_TARGETING: SurfaceRaycastTargeting = {
  target: "next",
  ignores_root: true,
  ignores_locked: true,
};

export type SurfaceRaycastTargeting = {
  /**
   * Determines how the target node is selected:
   * - `deepest` => Selects the deepest (nested) node.
   * - `shallowest` => Selects the shallowest (root) node.
   * - `next` => Selects the next non-ignored shallowest node. (if the shallowest node is ignored and next is available)
   *
   * @default "next"
   */
  target: "deepest" | "shallowest" | "next";

  /**
   * @default true
   */
  ignores_root: boolean;

  /**
   * @default true
   */
  ignores_locked: boolean;
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
  surface_content_edit_mode?: false | "text" | "path";

  /**
   * the config of how the surface raycast targeting should be
   */
  surface_raycast_targeting: SurfaceRaycastTargeting;

  /**
   * @private - internal use only
   *
   * All node ids detected by the raycast (internally) - does not get affected by the targeting config
   */
  surface_raycast_detected_node_ids: string[];

  /**
   * @private - internal use only
   *
   * translate (offset) of the to the stage relative to event target
   */
  translate?: Vector2;

  /**
   * @private - internal use only
   *
   * relative cursor position to the event target (position in viewport space)
   *
   * @default [0, 0]
   */
  surface_cursor_position: Vector2;

  /**
   * @private - internal use only
   *
   * relative cursor position to document root (position in artboard (document) space)
   *
   * @default [0, 0]
   */
  cursor_position: Vector2;

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

  clipboard?: grida.program.nodes.Node;

  marquee?: Marquee;
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
    surface_cursor_position: [0, 0],
    cursor_position: [0, 0],
    document_ctx:
      grida.program.document.internal.createDocumentDefinitionRuntimeHierarchyContext(
        init.document
      ),
    surface_raycast_targeting: DEFAULT_RAY_TARGETING,
    surface_raycast_detected_node_ids: [],
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

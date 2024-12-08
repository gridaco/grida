import type { BuilderAction } from "./action";
import { grida } from "@/grida";
import { cmath } from "./cmath";

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

export type Modifiers = {
  translate_with_clone: "on" | "off";
};

interface IDocumentEditorClipboardState {
  /**
   * user clipboard - copied data
   */
  user_clipboard?: grida.program.nodes.Node;
}

interface IDocumentEditorTransformState {
  /**
   * @private - internal use only
   *
   * translate (offset) of the to the stage relative to event target
   */
  translate?: cmath.Vector2;
}

/**
 * [Surface Support State]
 *
 * this support state is not part of the document state and does not get saved or recorded as history
 */
interface IDocumentEditorEventTargetState {
  gesture?: // translate (move)
  | {
        type: "translate";
        initial_bounding_rectangle: cmath.Rectangle;
        // initial_node_id: string;
        // snapshot: IDocumentEditorState;
        // mods: {
        //   clone: boolean; // alt
        //   // lock_axis: boolean; // shift
        // };
      }
    // scale (resize)
    | {
        type: "scale";
        initial_bounding_rectangle: cmath.Rectangle | null;
        // mods: {
        //   center_origin: boolean; // alt
        //   lock_aspect_ratio: boolean; // shift
        // };
      }
    // rotate
    | {
        type: "rotate";
        initial_bounding_rectangle: cmath.Rectangle | null;
        // mods: {
        //   quantize: boolean; // shift
        // };
      }
    // corner radius
    | {
        /**
         * - corner-radius
         */
        type: "corner-radius";
        initial_bounding_rectangle: cmath.Rectangle | null;
      };

  // gesture?: // translate (move)
  // {
  //   type: "translate" | "scale" | "rotate" | "corner-radius";
  //   initial_bounding_rectangle: cmath.Rectangle;
  //   mods: {
  //     with_cloned_translate: boolean; // alt - applies to [translate]
  //     // with_axis: boolean; // shift - applies to [translate]
  //     // with_quantize: boolean; // shift - applies to [rotate]
  //     // with_aspect_ratio: boolean; // shift - applies to [scale]
  //     // with_center_transform_origin: boolean; // alt - applies to [scale]
  //   };
  // };

  // =============

  hovered_node_id?: string;

  //
  // TODO:
  // translate (move) axis lock
  // user can configure the axis lock mode (turn this on when shift key is pressed, the node will move only in x or y axis)
  //
  modifiers: Modifiers;

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
   * relative cursor position to the event target (position in viewport space)
   *
   * @default [0, 0]
   */
  surface_cursor_position: cmath.Vector2;

  /**
   * @private - internal use only
   *
   * relative cursor position to document root (position in artboard (document) space)
   *
   * @default [0, 0]
   */
  cursor_position: cmath.Vector2;

  /**
   * @private - internal use only
   *
   * cursor mode
   *
   * @default {type: "cursor"}
   */
  cursor_mode: CursorMode;

  /**
   * target node id to measure distance between the selection
   */
  surface_measurement_target?: string;
  surface_measurement_targeting: "on" | "off";

  /**
   * Marquee transform relative to viewport
   */
  marquee?: Marquee;
}

interface IDocumentEditorSelectionState {
  selection: string[];

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
   * refresh key
   */
  // __r: number;
  // selectedTextRange;
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
    IDocumentEditorClipboardState,
    IDocumentEditorTransformState,
    IDocumentEditorEventTargetState,
    IDocumentEditorSelectionState,
    IDocumentGoogleFontsState,
    grida.program.document.IDocumentTemplatesRepository,
    grida.program.document.internal.IDocumentEditorState {}

export function initDocumentEditorState({
  ...init
}: IDocumentEditorInit): IDocumentEditorState {
  const s = new DocumentState(init);

  return {
    selection: [],
    surface_cursor_position: [0, 0],
    cursor_position: [0, 0],
    modifiers: {
      translate_with_clone: "off",
    },
    document_ctx:
      grida.program.document.internal.createDocumentDefinitionRuntimeHierarchyContext(
        init.document
      ),
    surface_raycast_targeting: DEFAULT_RAY_TARGETING,
    surface_measurement_targeting: "off",
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

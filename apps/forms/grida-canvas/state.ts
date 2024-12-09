import type { Action, EditorAction } from "./action";
import { grida } from "@/grida";
import { cmath } from "./cmath";

export type DocumentDispatcher = (action: Action) => void;

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
  tarnslate_with_axis_lock: "on" | "off";
  transform_with_center_origin: "on" | "off";
  transform_with_preserve_aspect_ratio: "on" | "off";
  /**
   *
   * Set the quantize value for the rotation (in degrees)
   *
   * `15` is a good value for most cases
   *
   * @default "off"
   */
  rotate_with_quantize: "off" | number;
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
        initial_rects: cmath.Rectangle[];
        movement: cmath.Vector2;
      }
    // scale (resize)
    | {
        type: "scale";
        initial_rects: cmath.Rectangle[];
        selection: string[];
        direction: cmath.CardinalDirection;
        /**
         * raw movement - independent of the direction
         */
        movement: cmath.Vector2;
      }
    // rotate
    | {
        type: "rotate";
        initial_bounding_rectangle: cmath.Rectangle | null;
        // TODO: support multiple selection
        selection: string;
        offset: cmath.Vector2;
        /**
         * raw movement - independent of the offset
         */
        movement: cmath.Vector2;
      }
    // corner radius
    | {
        /**
         * - corner-radius
         */
        type: "corner-radius";
        initial_bounding_rectangle: cmath.Rectangle | null;
      };

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

export type HistoryEntry = {
  actionType: EditorAction["type"];
  timestamp: number;
  state: IDocumentState;
};

// export type HistoryState = {
//   past: HistoryEntry[];
//   present: IDocumentState;
//   future: HistoryEntry[];
// };

// function initialHistoryState(init: IDocumentEditorInit): HistoryState {
//   return {
//     past: [],
//     present: {
//       selection: [],
//       document_ctx:
//         grida.program.document.internal.createDocumentDefinitionRuntimeHierarchyContext(
//           init.document
//         ),
//       document: init.document,
//     },
//     future: [],
//   };
// }
export interface IDocumentState {
  document: grida.program.document.IDocumentDefinition;
  /**
   * the document key set by user. user can update this to tell it's entirely replaced
   *
   * Optional, but recommended to set for better tracking and debugging.
   */
  document_key?: string;
  document_ctx: grida.program.document.internal.IDocumentDefinitionRuntimeHierarchyContext;

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

interface __TMP_HistoryExtension {
  history: {
    past: HistoryEntry[];
    future: HistoryEntry[];
  };
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
    IDocumentGoogleFontsState,
    grida.program.document.IDocumentTemplatesRepository,
    __TMP_HistoryExtension,
    IDocumentState {}

export function initDocumentEditorState({
  ...init
}: IDocumentEditorInit): IDocumentEditorState {
  const s = new DocumentState(init);

  return {
    selection: [],
    surface_cursor_position: [0, 0],
    history: {
      future: [],
      past: [],
    },
    cursor_position: [0, 0],
    modifiers: {
      translate_with_clone: "off",
      tarnslate_with_axis_lock: "off",
      transform_with_center_origin: "off",
      transform_with_preserve_aspect_ratio: "off",
      rotate_with_quantize: "off",
    },
    document_ctx:
      grida.program.document.internal.createDocumentDefinitionRuntimeHierarchyContext(
        init.document
      ),
    // history: initialHistoryState(init),
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

import type { Action, EditorAction } from "./action";
import { grida } from "@/grida";
import { document } from "./document-query";
import type { cmath } from "./cmath";
import type { SnapResult } from "./cmath/_snap";

export type DocumentDispatcher = (action: Action) => void;

export type CursorMode =
  | {
      type: "cursor";
    }
  | {
      type: "insert";
      node: "text" | "image" | "container" | "rectangle" | "ellipse";
    }
  | {
      type: "draw";
      tool: "line" | "polyline";
    }
  | {
      type: "path";
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

export type GestureModifiers = {
  /**
   * when on, this will translate the selected nodes with the hierarchy change - when cursor escapes and hits a new parent, the selected nodes will be moved to the new parent, maintining its absolute position
   * @default "on"
   */
  translate_with_hierarchy_change: "on" | "off";

  /**
   * [a.k.a press option to copy]
   *
   * when on, this will change the current document tree structure (inserts a clone), replace the current tranalate selection with the cloned nodes
   *
   * usually, this is toggled when the user press the option key
   *
   * @default "off"
   */
  translate_with_clone: "on" | "off";
  /**
   * translate (move) with axis lock (dominant axis)
   * user can configure the axis lock mode (turn this on when shift key is pressed, the node will move only in x or y axis)
   */
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
  user_clipboard?: { nodes: grida.program.nodes.Node[] };

  /**
   *
   * last font used - used when new text node is created
   *
   * save when
   * - font is changed
   * - text (or range) is selected
   *
   * @deprecated - not ready
   */
  last_font_family?: string;
}

interface IDocumentEditorTransformState {
  /**
   * @private - internal use only
   *
   * translate (offset) of the content (stage) relative to surface (viewport, not window)
   */
  content_offset: cmath.Vector2;

  /**
   * @private - internal use only
   *
   * translate (offset) of the viewport (surface) relative to the window
   */
  viewport_offset: cmath.Vector2;
}

export type GestureState =
  | GestureIdle
  | GestureNudge
  | {
      // translate (move)
      type: "translate";
      selection: string[];
      initial_selection: string[];
      initial_snapshot: IDocumentState["document"];
      initial_clone_ids: string[];
      initial_rects: cmath.Rectangle[];
      movement: cmath.Vector2;
      is_currently_cloned: boolean;

      /**
       * surface snap guides - result of snap while translate (move) gesture
       */
      surface_snapping?: SnapResult;
    }
  | {
      // scale (resize)
      type: "scale";
      initial_rects: cmath.Rectangle[];
      selection: string[];
      direction: cmath.CardinalDirection;
      /**
       * raw movement - independent of the direction
       */
      movement: cmath.Vector2;

      /**
       * surface snap guides - result of snap while translate (move) gesture
       */
      surface_snapping?: SnapResult;
    }
  | {
      // rotate
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
  | GestyreCornerRadius
  | GestureDraw
  | GestureTranslatePoint
  | GestureCurve;

export type GestureIdle = {
  type: "idle";
};

export type GestureNudge = {
  type: "nudge";
  /**
   * surface snap guides - result of snap while translate (move) gesture
   */
  surface_snapping?: SnapResult;
};

export type GestyreCornerRadius = {
  /**
   * - corner-radius
   */
  type: "corner-radius";
  initial_bounding_rectangle: cmath.Rectangle | null;
};

export type GestureDraw = {
  /**
   * - draw points
   */
  type: "draw";
  mode: "line" | "polyline";

  /**
   * origin point - relative to content space
   */
  origin: cmath.Vector2;

  /**
   * record of points (movements)
   * the absolute position of the points will be (p + origin)
   */
  points: cmath.Vector2[];

  /**
   * current movement
   */
  movement: cmath.Vector2;
  node_id: string;
};

/**
 * Translate certain path point
 *
 * @remarks
 * This is only valid with content edit mode is "path"
 */
export type GestureTranslatePoint = {
  type: "translate-point";

  /**
   * initial (snapshot) value of the points
   */
  initial_verticies: cmath.Vector2[];

  node_id: string;

  /**
   * initial position of node
   */
  initial_position: cmath.Vector2;
};

/**
 * add a new curve point
 *
 * @deprecated
 */
export type GestureCurve = {
  type: "curve";
  initial: cmath.Vector2;
  movement: cmath.Vector2;
};

/**
 * [Surface Support State]
 *
 * this support state is not part of the document state and does not get saved or recorded as history
 */
interface IDocumentEditorEventTargetState {
  gesture: GestureState;

  gesture_modifiers: GestureModifiers;

  // =============

  /**
   * last movement of translate (move) gesture
   *
   * this is saved and used when "repeat duplicate"
   */
  // last_translate_movement?: cmath.Vector2;

  /**
   * general hover state
   */
  hovered_node_id: string | null;

  /**
   * hovered point index (of a selected path node)
   */
  hovered_point: number | null;

  /**
   * special hover state - when a node is a target of certain gesture, and ux needs to show the target node
   */
  dropzone_node_id?: string;

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
  surface_measurement_target?: string[];
  surface_measurement_targeting_locked: boolean;
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
  debug: boolean;
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
  content_edit_mode?:
    | {
        type: "text";
        /**
         * text node id
         */
        node_id: string;
        // selectedTextRange;
      }
    | {
        type: "path";
        node_id: string;

        /**
         * selected points index
         */
        selected_points: number[];

        /**
         * origin point - the new point will be connected to this point
         * also `selected_points[0]`
         */
        a_point: number | null;

        /**
         * next points position
         */
        path_cursor_position: cmath.Vector2;
      };

  /**
   * @private - internal use only
   *
   * refresh key
   */
  // __r: number;
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
  const s = new document.DocumentState(init.document);

  return {
    selection: [],
    hovered_node_id: null,
    hovered_point: null,
    content_offset: [0, 0],
    viewport_offset: [0, 0],
    cursor_position: [0, 0],
    surface_cursor_position: [0, 0],
    history: {
      future: [],
      past: [],
    },
    gesture: { type: "idle" },
    gesture_modifiers: {
      translate_with_hierarchy_change: "on",
      translate_with_clone: "off",
      tarnslate_with_axis_lock: "off",
      transform_with_center_origin: "off",
      transform_with_preserve_aspect_ratio: "off",
      rotate_with_quantize: "off",
    },
    document_ctx: document.Context.from(init.document).snapshot(),
    // history: initialHistoryState(init),
    surface_raycast_targeting: DEFAULT_RAY_TARGETING,
    surface_measurement_targeting: "off",
    surface_measurement_targeting_locked: false,
    surface_raycast_detected_node_ids: [],
    googlefonts: s.fonts().map((family) => ({ family })),
    cursor_mode: { type: "cursor" },
    ...init,
  };
}

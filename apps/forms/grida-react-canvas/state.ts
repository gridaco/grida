import type { Action, EditorAction } from "./action";
import { grida } from "@/grida";
import { document } from "./document-query";
import { cmath } from "@grida/cmath";
import type { SnapToObjectsResult } from "@grida/cmath/_snap";

// #region config

/**
 * The tolerance for the gap alignment, if each gap is within this tolerance, it is considered aligned.
 *
 * It's 1 because, we quantize the position to 1px, so each gap diff on aligned nodes is not guaranteed to be exactly 0.
 *
 * 1.001 because the surface measurement is can get slighly off due to the transform matrix calculation.
 */
export const DEFAULT_GAP_ALIGNMENT_TOLERANCE = 1.01;

/**
 * The base snap threshold (in px) used during a real pointer movement (drag gesture).
 *
 * In practice, the final threshold often scales inversely with the current zoom level:
 *
 * ```ts
 * const threshold = Math.ceil(DEFAULT_SNAP_MOVEMNT_THRESHOLD_FACTOR / zoom);
 * ```
 *
 * At higher zoom levels, the threshold becomes smaller for more precise snapping;
 * at lower zoom levels, it grows for a smoother user experience.
 */
export const DEFAULT_SNAP_MOVEMNT_THRESHOLD_FACTOR = 5;

/**
 * snap threshold applyed when nudge (fake gesture) is applied
 */
export const DEFAULT_SNAP_NUDGE_THRESHOLD = 0.5;

const DEFAULT_RAY_TARGETING: SurfaceRaycastTargeting = {
  target: "auto",
  ignores_root: true,
  ignores_locked: true,
};

// #endregion config

export type DocumentDispatcher = (action: Action) => void;

export type CursorModeType = CursorMode["type"];
export type CursorMode =
  | {
      type: "cursor";
    }
  | {
      type: "hand";
    }
  | {
      type: "zoom";
    }
  | {
      type: "insert";
      node: "text" | "image" | "container" | "rectangle" | "ellipse";
    }
  | {
      type: "draw";
      tool: "line" | "pencil";
    }
  | {
      type: "paint";
    }
  | {
      type: "path";
    };

/**
 * A marquee is a area where it takes two points, where it uses the min point as min and max point as max.
 * - a: [x1, y1]
 * - b: [x2, y2]
 */
export type Marquee = {
  a: cmath.Vector2;
  b: cmath.Vector2;
};

export type SurfaceRaycastTargeting = {
  /**
   * Determines how the target node is selected:
   * - `auto` => selects the shallowest, while selecting the siblings first
   * - `deepest` => Selects the deepest (nested) node.
   * - `shallowest` => Selects the shallowest (root) node.
   *
   * @default "auto"
   */
  target: "auto" | "deepest" | "shallowest";

  /**
   * ignores the root node from the targeting
   * @default true
   */
  ignores_root: boolean;

  /**
   * ignores the locked node from the targeting
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
  user_clipboard?: {
    /**
     * copied node data as prototype
     */
    prototypes: grida.program.nodes.NodePrototype[];
    /**
     * original node ids (top ids)
     */
    ids: string[];
  };

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
   * current transform of the canvas.
   * where transform origin is 0,0
   */
  transform: cmath.Transform;
}

export type GestureState =
  | GestureIdle
  | GesturePan
  | GestureGuide
  | GestureVirtualNudge
  | GestureTranslate
  | GestureSort
  | GestureGap
  | GestureScale
  | GestureRotate
  | GestureCornerRadius
  | GestureDraw
  | GesturePaint
  | GestureTranslateVertex
  | GestureCurve
  | GestureCurveA;

interface IGesture {
  /**
   * current movement of the drag
   *
   * raw movement - independent of the offset or origin, purely the movement of the mouse.
   */
  movement: cmath.Vector2;
}

export type GestureIdle = {
  readonly type: "idle";
};

/**
 * Pan the viewport - a.k.a hand tool
 */
export type GesturePan = IGesture & {
  readonly type: "pan";
};

/**
 * Move or draw the guide line
 */
export type GestureGuide = IGesture & {
  readonly type: "guide";
  /**
   * the axis of the guide
   */
  readonly axis: cmath.Axis;

  /**
   * the index, id of the guide
   */
  readonly idx: number;

  /**
   * initial offset of the guide
   */
  readonly initial_offset: number;

  /**
   * the current offset of the guide (can be snapped to objects)
   */
  offset: number;
};

/**
 * virtual nudge gesture.
 *
 * this is not a real gesture, commonly triggered by keyboard arrow keys.
 *
 * this is required to tell the surface that it is nudging, thus, show snaps & related ux
 */
export type GestureVirtualNudge = {
  readonly type: "nudge";
};

export type GestureTranslate = IGesture & {
  // translate (move)
  readonly type: "translate";
  selection: string[];

  /**
   * initial selection of the nodes - the original node ids
   */
  readonly initial_selection: string[];
  readonly initial_snapshot: IMinimalDocumentState;
  readonly initial_clone_ids: string[];
  readonly initial_rects: cmath.Rectangle[];

  /**
   * indicator between gesture events to ensure if the current selection is cloned ones or not
   */
  is_currently_cloned: boolean;
};

/**
 * Sanpshot used for arrangement.
 *
 * Contains collection of nodes' bounding rect.
 */
export interface LayoutSnapshot {
  /**
   * the type of the layout
   */
  type: "flex" | "group";

  /**
   * the grouping parent id
   */
  group: string;

  /**
   * relative objects to the parent
   */
  objects: Array<cmath.Rectangle & { id: string }>;
}

/**
 * Sort the node within the layout (re-order)
 */
export type GestureSort = IGesture & {
  readonly type: "sort";

  /**
   * the current moving node id of this gesture
   */
  readonly node_id: string;

  /**
   * initial position of moving node {@link GestureSort.node_id}
   */
  readonly node_initial_rect: cmath.Rectangle;

  /**
   * the current layout - this changes as the movement changes
   */
  layout: LayoutSnapshot;

  /**
   * the selection will be at this position (when dropped)
   */
  placement: {
    /**
     * the current rect (placed) of the moving node.
     * this should be identical to layout.objects[index]
     */
    rect: cmath.Rectangle;

    /**
     * index of the node's rect within the current layout snapshot
     */
    index: number;
  };
};

/**
 * Sort the node within the layout (re-order)
 */
export type GestureGap = IGesture & {
  readonly type: "gap";

  readonly axis: "x" | "y";

  readonly min_gap: number;
  readonly initial_gap: number;

  gap: number;

  /**
   * the current layout - this changes as the movement changes
   */
  layout: LayoutSnapshot;
};

export type GestureScale = IGesture & {
  // scale (resize)
  readonly type: "scale";
  readonly selection: string[];
  readonly initial_snapshot: IMinimalDocumentState;
  readonly initial_rects: cmath.Rectangle[];
  readonly direction: cmath.CardinalDirection;
};

export type GestureRotate = IGesture & {
  readonly type: "rotate";
  readonly initial_bounding_rectangle: cmath.Rectangle | null;
  // TODO: support multiple selection
  readonly selection: string;
  readonly offset: cmath.Vector2;

  /**
   * the current rotation of the selection
   */
  rotation: number;
};

export type GestureCornerRadius = IGesture & {
  /**
   * - corner-radius
   */
  readonly type: "corner-radius";
  readonly node_id: string;
  readonly initial_bounding_rectangle: cmath.Rectangle | null;
};

export type GestureDraw = IGesture & {
  /**
   * - draw points
   */
  readonly type: "draw";
  readonly mode: "line" | "pencil";

  /**
   * origin point - relative to canvas space
   */
  readonly origin: cmath.Vector2;

  /**
   * record of points (movements)
   * the absolute position of the points will be (p + origin)
   */
  points: cmath.Vector2[];

  readonly node_id: string;
};

export type GesturePaint = IGesture & {
  /**
   * - paint pixels
   */
  readonly type: "paint";
  readonly mode: "pixel";

  /**
   * origin point - relative to canvas space
   */
  readonly origin: cmath.Vector2;

  /**
   * record of points (movements)
   * the absolute position of the points will be (p + origin)
   */
  points: cmath.Vector2[];

  readonly node_id: string;
};

/**
 * Translate certain path point
 *
 * @remarks
 * This is only valid with content edit mode is "path"
 */
export type GestureTranslateVertex = IGesture & {
  type: "translate-vertex";

  /**
   * initial (snapshot) value of the points
   */
  readonly initial_verticies: cmath.Vector2[];

  /**
   * index of the vertex
   */
  readonly vertex: number;

  readonly node_id: string;

  /**
   * initial position of node
   */
  readonly initial_position: cmath.Vector2;
};

/**
 * curves the existing segment
 */
export type GestureCurve = IGesture & {
  readonly type: "curve";

  /**
   * selected path node id
   */
  readonly node_id: string;

  /**
   * segment index
   */
  readonly segment: number;

  /**
   * control point
   */
  readonly control: "ta" | "tb";

  /**
   * initial position of the control point
   */
  readonly initial: cmath.Vector2;

  /**
   * rather to invert the movement
   */
  readonly invert: boolean;
};

/**
 * pre-curve the future segment (when only vertex is present)
 *
 * This is used when user creates a new vertex point without connection, yet dragging to first configure the `ta` of the next segment
 */
export type GestureCurveA = IGesture & {
  readonly type: "curve-a";

  /**
   * selected path node id
   */
  readonly node_id: string;

  /**
   * vertex index
   */
  readonly vertex: number;

  /**
   * control point - always `ta`
   */
  readonly control: "ta";

  /**
   * initial position of the control point - always `zero`
   */
  readonly initial: cmath.Vector2;

  /**
   * rather to invert the movement
   */
  readonly invert: boolean;
};

/**
 * Indication of the dropzone
 *
 * - type: "node" - dropzone is a node
 * - type: "rect" - dropzone is a rect (in canvas space)
 */
export type DropzoneIndication =
  | {
      type: "node";
      node_id: string;
    }
  | {
      type: "rect";
      rect: cmath.Rectangle;
    };

/**
 * [Surface Support State]
 *
 * this support state is not part of the document state and does not get saved or recorded as history
 */
interface IDocumentEditorEventTargetState {
  gesture: GestureState;

  gesture_modifiers: GestureModifiers;

  /**
   * the latest snap result from the gesture
   */
  surface_snapping?: SnapToObjectsResult;

  /**
   * general hover state
   */
  hovered_node_id: string | null;

  /**
   * hovered vertex index (of a selected path node)
   */
  hovered_vertex_idx: number | null;

  /**
   * special hover state - when a node is a target of certain gesture, and ux needs to show the target node
   */
  dropzone?: DropzoneIndication;

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

  pointer: {
    position: cmath.Vector2;
    // position_snap: cmath.Vector2;
  };

  ruler: "on" | "off";

  pixelgrid: "on" | "off";

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
   * Marquee transform in canvas space
   */
  marquee?: Marquee;

  /**
   * active, repeatable duplication state
   */
  active_duplication: ActiveDuplication | null;
}

/**
 * used for "repeated duplicate", where accumulating the delta between the original and the clone, forwarding that delta to the next clone.
 *
 * [accumulated duplicate]
 * - [set]
 *    - as clone / duplicate happens, we save each id of original and duplicated.
 * - [reset]
 *    - whenever the active clone is considered no longer valid, e.g. when origianl is deleted. (to detect this easily we use a strict diff of the selection change)
 *    - the current history change shall only contain the diff of the clone, otherwise, reset.
 *      - this includes the selection change.
 *      - as long as the history (change) is made within the clone, it kept valid.
 *    - as history changes backward, reset. (accumulated duplicate related states are reset (set null) as history goes backward)
 *    - as the focus (selection) changes, reset.
 *
 * **Note:** currently we simply reset whenever selection is changed.
 * => this is enough for now, but as we support api access, we'll actually need to track the change.
 */
export interface ActiveDuplication {
  origins: grida.program.nodes.NodeID[];
  clones: grida.program.nodes.NodeID[];
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

type ContentEditModeState =
  | TextContentEditMode
  | PathContentEditMode
  | GradientContentEditMode;

type TextContentEditMode = {
  type: "text";
  /**
   * text node id
   */
  node_id: string;
  // selectedTextRange;
};

type PathContentEditMode = {
  type: "path";
  node_id: string;

  /**
   * selected vertex indices
   */
  selected_vertices: number[];

  /**
   * origin point - the new point will be connected to this point
   * also `selected_vertices[0]`
   */
  a_point: number | null;

  /**
   * next `ta` value when segment is created (connected)
   *
   * used when user creates a new vertex point without connection, yet dragging to first configure the `ta` of the next segment
   *
   * @default zero
   */
  next_ta: cmath.Vector2 | null;

  /**
   * next points position
   *
   * @deprecated - remove me - use global sanp pointer
   */
  path_cursor_position: cmath.Vector2;
};

/**
 * @deprecated - WIP
 */
type GradientContentEditMode = {
  type: "gradient";
  node_id: string;
};

export interface IMinimalDocumentState {
  document: grida.program.document.IDocumentDefinition;
  /**
   * the document key set by user. user can update this to tell it's entirely replaced
   *
   * Optional, but recommended to set for better tracking and debugging.
   */
  document_key?: string;
  document_ctx: grida.program.document.internal.IDocumentDefinitionRuntimeHierarchyContext;
}

export interface Guide {
  readonly axis: cmath.Axis;
  readonly offset: number;
}

export interface IDocumentState extends IMinimalDocumentState {
  selection: string[];

  /**
   * @private - internal use only
   *
   * current content edit mode
   *
   * @default false
   */
  content_edit_mode?: ContentEditModeState;

  /**
   * the ruler guides.
   *
   * objects sanps to this when ruler is on
   */
  guides: Guide[];
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
  debug,
  ...init
}: Omit<IDocumentEditorInit, "debug"> & {
  debug?: boolean;
}): IDocumentEditorState {
  const s = new document.DocumentState(init.document);

  // console.log("i", init["transform"]);

  return {
    transform: cmath.transform.identity,
    debug: debug ?? false,
    selection: [],
    hovered_node_id: null,
    hovered_vertex_idx: null,
    pointer: {
      position: cmath.vector2.zero,
    },
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
    ruler: "on",
    pixelgrid: "on",
    guides: [],
    active_duplication: null,
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

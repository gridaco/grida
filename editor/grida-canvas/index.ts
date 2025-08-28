import type {
  Action,
  EditorAction,
  TCanvasEventTargetDragGestureState,
} from "@/grida-canvas/action";
import type { BitmapEditorBrush, BitmapLayerEditor } from "@grida/bitmap";
import type cg from "@grida/cg";
import type { SnapResult } from "@grida/cmath/_snap";
import type { tokens } from "@grida/tokens";
import type { NodeProxy } from "./editor";
import type { GoogleWebFontList } from "@grida/fonts/google";
import { dq } from "./query";
import cmath from "@grida/cmath";
import vn from "@grida/vn";
import grida from "@grida/schema";

export { type Action };

export namespace editor {
  export type EditorContentRenderingBackend = "dom" | "canvas";

  /**
   * Creates a throttled function that only invokes the provided function at most once per every `limit` milliseconds.
   * When `options.trailing` is true, the function will be called one more time after the limit period to ensure the last change is processed.
   *
   * @param func - The function to throttle
   * @param limit - The time limit in milliseconds
   * @param options - Configuration options for the throttle behavior
   * @param options.trailing - Whether to invoke the function one more time after the limit period. Defaults to false.
   * @returns A throttled version of the provided function
   *
   * @example
   * ```ts
   * const throttledFn = throttle((x) => console.log(x), 1000, { trailing: true });
   * throttledFn(1); // logs: 1
   * throttledFn(2); // ignored
   * throttledFn(3); // ignored
   * // after 1000ms
   * // logs: 3 (because trailing is true)
   * ```
   */
  export function throttle<T extends (...args: any[]) => void>(
    func: T,
    limit: number,
    options: {
      trailing?: boolean;
    } = { trailing: false }
  ): T {
    let inThrottle: boolean;
    let lastArgs: Parameters<T> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return function (this: any, ...args: Parameters<T>) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        timeoutId = setTimeout(() => {
          inThrottle = false;
          if (options.trailing && lastArgs) {
            func.apply(this, lastArgs);
            lastArgs = null;
          }
        }, limit);
      } else if (options.trailing) {
        lastArgs = args;
      }
    } as T;
  }

  export type NodeID = string & {};

  /**
   * a global class based editor instances
   *
   * @deprecated move under class
   */
  export const __global_editors = {
    bitmap: null as BitmapLayerEditor | null,
  };
}

export namespace editor.config {
  export interface IEditorConfig {
    /**
     * when editable is false, the document definition is not editable
     * set editable false on production context - end-user-facing context
     */
    editable: boolean;
    debug: boolean;

    /**
     * when user tries to remove a node that is not removable (removable=false) or tries to remove root node that is required by constraints, this is the behavior
     *
     * - `ignore` - ignore the action
     * - `deactivate` - deactivate the node (set active=false)
     * - `force` - force remove the node (even if it's not removable) (this may cause unexpected behavior or cause system to crash)
     * - `throw` - throw an error
     */
    when_not_removable: "ignore" | "deactivate" | "force" | "throw";

    flags: {
      /**
       * enable / disable the brush feature
       * - brush / eraser tool
       *
       * @default "off"
       */
      __unstable_brush_tool: "on" | "off";
    };

    /**
     * base quantization step for rotation in degrees
     *
     * @default 1
     */
    rotation_quantize_step: number;
  }

  /**
   * The tolerance for the gap alignment, if each gap is within this tolerance, it is considered aligned.
   *
   * It's 1 because, we quantize the position to 1px, so each gap diff on aligned nodes is not guaranteed to be exactly 0.
   *
   * 1.001 because the surface measurement is can get slighly off due to the transform matrix calculation.
   */
  export const DEFAULT_GAP_ALIGNMENT_TOLERANCE = 1.01;

  /**
   * The camera movement to be multiplied when panning with keyboard input.
   */
  export const DEFAULT_CAMERA_KEYBOARD_MOVEMENT = 50;

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

  export const DEFAULT_CANVAS_TRANSFORM_SCALE_MIN = 0.02;
  export const DEFAULT_CANVAS_TRANSFORM_SCALE_MAX = 256;

  /**
   * snap threshold applyed when nudge (fake gesture) is applied
   */
  export const DEFAULT_SNAP_NUDGE_THRESHOLD = 0.5;

  /**
   * the tolerance for the vector geometry vertex (when cleaning the vector geometry)
   * @deprecated - will be removed
   */
  export const DEFAULT_VECTOR_GEOMETRY_VERTEX_TOLERANCE = 0.5;

  /**
   * Default optimization configuration for vector networks.
   */
  export const DEFAULT_VECTOR_OPTIMIZATION_CONFIG: vn.OptimizationConfig = {
    vertex_tolerance: DEFAULT_VECTOR_GEOMETRY_VERTEX_TOLERANCE,
    remove_unused_verticies: true,
  };

  /**
   * default quantization step for rotation gestures (in degrees)
   */
  export const DEFAULT_ROTATION_QUANTIZE_STEP = 1;

  export const DEFAULT_HIT_TESTING_CONFIG: state.HitTestingConfig = {
    target: "auto",
    ignores_root_with_children: true,
    ignores_locked: true,
  };

  export const DEFAULT_GESTURE_MODIFIERS: state.GestureModifiers = {
    translate_with_hierarchy_change: "on",
    translate_with_clone: "off",
    tarnslate_with_axis_lock: "off",
    translate_with_force_disable_snap: "off",
    transform_with_center_origin: "off",
    transform_with_preserve_aspect_ratio: "off",
    path_keep_projecting: "off",
    rotate_with_quantize: "off",
    curve_tangent_mirroring: "auto",
  };

  export const DEFAULT_BRUSH: state.CurrentBrush = {
    name: "Default",
    hardness: 1,
    size: [4, 4],
    spacing: 0,
    opacity: 1,
  };

  export const DEFAULT_FE_SHADOW: cg.IFeShadow = {
    color: { r: 0, g: 0, b: 0, a: 0.25 },
    dx: 0,
    dy: 4,
    blur: 4,
    spread: 0,
  };

  export const DEFAULT_FE_GAUSSIAN_BLUR: cg.IFeGaussianBlur = {
    radius: 4,
  };

  export const DEFAULT_FE_PROGRESSIVE_BLUR: cg.IFeProgressiveBlur = {
    x1: 0.5,
    y1: 0,
    x2: 0.5,
    y2: 1,
    radius: 0,
    radius2: 4,
  };
}

export namespace editor.state {
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
  export type ActiveDuplication = {
    origins: grida.program.nodes.NodeID[];
    clones: grida.program.nodes.NodeID[];
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

  export type CurrentBrush = BitmapEditorBrush & { opacity: number };

  export type ToolModeType = ToolMode["type"];

  export type VariableWidthTool = {
    type: "width";
  };

  export type BendTool = {
    type: "bend";
  };

  export type PenPathTool = {
    type: "path";
  };

  export type ToolMode =
    | {
        type: "cursor";
      }
    | {
        type: "hand";
      }
    | {
        type: "lasso";
      }
    | BendTool
    | VariableWidthTool
    | PenPathTool
    | {
        type: "zoom";
      }
    | {
        type: "insert";
        node:
          | "text"
          | "image"
          | "container"
          | "rectangle"
          | "ellipse"
          | "polygon"
          | "star";
      }
    | {
        type: "draw";
        tool: "line" | "pencil";
      }
    | {
        type: "brush" | "eraser" | "flood-fill";
      };

  /**
   * A marquee is a area where it takes two points, where it uses the min point as min and max point as max.
   * - a: [x1, y1]
   * - b: [x2, y2]
   */
  export type Marquee = {
    a: cmath.Vector2;
    b: cmath.Vector2;
    /** when true, adds to existing selection */
    additive?: boolean;
  };

  /**
   * A lasso is a list of points that is represented as a polygon (as its fill regions)
   */
  export type Lasso = {
    points: cmath.Vector2[];
    /** when true, adds to existing selection */
    additive?: boolean;
  };

  export type HitTestingConfig = {
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
     * ignores the root node from the targeting (if not empty)
     * @default true
     */
    ignores_root_with_children: boolean;

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
    /**
     * force disable snapping while translating
     *
     * when on, translation will ignore any snap guides and move freely
     */
    translate_with_force_disable_snap: "on" | "off";
    transform_with_center_origin: "on" | "off";
    transform_with_preserve_aspect_ratio: "on" | "off";
    /**
     * Continue projecting a path after connecting to an existing vertex.
     *
     * This is typically toggled momentarily while the `p` key is held
     * during a pen gesture.
     *
     * @default "off"
     */
    path_keep_projecting: "on" | "off";
    /**
     *
     * Set the quantize value for the rotation (in degrees)
     *
     * `15` is a good value for most cases
     *
     * @default "off"
     */
    rotate_with_quantize: "off" | number;
    /**
     * tangent control mirroring mode for curve gestures
     *
     * @default "auto"
     */
    curve_tangent_mirroring: vn.TangentMirroringMode;
  };

  export interface IViewportTransformState {
    /**
     * current transform of the canvas.
     * where transform origin is 0,0
     */
    transform: cmath.Transform;
  }

  /**
   * list of webfonts, the list is fetched from the server.
   * this is a collection of webfonts registry, it does not mean the fonts are used or loaded.
   */
  export interface IEditorWebfontListState {
    /**
     * @see https://fonts.grida.co
     * @see https://fonts.grida.co/webfonts-vf.json
     * @see https://fonts.grida.co/webfonts.json
     */
    webfontlist: GoogleWebFontList;
  }

  export interface IEditorGoogleFontsState {
    googlefonts: { family: string }[];
  }

  export interface IEditorFeatureBrushState {
    brushes: BitmapEditorBrush[];
    brush_color?: cg.RGBA8888;
    brush: editor.state.CurrentBrush;
  }

  /**
   * @volatile
   */
  export interface IEditorFeatureRulerState {
    ruler: "on" | "off";
  }

  /**
   * @volatile
   */
  export interface IEditorFeaturePixelGridState {
    pixelgrid: "on" | "off";
  }

  /**
   * @volatile
   */
  export interface IEditorFeatureMeasurementState {
    /**
     * surface measurement target
     *
     * @default undefined
     */
    surface_measurement_target?: string[];
    surface_measurement_targeting_locked: boolean;
    surface_measurement_targeting: "on" | "off";
  }

  /**
   * @volatile
   */
  export interface IEditorFeatureRepeatableDuplicateState {
    /**
     * active, repeatable duplication state
     *
     * @default null
     */
    active_duplication: editor.state.ActiveDuplication | null;
  }

  export type MultiplayerCursorColorPalette = {
    "50": string;
    "100": string;
    "200": string;
    "300": string;
    "400": string;
    "500": string;
    "600": string;
    "700": string;
    "800": string;
    "900": string;
    "950": string;
  };

  export type MultiplayerCursor = {
    t: number;
    id: string;
    transform: cmath.Transform | null;
    position: cmath.Vector2;
    palette: MultiplayerCursorColorPalette;
    marquee: editor.state.Marquee | null;
    selection: string[];
    scene_id: string | undefined;
  };

  /**
   * @volatile
   */
  export interface IEditorMultiplayerCursorState {
    /**
     * multiplayer cursors, does not include local cursor
     */
    cursors: MultiplayerCursor[];
  }

  export interface IEditorUserClipboardState {
    /**
     * user clipboard - copied data
     */
    user_clipboard?: {
      /** unique payload id for distinguishing clipboard contents */
      payload_id: string;
      /**
       * copied node data as prototype
       */
      prototypes: grida.program.nodes.NodePrototype[];
      /**
       * original node ids (top ids)
       */
      ids: string[];
    };
    user_clipboard_color?: cg.RGBA8888;
  }

  /**
   * [Scene Surface Support State]
   *
   * @volatile this support state is not part of the document state and does not get saved or recorded as history
   */
  export interface ISceneSurfaceState {
    /**
     * the current gesture state
     *
     * @default idle
     */
    gesture: editor.gesture.GestureState;

    /**
     * whether the surface is dragging (by the raw event)
     *
     * triggered by the "ondragstart" / "ondragend" event
     */
    dragging: boolean;

    /**
     * the latest snap result from the gesture
     */
    surface_snapping?: SnapResult;

    /**
     * general hover state
     *
     * @default null
     */
    hovered_node_id: string | null;

    /**
     * special hover state - when a node is a target of certain gesture, and ux needs to show the target node
     *
     * @default undefined
     */
    dropzone: editor.state.DropzoneIndication | undefined;

    /**
     * @private - internal use only
     *
     * All node ids detected by the raycast (internally) - does not get affected by the targeting config
     *
     * @default []
     */
    hits: string[];

    /**
     * Marquee transform in canvas space
     *
     * @default undefined
     */
    marquee?: editor.state.Marquee;

    /**
     * Lasso state
     */
    lasso?: editor.state.Lasso;
  }

  /**
   * [Preserved Runtime Editor State]
   *
   * @volatile this state is volatile, but preserved between scene switch.
   */
  export interface IEditorRuntimePreservedState {
    pointer: {
      /**
       * [clientX, clientY] - browser pointer event position
       */
      client: cmath.Vector2;
      position: cmath.Vector2;
      last: cmath.Vector2;
      logical: cmath.Vector2;
      // position_snap: cmath.Vector2;
    };

    /**
     * the config of how the surface raycast targeting should be
     */
    pointer_hit_testing_config: editor.state.HitTestingConfig;

    gesture_modifiers: editor.state.GestureModifiers;

    /**
     * @private - internal use only
     *
     * current tool mode
     *
     * @default {type: "cursor"}
     */
    tool: editor.state.ToolMode;

    /**
     * @private - internal use only
     *
     * previously selected tool type
     */
    __tool_previous: editor.state.ToolMode | null;
  }

  export type ContentEditModeState =
    | TextContentEditMode
    | VariableWidthContentEditMode
    | VectorContentEditMode
    | BitmapContentEditMode
    | FillGradientContentEditMode;

  type TextContentEditMode = {
    type: "text";
    /**
     * text node id
     */
    node_id: string;
    // selectedTextRange;
  };

  export type VectorContentEditModeHoverableGeometryControlType =
    | "vertex"
    | "segment";

  export type VectorContentEditModeGeometryControlsSelection = {
    /**
     * selected vertex indices
     */
    selected_vertices: number[];

    /**
     * selected segment indices
     */
    selected_segments: number[];

    /**
     * selected tangent indices
     *
     * each tangent is represented as [vertex_index, a_or_b]
     * where a_or_b is 0 for `a` and 1 for `b`
     */
    selected_tangents: [number, 0 | 1][];
  };

  // export type VectorContentEditModeCursorTarget =
  //   | { type: "vertex"; vertex: number }
  //   | { type: "segment"; segment: vn.PointOnSegment };

  export type VectorContentEditMode = {
    type: "vector";
    node_id: string;

    selection: VectorContentEditModeGeometryControlsSelection;
    /**
     * vertices considered active for showing tangent handles
     */
    selection_neighbouring_vertices: number[];

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
     * initial vector network data
     *
     * The VectorNetwork data as entering the vector edit mode
     *
     * used to check if the content has changed, and revert the node if no changes were made
     */
    initial_vector_network: vn.VectorNetwork;

    /**
     * Snapshot of the node before entering vector edit mode. Used to revert the node
     * when no edits were performed.
     */
    original: grida.program.nodes.UnknwonNode | null;

    /**
     * clipboard data for vector content copy/paste
     */
    clipboard: vn.VectorNetwork | null;

    /**
     * Position of the vector node when the clipboard was populated.
     *
     * This allows pasted geometry to retain the absolute coordinates
     * it had at copy time, even if the node moves before pasting.
     */
    clipboard_node_position: cmath.Vector2 | null;

    /**
     * next point position, snapped, in vector network space
     */
    cursor: cmath.Vector2;

    /**
     * snapped vertex index (of a selected path node)
     *
     * This is mathematically resolved based on proximity calculations and snap guides.
     * Used for measurement calculations and precise vertex targeting.
     *
     * @default null
     */
    snapped_vertex_idx: number | null;

    /**
     * snapped segment with parametric position and evaluated point
     *
     * This is mathematically resolved based on proximity calculations and snap guides.
     * Contains the segment index, parametric position (t), and evaluated point for precise targeting.
     * Used for measurement calculations and precise segment targeting.
     *
     * @default null
     */
    snapped_segment_p: vn.EvaluatedPointOnSegment | null;

    /**
     * hovered control for UI feedback and measurement
     *
     * This is a UI-triggered hover state based on surface interaction, not mathematically resolved.
     * Used for visual feedback and measurement calculations when alt key is pressed.
     * Cannot have multiple mixed hover states - only one control can be hovered at a time.
     *
     * @default null
     */
    hovered_control: {
      type: VectorContentEditModeHoverableGeometryControlType;
      index: number;
    } | null;
  };

  export type VariableWidthContentEditMode = {
    type: "width";
    node_id: string;
    snapped_p: vn.EvaluatedPointOnSegment | null;
    initial_vector_network: vn.VectorNetwork;
    variable_width_selected_stop: number | null;
    initial_variable_width_profile: cg.VariableWidthProfile;
    variable_width_profile: cg.VariableWidthProfile;
  };

  type BitmapContentEditMode = {
    type: "bitmap";
    node_id: string;
    imageRef: string;
  };

  /**
   * surface gradient edit mode
   */
  export type FillGradientContentEditMode = {
    type: "fill/gradient";
    node_id: string;
    /**
     * index of the focused stop, if any
     *
     * @default 0
     */
    selected_stop: number;
  };

  /**
   * @persistent scene persistence state
   */
  export interface IScenePersistenceState {
    selection: string[];

    /**
     * @private - internal use only
     *
     * current content edit mode
     *
     * @default false
     */
    content_edit_mode?: editor.state.ContentEditModeState;
  }

  export interface IEditorHistoryExtensionState {
    history: {
      past: history.HistoryEntry[];
      future: history.HistoryEntry[];
    };
  }

  /**
   * @deprecated remove when possible
   */
  export interface IMinimalDocumentState {
    document: grida.program.document.Document;
    document_ctx: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext;

    /**
     * the document key set by user. user can update this to tell it's entirely replaced
     *
     * Optional, but recommended to set for better tracking and debugging.
     */
    document_key?: string;
  }

  /**
   * @persistent
   */
  export interface IDocumentState
    extends editor.state.IMinimalDocumentState,
      editor.state.IScenePersistenceState {
    /**
     * current scene id
     */
    scene_id: string | undefined;
  }

  export interface IEditorState
    extends editor.config.IEditorConfig,
      editor.state.IViewportTransformState,
      editor.state.IEditorUserClipboardState,
      editor.state.IEditorMultiplayerCursorState,
      editor.state.IEditorWebfontListState,
      editor.state.IEditorGoogleFontsState,
      editor.state.IEditorFeatureBrushState,
      editor.state.IEditorFeatureRulerState,
      editor.state.IEditorFeaturePixelGridState,
      editor.state.IEditorFeatureRepeatableDuplicateState,
      //
      editor.state.IEditorFeatureMeasurementState,
      editor.state.ISceneSurfaceState,
      editor.state.IEditorRuntimePreservedState,
      //
      editor.state.IEditorHistoryExtensionState,
      editor.state.IDocumentState,
      grida.program.document.IDocumentTemplatesRepository {
    rotation_quantize_step: number;
  }

  /**
   * @deprecated
   *
   * Dangerous. Use when absolutely necessary.
   */
  export function snapshot(state: editor.state.IEditorState) {
    const minimal: editor.state.IMinimalDocumentState = {
      document: state.document,
      document_ctx: state.document_ctx,
      document_key: state.document_key,
    };

    return JSON.parse(JSON.stringify(minimal));
  }

  /**
   * the default state of the scene
   *
   * this is applied when the scene is loaded (switched)
   *
   * @deprecated the scene-specific properties will be moved under the scene nodes.
   */
  export const __RESET_SCENE_STATE: editor.state.IScenePersistenceState &
    editor.state.ISceneSurfaceState &
    editor.state.IEditorFeatureRepeatableDuplicateState = {
    dragging: false,
    active_duplication: null,
    content_edit_mode: undefined,
    dropzone: undefined,
    gesture: { type: "idle" },
    hovered_node_id: null,
    marquee: undefined,
    selection: [],
    hits: [],
    surface_snapping: undefined,
  };

  export interface IEditorStateInit
    extends Pick<editor.config.IEditorConfig, "editable" | "debug">,
      Partial<
        Pick<editor.config.IEditorConfig, "flags" | "rotation_quantize_step">
      >,
      grida.program.document.IDocumentTemplatesRepository {
    document: Pick<
      grida.program.document.Document,
      "nodes" | "entry_scene_id"
    > &
      Partial<grida.program.document.IBitmapsRepository> & {
        scenes: Record<
          string,
          Partial<grida.program.document.Scene> &
            Pick<grida.program.document.Scene, "id" | "name" | "constraints">
        >;
      };
  }

  export function init({
    debug,
    ...init
  }: Omit<IEditorStateInit, "debug"> & {
    debug?: boolean;
  }): editor.state.IEditorState {
    const doc: grida.program.document.Document = {
      bitmaps: {},
      images: {},
      properties: {},
      ...init.document,
      scenes: Object.entries(init.document.scenes ?? {}).reduce(
        (acc, [key, scene]) => {
          acc[key] = grida.program.document.init_scene(scene);
          return acc;
        },
        {} as grida.program.document.Document["scenes"]
      ),
    };

    const s = new dq.DocumentStateQuery(doc);

    return {
      transform: cmath.transform.identity,
      debug: debug ?? false,
      pointer: {
        client: cmath.vector2.zero,
        position: cmath.vector2.zero,
        last: cmath.vector2.zero,
        logical: cmath.vector2.zero,
      },
      cursors: [],
      history: {
        future: [],
        past: [],
      },
      gesture_modifiers: editor.config.DEFAULT_GESTURE_MODIFIERS,
      ruler: "off",
      pixelgrid: "on",
      when_not_removable: "deactivate",
      document_ctx: dq.Context.from(doc).snapshot(),
      pointer_hit_testing_config: editor.config.DEFAULT_HIT_TESTING_CONFIG,
      surface_measurement_targeting: "off",
      surface_measurement_targeting_locked: false,
      surface_measurement_target: undefined,
      googlefonts: s.fonts().map((family) => ({ family })),
      webfontlist: {
        kind: "webfonts#webfontList",
        items: [],
      },
      brushes: [],
      tool: { type: "cursor" },
      __tool_previous: null,
      brush: editor.config.DEFAULT_BRUSH,
      scene_id: doc.entry_scene_id ?? Object.keys(doc.scenes)[0] ?? undefined,
      flags: {
        __unstable_brush_tool: "off",
      },
      rotation_quantize_step:
        init.rotation_quantize_step ??
        editor.config.DEFAULT_ROTATION_QUANTIZE_STEP,
      ...__RESET_SCENE_STATE,
      ...init,
      document: doc,
    };
  }
}

export namespace editor.gesture {
  /**
   * Sanpshot used for arrangement.
   *
   * Contains collection of nodes' bounding rect.
   */
  export type LayoutSnapshot = {
    /**
     * relative objects to the parent
     */
    objects: Array<cmath.Rectangle & { id: string }>;
  } & (
    | {
        /**
         * the type of the layout
         */
        type: "flex";

        /**
         * the grouping parent id
         */
        group: string;
      }
    | {
        type: "group";
        /**
         * the grouping parent id (null if document root)
         */
        group: string | null;
      }
  );

  export type GestureState =
    | GestureIdle
    | GesturePan
    | GestureGuide
    | GestureVirtualNudge
    | GestureTranslate
    | GestureSort
    | GestureGap
    | GestureInsertAndResize
    | GestureScale
    | GestureRotate
    | GestureCornerRadius
    | GestureDraw
    | GestureBrush
    | GestureTranslateVectorControls
    | GestureTranslateVariableWidthStop
    | GestureResizeVariableWidthStop
    | GestureCurve
    | GestureCurveA;

  interface IGesture {
    /**
     * current movement of the drag
     *
     * raw movement - independent of the offset or origin, purely the movement of the mouse.
     */
    movement: cmath.Vector2;

    /**
     * first movement of the drag
     */
    first: cmath.Vector2;

    /**
     * last movement of the drag
     */
    last: cmath.Vector2;
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

    /**
     * @deprecated FIXME: use layout snapshot or history instead
     */
    readonly initial_snapshot: editor.state.IMinimalDocumentState;
    readonly initial_clone_ids: string[];
    readonly initial_rects: cmath.Rectangle[];

    /**
     * indicator between gesture events to ensure if the current selection is cloned ones or not
     */
    is_currently_cloned: boolean;
  };

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
    /**
     * @deprecated FIXME: use layout snapshot or history instead
     */
    readonly initial_snapshot: editor.state.IMinimalDocumentState;
    readonly initial_rects: cmath.Rectangle[];
    readonly direction: cmath.CardinalDirection;
  };

  export type GestureInsertAndResize = Omit<GestureScale, "type"> & {
    readonly type: "insert-and-resize";
    pending_insertion: {
      node_id: string;
      prototype: grida.program.nodes.Node;
    } | null;
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

  export type GestureBrush = IGesture & {
    readonly type: "brush";

    /**
     * color to paint
     */
    readonly color: cmath.Vector4;

    // /**
    //  * record of points (movements)
    //  * the absolute position of the points will be (p + origin)
    //  */
    // points: cmath.Vector2[];

    readonly node_id: string;
  };

  /**
   * Translate certain path point
   *
   * @remarks
   * This is only valid with content edit mode is "vector"
   */
  export type GestureTranslateVectorControls = IGesture & {
    type: "translate-vector-controls";
    readonly node_id: string;
    readonly vertices: number[];
    readonly tangents: [number, 0 | 1][];
    readonly initial_verticies: cmath.Vector2[];
    readonly initial_segments: vn.VectorNetworkSegment[];
    readonly initial_position: cmath.Vector2;
    /**
     * Absolute position of the node when the gesture started.
     *
     * Used for snap guide rendering inside nested containers where the local
     * position does not reflect the node's location on the canvas.
     */
    readonly initial_absolute_position: cmath.Vector2;
  };

  /**
   * Translate variable width stop
   *
   * @remarks
   * This is only valid with content edit mode is "width"
   */
  export type GestureTranslateVariableWidthStop = IGesture & {
    type: "translate-variable-width-stop";
    readonly node_id: string;
    readonly stop: number;
    readonly initial_stop: cg.VariableWidthStop;
    readonly initial_position: cmath.Vector2;
    /**
     * Absolute position of the node when the gesture started.
     *
     * Used for snap guide rendering inside nested containers where the local
     * position does not reflect the node's location on the canvas.
     */
    readonly initial_absolute_position: cmath.Vector2;
  };

  /**
   * Resize variable width stop radius
   *
   * @remarks
   * This is only valid with content edit mode is "width"
   */
  export type GestureResizeVariableWidthStop = IGesture & {
    type: "resize-variable-width-stop";
    readonly node_id: string;
    readonly stop: number;
    readonly side: "left" | "right";
    readonly initial_stop: cg.VariableWidthStop;
    readonly initial_position: cmath.Vector2;
    /**
     * Absolute position of the node when the gesture started.
     *
     * Used for snap guide rendering inside nested containers where the local
     * position does not reflect the node's location on the canvas.
     */
    readonly initial_absolute_position: cmath.Vector2;
    /**
     * Initial angle of the curve at the stop position.
     * Used to transform movement perpendicular to the curve direction.
     */
    readonly initial_angle: number;
    /**
     * Initial curve position at the stop.
     * Used to calculate the radius based on cursor distance from curve.
     */
    readonly initial_curve_position: cmath.Vector2;
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
}

export namespace editor.history {
  export type HistoryEntry = {
    actionType: EditorAction["type"];
    timestamp: number;
    state: editor.state.IDocumentState;
  };

  /**
   * @mutates draft
   */
  export function apply(
    draft: editor.state.IEditorState,
    snapshot: editor.state.IDocumentState
  ) {
    //
    draft.selection = snapshot.selection;
    draft.scene_id = snapshot.scene_id;
    draft.document = snapshot.document;
    draft.document_ctx = snapshot.document_ctx;
    draft.content_edit_mode = snapshot.content_edit_mode;
    draft.document_key = snapshot.document_key;
    //

    // hover state should be cleared to prevent errors
    draft.hovered_node_id = null;
    return;
  }

  export function snapshot(
    state: editor.state.IDocumentState
  ): editor.state.IDocumentState {
    return {
      selection: state.selection,
      scene_id: state.scene_id,
      document: state.document,
      document_ctx: state.document_ctx,
      content_edit_mode: state.content_edit_mode,
      document_key: state.document_key,
    };
  }

  export function entry(
    actionType: editor.history.HistoryEntry["actionType"],
    state: editor.state.IDocumentState
  ): editor.history.HistoryEntry {
    return {
      actionType,
      state: snapshot(state),
      timestamp: Date.now(),
    };
  }

  export function getMergableEntry(
    snapshots: editor.history.HistoryEntry[],
    timeout: number = 300
  ): editor.history.HistoryEntry | undefined {
    if (snapshots.length === 0) {
      return;
    }

    const newTimestamp = Date.now();
    const previousEntry = snapshots[snapshots.length - 1];

    if (
      // actionType !== previousEntry.actionType ||
      newTimestamp - previousEntry.timestamp >
      timeout
    ) {
      return;
    }

    return previousEntry;
  }
}

export namespace editor.a11y {
  export type EscapeStep =
    | "escape-tool"
    | "escape-selection"
    | "escape-content-edit-mode";

  export const a11y_direction_to_order = {
    "a11y/up": "backward",
    "a11y/right": "forward",
    "a11y/down": "forward",
    "a11y/left": "backward",
  } as const;

  export const a11y_direction_to_vector = {
    "a11y/up": [0, -1] as cmath.Vector2,
    "a11y/right": [1, 0] as cmath.Vector2,
    "a11y/down": [0, 1] as cmath.Vector2,
    "a11y/left": [-1, 0] as cmath.Vector2,
  } as const;
}

export namespace editor.api {
  export class EditorConsumerVerboseError extends Error {
    context: any;
    constructor(message: string, context: any) {
      super(message); // Pass message to the parent Error class
      this.name = this.constructor.name; // Set the error name
      this.context = context; // Attach the context object
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      }
    }

    toString(): string {
      return `${this.name}: ${this.message} - Context: ${JSON.stringify(this.context)}`;
    }
  }

  export type TChange<T> =
    | {
        type: "set";
        value: T;
      }
    | {
        type: "delta";
        value: NonNullable<T>;
      };

  /**
   * Numeric value change payload.
   */
  export type NumberChange = TChange<number>;

  export type NudgeUXConfig = {
    /**
     * when gesture is true, it will set the gesture state to trigger the surface guide rendering.
     *
     * @default true
     */
    gesture: boolean;

    /**
     * delay in ms to toggle off the gesture state
     *
     * @default 500
     */
    delay: number;
  };

  export interface INodeChangeActions {
    toggleNodeActive(node_id: NodeID): void;
    toggleNodeLocked(node_id: NodeID): void;
    toggleNodeBold(node_id: NodeID): void;
    toggleNodeUnderline(node_id: NodeID): void;
    toggleNodeLineThrough(node_id: NodeID): void;
    changeNodeActive(node_id: NodeID, active: boolean): void;
    changeNodeLocked(node_id: NodeID, locked: boolean): void;
    changeNodeName(node_id: NodeID, name: string): void;
    changeNodeUserData(node_id: NodeID, userdata: unknown): void;
    changeNodeSize(
      node_id: NodeID,
      axis: "width" | "height",
      value: grida.program.css.LengthPercentage | "auto"
    ): void;
    changeNodeBorder(
      node_id: NodeID,
      border: grida.program.css.Border | undefined
    ): void;
    changeNodeProps(
      node_id: string,
      key: string,
      value?: tokens.StringValueExpression
    ): void;
    changeNodeComponent(node_id: NodeID, component: string): void;
    changeNodeText(node_id: NodeID, text: tokens.StringValueExpression): void;
    changeNodeStyle(
      node_id: NodeID,
      key: keyof grida.program.css.ExplicitlySupportedCSSProperties,
      value: any
    ): void;
    changeNodeMouseCursor(
      node_id: NodeID,
      mouseCursor: cg.SystemMouseCursor
    ): void;
    changeNodeSrc(node_id: NodeID, src?: tokens.StringValueExpression): void;
    changeNodeHref(
      node_id: NodeID,
      href?: grida.program.nodes.i.IHrefable["href"]
    ): void;
    changeNodeTarget(
      node_id: NodeID,
      target?: grida.program.nodes.i.IHrefable["target"]
    ): void;
    changeNodePositioning(
      node_id: NodeID,
      positioning: grida.program.nodes.i.IPositioning
    ): void;
    changeNodePositioningMode(
      node_id: NodeID,
      positioningMode: "absolute" | "relative"
    ): void;
    changeNodeCornerRadius(
      node_id: NodeID,
      cornerRadius: cg.CornerRadius
    ): void;
    changeNodePointCount(node_id: NodeID, pointCount: number): void;
    changeNodeInnerRadius(node_id: NodeID, innerRadius: number): void;
    changeNodeArcData(
      node_id: NodeID,
      arcData: grida.program.nodes.i.IEllipseArcData
    ): void;
    changeNodeFill(
      node_id: NodeID,
      fill: grida.program.nodes.i.props.SolidPaintToken | cg.Paint | null
    ): void;
    changeNodeFill(
      node_id: NodeID[],
      fill: grida.program.nodes.i.props.SolidPaintToken | cg.Paint | null
    ): void;
    changeNodeStroke(
      node_id: NodeID,
      stroke: grida.program.nodes.i.props.SolidPaintToken | cg.Paint | null
    ): void;
    changeNodeStroke(
      node_id: NodeID[],
      stroke: grida.program.nodes.i.props.SolidPaintToken | cg.Paint | null
    ): void;
    changeNodeStrokeWidth(
      node_id: NodeID,
      strokeWidth: editor.api.NumberChange
    ): void;
    changeNodeStrokeCap(node_id: NodeID, strokeCap: cg.StrokeCap): void;
    changeNodeStrokeAlign(node_id: NodeID, strokeAlign: cg.StrokeAlign): void;
    changeNodeFit(node_id: NodeID, fit: cg.BoxFit): void;
    changeNodeOpacity(node_id: NodeID, opacity: editor.api.NumberChange): void;
    changeNodeBlendMode(node_id: NodeID, blendMode: cg.BlendMode): void;
    changeNodeRotation(
      node_id: NodeID,
      rotation: editor.api.NumberChange
    ): void;
    changeTextNodeFontFamily(node_id: NodeID, fontFamily: string): void;
    changeTextNodeFontWeight(node_id: NodeID, fontWeight: cg.NFontWeight): void;
    changeTextNodeFontSize(
      node_id: NodeID,
      fontSize: editor.api.NumberChange
    ): void;
    changeTextNodeTextAlign(node_id: NodeID, textAlign: cg.TextAlign): void;
    changeTextNodeTextAlignVertical(
      node_id: NodeID,
      textAlignVertical: cg.TextAlignVertical
    ): void;
    changeTextNodeTextTransform(
      node_id: NodeID,
      transform: cg.TextTransform
    ): void;
    changeTextNodeTextDecorationLine(
      node_id: NodeID,
      textDecorationLine: cg.TextDecorationLine
    ): void;
    changeTextNodeTextDecorationStyle(
      node_id: NodeID,
      textDecorationStyle: cg.TextDecorationStyle
    ): void;
    changeTextNodeTextDecorationThickness(
      node_id: NodeID,
      textDecorationThickness: cg.TextDecorationThicknessPercentage
    ): void;
    changeTextNodeTextDecorationColor(
      node_id: NodeID,
      textDecorationColor: cg.TextDecorationColor
    ): void;
    changeTextNodeTextDecorationSkipInk(
      node_id: NodeID,
      textDecorationSkipInk: cg.TextDecorationSkipInkFlag
    ): void;
    changeTextNodeLineHeight(
      node_id: NodeID,
      lineHeight: TChange<grida.program.nodes.TextNode["lineHeight"]>
    ): void;
    changeTextNodeLetterSpacing(
      node_id: NodeID,
      letterSpacing: TChange<grida.program.nodes.TextNode["letterSpacing"]>
    ): void;
    changeTextNodeMaxlength(
      node_id: NodeID,
      maxlength: number | undefined
    ): void;
    changeTextNodeMaxLines(node_id: NodeID, maxLines: number | null): void;
    changeContainerNodePadding(
      node_id: NodeID,
      padding: grida.program.nodes.i.IPadding["padding"]
    ): void;
    changeNodeFilterEffects(node_id: NodeID, effects?: cg.FilterEffect[]): void;
    changeNodeFeShadows(node_id: NodeID, effect?: cg.FeShadow[]): void;
    changeNodeFeBlur(node_id: NodeID, effect?: cg.FeBlur): void;
    changeNodeFeBackdropBlur(
      node_id: NodeID,
      effect?: cg.IFeGaussianBlur
    ): void;
    changeContainerNodeLayout(
      node_id: NodeID,
      layout: grida.program.nodes.i.IFlexContainer["layout"]
    ): void;
    changeFlexContainerNodeDirection(node_id: string, direction: cg.Axis): void;
    changeFlexContainerNodeMainAxisAlignment(
      node_id: string,
      mainAxisAlignment: cg.MainAxisAlignment
    ): void;
    changeFlexContainerNodeCrossAxisAlignment(
      node_id: string,
      crossAxisAlignment: cg.CrossAxisAlignment
    ): void;
    changeFlexContainerNodeGap(
      node_id: string,
      gap: number | { mainAxisGap: number; crossAxisGap: number }
    ): void;
  }

  export interface IBrushToolActions {
    changeBrush(brush: BitmapEditorBrush): void;
    changeBrushSize(size: editor.api.NumberChange): void;
    changeBrushOpacity(opacity: editor.api.NumberChange): void;
  }

  export interface IPixelGridActions {
    configurePixelGrid(state: "on" | "off"): void;
    togglePixelGrid(): "on" | "off";
  }

  export interface IRulerActions {
    configureRuler(state: "on" | "off"): void;
    toggleRuler(): "on" | "off";
  }

  export interface IGuide2DActions {
    deleteGuide(idx: number): void;
  }

  export interface ICameraActions {
    setTransform(transform: cmath.Transform): void;

    /**
     * zoom the camera by the given delta
     * @param delta the delta to zoom by
     * @param origin the origin of the zoom
     */
    zoom(delta: number, origin: cmath.Vector2): void;
    /**
     * pan the camera by the given delta
     * @param delta the delta to pan by
     */
    pan(delta: [number, number]): void;

    scale(
      factor: number | cmath.Vector2,
      origin: cmath.Vector2 | "center"
    ): void;
    fit(
      selector: grida.program.document.Selector,
      options?: {
        margin?: number | [number, number, number, number];
        animate?: boolean;
      }
    ): void;
    zoomIn(): void;
    zoomOut(): void;
  }

  export interface IEventTargetActions {
    hoverNode(node_id: string, event: "enter" | "leave"): void;
    hoverEnterNode(node_id: string): void;
    hoverLeaveNode(node_id: string): void;

    startGuideGesture(axis: cmath.Axis, idx: number | -1): void;
    startScaleGesture(
      selection: string | string[],
      direction: cmath.CardinalDirection
    ): void;
    startSortGesture(selection: string | string[], node_id: string): void;
    startGapGesture(selection: string | string[], axis: "x" | "y"): void;
    startCornerRadiusGesture(selection: string): void;
    startRotateGesture(selection: string): void;
    startTranslateVectorNetwork(node_id: string): void;
    startCurveGesture(
      node_id: string,
      segment: number,
      control: "ta" | "tb"
    ): void;

    pointerDown(event: PointerEvent): void;
    pointerUp(event: PointerEvent): void;
    pointerMove(event: PointerEvent): void;

    click(event: MouseEvent): void;
    doubleClick(event: MouseEvent): void;

    dragStart(event: PointerEvent): void;
    dragEnd(event: PointerEvent): void;
    drag(event: TCanvasEventTargetDragGestureState): void;
  }

  export interface IDocumentGeometryInterfaceProvider {
    /**
     * returns a list of node ids that are intersecting with the pointer event
     * @param event window event
     * @returns
     */
    getNodeIdsFromPointerEvent(event: PointerEvent | MouseEvent): string[];
    /**
     * returns a list of node ids that are intersecting with the point in canvas space
     * @param point canvas space point
     * @returns
     */
    getNodeIdsFromPoint(point: cmath.Vector2): string[];
    /**
     * returns a list of node ids that are intersecting with the envelope in canvas space
     * @param envelope
     * @returns
     */
    getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[];
    /**
     * returns a bounding rect of the node in canvas space
     * @param node_id
     * @returns
     */
    getNodeAbsoluteBoundingRect(node_id: string): cmath.Rectangle | null;
  }

  export interface IDocumentImageExportInterfaceProvider {
    /**
     * exports the node as an image
     * @param node_id
     * @param format
     * @returns
     */
    exportNodeAsImage(
      node_id: string,
      format: "PNG" | "JPEG"
    ): Promise<Uint8Array>;
  }

  export interface IDocumentFontLoaderInterfaceProvider {
    /**
     * loads the font so that the backend can render it
     * @param font font descriptor
     */
    loadFont(font: { family: string }): Promise<void>;

    /**
     * Lists fonts that have been loaded and are available at runtime.
     * This does not fetch the full webfont list; it only reports fonts
     * that were explicitly loaded through {@link loadFont}.
     */
    listLoadedFonts(): string[];
  }

  export interface IDocumentSVGExportInterfaceProvider {
    /**
     * exports the node as an svg
     * @param node_id
     * @returns
     */
    exportNodeAsSVG(node_id: string): Promise<string>;
  }

  export interface IDocumentPDFExportInterfaceProvider {
    /**
     * exports the node as an pdf
     * @param node_id
     * @returns
     */
    exportNodeAsPDF(node_id: string): Promise<Uint8Array>;
  }

  export interface IDocumentVectorInterfaceProvider {
    /**
     * converts the node into a vector network
     * @param node_id
     * @returns vector network or null if unsupported
     */
    toVectorNetwork(node_id: string): vn.VectorNetwork | null;
  }

  export interface IDocumentGeometryQuery {
    /**
     * returns a list of node ids that are intersecting with the point in canvas space
     * @param point canvas space point
     * @returns
     */
    getNodeIdsFromPoint(point: cmath.Vector2): string[];
    /**
     * returns a list of node ids that are intersecting with the pointer event
     * @param event window event
     * @returns
     */
    getNodeIdsFromPointerEvent(event: PointerEvent | MouseEvent): string[];
    /**
     * returns a list of node ids that are intersecting with the envelope in canvas space
     * @param envelope canvas space envelope
     * @returns
     */
    getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[];
    /**
     * returns a bounding rect of the node in canvas space
     * @param node_id node id
     * @returns
     */
    getNodeAbsoluteBoundingRect(node_id: NodeID): cmath.Rectangle | null;
    /**
     * returns the absolute rotation of the node in canvas space
     * @param node_id node id
     * @returns
     */
    getNodeAbsoluteRotation(node_id: NodeID): number;
  }

  export interface IDocumentEditorActions {
    loadScene(scene_id: string): void;
    createScene(scene?: grida.program.document.SceneInit): void;
    deleteScene(scene_id: string): void;
    duplicateScene(scene_id: string): void;
    renameScene(scene_id: string, name: string): void;
    changeSceneBackground(
      scene_id: string,
      backgroundColor: grida.program.document.ISceneBackground["backgroundColor"]
    ): void;

    //
    /**
     * creates an image (data) from the given src, registers it to the document
     * @param src
     */
    createImage(src: string): Promise<grida.program.document.ImageRef>;

    //
    setTool(tool: editor.state.ToolMode): void;
    tryExitContentEditMode(): void;
    tryToggleContentEditMode(): void;
    tryEnterContentEditMode(): void;
    tryEnterContentEditMode(
      node_id?: string,
      mode?: "auto" | "fill/gradient"
    ): void;
    //

    /**
     * select the nodes by the given selectors.
     *
     * @param selectors - {@link grida.program.document.Selector}[]
     * @returns the selected node ids. or `false` if ignored.
     */
    select(...selectors: grida.program.document.Selector[]): NodeID[] | false;

    /**
     * ux a11y escape command.
     *
     * - In vector content edit mode, prioritizes:
     *   1. resetting active tool to cursor,
     *   2. clearing vector selection,
     *   3. exiting the content edit mode.
     * - Otherwise exits the content edit mode.
     *
     * bind this to `escape` key.
     */
    a11yEscape(): void;

    /**
     * semantic copy command for accessibility features.
     *
     * currently proxies to copying the current selection.
     */
    a11yCopy(): void;

    /**
     * semantic cut command for accessibility features.
     *
     * currently proxies to cutting the current selection.
     */
    a11yCut(): void;

    /**
     * semantic paste command for accessibility features.
     *
     * currently proxies to the standard paste behavior.
     */
    a11yPaste(): void;
    a11yDelete(): void;
    blur(): void;
    undo(): void;
    redo(): void;
    cut(target: "selection" | NodeID): void;
    copy(target: "selection" | NodeID): void;
    paste(): void;
    duplicate(target: "selection" | NodeID): void;
    flatten(target: "selection" | NodeID): void;
    op(target: ReadonlyArray<NodeID>, op: cg.BooleanOperation): void;
    union(target: ReadonlyArray<NodeID>): void;
    subtract(target: ReadonlyArray<NodeID>): void;
    intersect(target: ReadonlyArray<NodeID>): void;
    exclude(target: ReadonlyArray<NodeID>): void;

    setClipboardColor(color: cg.RGBA8888): void;

    // vector editor
    selectVertex(node_id: NodeID, vertex: number): void;
    deleteVertex(node_id: NodeID, vertex: number): void;
    selectSegment(node_id: NodeID, segment: number): void;
    deleteSegment(node_id: NodeID, segment: number): void;
    splitSegment(node_id: NodeID, point: vn.PointOnSegment): void;
    translateVertex(
      node_id: NodeID,
      vertex: number,
      delta: cmath.Vector2
    ): void;
    translateSegment(
      node_id: NodeID,
      segment: number,
      delta: cmath.Vector2
    ): void;
    bendSegment(
      node_id: NodeID,
      segment: number,
      ca: number,
      cb: cmath.Vector2,
      frozen: {
        a: cmath.Vector2;
        b: cmath.Vector2;
        ta: cmath.Vector2;
        tb: cmath.Vector2;
      }
    ): void;
    planarize(node_id: NodeID): void;

    /**
     * Updates the hovered control in vector content edit mode.
     *
     * @param hoveredControl - The hovered control with type and index, or null if no control is hovered
     */
    updateVectorHoveredControl(
      hoveredControl: {
        type: editor.state.VectorContentEditModeHoverableGeometryControlType;
        index: number;
      } | null
    ): void;

    //

    //
    /**
     * select the gradient stop by the given index
     *
     * only effective when content edit mode is {@link editor.state.FillGradientContentEditMode}
     *
     * @param node_id node id
     * @param stop index of the stop
     */
    selectGradientStop(node_id: NodeID, stop: number): void;
    //

    //
    getNodeSnapshotById(node_id: NodeID): Readonly<grida.program.nodes.Node>;
    getNodeById(node_id: NodeID): NodeProxy<grida.program.nodes.Node>;
    getNodeDepth(node_id: NodeID): number;
    //

    //
    insertNode(prototype: grida.program.nodes.NodePrototype): NodeID;
    deleteNode(target: "selection" | NodeID): void;
    //

    createNodeFromSvg(
      svg: string
    ): Promise<NodeProxy<grida.program.nodes.ContainerNode>>;
    createImageNode(
      image: grida.program.document.ImageRef
    ): NodeProxy<grida.program.nodes.ImageNode>;
    createTextNode(text: string): NodeProxy<grida.program.nodes.TextNode>;
    createRectangleNode(): NodeProxy<grida.program.nodes.RectangleNode>;

    //
    nudgeResize(
      target: "selection" | NodeID,
      axis: "x" | "y",
      delta: number
    ): void;
    align(
      target: "selection" | NodeID,
      alignment: {
        horizontal?: "none" | "min" | "max" | "center";
        vertical?: "none" | "min" | "max" | "center";
      }
    ): void;
    order(target: "selection" | NodeID, order: "back" | "front" | number): void;
    mv(source: NodeID[], target: NodeID, index?: number): void;
    //
    distributeEvenly(target: "selection" | NodeID[], axis: "x" | "y"): void;
    autoLayout(target: "selection" | NodeID[]): void;
    contain(target: "selection" | NodeID[]): void;

    /**
     * group the nodes
     * @param target - the nodes to group
     */
    group(target: "selection" | NodeID[]): void;

    /**
     * ungroup the nodes (from group or boolean)
     * @param target - the nodes to ungroup
     */
    ungroup(target: "selection" | NodeID[]): void;
    configureSurfaceRaycastTargeting(
      config: Partial<state.HitTestingConfig>
    ): void;
    configureMeasurement(measurement: "on" | "off"): void;
    configureTranslateWithCloneModifier(
      translate_with_clone: "on" | "off"
    ): void;
    configureTranslateWithAxisLockModifier(
      tarnslate_with_axis_lock: "on" | "off"
    ): void;
    configureTranslateWithForceDisableSnap(
      translate_with_force_disable_snap: "on" | "off"
    ): void;
    configureTransformWithCenterOriginModifier(
      transform_with_center_origin: "on" | "off"
    ): void;
    configureTransformWithPreserveAspectRatioModifier(
      transform_with_preserve_aspect_ratio: "on" | "off"
    ): void;
    configureRotateWithQuantizeModifier(
      rotate_with_quantize: number | "off"
    ): void;
    configureCurveTangentMirroringModifier(
      curve_tangent_mirroring: vn.TangentMirroringMode
    ): void;
    // //
    toggleActive(target: "selection" | NodeID): void;
    toggleLocked(target: "selection" | NodeID): void;
    toggleBold(target: "selection" | NodeID): void;
    toggleUnderline(target: "selection" | NodeID): void;
    toggleLineThrough(target: "selection" | NodeID): void;
    // //
    setOpacity(target: "selection" | NodeID, opacity: number): void;
  }

  export interface ISchemaActions {
    // //
    schemaDefineProperty(
      key?: string,
      definition?: grida.program.schema.PropertyDefinition
    ): void;
    schemaRenameProperty(key: string, newName: string): void;
    schemaUpdateProperty(
      key: string,
      definition: grida.program.schema.PropertyDefinition
    ): void;
    schemaPutProperty(key: string, value: any): void;
    schemaDeleteProperty(key: string): void;
  }

  export interface IFollowPluginActions {
    follow(cursor_id: string): void;
    unfollow(): void;
  }

  export interface IVectorInterfaceActions {
    toVectorNetwork(node_id: string): vn.VectorNetwork | null;
  }

  export interface IFontLoaderActions {
    /**
     * Loads the font so that the backend can render it
     */
    loadFont(font: { family: string }): Promise<void>;

    /**
     * Lists fonts currently loaded and available to the renderer.
     */
    listLoadedFonts(): string[];
  }

  export interface IExportPluginActions {
    exportNodeAs(node_id: string, format: "PNG" | "JPEG"): Promise<Uint8Array>;
    exportNodeAs(node_id: string, format: "PDF"): Promise<Uint8Array>;
    exportNodeAs(node_id: string, format: "SVG"): Promise<string>;
  }
}

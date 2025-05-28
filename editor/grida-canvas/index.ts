import type { Action, EditorAction, TChange } from "@/grida-canvas/action";
import type { BitmapEditorBrush, BitmapLayerEditor } from "@grida/bitmap";
import type cg from "@grida/cg";
import type { SnapToObjectsResult } from "@grida/cmath/_snap";
import type { tokens } from "@grida/tokens";
import cmath from "@grida/cmath";
import grida from "@grida/schema";
import assert from "assert";

export { type Action };

export namespace editor {
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

  export const DEFAULT_HIT_TESTING_CONFIG: state.HitTestingConfig = {
    target: "auto",
    ignores_root_with_children: true,
    ignores_locked: true,
  };

  export const DEFAULT_GESTURE_MODIFIERS: state.GestureModifiers = {
    translate_with_hierarchy_change: "on",
    translate_with_clone: "off",
    tarnslate_with_axis_lock: "off",
    transform_with_center_origin: "off",
    transform_with_preserve_aspect_ratio: "off",
    rotate_with_quantize: "off",
  };

  export const DEFAULT_BRUSH: state.CurrentBrush = {
    name: "Default",
    hardness: 1,
    size: [4, 4],
    spacing: 0,
    opacity: 1,
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
  export type ToolMode =
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
        type: "brush" | "eraser" | "flood-fill";
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

  export interface IViewportTransformState {
    /**
     * current transform of the canvas.
     * where transform origin is 0,0
     */
    transform: cmath.Transform;
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

  export interface IEditorUserClipboardState {
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
    surface_snapping?: SnapToObjectsResult;

    /**
     * general hover state
     *
     * @default null
     */
    hovered_node_id: string | null;

    /**
     * hovered vertex index (of a selected path node)
     *
     * @default null
     */
    hovered_vertex_idx: number | null;

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
  }

  export type ContentEditModeState =
    | TextContentEditMode
    | PathContentEditMode
    | BitmapContentEditMode
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

  type BitmapContentEditMode = {
    type: "bitmap";
    node_id: string;
    imageRef: string;
  };

  /**
   * @deprecated - WIP
   */
  type GradientContentEditMode = {
    type: "gradient";
    node_id: string;
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
      grida.program.document.IDocumentTemplatesRepository {}

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
    hovered_vertex_idx: null,
    marquee: undefined,
    selection: [],
    hits: [],
    surface_snapping: undefined,
  };

  export interface IEditorStateInit
    extends Pick<editor.config.IEditorConfig, "editable" | "debug">,
      Partial<Pick<editor.config.IEditorConfig, "flags">>,
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

    const s = new editor.dq.DocumentState(doc);

    return {
      transform: cmath.transform.identity,
      debug: debug ?? false,
      pointer: {
        client: cmath.vector2.zero,
        position: cmath.vector2.zero,
        last: cmath.vector2.zero,
      },
      history: {
        future: [],
        past: [],
      },
      gesture_modifiers: editor.config.DEFAULT_GESTURE_MODIFIERS,
      ruler: "off",
      pixelgrid: "on",
      when_not_removable: "deactivate",
      document_ctx: editor.dq.Context.from(doc).snapshot(),
      pointer_hit_testing_config: editor.config.DEFAULT_HIT_TESTING_CONFIG,
      surface_measurement_targeting: "off",
      surface_measurement_targeting_locked: false,
      surface_measurement_target: undefined,
      googlefonts: s.fonts().map((family) => ({ family })),
      brushes: [],
      tool: { type: "cursor" },
      brush: editor.config.DEFAULT_BRUSH,
      scene_id: doc.entry_scene_id ?? Object.keys(doc.scenes)[0] ?? undefined,
      flags: {
        __unstable_brush_tool: "off",
      },
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
    | GestureScale
    | GestureRotate
    | GestureCornerRadius
    | GestureDraw
    | GestureBrush
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
    draft.hovered_vertex_idx = null;
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

/**
 * @internal document /design query
 */
export namespace editor.dq {
  const HARD_MAX_WHILE_LOOP = 5000;

  /**
   * Queries nodes in the document hierarchy based on a specified selector.
   *
   * @param context - The runtime hierarchy context containing the node structure and relationships.
   * @param selection - The currently selected nodes, represented as an array of node IDs.
   * @param selector - A `Selector` indicating the query type:
   *  - `"*"`: Selects all nodes.
   *  - `"~"`: Selects siblings of the current selection.
   *    - If a single node is selected, returns its siblings.
   *    - If multiple nodes are selected, ensures all selected nodes are siblings and returns their siblings.
   *    - If no nodes are selected, defaults to `"*"` (all nodes).
   *  - `">"`: Selects the direct children of the currently selected nodes.
   *  - `"selection"`: Returns the currently selected nodes.
   *  - `NodeID[]`: A specific array of node IDs to query directly.
   *
   * @returns An array of node IDs matching the specified query.
   *
   * @example
   * // Example context
   * const context = {
   *   __ctx_nid_to_parent_id: {
   *     "node1": null,    // Root node
   *     "node2": "node1", // Child of node1
   *     "node3": "node1", // Child of node1
   *     "node4": "node2", // Child of node2
   *   },
   *   __ctx_nids: new Set(["node1", "node2", "node3", "node4"]),
   * };
   *
   * // Query all nodes
   * const allNodes = querySelector(context, [], "*");
   * console.log(allNodes); // ["node1", "node2", "node3", "node4"]
   *
   * // Query siblings of "node2"
   * const siblings = querySelector(context, ["node2"], "~");
   * console.log(siblings); // ["node3"]
   *
   * // Query children of "node1"
   * const children = querySelector(context, ["node1"], ">");
   * console.log(children); // ["node2", "node3"]
   *
   * // Query specific nodes
   * const specificNodes = querySelector(context, [], ["node2", "node3"]);
   * console.log(specificNodes); // ["node2", "node3"]
   *
   * // Query current selection
   * const currentSelection = querySelector(context, ["node4"], "selection");
   * console.log(currentSelection); // ["node4"]
   */
  export function querySelector(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    selection: NodeID[],
    selector: grida.program.document.Selector
  ): NodeID[] {
    switch (selector) {
      case "*": {
        return Array.from(context.__ctx_nids);
      }
      case "~": {
        // check if selection is empty / single / multiple
        if (selection.length === 0) {
          // when empty, select with * (all)
          return Array.from(context.__ctx_nids);
        } else if (selection.length === 1) {
          return dq.getSiblings(context, selection[0]);
        } else {
          // multiple selection
          // when multiple, ensure that the current selection is a subset of the siblings (shares the same parent) / if not, ignore.

          const parentIds = selection.map((node_id) =>
            dq.getParentId(context, node_id)
          );
          const uniqueParentIds = new Set(parentIds);
          const is_siblings = uniqueParentIds.size === 1;

          if (!is_siblings) return [];
          const siblings = dq.getSiblings(context, selection[0]);
          return siblings;
        }
      }
      case ">": {
        return selection.flatMap((node_id) => dq.getChildren(context, node_id));
      }
      case "..": {
        return selection.flatMap((node_id) => {
          const parent = dq.getParentId(context, node_id);
          return parent ? [parent] : [];
        });
      }
      case "selection": {
        return selection;
      }
      default: {
        assert(Array.isArray(selector), "selection must be an array");
        return selector;
      }
    }
  }

  /**
   * [UX]
   *
   * filters nodes by hierarchy in a UX friendly matter.
   *
   * When a parent and child is requested to be selected at the same time, only the parent shall be selected.
   * This is to prevent recursive mutation of selected nodes in a nested way.
   *
   * Without this filtering, when modifying a tralsate or rotation will cause the nested children to be mutated as well.
   *
   * @example
   * - input: [a, a.0, a.1, a.1.9, b, c, d.0, z.9.9.9]
   * - output: [a, b, c, d.0, z.9.9.9]
   */
  export function pruneNestedNodes(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    selection: NodeID[]
  ): NodeID[] {
    const prunedSelection: Set<NodeID> = new Set();

    for (const node of selection) {
      // Check if the node is a descendant of any already selected parent
      if (
        !Array.from(prunedSelection).some((selected) =>
          isAncestor(context, selected, node)
        )
      ) {
        // Remove descendants of the current node from the pruned selection
        for (const selected of Array.from(prunedSelection)) {
          if (isAncestor(context, node, selected)) {
            prunedSelection.delete(selected);
          }
        }

        // Add the current node
        prunedSelection.add(node);
      }
    }

    return Array.from(prunedSelection);
  }

  /**
   * Determines whether a given node (`ancestor`) is an ancestor of another node (`node`).
   *
   * This function traverses upwards in the hierarchy from the specified node,
   * checking each parent node until it reaches the root or finds the specified ancestor.
   *
   * @param context - The runtime hierarchy context containing the mapping of node IDs to their parent IDs.
   * @param ancestor - The node ID to check as a potential ancestor.
   * @param node - The node ID to check as a descendant.
   * @returns `true` if the specified `ancestor` is an ancestor of the given `node`; otherwise, `false`.
   *
   * @example
   * // Example context
   * const context = {
   *   __ctx_nid_to_parent_id: {
   *     "node4": "node3",
   *     "node3": "node2",
   *     "node2": "node1",
   *     "node1": null, // root node has no parent
   *   }
   * };
   *
   * // Check if "node2" is an ancestor of "node4"
   * const result = isAncestor(context, "node2", "node4");
   * console.log(result); // true
   *
   * // Check if "node1" is an ancestor of "node4"
   * const result = isAncestor(context, "node1", "node4");
   * console.log(result); // true
   *
   * // Check if "node3" is an ancestor of "node2"
   * const result = isAncestor(context, "node3", "node2");
   * console.log(result); // false
   */
  function isAncestor(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    ancestor: NodeID,
    node: NodeID
  ): boolean {
    const { __ctx_nid_to_parent_id } = context;
    let current: string | null = node;

    let i = 0;
    while (current) {
      const parent: string | null = current
        ? __ctx_nid_to_parent_id[current]
        : null;
      if (parent === ancestor) return true; // Ancestor found
      current = parent;
      if (i++ > HARD_MAX_WHILE_LOOP) {
        reportError("HARD_MAX_WHILE_LOOP");
        break;
      }
    }

    return false; // Ancestor not found
  }

  /**
   * Retrieves a list of ancestor node IDs for a given node, starting from the root
   * and ending with the parent of the specified node.
   *
   * @param context - The runtime hierarchy context containing the mapping of node IDs to their parent IDs.
   * @param node_id - The ID of the node for which ancestors are to be retrieved.
   * @returns An array of ancestor node IDs in **root-first order**, excluding the current node.
   *          - The first element (`res[0]`) is the root node.
   *          - The last element (`res[res.length - 1]`) is the immediate parent of the given node.
   *
   * @example
   * // Example context
   * const context = {
   *   __ctx_nid_to_parent_id: {
   *     "node4": "node3",
   *     "node3": "node2",
   *     "node2": "node1",
   *     "node1": null, // root node has no parent
   *   }
   * };
   *
   * // Get ancestors for "node4"
   * const ancestors = documentquery.getAncestors(context, "node4");
   * console.log(ancestors); // ["node1", "node2", "node3"]
   *
   * // Explanation:
   * // - "node1" is the root node.
   * // - "node2" is the parent of "node3".
   * // - "node3" is the parent of "node4".
   */
  export function getAncestors(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    node_id: string
  ): NodeID[] {
    const { __ctx_nid_to_parent_id } = context;
    const ancestors: string[] = [];
    let current = node_id;

    // Traverse upwards to collect ancestors
    let i = 0;
    while (current) {
      const parent = __ctx_nid_to_parent_id[current];
      if (!parent) break; // Stop at root node
      ancestors.unshift(parent); // Insert at the beginning for root-first order
      current = parent;

      if (i++ > HARD_MAX_WHILE_LOOP) {
        reportError("HARD_MAX_WHILE_LOOP");
        break;
      }
    }

    return ancestors;
  }

  export function getDepth(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    node_id: string
  ): number {
    return getAncestors(context, node_id).length;
  }

  /**
   * Retrieves all sibling nodes of a specified node.
   *
   * @param context - The runtime hierarchy context containing the mapping of node IDs to their parent IDs.
   * @param node_id - The ID of the node for which siblings are to be retrieved.
   * @returns An array of sibling node IDs that share the same parent as the specified node.
   *          The array excludes the input node itself.
   *
   * @example
   * // Example context
   * const context = {
   *   __ctx_nid_to_parent_id: {
   *     "node1": null, // root node
   *     "node2": "node1",
   *     "node3": "node1",
   *     "node4": "node2",
   *   }
   * };
   *
   * // Get siblings for "node3"
   * const siblings = getSiblings(context, "node3");
   * console.log(siblings); // ["node2"]
   *
   * // Get siblings for "node1" (root node)
   * const siblings = getSiblings(context, "node1");
   * console.log(siblings); // []
   */
  export function getSiblings(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    node_id: string
  ): NodeID[] {
    const parent_id = getParentId(context, node_id);

    if (!parent_id) {
      // If the node has no parent, it is at the root level, and all nodes without parents are its "siblings."
      return Object.keys(context.__ctx_nid_to_parent_id).filter(
        (id) => context.__ctx_nid_to_parent_id[id] === null
      );
    }

    // Filter all nodes that share the same parent but exclude the input node itself.
    return Object.keys(context.__ctx_nid_to_parent_id).filter(
      (id) => context.__ctx_nid_to_parent_id[id] === parent_id && id !== node_id
    );
  }

  /**
   * Retrieves all child nodes of a specified node.
   *
   * @param context - The runtime hierarchy context containing the mapping of node IDs to their parent IDs.
   * @param node_id - The ID of the node for which children are to be retrieved.
   * @returns An array of child node IDs that have the specified node as their parent.
   *
   * @example
   * // Example context
   * const context = {
   *   __ctx_nid_to_parent_id: {
   *     "node1": null,    // Root node
   *     "node2": "node1", // Child of node1
   *     "node3": "node1", // Child of node1
   *     "node4": "node2", // Child of node2
   *   }
   * };
   *
   * // Get children of "node1"
   * const children = getChildren(context, "node1");
   * console.log(children); // ["node2", "node3"]
   *
   * // Get children of "node2"
   * const children = getChildren(context, "node2");
   * console.log(children); // ["node4"]
   *
   * // Get children of a root node with no children
   * const children = getChildren(context, "node3");
   * console.log(children); // []
   */
  export function getChildren(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    node_id: string,
    recursive = false
  ): NodeID[] {
    const { __ctx_nid_to_parent_id } = context;
    const directChildren = Object.keys(__ctx_nid_to_parent_id).filter(
      (id) => __ctx_nid_to_parent_id[id] === node_id
    );

    if (!recursive) {
      return directChildren;
    }

    const allChildren = [...directChildren];
    for (const child of directChildren) {
      allChildren.push(...getChildren(context, child, true));
    }
    return allChildren;
  }

  export function getParentId(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    node_id: string
  ): NodeID | null {
    return context.__ctx_nid_to_parent_id[node_id] ?? null;
  }

  export function getTopId(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    node_id: string
  ): NodeID | null {
    // veryfi if exists
    if (context.__ctx_nids.includes(node_id)) {
      const ancestors = getAncestors(context, node_id);
      return ancestors[0] ?? node_id;
    } else {
      return null;
    }
  }

  /**
   * @internal
   * @param state - state or draft
   * @param node_id
   * @returns
   */
  export function __getNodeById<
    S extends Pick<editor.state.IEditorState, "document" | "templates">,
  >(state: S, node_id: string): S["document"]["nodes"][string] {
    ///
    /// NOTE: once migrated, this function SHALL NOT lookup the templates table.
    ///
    const { document, templates } = state;
    const node = document.nodes[node_id];
    if (node) return node as S["document"]["nodes"][string];

    if (templates) {
      const templates_arr = Object.values(templates);
      const found = __getSubNodeById(templates_arr, node_id);
      if (found) return found as S["document"]["nodes"][string];
    }

    throw new Error(`node not found with node_id: "${node_id}"`);
  }

  /**
   * @deprecated
   * @param repositories
   * @param node_id
   * @returns
   */
  function __getSubNodeById(
    repositories: grida.program.document.INodesRepository[],
    node_id: string
  ): grida.program.nodes.Node {
    const repo = repositories.find((repo) => repo.nodes[node_id]);
    if (repo) return repo.nodes[node_id];
    throw new Error(`node not found with node_id: "${node_id}"`);
  }

  //
  export function hierarchy(
    node_id: string,
    ctx: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext
  ): { id: string; depth: number }[] {
    const collectNodeIds = (
      nodeId: string,
      depth: number,
      result: { id: string; depth: number }[] = []
    ): { id: string; depth: number }[] => {
      result.push({ id: nodeId, depth }); // Add current node ID with its depth

      // Get children from context
      const children = ctx.__ctx_nid_to_children_ids[nodeId] ?? [];
      for (const childId of children) {
        collectNodeIds(childId, depth + 1, result); // Increase depth for children
      }

      return result;
    };

    // Start traversal from the root node
    return collectNodeIds(node_id, 0);
  }

  export class Context
    implements
      grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext
  {
    readonly __ctx_nids: string[] = [];
    readonly __ctx_nid_to_parent_id: Record<string, string | null> = {};
    readonly __ctx_nid_to_children_ids: Record<string, string[]> = {};
    constructor(
      init?: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext
    ) {
      if (init) {
        Object.assign(this, init);
      }
    }

    static from(document: grida.program.document.IDocumentDefinition) {
      const ctx =
        grida.program.document.internal.create_nodes_repository_runtime_hierarchy_context(
          document
        );
      return new Context(ctx);
    }

    insert(node_id: NodeID, parent_id: NodeID | null) {
      assert(this.__ctx_nids.indexOf(node_id) === -1, "node_id already exists");

      if (parent_id) {
        this.__ctx_nids.push(node_id);
        this.__ctx_nid_to_parent_id[node_id] = parent_id;

        if (!this.__ctx_nid_to_children_ids[parent_id]) {
          this.__ctx_nid_to_children_ids[parent_id] = [];
        }

        this.__ctx_nid_to_children_ids[parent_id].push(node_id);
      } else {
        // register to the document. done.
        this.__ctx_nids.push(node_id);
        this.__ctx_nid_to_parent_id[node_id] = null;
      }
    }

    /**
     * place the node as a child of the parent node.
     * this does not consider the current parent of the node. or does anything about it.
     *
     * The use of this methid is very limited.
     *
     * @param node_id
     * @param parent_id
     */
    blindlymove(node_id: NodeID, parent_id: NodeID | null) {
      this.__ctx_nid_to_parent_id[node_id] = parent_id;

      if (parent_id) {
        if (!this.__ctx_nid_to_children_ids[parent_id]) {
          this.__ctx_nid_to_children_ids[parent_id] = [];
        }
        this.__ctx_nid_to_children_ids[parent_id].push(node_id);
      } else {
        // register to the document. done.
        this.__ctx_nids.push(node_id);
      }
    }

    snapshot(): grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext {
      return {
        __ctx_nids: this.__ctx_nids.slice(),
        __ctx_nid_to_parent_id: { ...this.__ctx_nid_to_parent_id },
        __ctx_nid_to_children_ids: { ...this.__ctx_nid_to_children_ids },
      };
    }

    // [NOT USED] - did not yet decided how to implement the callback (for updating the document - none-context)
    // delete(node_id: NodeID) {
    //   const deleted_node_ids = new Set<NodeID>(node_id);
    //   // recursively delete children
    //   const children_ids = this.__ctx_nid_to_children_ids[node_id] || [];
    //   for (const child_id of children_ids) {
    //     const deleted = this.delete(child_id);
    //     deleted.forEach(deleted_node_ids.add, deleted_node_ids);
    //   }

    //   // detach from parent
    //   const parent_id = this.__ctx_nid_to_parent_id[node_id];
    //   if (parent_id) {
    //     const parent_children_ids = this.__ctx_nid_to_children_ids[parent_id];
    //     const index = parent_children_ids.indexOf(node_id);

    //     if (index > -1) {
    //       // remove from parent node's children array
    //       // (
    //       //   draft.document.nodes[parent_id] as grida.program.nodes.i.IChildren
    //       // ).children!.splice(index, 1);

    //       // remove from document context
    //       parent_children_ids.splice(index, 1);
    //     }
    //   }

    //   // delete self from context
    //   delete this.__ctx_nid_to_parent_id[node_id];
    //   delete this.__ctx_nid_to_children_ids[node_id];
    //   const index = this.__ctx_nids.indexOf(node_id);
    //   if (index > -1) {
    //     this.__ctx_nids.splice(index, 1);
    //   }

    //   return Array.from(deleted_node_ids);
    // }

    getAncestors(node_id: NodeID): NodeID[] {
      return getAncestors(this, node_id);
    }

    getDepth(node_id: NodeID): number {
      return getDepth(this, node_id);
    }
  }

  //

  export class DocumentState {
    constructor(
      private readonly document: grida.program.document.IDocumentDefinition
    ) {}

    private get nodes(): grida.program.document.INodesRepository["nodes"] {
      return this.document.nodes;
    }

    private get nodeids(): Array<string> {
      return Object.keys(this.nodes);
    }

    textnodes(): Array<grida.program.nodes.TextNode> {
      return this.nodeids
        .map((id) => this.nodes[id])
        .filter(
          (node) => node.type === "text"
        ) as grida.program.nodes.TextNode[];
    }

    fonts(): Array<string> {
      return Array.from(
        new Set(
          this.textnodes()
            .map((node) => node.fontFamily)
            .filter(Boolean) as Array<string>
        )
      );
    }
  }
}

export namespace editor.a11y {
  export const a11y_direction_to_order = {
    "a11y/up": "backward",
    "a11y/right": "forward",
    "a11y/down": "forward",
    "a11y/left": "backward",
  } as const;

  export const a11y_direction_to_vector = {
    "a11y/up": [0, -1],
    "a11y/right": [1, 0],
    "a11y/down": [0, 1],
    "a11y/left": [-1, 0],
  } as const;
}

export namespace editor.api {
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
    toggleNodeActive: (node_id: NodeID) => void;
    toggleNodeLocked: (node_id: NodeID) => void;
    toggleNodeBold: (node_id: NodeID) => void;
    changeNodeActive: (node_id: NodeID, active: boolean) => void;
    changeNodeLocked: (node_id: NodeID, locked: boolean) => void;
    changeNodeName: (node_id: NodeID, name: string) => void;
    changeNodeUserData: (node_id: NodeID, userdata: unknown) => void;
    changeNodeSize: (
      node_id: NodeID,
      axis: "width" | "height",
      value: grida.program.css.LengthPercentage | "auto"
    ) => void;
    changeNodeBorder: (
      node_id: NodeID,
      border: grida.program.css.Border | undefined
    ) => void;
    changeNodeProps: (
      node_id: string,
      key: string,
      value?: tokens.StringValueExpression
    ) => void;
    changeNodeComponent: (node_id: NodeID, component: string) => void;
    changeNodeText: (
      node_id: NodeID,
      text?: tokens.StringValueExpression
    ) => void;
    changeNodeStyle: (
      node_id: NodeID,
      key: keyof grida.program.css.ExplicitlySupportedCSSProperties,
      value: any
    ) => void;
    changeNodeMouseCursor: (
      node_id: NodeID,
      mouseCursor: cg.SystemMouseCursor
    ) => void;
    changeNodeSrc: (
      node_id: NodeID,
      src?: tokens.StringValueExpression
    ) => void;
    changeNodeHref: (
      node_id: NodeID,
      href?: grida.program.nodes.i.IHrefable["href"]
    ) => void;
    changeNodeTarget: (
      node_id: NodeID,
      target?: grida.program.nodes.i.IHrefable["target"]
    ) => void;
    changeNodePositioning: (
      node_id: NodeID,
      positioning: grida.program.nodes.i.IPositioning
    ) => void;
    changeNodePositioningMode: (
      node_id: NodeID,
      positioningMode: "absolute" | "relative"
    ) => void;
    changeNodeCornerRadius: (
      node_id: NodeID,
      cornerRadius: grida.program.nodes.i.IRectangleCorner["cornerRadius"]
    ) => void;
    changeNodeFill: (
      node_id: NodeID,
      fill:
        | grida.program.nodes.i.props.SolidPaintToken
        | cg.PaintWithoutID
        | null
    ) => void;
    changeNodeStroke: (
      node_id: NodeID,
      stroke:
        | grida.program.nodes.i.props.SolidPaintToken
        | cg.PaintWithoutID
        | null
    ) => void;
    changeNodeStrokeWidth: (
      node_id: NodeID,
      strokeWidth: TChange<number>
    ) => void;
    changeNodeStrokeCap: (node_id: NodeID, strokeCap: cg.StrokeCap) => void;
    changeNodeFit: (node_id: NodeID, fit: cg.BoxFit) => void;
    changeNodeOpacity: (node_id: NodeID, opacity: TChange<number>) => void;
    changeNodeRotation: (node_id: NodeID, rotation: TChange<number>) => void;
    changeTextNodeFontFamily: (node_id: NodeID, fontFamily: string) => void;
    changeTextNodeFontWeight: (
      node_id: NodeID,
      fontWeight: cg.NFontWeight
    ) => void;
    changeTextNodeFontSize: (
      node_id: NodeID,
      fontSize: TChange<number>
    ) => void;
    changeTextNodeTextAlign: (node_id: NodeID, textAlign: cg.TextAlign) => void;
    changeTextNodeTextAlignVertical: (
      node_id: NodeID,
      textAlignVertical: cg.TextAlignVertical
    ) => void;
    changeTextNodeLineHeight: (
      node_id: NodeID,
      lineHeight: TChange<grida.program.nodes.TextNode["lineHeight"]>
    ) => void;
    changeTextNodeLetterSpacing: (
      node_id: NodeID,
      letterSpacing: TChange<grida.program.nodes.TextNode["letterSpacing"]>
    ) => void;
    changeTextNodeMaxlength: (
      node_id: NodeID,
      maxlength: number | undefined
    ) => void;
    changeContainerNodePadding: (
      node_id: NodeID,
      padding: grida.program.nodes.i.IPadding["padding"]
    ) => void;
    changeNodeBoxShadow: (node_id: NodeID, boxShadow?: cg.BoxShadow) => void;
    changeContainerNodeLayout: (
      node_id: NodeID,
      layout: grida.program.nodes.i.IFlexContainer["layout"]
    ) => void;
    changeFlexContainerNodeDirection: (
      node_id: string,
      direction: cg.Axis
    ) => void;
    changeFlexContainerNodeMainAxisAlignment: (
      node_id: string,
      mainAxisAlignment: cg.MainAxisAlignment
    ) => void;
    changeFlexContainerNodeCrossAxisAlignment: (
      node_id: string,
      crossAxisAlignment: cg.CrossAxisAlignment
    ) => void;
    changeFlexContainerNodeGap: (
      node_id: string,
      gap: number | { mainAxisGap: number; crossAxisGap: number }
    ) => void;
  }

  export interface IBrushToolActions {
    changeBrush(brush: BitmapEditorBrush): void;
    changeBrushSize(size: TChange<number>): void;
    changeBrushOpacity(opacity: TChange<number>): void;
  }

  export interface ICameraActions {
    transform(transform: cmath.Transform): void;
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
    setTool(tool: editor.state.ToolMode): void;
    tryExitContentEditMode(): void;
    tryToggleContentEditMode(): void;
    tryEnterContentEditMode(): void;
    //
    hoverNode(node_id: string, event: "enter" | "leave"): void;
    hoverEnterNode(node_id: string): void;
    hoverLeaveNode(node_id: string): void;

    //
    select(...selectors: grida.program.document.Selector[]): void;
    blur(): void;
    undo(): void;
    redo(): void;
    cut(target: "selection" | NodeID): void;
    copy(target: "selection" | NodeID): void;
    paste(): void;
    duplicate(target: "selection" | NodeID): void;

    setClipboardColor: (color: cg.RGBA8888) => void;
    deleteNode(target: "selection" | NodeID): void;

    //
    selectVertex(node_id: NodeID, vertex: number): void;
    deleteVertex(node_id: NodeID, vertex: number): void;
    //

    //
    createNodeId(): NodeID;
    getNodeById(node_id: NodeID): grida.program.nodes.Node;
    getNodeDepth(node_id: NodeID): number;
    insertNode(prototype: grida.program.nodes.NodePrototype): void;

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
    configureTransformWithCenterOriginModifier(
      transform_with_center_origin: "on" | "off"
    ): void;
    configureTransformWithPreserveAspectRatioModifier(
      transform_with_preserve_aspect_ratio: "on" | "off"
    ): void;
    configureRotateWithQuantizeModifier(
      rotate_with_quantize: number | "off"
    ): void;
    // //
    toggleActive(target: "selection" | NodeID): void;
    toggleLocked(target: "selection" | NodeID): void;
    toggleBold(target: "selection" | NodeID): void;
    // //
    setOpacity(target: "selection" | NodeID, opacity: number): void;

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
}

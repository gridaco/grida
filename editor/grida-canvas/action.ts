import type { editor } from "@/grida-canvas";
import type cmath from "@grida/cmath";
import type { BitmapEditorBrush } from "@grida/bitmap";
import type grida from "@grida/schema";
import type cg from "@grida/cg";
import type vn from "@grida/vn";
import type { GoogleWebFontList } from "@grida/fonts/google";

export type Action =
  | InternalAction
  | DocumentResetAction
  | EditorCameraAction
  | EditorAction
  | EditorClipAction;

export type InternalAction = __InternalWebfontListLoadAction;

/**
 * Document Reset Action
 *
 * Special marker action emitted when the entire document state is replaced via `reset()`.
 * This action is NOT handled by the global actions reducer - it only marks that a full
 * state replacement occurred. Subscribers can check for this action to distinguish
 * between full resets and incremental changes.
 */
export interface DocumentResetAction {
  type: "document/reset";
  /**
   * Unique identifier for this reset operation (auto-generated timestamp if not provided)
   */
  document_key: string;
}

export type EditorAction =
  | EditorConfigAction
  | EditorNudgeGestureStateAction
  | EventTargetAction
  | DocumentAction;

export type DocumentAction =
  | LoadSceneAction
  | SceneAction
  | EditorSelectAction
  | EditorTitleBarHoverAction
  | EditorUITriggeredHoverAction
  | EditorBlurAction
  | EditorCopyCutPasteAction
  | EditorDeleteAction
  | EditorFlattenAction
  | EditorA11yDeleteAction
  | EditorApplyParametricScaleAction
  | EditorHierarchyAction
  | EditorVectorEditorAction
  | EditorVariableWidthAction
  | EditorGradientAction
  | EditorNudgeAction
  | EditorNudgeResizeAction
  | EditorA11yArrowAction
  | EditorA11yAlignAction
  | EditorAlignAction
  | EditorDistributeEvenlyAction
  | EditorAutoLayoutAction
  | EditorContainAction
  | EditorGroupAction
  | EditorUngroupAction
  | EditorBooleanOperationAction
  | DocumentEditorInsertNodeAction
  //
  | SurfaceAction
  //
  | NodeChangeAction
  | NodeToggleUnderlineAction
  | NodeToggleLineThroughAction
  | TemplateNodeOverrideChangeAction
  | TemplateEditorSetTemplatePropsAction
  //
  | SchemaAction;

type NodeID = string & {};
type Vector2 = [number, number];

interface INodeID {
  node_id: NodeID;
}

interface IVertexIdx {
  /**
   * index of the vertex
   */
  vertex: number;
}

interface ISegmentIdx {
  /**
   * index of the segment
   */
  segment: number;
}

interface VertexQuery extends IVertexIdx {
  /**
   * node id (must be a path node)
   */
  node_id: NodeID;
}

interface SegmentQuery extends ISegmentIdx {
  /**
   * node id (must be a path node)
   */
  node_id: NodeID;
}

interface TangentQuery extends IVertexIdx {
  /**
   * node id (must be a path node)
   */
  node_id: NodeID;
  /**
   * tangent index (0 for `a`, 1 for `b`)
   */
  tangent: 0 | 1;
}

interface IVariableWidthStopIdx {
  /**
   * index of the variable width stop
   */
  stop: number;
}

interface VariableWidthStopQuery extends IVariableWidthStopIdx {
  /**
   * node id (must be a variable width node)
   */
  node_id: NodeID;
}

interface IGradientStopIdx {
  /**
   * index of the gradient stop
   */
  stop: number;
}

interface GradientStopQuery extends IGradientStopIdx {
  /**
   * node id (must be a gradient node)
   */
  node_id: NodeID;
  /**
   * index of the paint under fill_paints/stroke_paints
   */
  paint_index?: number;
  /**
   * target paint channel
   */
  paint_target?: "fill" | "stroke";
}

export type TCanvasEventTargetDragGestureState = {
  /**
   * Difference between the current movement and the previous movement.
   */
  delta: Vector2;
  /**
   * Cumulative distance of the gesture. Deltas are summed with their absolute
   * values.
   */
  distance: Vector2;
  /**
   * Displacement of the current gesture.
   */
  movement: Vector2;
  /**
   * Raw values when the gesture started.
   */
  initial: Vector2;
  /**
   * Pointer coordinates (alias to values)
   */
  xy: Vector2;
};

interface ISelection {
  selection: NodeID[];
}

/**
 * load webfont list
 */
export interface __InternalWebfontListLoadAction {
  type: "__internal/webfonts#webfontList";
  webfontlist: GoogleWebFontList;
}

export interface LoadSceneAction {
  type: "load";
  scene: string;
}

export type SceneAction =
  | CreateNewSceneAction
  | DeleteSceneAction
  | DuplicateSceneAction
  | ChangeSceneNameAction
  | ChangeSceneBackgroundAction;

export interface CreateNewSceneAction {
  type: "scenes/new";
  scene?: grida.program.document.SceneInit;
}

export interface DeleteSceneAction {
  type: "scenes/delete";
  scene: string;
}

export interface DuplicateSceneAction {
  type: "scenes/duplicate";
  scene: string;
}

export interface ChangeSceneNameAction {
  type: "scenes/change/name";
  scene: string;
  name: string;
}
export interface ChangeSceneBackgroundAction {
  type: "scenes/change/background-color";
  scene: string;
  backgroundColor: grida.program.document.ISceneBackground["background_color"];
}

export interface EditorSelectAction {
  type: "select";
  /**
   * Selection mode: "reset" (replace), "add" (additive), or "toggle".
   * Defaults to "reset" for backward compatibility.
   * @default "reset"
   */
  mode?: "reset" | "add" | "toggle";
  selection: NodeID[];
}

/**
 * Title bar hover action from DOM events.
 * This sets hovered_node_id and hovered_node_source to "title-bar" to prevent
 * hit-testing from clearing the hover state when moving the pointer within the title bar.
 * This is distinct from hit-testing-based hover which updates hovered_node_id
 * directly in self_updateSurfaceHoverState.
 */
export interface EditorTitleBarHoverAction {
  type: "hover/title-bar";
  event: "enter" | "leave";
  target: NodeID;
}

/**
 * UI-triggered hover action from DOM events (e.g., hierarchy tree).
 * This sets hovered_node_id and hovered_node_source to "hierarchy-tree".
 * This is distinct from hit-testing-based hover which updates hovered_node_id
 * directly in self_updateSurfaceHoverState.
 */
export interface EditorUITriggeredHoverAction {
  type: "hover/ui";
  event: "enter" | "leave";
  target: NodeID;
}

/**
 * @deprecated Use EditorTitleBarHoverAction or EditorUITriggeredHoverAction instead
 */
export type EditorHoverAction =
  | EditorTitleBarHoverAction
  | EditorUITriggeredHoverAction;

export interface EditorBlurAction {
  type: "blur";
}

/**
 * set to editor clipbard
 */
export type EditorClipAction = {
  type: "clip/color";
  color: cg.RGBA32F;
};

// #region copy cut paste
export type EditorCopyCutPasteAction =
  | EditorCopyAction
  | EditorCutAction
  | EditorPasteAction
  | EditorDuplicateAction;

export interface EditorCopyAction {
  type: "copy";
  target: NodeID | "selection";
}

export interface EditorCutAction {
  type: "cut";
  target: NodeID | "selection";
}

export interface EditorPasteAction {
  type: "paste";
  /**
   * @deprecated Vector network paste. Should be removed in favor of clipboard mechanism.
   */
  vector_network?: vn.VectorNetwork;
  target: NodeID | NodeID[];
}

export interface EditorDuplicateAction {
  type: "duplicate";
  target: NodeID | "selection";
}

// #endregion copy cut paste

export interface EditorDeleteAction {
  type: "delete";
  target: NodeID | "selection";
}

export interface EditorFlattenAction {
  type: "flatten";
  target: NodeID | "selection";
}

export interface EditorA11yDeleteAction {
  type: "a11y/delete";
}

export type EditorHierarchyAction =
  | EditorHierarchyOrderAction
  | EditorHierarchyMoveAction;

export interface EditorHierarchyOrderAction {
  type: "order";
  target: NodeID | "selection";
  order: "front" | "back" | number;
}

export interface EditorHierarchyMoveAction {
  type: "mv";
  source: NodeID[];
  target: NodeID;
  index?: number;
}

// #region [vector]
export type EditorVectorEditorAction =
  | EditorVectorSelectVertexAction
  | EditorVectorDeleteVertexAction
  | EditorVectorSelectSegmentAction
  | EditorVectorDeleteSegmentAction
  | EditorVectorSplitSegmentAction
  | EditorVectorSelectTangentAction
  | EditorVectorDeleteTangentAction
  | EditorVectorTranslateVertexAction
  | EditorVectorTranslateSegmentAction
  | EditorVectorBendSegmentAction
  | EditorVectorPlanarizeAction
  | EditorVectorBendOrClearCornerAction
  | EditorVectorUpdateHoveredControlAction;

export interface EditorVectorSelectVertexAction {
  type: "select-vertex";
  target: VertexQuery;
  /** if true, toggle selection instead of resetting */
  additive?: boolean;
}

export interface EditorVectorDeleteVertexAction {
  type: "delete-vertex";
  target: VertexQuery;
}

export interface EditorVectorSelectSegmentAction {
  type: "select-segment";
  target: SegmentQuery;
  /** if true, toggle selection instead of resetting */
  additive?: boolean;
}

export interface EditorVectorDeleteSegmentAction {
  type: "delete-segment";
  target: SegmentQuery;
}

export interface EditorVectorSplitSegmentAction {
  type: "split-segment";
  target: {
    node_id: string;
    point: vn.PointOnSegment;
  };
}

export interface EditorVectorSelectTangentAction {
  type: "select-tangent";
  target: TangentQuery;
  /** if true, toggle selection instead of resetting */
  additive?: boolean;
}

export interface EditorVectorDeleteTangentAction {
  type: "delete-tangent";
  target: TangentQuery;
}

export interface EditorVectorTranslateVertexAction {
  type: "translate-vertex";
  target: VertexQuery;
  delta: cmath.Vector2;
}

export interface EditorVectorTranslateSegmentAction {
  type: "translate-segment";
  target: SegmentQuery;
  delta: cmath.Vector2;
}

export interface EditorVectorBendSegmentAction {
  type: "bend-segment";
  target: SegmentQuery;
  /** parametric position (0-1) where the bend gesture started */
  ca: number;
  /** current cursor position in node space */
  cb: cmath.Vector2;
  /** frozen original segment state */
  frozen: {
    a: cmath.Vector2;
    b: cmath.Vector2;
    ta: cmath.Vector2;
    tb: cmath.Vector2;
  };
}

export interface EditorVectorBendOrClearCornerAction {
  type: "bend-or-clear-corner";
  target: VertexQuery & { ref?: "ta" | "tb" };
  /**
   * If provided, explicitly sets corner tangents to this value (or clears when 0).
   * When omitted, the corner is bent or cleared based on existing tangents.
   */
  tangent?: Vector2 | 0;
}

export interface EditorVectorPlanarizeAction {
  type: "vector/planarize";
  target: NodeID | NodeID[];
}

// #region [variable width]
export type EditorVariableWidthAction =
  | EditorVariableWidthSelectStopAction
  | EditorVariableWidthDeleteStopAction
  | EditorVariableWidthAddStopAction;

export interface EditorVariableWidthSelectStopAction {
  type: "variable-width/select-stop";
  target: VariableWidthStopQuery;
}

export interface EditorVariableWidthDeleteStopAction {
  type: "variable-width/delete-stop";
  target: VariableWidthStopQuery;
}

export interface EditorVariableWidthAddStopAction {
  type: "variable-width/add-stop";
  target: {
    node_id: string;
    u: number; // parametric position 0-1
    r: number; // radius
  };
}

// #endregion [variable width]

export interface EditorVectorUpdateHoveredControlAction {
  type: "vector/update-hovered-control";
  hoveredControl: {
    type: editor.state.VectorContentEditModeHoverableGeometryControlType;
    index: number;
  } | null;
}
// #endregion

// #region [gradient]
export type EditorGradientAction = EditorSelectGradientStopAction;

export interface EditorSelectGradientStopAction {
  type: "select-gradient-stop";
  target: GradientStopQuery;
}

// #endregion [gradient]

/**
 * [Nudge]
 *
 * Nudge, usually triggered by arrow keys, translates the selected nodes by a exact amount.
 * Unlike dragging, nudge does not snaps to pixel grid or other objects.
 */
export interface EditorNudgeAction {
  type: "nudge";
  target: NodeID | "selection";
  axis: "x" | "y";
  delta: number;
}

/**
 * [NudgeResize]
 *
 * NudgeResize, usually triggered by ctrl + alt + arrow keys, resizes the selected nodes by a exact amount.
 * Unlike dragging, nudge does not snaps to pixel grid or other objects.
 */
export interface EditorNudgeResizeAction {
  type: "nudge-resize";
  target: NodeID | "selection";
  axis: "x" | "y";
  delta: number;
}

/**
 * [A11yArrowAction]
 *
 * This binds to keyboard arrow keys for accessibility.
 *
 * - For fixed positioning, this will trigger nudge (translate) action.
 * - For non-fixed positioning, this will trigger order action. (e.g. item in a flex container)
 */
export interface EditorA11yArrowAction {
  type: "a11y/up" | "a11y/down" | "a11y/left" | "a11y/right";
  target: NodeID | "selection";
  shiftKey?: boolean;
}

export interface EditorA11yAlignAction {
  type: "a11y/align";
  alignment: {
    horizontal?: "min" | "max" | "center";
    vertical?: "min" | "max" | "center";
  };
}

export interface EditorAlignAction {
  type: "align";
  target: NodeID | "selection";
  alignment: {
    horizontal?: "none" | "min" | "max" | "center";
    vertical?: "none" | "min" | "max" | "center";
  };
}

export interface EditorDistributeEvenlyAction {
  type: "distribute-evenly";
  target: NodeID[] | "selection";
  axis: "x" | "y";
}

export type EditorAutoLayoutAction = {
  type: "autolayout";
} & (
  | {
      /**
       * if true, the nodes will be wrapped into a new container.
       * if false, the target is expected to be exactly one, and needs to be a container.
       */
      contain: true;
      target: NodeID[] | "selection";
    }
  | {
      /**
       * if true, the nodes will be wrapped into a new container.
       * if false, the target is expected to be exactly one, and needs to be a container.
       */
      contain: false;
      target: NodeID;
    }
);

export interface EditorContainAction {
  type: "contain";
  target: NodeID[] | "selection";
}

export interface EditorGroupAction {
  type: "group";
  target: NodeID[] | "selection";
}

export interface EditorBooleanOperationAction {
  type: "group-op";
  target: ReadonlyArray<NodeID>;
  op: cg.BooleanOperation;
}

export interface EditorUngroupAction {
  type: "ungroup";
  target: NodeID[] | "selection";
}

export interface EditorApplyParametricScaleAction {
  type: "apply-scale";
  /**
   * root targets (selection roots)
   */
  targets: NodeID[];
  /**
   * delta scale factor to apply for this command (e.g. 1.5).
   */
  factor: number;
  origin: "center" | cmath.CardinalDirection;
  include_subtree: boolean;

  /**
   * Coordinate space interpretation for layout geometry (`left/top/...`).
   *
   * - `auto` (default): best-effort UX semantics; may override selection-root `left/top`
   *   so origin behaves selection-local for root-level nodes (scene direct children).
   * - `global`: purely multiply numeric layout fields by factor (developer/math usage).
   */
  space?: "auto" | "global";
}

export type EditorConfigAction =
  | EditorConfigure_RaycastTargeting
  | EditorConfigure_Measurement
  | EditorConfigureModifier_TranslateWithClone
  | EditorConfigureModifier_TranslateWithAxisLock
  | EditorConfigureModifier_TranslateWithForceDisableSnap
  | EditorConfigureModifier_ScaleWithForceDisableSnap
  | EditorConfigureModifier_TransformWithCenterOrigin
  | EditorConfigureModifier_TransformWithPreserveAspectRatio
  | EditorConfigureModifier_RotateWithQuantize
  | EditorConfigureModifier_PathKeepProjecting
  | EditorConfigureModifier_CurveTangentMirroring
  | EditorConfigureModifier_PaddingWithMirroring;

export interface EditorConfigure_RaycastTargeting {
  type: "config/surface/raycast-targeting";
  config: Partial<editor.state.HitTestingConfig>;
}

export interface EditorConfigure_Measurement {
  type: "config/surface/measurement";
  measurement: "on" | "off";
}

export interface EditorConfigureModifier_TranslateWithClone {
  type: "config/modifiers/translate-with-clone";
  translate_with_clone: "on" | "off";
}
export interface EditorConfigureModifier_TranslateWithAxisLock {
  type: "config/modifiers/translate-with-axis-lock";
  tarnslate_with_axis_lock: "on" | "off";
}

export interface EditorConfigureModifier_TranslateWithForceDisableSnap {
  type: "config/modifiers/translate-with-force-disable-snap";
  translate_with_force_disable_snap: "on" | "off";
}

export interface EditorConfigureModifier_ScaleWithForceDisableSnap {
  type: "config/modifiers/scale-with-force-disable-snap";
  scale_with_force_disable_snap: "on" | "off";
}

export interface EditorConfigureModifier_TransformWithCenterOrigin {
  type: "config/modifiers/transform-with-center-origin";
  transform_with_center_origin: "on" | "off";
}

export interface EditorConfigureModifier_TransformWithPreserveAspectRatio {
  type: "config/modifiers/transform-with-preserve-aspect-ratio";
  transform_with_preserve_aspect_ratio: "on" | "off";
}

export interface EditorConfigureModifier_RotateWithQuantize {
  type: "config/modifiers/rotate-with-quantize";
  rotate_with_quantize: number | "off";
}

export interface EditorConfigureModifier_PathKeepProjecting {
  type: "config/modifiers/path-keep-projecting";
  path_keep_projecting: "on" | "off";
}

export interface EditorConfigureModifier_CurveTangentMirroring {
  type: "config/modifiers/curve-tangent-mirroring";
  curve_tangent_mirroring: vn.TangentMirroringMode;
}

export interface EditorConfigureModifier_PaddingWithMirroring {
  type: "config/modifiers/padding-with-mirroring";
  padding_with_axis_mirroring: "on" | "off";
}

/**
 * [gesture/nudge] - used with `nudge` {@link EditorNudgeAction} or `nudge-resize` {@link EditorNudgeResizeAction}
 *
 * By default, nudge is not a gesture, but a command. Unlike dragging, nudge does not has a "duration", as it's snap guides cannot be displayed.
 * To mimic the nudge as a gesture (mostly when needed to display snap guides), use this action.
 *
 * @example when `nudge`, also call `gesture/nudge` to display snap guides. after certain duration, call `gesture/nudge` with `state: "off"`
 */
export interface EditorNudgeGestureStateAction {
  type: "gesture/nudge";
  state: "on" | "off";
}

interface IHtmlBackendCanvasEventTargetPointerEvent {
  /**
   * The node ids from the point.
   *
   * use document.elementFromPoint with filtering
   */
  node_ids_from_point: string[];
  shiftKey: boolean;
}

interface ICanvasEventTargetDragEvent {
  event: TCanvasEventTargetDragGestureState;
}

export type EditorCameraAction = {
  type: "transform";
  transform: cmath.Transform;
  /**
   * if true, the transform will also re-calculate the cursor position.
   */
  sync: boolean;
};

export type EventTargetAction =
  //
  | EditorEventTarget_PointerMove
  | EditorEventTarget_PointerMoveRaycast
  | EditorEventTarget_PointerDown
  | EditorEventTarget_PointerUp
  | EditorEventTarget_Click
  | EditorEventTarget_DoubleClick
  | EditorEventTarget_DragStart
  | EditorEventTarget_Drag
  | EditorEventTarget_DragEnd
  //
  | EditorEventTarget_MultipleSelectionLayer_Click;

export type EditorEventTarget_PointerMove = {
  type: "event-target/event/on-pointer-move";
  /**
   * position in canvas space - need to pass a resolved value
   */
  position_canvas: {
    x: number;
    y: number;
  };

  position_client: {
    x: number;
    y: number;
  };
};

export type EditorEventTarget_PointerMoveRaycast =
  IHtmlBackendCanvasEventTargetPointerEvent & {
    type: "event-target/event/on-pointer-move-raycast";
    /**
     * position in canvas space - need to pass a resolved value
     */
    position: {
      x: number;
      y: number;
    };
  };

export type EditorEventTarget_PointerDown =
  IHtmlBackendCanvasEventTargetPointerEvent & {
    type: "event-target/event/on-pointer-down";
  };

export type EditorEventTarget_PointerUp = {
  type: "event-target/event/on-pointer-up";
};

export type EditorEventTarget_Click =
  IHtmlBackendCanvasEventTargetPointerEvent & {
    type: "event-target/event/on-click";
  };

export type EditorEventTarget_DoubleClick = {
  type: "event-target/event/on-double-click";
};

export type EditorEventTarget_DragStart = {
  type: "event-target/event/on-drag-start";
  /**
   * @deprecated
   */
  shiftKey: boolean;
};

export type EditorEventTarget_Drag = ICanvasEventTargetDragEvent & {
  type: "event-target/event/on-drag";
};

export type EditorEventTarget_DragEnd = {
  type: "event-target/event/on-drag-end";
  node_ids_from_area?: string[];
  shiftKey: boolean;
};

//
export type EditorEventTarget_MultipleSelectionLayer_Click = ISelection &
  IHtmlBackendCanvasEventTargetPointerEvent & {
    type: "event-target/event/multiple-selection-overlay/on-click";
  };

// #region surface action
export type SurfaceAction =
  | EditorSurface_RulerAndGuideAction
  | EditorSurface_PixelGridStateAction
  | EditorSurface_ChangeBrushAction
  | EditorSurface_ChangeBrushSizeAction
  | EditorSurface_ChangeBrushOpacityAction
  | EditorSurface_EnterContentEditMode
  | EditorSurface_EnterPaintGradientContentEditMode
  | EditorSurface_EnterPaintImageContentEditMode
  | EditorSurface_ExitContentEditMode
  //
  | EditorSurface_CursorMode
  | EditorSurface_StartGesture;

type EditorSurface_RulerAndGuideAction =
  | EditorSurface_RulerStateAction
  | EditorSurface_DeleteGuideAction;

export interface EditorSurface_RulerStateAction {
  type: "surface/ruler";
  state: "on" | "off";
}

export interface EditorSurface_PixelGridStateAction {
  type: "surface/pixel-grid";
  state: "on" | "off";
}

export interface EditorSurface_ChangeBrushAction {
  type: "surface/brush";
  brush: BitmapEditorBrush;
}

export interface EditorSurface_ChangeBrushSizeAction {
  type: "surface/brush/size";
  size: editor.api.NumberChange;
}

export interface EditorSurface_ChangeBrushOpacityAction {
  type: "surface/brush/opacity";
  opacity: editor.api.NumberChange;
}

export interface EditorSurface_DeleteGuideAction {
  type: "surface/guide/delete";
  idx: number;
}

export type EditorSurface_EnterContentEditMode = {
  type: "surface/content-edit-mode/try-enter";
};

export type EditorSurface_EnterPaintGradientContentEditMode = {
  node_id: string;
  type: "surface/content-edit-mode/paint/gradient";
  paint_target?: "fill" | "stroke";
  paint_index?: number;
};

export type EditorSurface_EnterPaintImageContentEditMode = {
  node_id: string;
  type: "surface/content-edit-mode/paint/image";
  paint_target: "fill" | "stroke";
  paint_index: number;
};

export type EditorSurface_ExitContentEditMode = {
  type: "surface/content-edit-mode/try-exit";
};

export type EditorSurface_CursorMode = {
  type: "surface/tool";
  tool: editor.state.ToolMode;
};

export type EditorSurface_StartGesture = {
  type: "surface/gesture/start";
  gesture:
    | Pick<editor.gesture.GestureGuide, "type" | "axis" | "idx">
    | Pick<editor.gesture.GestureScale, "type" | "direction" | "selection">
    | Pick<editor.gesture.GestureRotate, "type" | "selection">
    | (Pick<editor.gesture.GestureSort, "type" | "node_id"> & {
        selection: string[];
      })
    | (Pick<editor.gesture.GestureGap, "type" | "axis"> & {
        selection: string | string[];
      })
    | Pick<editor.gesture.GesturePadding, "type" | "node_id" | "side">
    | Pick<editor.gesture.GestureCornerRadius, "type" | "node_id" | "anchor">
    | Pick<
        editor.gesture.GestureCurve,
        "type" | "control" | "node_id" | "segment"
      >
    | Pick<editor.gesture.GestureTranslateVectorControls, "type" | "node_id">
    | Pick<
        editor.gesture.GestureTranslateVariableWidthStop,
        "type" | "node_id" | "stop"
      >
    | Pick<
        editor.gesture.GestureResizeVariableWidthStop,
        "type" | "node_id" | "stop" | "side"
      >;
};

// #endregion surface action

export type DocumentEditorInsertNodeAction = {
  type: "insert";
} & (
  | {
      id?: string;
      prototype: grida.program.nodes.NodePrototype;
    }
  | {
      document: grida.program.document.IPackedSceneDocument;
    }
);

interface ITemplateInstanceNodeID {
  template_instance_node_id: string;
}

type INodeChangePositioningAction = INodeID &
  Partial<grida.program.nodes.i.IPositioning>;

type INodeChangePositioningModeAction = INodeID &
  Required<Pick<grida.program.nodes.UnknwonNode, "position">>;

type INodeChangeComponentAction = INodeID &
  Required<Pick<grida.program.nodes.UnknwonNode, "component_id">>;

interface ITextNodeChangeFontFamilyAction extends INodeID {
  fontFamily: string | undefined;
}

interface INodeChangeStyleAction extends INodeID {
  style: Partial<React.CSSProperties>;
}

interface INodeChangePropsAction extends INodeID {
  props: Partial<grida.program.nodes.i.IProps["props"]>;
}

export type NodeChangeAction =
  | ({
      type: "node/change/*";
      node_id: string;
    } & Partial<Omit<grida.program.nodes.UnknwonNode, "type">>)
  | ({ type: "node/change/positioning" } & INodeChangePositioningAction)
  | ({
      type: "node/change/positioning-mode";
    } & INodeChangePositioningModeAction)
  | ({ type: "node/change/component" } & INodeChangeComponentAction)
  | ({ type: "node/change/fontFamily" } & ITextNodeChangeFontFamilyAction)
  | ({ type: "node/change/style" } & INodeChangeStyleAction)
  | ({ type: "node/change/props" } & INodeChangePropsAction);
export type NodeToggleUnderlineAction = {
  type: "node/toggle/underline";
} & INodeID;

export type NodeToggleLineThroughAction = {
  type: "node/toggle/line-through";
} & INodeID;

export type TemplateNodeOverrideChangeAction = ITemplateInstanceNodeID & {
  type: "document/template/override/change/*";
  action: NodeChangeAction;
};

export interface TemplateEditorSetTemplatePropsAction {
  type: "document/template/set/props";
  data: Record<string, any>;
}

// === WIP ===

export type SchemaAction =
  | DocumentSchemaDefinePropertyAction
  | DocumentSchemaDeletePropertyAction
  | DocumentSchemaRenamePropertyAction
  | DocumentSchemaUpdatePropertyAction
  | DocumentSchemaPutPropertyAction;

export interface DocumentSchemaDefinePropertyAction {
  type: "document/properties/define";
  key?: string;
  definition?: grida.program.schema.PropertyDefinition;
}

export interface DocumentSchemaUpdatePropertyAction {
  type: "document/properties/update";
  key: string;
  definition: grida.program.schema.PropertyDefinition;
}

export interface DocumentSchemaPutPropertyAction {
  type: "document/properties/put";
  key: string;
  definition: grida.program.schema.PropertyDefinition;
}

export interface DocumentSchemaRenamePropertyAction {
  type: "document/properties/rename";
  key: string;
  newKey: string;
}

export interface DocumentSchemaDeletePropertyAction {
  type: "document/properties/delete";
  key: string;
}

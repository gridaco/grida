import type { editor } from "@/grida-canvas";
import type cmath from "@grida/cmath";
import type { BitmapEditorBrush } from "@grida/bitmap";
import type grida from "@grida/schema";
import type cg from "@grida/cg";

export type Action =
  | InternalAction
  | EditorCameraAction
  | EditorAction
  | EditorUndoAction
  | EditorRedoAction
  | EditorClipAction;

export type InternalAction = __InternalResetAction;

export type EditorAction =
  | EditorConfigAction
  | EditorNudgeGestureStateAction
  | EventTargetAction
  | DocumentAction;

export type DocumentAction =
  | LoadSceneAction
  | SceneAction
  | EditorSelectAction
  | EditorHoverAction
  | EditorBlurAction
  | EditorCopyCutPasteAction
  | EditorDeleteAction
  | EditorHierarchyAction
  | EditorVectorEditorAction
  | EditorGradientAction
  | EditorNudgeAction
  | EditorNudgeResizeAction
  | EditorA11yArrowAction
  | EditorAlignAction
  | EditorDistributeEvenlyAction
  | EditorAutoLayoutAction
  | EditorContainAction
  | DocumentEditorInsertNodeAction
  //
  | SurfaceAction
  //
  | NodeChangeAction
  | NodeToggleBoldAction
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

export interface __InternalResetAction {
  type: "__internal/reset";
  key?: string;
  state: editor.state.IEditorState;
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
  backgroundColor: grida.program.document.ISceneBackground["backgroundColor"];
}

export interface EditorSelectAction {
  type: "select";
  selection: NodeID[];
}

export interface EditorHoverAction {
  type: "hover";
  event: "enter" | "leave";
  target: NodeID;
}

export interface EditorBlurAction {
  type: "blur";
}

export type EditorUndoAction = {
  type: "undo";
};

export type EditorRedoAction = {
  type: "redo";
};

/**
 * set to editor clipbard
 */
export type EditorClipAction = {
  type: "clip/color";
  color: cg.RGBA8888;
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
  | EditorVectorHoverVertexAction
  | EditorVectorSelectVertexAction
  | EditorVectorDeleteVertexAction
  | EditorVectorSelectSegmentAction
  | EditorVectorDeleteSegmentAction
  | EditorVectorSplitSegmentAction;

export interface EditorVectorHoverVertexAction {
  type: "hover-vertex";
  event: "enter" | "leave";
  target: VertexQuery;
}

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
    segment: number;
  };
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

export interface EditorAutoLayoutAction {
  type: "autolayout";
  target: NodeID[] | "selection";
}

export interface EditorContainAction {
  type: "contain";
  target: NodeID[] | "selection";
}

export type EditorConfigAction =
  | EditorConfigure_RaycastTargeting
  | EditorConfigure_Measurement
  | EditorConfigureModifier_TranslateWithClone
  | EditorConfigureModifier_TranslateWithAxisLock
  | EditorConfigureModifier_TransformWithCenterOrigin
  | EditorConfigureModifier_TransformWithPreserveAspectRatio
  | EditorConfigureModifier_RotateWithQuantize;

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
  | EditorSurface_EnterFillGradientContentEditMode
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

export type EditorSurface_EnterFillGradientContentEditMode = {
  node_id: string;
  type: "surface/content-edit-mode/fill/gradient";
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
    | Pick<editor.gesture.GestureCornerRadius, "type" | "node_id">
    | Pick<
        editor.gesture.GestureCurve,
        "type" | "control" | "node_id" | "segment"
      >
    | Pick<
        editor.gesture.GestureTranslateSegment,
        "type" | "node_id" | "segment"
      >
    | Pick<
        editor.gesture.GestureTranslateVertex,
        "type" | "node_id" | "vertex"
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

export type NodeToggleBoldAction = { type: "node/toggle/bold" } & INodeID;

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

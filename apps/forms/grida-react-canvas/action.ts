import type { tokens } from "@grida/tokens";
import type { grida } from "@/grida";
import type {
  CursorMode,
  GestureCornerRadius,
  GestureCurve,
  GestureRotate,
  GestureScale,
  GestureTranslateVertex,
  IDocumentEditorState,
  SurfaceRaycastTargeting,
} from "./state";
import { cmath } from "@grida/cmath";

export type Action =
  | InternalAction
  | EditorCameraAction
  | EditorAction
  | EditorUndoAction
  | EditorRedoAction;

export type InternalAction = __InternalResetAction;

export type EditorAction =
  | EditorConfigAction
  | EditorNudgeGestureStateAction
  | EventTargetAction
  | DocumentAction;

export type DocumentAction =
  | EditorSelectAction
  | EditorHoverAction
  | EditorBlurAction
  | EditorCopyCutPasteAction
  | EditorDeleteAction
  | EditorOrderAction
  | EditorPathAction
  | EditorNudgeAction
  | EditorNudgeResizeAction
  | EditorA11yArrowAction
  | EditorAlignAction
  | EditorDistributeEvenlyAction
  | DocumentEditorInsertNodeAction
  //
  | SurfaceAction
  //
  | NodeChangeAction
  | NodeToggleBasePropertyAction
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

interface VertexQuery extends IVertexIdx {
  /**
   * node id (must be a path node)
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
  state: IDocumentEditorState;
}

export interface EditorSelectAction {
  type: "select";
  selectors: grida.program.document.Selector[];
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

export interface EditorOrderAction {
  type: "order";
  target: NodeID | "selection";
  order: "front" | "back" | number;
}

// #region [path]
export type EditorPathAction =
  | EditorDeleteVertexAction
  | EditorSelectVertexAction
  | EditorHoverVertexAction;

export interface EditorDeleteVertexAction {
  type: "delete-vertex";
  target: VertexQuery;
}

export interface EditorSelectVertexAction {
  type: "select-vertex";
  target: VertexQuery;
}

export interface EditorHoverVertexAction {
  type: "hover-vertex";
  event: "enter" | "leave";
  target: VertexQuery;
}
// #endregion

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
  config: Partial<SurfaceRaycastTargeting>;
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
  position: {
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
  | EditorSurface_EnterContentEditMode
  | EditorSurface_ExitContentEditMode
  //
  | EditorSurface_CursorMode
  | EditorSurface_StartGesture;

export type EditorSurface_EnterContentEditMode = {
  type: "surface/content-edit-mode/try-enter";
};

export type EditorSurface_ExitContentEditMode = {
  type: "surface/content-edit-mode/try-exit";
};

export type EditorSurface_CursorMode = {
  type: "surface/cursor-mode";
  cursor_mode: CursorMode;
};

export type EditorSurface_StartGesture = {
  type: "surface/gesture/start";
  gesture:
    | Pick<GestureScale, "type" | "direction" | "selection">
    | Pick<GestureRotate, "type" | "selection">
    | Pick<GestureCornerRadius, "type" | "node_id" | "direction">
    | Pick<GestureCurve, "type" | "control" | "node_id" | "segment">
    | Pick<GestureTranslateVertex, "type" | "node_id" | "vertex">;
};

// #endregion surface action

export interface DocumentEditorInsertNodeAction {
  type: "insert";
  prototype: grida.program.nodes.NodePrototype;
}

interface ITemplateInstanceNodeID {
  template_instance_node_id: string;
}

interface INodeChangeNameAction extends INodeID {
  name: string;
}

interface INodeChangeUserDataAction extends INodeID {
  userdata: grida.program.nodes.i.IBaseNode["userdata"];
}

interface INodeChangeActiveAction extends INodeID {
  active: boolean;
}

interface INodeChangeLockedAction extends INodeID {
  locked: boolean;
}

interface INodeChangePositioningAction extends INodeID {
  positioning: Partial<grida.program.nodes.i.IPositioning>;
}

interface INodeChangePositioningModeAction extends INodeID {
  position: grida.program.nodes.i.IPositioning["position"];
}

interface INodeChangeComponentAction extends INodeID {
  component_id: string;
}

interface INodeChangeTextAction extends INodeID {
  text?: tokens.StringValueExpression;
}

interface INodeChangeOpacityAction extends INodeID {
  opacity: TChange<number>;
}

interface INodeChangeSizeAction extends INodeID {
  axis: "width" | "height";
  value: grida.program.css.LengthPercentage | "auto";
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

interface INodeChangeRotationAction extends INodeID {
  rotation: TChange<grida.program.nodes.i.IRotation["rotation"]>;
}

interface INodeChangeCornerRadiusAction extends INodeID {
  cornerRadius: number | grida.program.nodes.i.IRectangleCorner["cornerRadius"];
}

interface INodeChangeFillAction extends INodeID {
  fill: grida.program.cg.PaintWithoutID | null;
}

interface INodeChangeStrokeAction extends INodeID {
  stroke: grida.program.cg.PaintWithoutID | null;
}

interface INodeChangeStrokeWidthAction extends INodeID {
  strokeWidth: TChange<number>;
}

interface INodeChangeStrokeCapAction extends INodeID {
  strokeCap: grida.program.cg.StrokeCap;
}

interface INodeChangeBorderAction extends INodeID {
  border: grida.program.css.Border | undefined;
}

interface INodeChangeFitAction extends INodeID {
  fit: grida.program.cg.BoxFit;
}

interface ITextNodeChangeFontFamilyAction extends INodeID {
  fontFamily: string | undefined;
}

interface ITextNodeChangeFontWeightAction extends INodeID {
  fontWeight: grida.program.cg.NFontWeight;
}
interface ITextNodeChangeFontSizeAction extends INodeID {
  fontSize: TChange<number>;
}
interface ITextNodeChangeTextAlignAction extends INodeID {
  textAlign: grida.program.cg.TextAlign;
}

interface ITextNodeChangeTextAlignVerticalAction extends INodeID {
  textAlignVertical: grida.program.cg.TextAlignVertical;
}

interface ITextNodeChangeLineHeightAction extends INodeID {
  lineHeight: TChange<grida.program.nodes.TextNode["lineHeight"]>;
}

interface ITextNodeChangeLetterSpacingAction extends INodeID {
  letterSpacing: TChange<grida.program.nodes.TextNode["letterSpacing"]>;
}

interface ITextNodeChangeMaxlengthAction extends INodeID {
  maxlength: number | undefined;
}

//
interface INodeChangePaddingAction extends INodeID {
  padding: grida.program.nodes.i.IPadding["padding"];
}

interface INodeChangeBoxShadowAction extends INodeID {
  boxShadow?: grida.program.nodes.i.IBoxShadow["boxShadow"];
}

// #region layout
interface INodeChangeLayoutAction extends INodeID {
  layout: grida.program.nodes.i.IFlexContainer["layout"];
}

interface IFlexContainerNodeChangeDirectionAction extends INodeID {
  direction: grida.program.nodes.i.IFlexContainer["direction"];
}

interface IFlexContainerNodeChangeMainAxisAlignmentAction extends INodeID {
  mainAxisAlignment: grida.program.nodes.i.IFlexContainer["mainAxisAlignment"];
}

interface IFlexContainerNodeChangeCrossAxisAlignmentAction extends INodeID {
  crossAxisAlignment: grida.program.nodes.i.IFlexContainer["crossAxisAlignment"];
}

interface IFlexContainerNodeChangeGapAction extends INodeID {
  gap: number | { mainAxisGap: number; crossAxisGap: number };
}

interface IFlexContainerNodeChangeMainAxisGapAction extends INodeID {
  mainAxisGap: grida.program.nodes.i.IFlexContainer["mainAxisGap"];
}

interface IFlexContainerNodeChangeCrossAxisGapAction extends INodeID {
  crossAxisGap: grida.program.nodes.i.IFlexContainer["crossAxisGap"];
}

interface INodeChangeMouseCursorAction extends INodeID {
  cursor: grida.program.cg.SystemMouseCursor;
}

interface INodeChangeStyleAction extends INodeID {
  style: Partial<React.CSSProperties>;
}

interface INodeChangeSrcAction extends INodeID {
  src?: tokens.StringValueExpression;
}

interface INodeChangeHrefAction extends INodeID {
  href?: grida.program.nodes.i.IHrefable["href"];
}

interface INodeChangeTargetAction extends INodeID {
  target?: grida.program.nodes.i.IHrefable["target"];
}

interface INodeChangePropsAction extends INodeID {
  props: Partial<grida.program.nodes.i.IProps["props"]>;
}

export type NodeChangeAction =
  | ({ type: "node/change/name" } & INodeChangeNameAction)
  | ({ type: "node/change/userdata" } & INodeChangeUserDataAction)
  | ({ type: "node/change/active" } & INodeChangeActiveAction)
  | ({ type: "node/change/locked" } & INodeChangeLockedAction)
  | ({ type: "node/change/positioning" } & INodeChangePositioningAction)
  | ({
      type: "node/change/positioning-mode";
    } & INodeChangePositioningModeAction)
  | ({ type: "node/change/component" } & INodeChangeComponentAction)
  | ({ type: "node/change/text" } & INodeChangeTextAction)
  | ({ type: "node/change/opacity" } & INodeChangeOpacityAction)
  | ({ type: "node/change/rotation" } & INodeChangeRotationAction)
  | ({ type: "node/change/size" } & INodeChangeSizeAction)
  | ({ type: "node/change/cornerRadius" } & INodeChangeCornerRadiusAction)
  | ({ type: "node/change/fill" } & INodeChangeFillAction)
  | ({ type: "node/change/stroke" } & INodeChangeStrokeAction)
  | ({ type: "node/change/stroke-width" } & INodeChangeStrokeWidthAction)
  | ({ type: "node/change/stroke-cap" } & INodeChangeStrokeCapAction)
  | ({ type: "node/change/border" } & INodeChangeBorderAction)
  | ({ type: "node/change/fit" } & INodeChangeFitAction)
  //
  | ({ type: "node/change/fontFamily" } & ITextNodeChangeFontFamilyAction)
  | ({ type: "node/change/fontWeight" } & ITextNodeChangeFontWeightAction)
  | ({ type: "node/change/fontSize" } & ITextNodeChangeFontSizeAction)
  | ({ type: "node/change/textAlign" } & ITextNodeChangeTextAlignAction)
  | ({
      type: "node/change/textAlignVertical";
    } & ITextNodeChangeTextAlignVerticalAction)
  | ({ type: "node/change/lineHeight" } & ITextNodeChangeLineHeightAction)
  | ({ type: "node/change/letterSpacing" } & ITextNodeChangeLetterSpacingAction)
  | ({ type: "node/change/maxlength" } & ITextNodeChangeMaxlengthAction)
  //
  | ({
      type: "node/change/padding";
    } & INodeChangePaddingAction)
  | ({
      type: "node/change/box-shadow";
    } & INodeChangeBoxShadowAction)
  //
  | ({
      type: "node/change/layout";
    } & INodeChangeLayoutAction)
  | ({
      type: "node/change/direction";
    } & IFlexContainerNodeChangeDirectionAction)
  | ({
      type: "node/change/mainAxisAlignment";
    } & IFlexContainerNodeChangeMainAxisAlignmentAction)
  | ({
      type: "node/change/crossAxisAlignment";
    } & IFlexContainerNodeChangeCrossAxisAlignmentAction)
  | ({
      type: "node/change/gap";
    } & IFlexContainerNodeChangeGapAction)
  | ({
      type: "node/change/mainAxisGap";
    } & IFlexContainerNodeChangeMainAxisGapAction)
  | ({
      type: "node/change/crossAxisGap";
    } & IFlexContainerNodeChangeCrossAxisGapAction)
  //
  | ({ type: "node/change/mouse-cursor" } & INodeChangeMouseCursorAction)
  | ({ type: "node/change/style" } & INodeChangeStyleAction)
  | ({ type: "node/change/src" } & INodeChangeSrcAction)
  | ({ type: "node/change/href" } & INodeChangeHrefAction)
  | ({ type: "node/change/target" } & INodeChangeTargetAction)
  | ({ type: "node/change/props" } & INodeChangePropsAction);

export type NodeToggleBasePropertyAction =
  | ({ type: "node/toggle/active" } & INodeID)
  | ({ type: "node/toggle/locked" } & INodeID);

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
  | DocumentSchemaUpdatePropertyAction;

export interface DocumentSchemaDefinePropertyAction {
  type: "document/schema/property/define";
  name?: string;
  definition?: grida.program.schema.PropertyDefinition;
}

export interface DocumentSchemaUpdatePropertyAction {
  type: "document/schema/property/update";
  name: string;
  definition: grida.program.schema.PropertyDefinition;
}

export interface DocumentSchemaRenamePropertyAction {
  type: "document/schema/property/rename";
  name: string;
  newName: string;
}

export interface DocumentSchemaDeletePropertyAction {
  type: "document/schema/property/delete";
  name: string;
}

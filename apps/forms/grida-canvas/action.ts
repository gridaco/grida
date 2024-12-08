import type { Tokens } from "@/ast";
import type { grida } from "@/grida";
import type {
  CursorMode,
  IDocumentEditorState,
  SurfaceRaycastTargeting,
} from "./types";
import type { cmath } from "./cmath";

export type BuilderAction =
  | __InternalSyncArtboardOffset
  | __InternalResetAction
  | EditorConfigAction
  | EventTargetAction
  | HistoryAction;

export type HistoryAction =
  | EditorUndoAction
  | EditorRedoAction
  | DocumentAction;

export type DocumentAction =
  | EditorCopyCutPasteAction
  | EditorDeleteAction
  | EditorNudgeAction
  | EditorNudgeResizeAction
  | EditorAlignAction
  | EditorDistributeEvenlyAction
  | DocumentEditorInsertNodeAction
  //
  | SurfaceAction
  //
  | DocumentEditorNodeSelectAction
  | NodeChangeAction
  | NodeOrderAction
  | NodeToggleBasePropertyAction
  | TemplateNodeOverrideChangeAction
  | TemplateEditorSetTemplatePropsAction
  //
  | SchemaAction;

type NodeID = string & {};
type Vector2 = [number, number];

interface INodeID {
  node_id: NodeID;
}

interface ISelection {
  selection: NodeID[];
}

export type __InternalSyncArtboardOffset = {
  type: "__internal/sync-artboard-offset";
} & {
  offset: Vector2;
};

export interface __InternalResetAction {
  type: "__internal/reset";
  key?: string;
  state: IDocumentEditorState;
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
  | EditorConfigureModifier_TranslateWithClone;

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

interface IHtmlBackendCanvasEventTargetPointerEvent {
  /**
   * The node ids from the point.
   *
   * use document.elementFromPoint with filtering
   */
  node_ids_from_point: string[];
  shiftKey: boolean;
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

interface ICanvasEventTargetDragEvent {
  event: TCanvasEventTargetDragGestureState;
}

export type EventTargetAction =
  //
  | EditorEventTarget_PointerMove
  | EditorEventTarget_PointerMoveRaycast
  | EditorEventTarget_PointerDown
  | EditorEventTarget_PointerUp
  | EditorEventTarget_Click
  | EditorEventTarget_DragStart
  | EditorEventTarget_Drag
  | EditorEventTarget_DragEnd
  //
  | EditorEventTarget_Node_PointerEnter
  | EditorEventTarget_Node_PointerLeave
  //
  | EditorEventTarget_NodeOverlay_Click
  | EditorEventTarget_NodeOverlay_DragStart
  | EditorEventTarget_NodeOverlay_DragEnd
  | EditorEventTarget_NodeOverlay_Drag
  //
  | EditorEventTarget_NodeOverlayResizeHandle_DragStart
  | EditorEventTarget_NodeOverlayResizeHandle_DragEnd
  | EditorEventTarget_NodeOverlayResizeHandle_Drag
  //
  | EditorEventTarget_NodeOverlayCornerRadiusHandle_DragStart
  | EditorEventTarget_NodeOverlayCornerRadiusHandle_DragEnd
  | EditorEventTarget_NodeOverlayCornerRadiusHandle_Drag
  //
  | EditorEventTarget_NodeOverlayRotationHandle_DragStart
  | EditorEventTarget_NodeOverlayRotationHandle_DragEnd
  | EditorEventTarget_NodeOverlayRotationHandle_Drag;

export type EditorEventTarget_PointerMove = {
  type: "document/canvas/backend/html/event/on-pointer-move";
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
    type: "document/canvas/backend/html/event/on-pointer-move-raycast";
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
    type: "document/canvas/backend/html/event/on-pointer-down";
  };

export type EditorEventTarget_PointerUp = {
  type: "document/canvas/backend/html/event/on-pointer-up";
};

export type EditorEventTarget_Click = {
  type: "document/canvas/backend/html/event/on-click";
  /**
   * position in canvas space - need to pass a resolved value
   */
  position: {
    x: number;
    y: number;
  };
};

export type EditorEventTarget_DragStart = {
  type: "document/canvas/backend/html/event/on-drag-start";
  /**
   * @deprecated
   */
  shiftKey: boolean;
};

export type EditorEventTarget_Drag = ICanvasEventTargetDragEvent & {
  type: "document/canvas/backend/html/event/on-drag";
};

export type EditorEventTarget_DragEnd = {
  type: "document/canvas/backend/html/event/on-drag-end";
  node_ids_from_area?: string[];
  shiftKey: boolean;
};

//

export type EditorEventTarget_Node_PointerEnter = INodeID & {
  type: "document/canvas/backend/html/event/node/on-pointer-enter";
};

export type EditorEventTarget_Node_PointerLeave = INodeID & {
  type: "document/canvas/backend/html/event/node/on-pointer-leave";
};

//
interface ICanvasEventTargetResizeHandleEvent {
  direction: cmath.CardinalDirection;
}

export type EditorEventTarget_NodeOverlay_Click = ISelection &
  IHtmlBackendCanvasEventTargetPointerEvent & {
    type: "document/canvas/backend/html/event/node-overlay/on-click";
  };

export type EditorEventTarget_NodeOverlay_DragStart = ISelection &
  ICanvasEventTargetDragEvent & {
    type: "document/canvas/backend/html/event/node-overlay/on-drag-start";
  };

export type EditorEventTarget_NodeOverlay_DragEnd = ISelection &
  ICanvasEventTargetDragEvent & {
    type: "document/canvas/backend/html/event/node-overlay/on-drag-end";
  };

export type EditorEventTarget_NodeOverlay_Drag = ISelection &
  ICanvasEventTargetDragEvent & {
    type: "document/canvas/backend/html/event/node-overlay/on-drag";
  };

export type EditorEventTarget_NodeOverlayResizeHandle_DragStart = INodeID & {
  type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-start";
};

export type EditorEventTarget_NodeOverlayResizeHandle_DragEnd = INodeID & {
  type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-end";
};

export type EditorEventTarget_NodeOverlayResizeHandle_Drag = INodeID &
  ICanvasEventTargetDragEvent &
  ICanvasEventTargetResizeHandleEvent & {
    type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag";
  };

//
export type EditorEventTarget_NodeOverlayCornerRadiusHandle_DragStart =
  INodeID & {
    type: "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-start";
  };

export type EditorEventTarget_NodeOverlayCornerRadiusHandle_DragEnd =
  INodeID & {
    type: "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-end";
  };

export type EditorEventTarget_NodeOverlayCornerRadiusHandle_Drag = INodeID &
  ICanvasEventTargetDragEvent &
  ICanvasEventTargetResizeHandleEvent & {
    type: "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag";
  };
//

export type EditorEventTarget_NodeOverlayRotationHandle_DragStart = INodeID & {
  type: "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-start";
};

export type EditorEventTarget_NodeOverlayRotationHandle_DragEnd = INodeID & {
  type: "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-end";
};

export type EditorEventTarget_NodeOverlayRotationHandle_Drag = INodeID &
  ICanvasEventTargetDragEvent &
  ICanvasEventTargetResizeHandleEvent & {
    type: "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag";
  };

//

// #region surface action
export type SurfaceAction =
  | EditorSurface_EnterContentEditMode
  | EditorSurface_ExitContentEditMode
  //
  | EditorSurface_CursorMode;

export type EditorSurface_EnterContentEditMode = {
  type: "document/surface/content-edit-mode/try-enter";
};

export type EditorSurface_ExitContentEditMode = {
  type: "document/surface/content-edit-mode/try-exit";
};

export type EditorSurface_CursorMode = {
  type: "document/surface/cursor-mode";
  cursor_mode: CursorMode;
};

// #endregion surface action

export interface DocumentEditorInsertNodeAction {
  type: "document/insert";
  prototype: grida.program.nodes.NodePrototype;
}

export interface DocumentEditorNodeSelectAction {
  type: "document/node/select";
  node_id?: NodeID;
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
  positioning: grida.program.nodes.i.IPositioning;
}

interface INodeChangePositioningModeAction extends INodeID {
  position: grida.program.nodes.i.IPositioning["position"];
}

interface INodeChangeComponentAction extends INodeID {
  component_id: string;
}

interface INodeChangeTextAction extends INodeID {
  text?: Tokens.StringValueExpression;
}

interface INodeChangeOpacityAction extends INodeID {
  opacity: number;
}

interface INodeChangeSizeAction extends INodeID {
  axis: "width" | "height";
  length: grida.program.css.Length | "auto";
}

interface INodeChangeRotationAction extends INodeID {
  rotation: grida.program.nodes.i.IRotation["rotation"];
}

interface INodeChangeCornerRadiusAction extends INodeID {
  cornerRadius: number | grida.program.nodes.i.IRectangleCorner["cornerRadius"];
}

interface INodeChangeFillAction extends INodeID {
  fill: grida.program.cg.PaintWithoutID;
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
  fontSize: number;
}
interface ITextNodeChangeTextAlignAction extends INodeID {
  textAlign: grida.program.cg.TextAlign;
}

interface ITextNodeChangeTextAlignVerticalAction extends INodeID {
  textAlignVertical: grida.program.cg.TextAlignVertical;
}

interface ITextNodeChangeLineHeightAction extends INodeID {
  lineHeight: grida.program.nodes.TextNode["lineHeight"];
}

interface ITextNodeChangeLetterSpacingAction extends INodeID {
  letterSpacing: grida.program.nodes.TextNode["letterSpacing"];
}

interface ITextNodeChangeMaxlengthAction extends INodeID {
  maxlength: number | undefined;
}

//
interface INodeChangePaddingAction extends INodeID {
  padding: grida.program.nodes.i.IPadding["padding"];
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

interface INodeChangeStyleAction extends INodeID {
  style: Partial<React.CSSProperties>;
}

interface INodeChangeSrcAction extends INodeID {
  src?: Tokens.StringValueExpression;
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
  | ({ type: "node/change/style" } & INodeChangeStyleAction)
  | ({ type: "node/change/src" } & INodeChangeSrcAction)
  | ({ type: "node/change/href" } & INodeChangeHrefAction)
  | ({ type: "node/change/target" } & INodeChangeTargetAction)
  | ({ type: "node/change/props" } & INodeChangePropsAction);

export type NodeOrderAction =
  // | ({ type: "node/order/reorder" } & INodeID &)
  | ({ type: "node/order/back" } & INodeID)
  | ({ type: "node/order/front" } & INodeID);

export type NodeToggleBasePropertyAction =
  | ({ type: "node/toggle/active" } & INodeID)
  | ({ type: "node/toggle/locked" } & INodeID);

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

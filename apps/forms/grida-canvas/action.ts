import type { Tokens } from "@/ast";
import { grida } from "@/grida";
import { CursorMode, IDocumentEditorState } from "./types";

export type BuilderAction =
  | __InternalSyncArtboardOffset
  | __InternalResetAction
  | DocumentEditorInsertNodeAction
  //
  | SurfaceAction
  //
  | DocumentEditorNodeSelectAction
  | DocumentEditorNodePointerEnterAction
  | DocumentEditorNodePointerLeaveAction
  | NodeChangeAction
  | NodeOrderAction
  | NodeToggleAction
  | TemplateNodeOverrideChangeAction
  | TemplateEditorSetTemplatePropsAction
  //
  | SchemaAction;

type NodeID = string;
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

interface IHtmlBackendCanvasEventTargetPointerEvent {
  /**
   * The node ids from the point.
   *
   * use document.elementFromPoint with filtering
   */
  node_ids_from_point: string[];
  shiftKey: boolean;
}

interface ICanvasEventTargetPointerEvent {
  event: {
    delta: Vector2;
    distance: Vector2;
  };
}

export type SurfaceAction =
  //
  | EditorSurface_KeyDown
  | EditorSurface_KeyUp
  //
  | EditorSurface_PointerMove
  | EditorSurface_PointerMoveRaycast
  | EditorSurface_PointerDown
  | EditorSurface_PointerUp
  | EditorSurface_Click
  | EditorSurface_DragStart
  | EditorSurface_Drag
  | EditorSurface_DragEnd
  //
  | EditorSurface_NodeOverlay_Click
  | EditorSurface_NodeOverlay_DragStart
  | EditorSurface_NodeOverlay_DragEnd
  | EditorSurface_NodeOverlay_Drag
  //
  | EditorSurface_NodeOverlayResizeHandle_DragStart
  | EditorSurface_NodeOverlayResizeHandle_DragEnd
  | EditorSurface_NodeOverlayResizeHandle_Drag
  //
  | EditorSurface_NodeOverlayCornerRadiusHandle_DragStart
  | EditorSurface_NodeOverlayCornerRadiusHandle_DragEnd
  | EditorSurface_NodeOverlayCornerRadiusHandle_Drag
  //
  | EditorSurface_NodeOverlayRotationHandle_DragStart
  | EditorSurface_NodeOverlayRotationHandle_DragEnd
  | EditorSurface_NodeOverlayRotationHandle_Drag
  //
  | EditorSurface_EnterContentEditMode
  | EditorSurface_ExitContentEditMode
  //
  | EditorSurface_CursorMode;

export type EditorSurface_KeyDown = {
  type: "document/canvas/backend/html/event/on-key-down";
} & Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

export type EditorSurface_KeyUp = {
  type: "document/canvas/backend/html/event/on-key-up";
} & Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

export type EditorSurface_PointerMove = {
  type: "document/canvas/backend/html/event/on-pointer-move";
  /**
   * position in canvas space - need to pass a resolved value
   */
  position: {
    x: number;
    y: number;
  };
};

export type EditorSurface_PointerMoveRaycast =
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

export type EditorSurface_PointerDown =
  IHtmlBackendCanvasEventTargetPointerEvent & {
    type: "document/canvas/backend/html/event/on-pointer-down";
  };

export type EditorSurface_PointerUp = {
  type: "document/canvas/backend/html/event/on-pointer-up";
};

export type EditorSurface_Click = {
  type: "document/canvas/backend/html/event/on-click";
  /**
   * position in canvas space - need to pass a resolved value
   */
  position: {
    x: number;
    y: number;
  };
};

export type EditorSurface_DragStart = {
  type: "document/canvas/backend/html/event/on-drag-start";
  shiftKey: boolean;
};

export type EditorSurface_Drag = ICanvasEventTargetPointerEvent & {
  type: "document/canvas/backend/html/event/on-drag";
};

export type EditorSurface_DragEnd = {
  type: "document/canvas/backend/html/event/on-drag-end";
  node_ids_from_area?: string[];
  shiftKey: boolean;
};

export type EditorSurface_EnterContentEditMode = {
  type: "document/canvas/content-edit-mode/try-enter";
};

export type EditorSurface_ExitContentEditMode = {
  type: "document/canvas/content-edit-mode/try-exit";
};

export type EditorSurface_CursorMode = {
  type: "document/canvas/cursor-mode";
  cursor_mode: CursorMode;
};

interface ICanvasEventTargetResizeHandleEvent {
  anchor: "nw" | "ne" | "sw" | "se";
}

/**
 * Payload when current node size is unknown and should change to known
 *
 * This payload is required when changing node sizing mode to auto => fixed
 */
interface IHtmlCanvasEventTargetCalculatedNodeSize {
  /**
   * client width and height are required for non-numeric sized node.
   *
   * when resizing a node with `width: 100%`  resize delta
   */
  client_wh: grida.program.nodes.i.IFixedDimension;
}

export type EditorSurface_NodeOverlay_Click = ISelection &
  IHtmlBackendCanvasEventTargetPointerEvent & {
    type: "document/canvas/backend/html/event/node-overlay/on-click";
  };

export type EditorSurface_NodeOverlay_DragStart = ISelection &
  ICanvasEventTargetPointerEvent & {
    type: "document/canvas/backend/html/event/node-overlay/on-drag-start";
  };

export type EditorSurface_NodeOverlay_DragEnd = ISelection &
  ICanvasEventTargetPointerEvent & {
    type: "document/canvas/backend/html/event/node-overlay/on-drag-end";
  };

export type EditorSurface_NodeOverlay_Drag = ISelection &
  ICanvasEventTargetPointerEvent & {
    type: "document/canvas/backend/html/event/node-overlay/on-drag";
  };

export type EditorSurface_NodeOverlayResizeHandle_DragStart = INodeID &
  IHtmlCanvasEventTargetCalculatedNodeSize & {
    type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-start";
  };

export type EditorSurface_NodeOverlayResizeHandle_DragEnd = INodeID & {
  type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-end";
};

export type EditorSurface_NodeOverlayResizeHandle_Drag = INodeID &
  ICanvasEventTargetPointerEvent &
  ICanvasEventTargetResizeHandleEvent & {
    type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag";
  };

//
export type EditorSurface_NodeOverlayCornerRadiusHandle_DragStart = INodeID & {
  type: "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-start";
};

export type EditorSurface_NodeOverlayCornerRadiusHandle_DragEnd = INodeID & {
  type: "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-end";
};

export type EditorSurface_NodeOverlayCornerRadiusHandle_Drag = INodeID &
  ICanvasEventTargetPointerEvent &
  ICanvasEventTargetResizeHandleEvent & {
    type: "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag";
  };
//

export type EditorSurface_NodeOverlayRotationHandle_DragStart = INodeID & {
  type: "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-start";
};

export type EditorSurface_NodeOverlayRotationHandle_DragEnd = INodeID & {
  type: "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-end";
};

export type EditorSurface_NodeOverlayRotationHandle_Drag = INodeID &
  ICanvasEventTargetPointerEvent &
  ICanvasEventTargetResizeHandleEvent & {
    type: "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag";
  };

//

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

export type DocumentEditorNodePointerEnterAction = INodeID & {
  type: "document/node/on-pointer-enter";
};

export type DocumentEditorNodePointerLeaveAction = INodeID & {
  type: "document/node/on-pointer-leave";
};

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

export type NodeToggleAction =
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

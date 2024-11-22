import type { Tokens } from "@/ast";
import { grida } from "@/grida";
import { CursorMode, IDocumentEditorState } from "./types";

export type BuilderAction =
  | DocumentEditorResetWithStateAction
  //
  | DocumentEditorCanvasEventTargetHtmlBackendKeyDown
  //
  | DocumentEditorCanvasEventTargetHtmlBackendPointerMove
  | DocumentEditorCanvasEventTargetHtmlBackendPointerMoveRaycast
  | DocumentEditorCanvasEventTargetHtmlBackendPointerDown
  | DocumentEditorCanvasEventTargetHtmlBackendPointerUp
  | DocumentEditorCanvasEventTargetHtmlBackendDragStart
  | DocumentEditorCanvasEventTargetHtmlBackendDrag
  | DocumentEditorCanvasEventTargetHtmlBackendDragEnd
  //
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayResizeHandleDragStart
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayResizeHandleDragEnd
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayResizeHandleDrag
  //
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayCornerRadiusHandleDragStart
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayCornerRadiusHandleDragEnd
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayCornerRadiusHandleDrag
  //
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDragStart
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDragEnd
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDrag
  //
  | DocumentEditorEnterContentEditMode
  //
  | DocumentEditorCursorMode
  //
  | DocumentEditorNodeSelectAction
  | DocumentEditorNodePointerEnterAction
  | DocumentEditorNodePointerLeaveAction
  | NodeChangeAction
  | TemplateNodeOverrideChangeAction
  | TemplateEditorSetTemplatePropsAction;

type Vector2 = [number, number];

interface IHtmlBackendCanvasEventTargetPointerEvent {
  /**
   * The node ids from the point.
   *
   * use document.elementFromPoint with filtering
   */
  node_ids_from_point: string[];
}

interface ICanvasEventTargetPointerEvent {
  event: {
    delta: Vector2;
    distance: Vector2;
  };
}

export type DocumentEditorCanvasEventTargetHtmlBackendKeyDown = {
  type: "document/canvas/backend/html/event/on-key-down";
  key: string;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export type DocumentEditorCanvasEventTargetHtmlBackendPointerMove = {
  type: "document/canvas/backend/html/event/on-pointer-move";
  /**
   * position in canvas space - need to pass a resolved value
   */
  position: {
    x: number;
    y: number;
  };
};

export type DocumentEditorCanvasEventTargetHtmlBackendPointerMoveRaycast =
  IHtmlBackendCanvasEventTargetPointerEvent & {
    type: "document/canvas/backend/html/event/on-pointer-move-raycast";
    /**
     * position in canvas space - need to pass a resolved value
     */
    position: {
      x: number;
      y: number;
    };
    metaKey: boolean;
  };

export type DocumentEditorCanvasEventTargetHtmlBackendPointerDown =
  IHtmlBackendCanvasEventTargetPointerEvent & {
    type: "document/canvas/backend/html/event/on-pointer-down";
  };

export type DocumentEditorCanvasEventTargetHtmlBackendPointerUp = {
  type: "document/canvas/backend/html/event/on-pointer-up";
};

export type DocumentEditorCanvasEventTargetHtmlBackendDragStart = {
  type: "document/canvas/backend/html/event/on-drag-start";
};

export type DocumentEditorCanvasEventTargetHtmlBackendDrag =
  ICanvasEventTargetPointerEvent & {
    type: "document/canvas/backend/html/event/on-drag";
  };

export type DocumentEditorCanvasEventTargetHtmlBackendDragEnd = {
  type: "document/canvas/backend/html/event/on-drag-end";
};

export type DocumentEditorEnterContentEditMode = {
  type: "document/canvas/enter-content-edit-mode";
};

export type DocumentEditorCursorMode = {
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

export type DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayResizeHandleDragStart =
  INodeID &
    IHtmlCanvasEventTargetCalculatedNodeSize & {
      type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-start";
    };

export type DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayResizeHandleDragEnd =
  INodeID & {
    type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-end";
  };

export type DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayResizeHandleDrag =
  INodeID &
    ICanvasEventTargetPointerEvent &
    ICanvasEventTargetResizeHandleEvent & {
      type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag";
    };

//
export type DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayCornerRadiusHandleDragStart =
  INodeID & {
    type: "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-start";
  };

export type DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayCornerRadiusHandleDragEnd =
  INodeID & {
    type: "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-end";
  };

export type DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayCornerRadiusHandleDrag =
  INodeID &
    ICanvasEventTargetPointerEvent &
    ICanvasEventTargetResizeHandleEvent & {
      type: "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag";
    };
//

export type DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDragStart =
  INodeID & {
    type: "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-start";
  };

export type DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDragEnd =
  INodeID & {
    type: "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-end";
  };

export type DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDrag =
  INodeID &
    ICanvasEventTargetPointerEvent &
    ICanvasEventTargetResizeHandleEvent & {
      type: "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag";
    };

//
export interface DocumentEditorResetWithStateAction {
  type: "document/reset";
  state: IDocumentEditorState;
}

export interface DocumentEditorNodeSelectAction {
  type: "document/node/select";
  node_id?: string;
}

interface INodeID {
  node_id: string;
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
  //
  | ({ type: "node/change/style" } & INodeChangeStyleAction)
  | ({ type: "node/change/src" } & INodeChangeSrcAction)
  | ({ type: "node/change/href" } & INodeChangeHrefAction)
  | ({ type: "node/change/target" } & INodeChangeTargetAction)
  | ({ type: "node/change/props" } & INodeChangePropsAction);

export type TemplateNodeOverrideChangeAction = ITemplateInstanceNodeID & {
  type: "document/template/override/change/*";
  action: NodeChangeAction;
};

export interface TemplateEditorSetTemplatePropsAction {
  type: "document/template/set/props";
  data: Record<string, any>;
}

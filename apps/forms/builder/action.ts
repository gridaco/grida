import type { Tokens } from "@/ast";
import { grida } from "@/grida";

export type BuilderAction =
  | DocumentEditorCanvasEventTargetHtmlBackendPointerMove
  | DocumentEditorCanvasEventTargetHtmlBackendPointerDown
  | DocumentEditorCanvasEventTargetHtmlBackendPointerUp
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayDrag
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayDragStart
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayDragEnd
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayResizeHandleDragStart
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayResizeHandleDragEnd
  | DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayResizeHandleDrag
  | DocumentEditorNodeSelectAction
  | DocumentEditorNodePointerEnterAction
  | DocumentEditorNodePointerLeaveAction
  | NodeChangeAction
  | TemplateNodeOverrideChangeAction
  | TemplateEditorSetTemplatePropsAction;

interface IHtmlBackendCanvasEventTargetPointerEvent {
  /**
   * The node ids from the point.
   *
   * use document.elementFromPoint with filtering
   */
  node_ids_from_point: string[];
}

export type DocumentEditorCanvasEventTargetHtmlBackendPointerMove =
  IHtmlBackendCanvasEventTargetPointerEvent & {
    type: "document/canvas/backend/html/event/on-pointer-move";
  };

export type DocumentEditorCanvasEventTargetHtmlBackendPointerDown =
  IHtmlBackendCanvasEventTargetPointerEvent & {
    type: "document/canvas/backend/html/event/on-pointer-down";
  };

export type DocumentEditorCanvasEventTargetHtmlBackendPointerUp = {
  type: "document/canvas/backend/html/event/on-pointer-up";
};

interface ICanvasEventTargetPointerEventDelta {
  delta: [number, number];
}

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
  client_wh: grida.program.nodes.i.IDimension;
}

export type DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayDrag =
  INodeID &
    ICanvasEventTargetPointerEventDelta & {
      type: "document/canvas/backend/html/event/node-overlay/on-drag";
    };

export type DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayDragStart =
  INodeID & {
    type: "document/canvas/backend/html/event/node-overlay/on-drag-start";
  };

export type DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayDragEnd =
  INodeID & {
    type: "document/canvas/backend/html/event/node-overlay/on-drag-end";
  };

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
    ICanvasEventTargetPointerEventDelta &
    ICanvasEventTargetResizeHandleEvent & {
      type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag";
    };

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

interface INodeChangeComponentAction extends INodeID {
  component_id: string;
}

interface INodeChangeTextAction extends INodeID {
  text?: Tokens.StringValueExpression;
}

interface INodeChangeOpacityAction extends INodeID {
  opacity: number;
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
  | ({ type: "node/change/component" } & INodeChangeComponentAction)
  | ({ type: "node/change/text" } & INodeChangeTextAction)
  | ({ type: "node/change/opacity" } & INodeChangeOpacityAction)
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

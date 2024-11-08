import { produce, type Draft } from "immer";

import type {
  BuilderAction,
  //
  DocumentEditorCanvasEventTargetHtmlBackendPointerMove,
  DocumentEditorCanvasEventTargetHtmlBackendPointerDown,
  DocumentEditorCanvasEventTargetHtmlBackendDrag,
  DocumentEditorCanvasEventTargetHtmlBackendDragStart,
  DocumentEditorCanvasEventTargetHtmlBackendDragEnd,
  TemplateEditorSetTemplatePropsAction,
  DocumentEditorNodeSelectAction,
  DocumentEditorNodePointerEnterAction,
  DocumentEditorNodePointerLeaveAction,
  NodeChangeAction,
  TemplateNodeOverrideChangeAction,
} from "./action";
import type { IDocumentEditorState } from "./types";
import { grida } from "@/grida";
import assert from "assert";

export default function reducer<S extends IDocumentEditorState>(
  state: S,
  action: BuilderAction
): S {
  switch (action.type) {
    // #region [html backend] canvas event target
    case "document/canvas/backend/html/event/on-pointer-move": {
      const { node_ids_from_point } = <
        DocumentEditorCanvasEventTargetHtmlBackendPointerMove
      >action;
      return produce(state, (draft) => {
        draft.hovered_node_id = node_ids_from_point[0];
      });
    }
    case "document/canvas/backend/html/event/on-pointer-down": {
      const { node_ids_from_point } = <
        DocumentEditorCanvasEventTargetHtmlBackendPointerDown
      >action;
      return produce(state, (draft) => {
        const selected_node_id = node_ids_from_point[0];
        draft.selected_node_id = selected_node_id;
      });
    }
    case "document/canvas/backend/html/event/on-pointer-up": {
      return produce(state, (draft) => {
        // clear all trasform state

        draft.is_gesture_node_drag_move = false;
        draft.is_gesture_node_drag_resize = false;
      });
    }
    // #region drag event
    case "document/canvas/backend/html/event/on-drag-start": {
      const {} = <DocumentEditorCanvasEventTargetHtmlBackendDragStart>action;
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_move = true;
        draft.is_gesture_node_drag_resize = false;
      });
    }
    case "document/canvas/backend/html/event/on-drag-end": {
      const {} = <DocumentEditorCanvasEventTargetHtmlBackendDragEnd>action;
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_move = false;
      });
    }
    case "document/canvas/backend/html/event/on-drag": {
      const { delta } = <DocumentEditorCanvasEventTargetHtmlBackendDrag>action;
      // cancel if invalid state
      if (!state.is_gesture_node_drag_move) return state;
      if (!state.selected_node_id) return state;
      return produce(state, (draft) => {
        const node = draft.document.nodes[draft.selected_node_id!];
        assert("style" in node, "node has no style property");
        if (
          ((node as grida.program.nodes.i.ICSSStylable).style.position =
            "absolute")
        ) {
          const [dx, dy] = delta;
          ((node as grida.program.nodes.i.ICSSStylable).style.left as number) +=
            dx;
          ((node as grida.program.nodes.i.ICSSStylable).style.top as number) +=
            dy;
        } else {
          // ignore
          reportError("node is not draggable");
        }
        //
      });
    }
    // #endregion drag event
    // #region resize handle event
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-start": {
      const { node_id, client_wh } = action;
      //

      return produce(state, (draft) => {
        draft.is_gesture_node_drag_resize = true;
        draft.is_gesture_node_drag_move = false;

        // need to assign a fixed size if width or height is a variable length
        const node = draft.document.nodes[node_id];
        (node as grida.program.nodes.i.ICSSStylable).style.width =
          client_wh.width;
        (node as grida.program.nodes.i.ICSSStylable).style.height =
          client_wh.height;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-end": {
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_resize = false;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag": {
      const { node_id, anchor, delta } = action;
      const [dx, dy] = delta;

      // cancel if invalid state
      if (!state.is_gesture_node_drag_resize) return state;

      return produce(state, (draft) => {
        // once the node's measurement mode is set to fixed (from drag start), we may safely cast the width / height sa fixed number
        const node = draft.document.nodes[node_id];

        // TODO: calculate the final delta based on anchor and movement delta
        switch (anchor) {
          case "ne": {
          }
          case "nw": {
          }
          case "se": {
          }
          case "sw": {
          }
        }

        ((node as grida.program.nodes.i.ICSSStylable).style.width as number) +=
          dx;
        ((node as grida.program.nodes.i.ICSSStylable).style.height as number) +=
          dy;
      });
      //
      //
    }
    // #endregion resize handle event

    // #endregion [html backend] canvas event target
    case "document/template/set/props": {
      const { data } = <TemplateEditorSetTemplatePropsAction>action;

      return produce(state, (draft) => {
        const root_template_instance =
          draft.document.nodes[draft.document.root_id!];
        assert(root_template_instance.type === "template_instance");
        root_template_instance.props = data;
      });
    }
    case "document/node/select": {
      const { node_id } = <DocumentEditorNodeSelectAction>action;

      return produce(state, (draft) => {
        draft.selected_node_id = node_id;
      });
    }
    case "document/node/on-pointer-enter": {
      const { node_id } = <DocumentEditorNodePointerEnterAction>action;
      return produce(state, (draft) => {
        draft.hovered_node_id = node_id;
      });
    }
    case "document/node/on-pointer-leave": {
      const { node_id } = <DocumentEditorNodePointerLeaveAction>action;
      return produce(state, (draft) => {
        if (draft.hovered_node_id === node_id) {
          draft.hovered_node_id = undefined;
        }
      });
    }
    // case "document/template/change/props": {
    //   const { props: partialProps } = <TemplateEditorChangeTemplatePropsAction>(
    //     action
    //   );

    //   return produce(state, (draft) => {
    //     draft.template.props = {
    //       ...(draft.template.props || {}),
    //       ...partialProps,
    //     } as grida.program.schema.Props;
    //   });
    // }

    case "node/change/active":
    case "node/change/name":
    case "node/change/component":
    case "node/change/href":
    case "node/change/target":
    case "node/change/src":
    case "node/change/props":
    case "node/change/opacity":
    case "node/change/cornerRadius":
    case "node/change/fill":
    case "node/change/style":
    case "node/change/text": {
      const { node_id } = <NodeChangeAction>action;
      return produce(state, (draft) => {
        const node = draft.document.nodes[node_id];
        assert(node, `node not found with node_id: "${node_id}"`);
        draft.document.nodes[node_id] = nodeReducer(node, action);
      });
    }
    case "document/template/override/change/*": {
      const { template_instance_node_id, action: __action } = <
        TemplateNodeOverrideChangeAction
      >action;

      return produce(state, (draft) => {
        const { node_id } = __action;
        const template_instance_node =
          draft.document.nodes[template_instance_node_id];

        assert(
          template_instance_node &&
            template_instance_node.type === "template_instance"
        );

        const nodedata = template_instance_node.overrides[node_id] || {};
        template_instance_node.overrides[node_id] = nodeReducer(
          nodedata,
          __action
        );
      });
    }
  }

  return state;
}

function nodeReducer<N extends Partial<grida.program.nodes.Node>>(
  node: N,
  action: NodeChangeAction
): N {
  return produce(node, (draft) => {
    switch (action.type) {
      case "node/change/active": {
        draft.active = action.active;
        break;
      }
      case "node/change/name": {
        (draft as grida.program.nodes.i.IBaseNode).name = action.name;
        break;
      }
      case "node/change/href": {
        (draft as grida.program.nodes.i.IHrefable).href = action.href;
        break;
      }
      case "node/change/target": {
        (draft as grida.program.nodes.i.IHrefable).target = action.target;
        break;
      }
      case "node/change/component": {
        assert(draft.type === "instance");
        draft.component_id = action.component_id;
        break;
      }
      case "node/change/src": {
        assert(draft.type === "image");
        draft.src = action.src;
        break;
      }
      case "node/change/props": {
        assert(draft.type === "instance" || draft.type === "template_instance");
        draft.props = Object.assign({}, draft.props, action.props);
        break;
      }
      case "node/change/opacity": {
        (draft as Draft<grida.program.nodes.i.ICSSStylable>).opacity =
          action.opacity;
        break;
      }
      case "node/change/cornerRadius": {
        assert(draft.type === "rectangle");
        draft.cornerRadius = action.cornerRadius;
        break;
      }
      case "node/change/fill": {
        assert(draft.type === "rectangle" || draft.type === "ellipse");
        draft.fill = action.fill;
        break;
      }
      case "node/change/style": {
        // assert(draft.type !== 'template_instance')
        (draft as Draft<grida.program.nodes.i.ICSSStylable>).style =
          Object.assign(
            {},
            (draft as Draft<grida.program.nodes.i.ICSSStylable>).style,
            action.style
          );
        break;
      }
      case "node/change/text": {
        assert(draft.type === "text");
        draft.text = action.text ?? null;
        break;
      }
    }
  });
}

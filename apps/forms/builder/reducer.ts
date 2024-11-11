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
      const {
        event: { delta, distance },
      } = <DocumentEditorCanvasEventTargetHtmlBackendDrag>action;
      // cancel if invalid state
      if (!state.is_gesture_node_drag_move) return state;
      if (!state.selected_node_id) return state;

      const nid = state.selected_node_id;

      const [dx, dy] = delta;

      return produce(state, (draft) => {
        const node = draft.document.nodes[nid];

        draft.document.nodes[nid] = nodeTransformReducer(node, {
          type: "move",
          dx: dx,
          dy: dy,
        });

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
        draft.hovered_node_id = undefined;

        const node = draft.document.nodes[node_id];

        // need to assign a fixed size if width or height is a variable length
        (node as grida.program.nodes.i.ICSSDimension).width = client_wh.width;
        // (node as grida.program.nodes.i.ICSSStylable).style.width = client_wh.width;
        (node as grida.program.nodes.i.ICSSDimension).height = client_wh.height;
        // (node as grida.program.nodes.i.ICSSStylable).style.height = client_wh.height;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-end": {
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_resize = false;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag": {
      const {
        node_id,
        anchor,
        event: { delta, distance },
      } = action;
      const [dx, dy] = delta;

      // cancel if invalid state
      if (!state.is_gesture_node_drag_resize) return state;

      return produce(state, (draft) => {
        // once the node's measurement mode is set to fixed (from drag start), we may safely cast the width / height sa fixed number
        const node = draft.document.nodes[node_id];

        draft.document.nodes[node_id] = nodeTransformReducer(node, {
          type: "resize",
          anchor,
          dx: dx,
          dy: dy,
        });
      });
      //
      //
    }
    // #endregion resize handle event

    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-start": {
      const { node_id } = action;

      return produce(state, (draft) => {
        draft.selected_node_id = node_id;
        draft.is_gesture_node_drag_corner_radius = true;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-end": {
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_corner_radius = false;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag": {
      const {
        node_id,
        event: { delta, distance },
      } = action;
      const [dx, dy] = delta;
      // cancel if invalid state
      if (!state.is_gesture_node_drag_corner_radius) return state;

      // const distance = Math.sqrt(dx * dx + dy * dy);
      const d = -Math.round(dx);
      return produce(state, (draft) => {
        const node = draft.document.nodes[node_id];

        if (!("cornerRadius" in node)) {
          return;
        }

        draft.document.nodes[node_id] = nodeReducer(node, {
          type: "node/change/cornerRadius",
          // TODO: resolve by anchor
          cornerRadius:
            (typeof node.cornerRadius == "number" ? node.cornerRadius : 0) + d,
          node_id,
        });
      });
      //
    }

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
    case "node/change/positioning":
    case "node/change/positioning-mode":
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

type NodeTransformAction =
  | {
      type: "move";
      /**
       * distance or delta
       */
      dx: number;
      /**
       * distance or delta
       */
      dy: number;
    }
  | {
      type: "resize";
      anchor: "nw" | "ne" | "sw" | "se";
      /**
       * distance or delta
       */
      dx: number;
      /**
       * distance or delta
       */
      dy: number;
    };

function nodeTransformReducer(
  node: grida.program.nodes.Node,
  action: NodeTransformAction
) {
  return produce(node, (draft) => {
    assert(
      draft.type !== "template_instance",
      "template_instance cannot be transformed"
    );

    switch (action.type) {
      case "move": {
        const { dx, dy } = action;
        if (draft.position == "absolute") {
          if (dx) {
            if (draft.left !== undefined || draft.right !== undefined) {
              if (draft.left !== undefined) {
                const new_l = draft.left + dx;
                draft.left = new_l;
              }
              if (draft.right !== undefined) {
                const new_r = draft.right - dx;
                draft.right = new_r;
              }
            } else {
              draft.left = dx;
            }
          }
          if (dy) {
            if (draft.top !== undefined || draft.bottom !== undefined) {
              if (draft.top !== undefined) {
                const new_t = draft.top + dy;
                draft.top = new_t;
              }
              if (draft.bottom !== undefined) {
                const new_b = draft.bottom - dy;
                draft.bottom = new_b;
              }
            } else {
              draft.top = dy;
            }
          }
        } else {
          // ignore
          reportError("node is not draggable");
        }

        return;
      }
      case "resize": {
        const { anchor, dx, dy } = action;
        //
        // TODO: calculate the final delta based on anchor and movement delta
        console.log(anchor);
        switch (anchor) {
          case "nw": {
            break;
          }
          case "ne": {
            break;
          }
          case "sw": {
            break;
          }
          case "se": {
            if (dx) {
              ((draft as grida.program.nodes.i.ICSSDimension)
                .width as number) += dx;

              if (draft.right !== undefined) {
                draft.right -= dx;
              }
            }

            if (dy) {
              ((draft as grida.program.nodes.i.ICSSDimension)
                .height as number) += dy;

              if (draft.bottom !== undefined) {
                draft.bottom -= dy;
              }
            }

            break;
          }
        }

        return;
      }
    }
  });
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
      case "node/change/positioning": {
        const { positioning } = action;
        (draft as grida.program.nodes.i.IPositioning).left = positioning.left;
        (draft as grida.program.nodes.i.IPositioning).top = positioning.top;
        (draft as grida.program.nodes.i.IPositioning).right = positioning.right;
        (draft as grida.program.nodes.i.IPositioning).bottom =
          positioning.bottom;
        (draft as grida.program.nodes.i.IPositioning).position =
          positioning.position;
        break;
      }
      case "node/change/positioning-mode": {
        const { position } = action;
        (draft as grida.program.nodes.i.IPositioning).position = position;
        switch (position) {
          case "absolute": {
            break;
          }
          case "relative": {
            (draft as grida.program.nodes.i.IPositioning).left = undefined;
            (draft as grida.program.nodes.i.IPositioning).top = undefined;
            (draft as grida.program.nodes.i.IPositioning).right = undefined;
            (draft as grida.program.nodes.i.IPositioning).bottom = undefined;
          }
        }
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

        // TODO: make [cornerRadius < (Math.min(width, height) / 2)]

        const each =
          typeof action.cornerRadius == "number"
            ? {
                tl: Math.max(action.cornerRadius, 0),
                tr: Math.max(action.cornerRadius, 0),
                br: Math.max(action.cornerRadius, 0),
                bl: Math.max(action.cornerRadius, 0),
              }
            : {
                tl: Math.max(action.cornerRadius.topLeftRadius, 0),
                tr: Math.max(action.cornerRadius.topRightRadius, 0),
                br: Math.max(action.cornerRadius.bottomRightRadius, 0),
                bl: Math.max(action.cornerRadius.bottomLeftRadius, 0),
              };
        if (each.tl === each.tr && each.tl === each.br && each.tl === each.bl) {
          draft.cornerRadius = each.tl;
        } else {
          draft.cornerRadius = {
            topLeftRadius: each.tl,
            topRightRadius: each.tr,
            bottomRightRadius: each.br,
            bottomLeftRadius: each.bl,
          };
        }
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

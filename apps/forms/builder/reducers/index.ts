import { produce, type Draft } from "immer";

import type {
  BuilderAction,
  DocumentEditorCanvasEventTargetHtmlBackendKeyDown,
  //
  DocumentEditorCanvasEventTargetHtmlBackendPointerMove,
  DocumentEditorCanvasEventTargetHtmlBackendPointerMoveRaycast,
  DocumentEditorCanvasEventTargetHtmlBackendPointerDown,
  //
  DocumentEditorCanvasEventTargetHtmlBackendDrag,
  DocumentEditorCanvasEventTargetHtmlBackendDragStart,
  DocumentEditorCanvasEventTargetHtmlBackendDragEnd,
  //
  DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDrag,
  DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDragEnd,
  DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDragStart,
  //
  TemplateEditorSetTemplatePropsAction,
  DocumentEditorNodeSelectAction,
  DocumentEditorNodePointerEnterAction,
  DocumentEditorNodePointerLeaveAction,
  NodeChangeAction,
  TemplateNodeOverrideChangeAction,
} from "../action";
import type { IDocumentEditorState } from "../types";
import { grida } from "@/grida";
import assert from "assert";
import { v4 } from "uuid";
import { documentquery } from "../document-query";

const keyboard_key_bindings = {
  r: "rectangle",
  t: "text",
  o: "ellipse",
  f: "container",
  a: "container",
} as const;

export default function reducer<S extends IDocumentEditorState>(
  state: S,
  action: BuilderAction
): S {
  if (!state.editable) return state;
  switch (action.type) {
    case "document/reset": {
      const { state: _new_state } = action;
      return _new_state as S;
    }
    // #region [html backend] canvas event target
    case "document/canvas/backend/html/event/on-key-down": {
      const { key, altKey, metaKey, shiftKey } = <
        DocumentEditorCanvasEventTargetHtmlBackendKeyDown
      >action;
      return produce(state, (draft) => {
        if (metaKey && key === "c") {
          // Copy logic
          if (draft.selected_node_id) {
            const selectedNode = documentquery.__getNodeById(
              draft,
              draft.selected_node_id
            );
            draft.clipboard = JSON.parse(JSON.stringify(selectedNode)); // Deep copy the node
          }
        } else if (metaKey && key === "x") {
          // Cut logic
          if (draft.selected_node_id) {
            const selectedNode = documentquery.__getNodeById(
              draft,
              draft.selected_node_id
            );
            draft.clipboard = JSON.parse(JSON.stringify(selectedNode)); // Deep copy the node
            deleteNode(draft, draft.selected_node_id);
          }
        } else if (metaKey && key === "v") {
          // Paste logic
          if (draft.clipboard) {
            const newNode = JSON.parse(JSON.stringify(draft.clipboard));
            newNode.id = v4(); // Assign a new unique ID
            const offset = 10; // Offset to avoid overlapping
            if (newNode.left !== undefined) newNode.left += offset;
            if (newNode.top !== undefined) newNode.top += offset;
            insertNode(draft, newNode.id, newNode);
            draft.selected_node_id = newNode.id; // Select the newly pasted node
          }
        }

        switch (key) {
          case "v": {
            draft.cursor_mode = { type: "cursor" };
            break;
          }
          case "r":
          case "t":
          case "o":
          case "f":
          case "a": {
            draft.cursor_mode = {
              type: "insert",
              node: keyboard_key_bindings[key],
            };
            break;
          }
          case "Backspace": {
            if (draft.selected_node_id) {
              if (draft.document.root_id !== draft.selected_node_id) {
                deleteNode(draft, draft.selected_node_id);
              }
            }
            break;
          }
        }
      });
    }
    case "document/canvas/backend/html/event/on-pointer-move": {
      const {
        position: { x, y },
      } = <DocumentEditorCanvasEventTargetHtmlBackendPointerMove>action;
      return produce(state, (draft) => {
        draft.cursor_position.x = x;
        draft.cursor_position.y = y;
      });
    }
    case "document/canvas/backend/html/event/on-pointer-move-raycast": {
      const { node_ids_from_point, metaKey } = <
        DocumentEditorCanvasEventTargetHtmlBackendPointerMoveRaycast
      >action;
      return produce(state, (draft) => {
        const target_node_id =
          node_ids_from_point[metaKey ? 0 : node_ids_from_point.length - 2];

        draft.hovered_node_id = target_node_id;
      });
    }
    case "document/canvas/backend/html/event/on-pointer-down": {
      const { node_ids_from_point } = <
        DocumentEditorCanvasEventTargetHtmlBackendPointerDown
      >action;
      return produce(state, (draft) => {
        if (draft.cursor_mode.type === "cursor") {
          const target_node_id = draft.hovered_node_id;
          // const target_node_id =
          //   node_ids_from_point[node_ids_from_point.length - 2];
          draft.selected_node_id = target_node_id;
          draft.content_edit_mode = false;
        } else if (draft.cursor_mode.type === "insert") {
          const { node: nodetype } = draft.cursor_mode;
          const nnode = initialNode(nodetype, {
            // TODO: need to transform to a relative position (to root renderer or parent node)
            left: draft.cursor_position.x,
            top: draft.cursor_position.y,
          });
          insertNode(draft, nnode.id, nnode);
        }
      });
    }
    case "document/canvas/backend/html/event/on-pointer-up": {
      return produce(state, (draft) => {
        // clear all trasform state

        draft.content_edit_mode = false;
        draft.is_gesture_node_drag_move = false;
        draft.is_gesture_node_drag_resize = false;
      });
    }
    // #region drag event
    case "document/canvas/backend/html/event/on-drag-start": {
      const {} = <DocumentEditorCanvasEventTargetHtmlBackendDragStart>action;
      return produce(state, (draft) => {
        draft.content_edit_mode = false;
        draft.is_gesture_node_drag_resize = false;
        //
        if (!draft.selected_node_id) {
          // marquee selection
          draft.marquee = {
            x1: draft.cursor_position.x,
            y1: draft.cursor_position.y,
            x2: draft.cursor_position.x,
            y2: draft.cursor_position.y,
          };
        } else {
          draft.is_gesture_node_drag_move = true;
        }
      });
    }
    case "document/canvas/backend/html/event/on-drag-end": {
      const {} = <DocumentEditorCanvasEventTargetHtmlBackendDragEnd>action;
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_move = false;
        draft.marquee = undefined;
      });
    }
    case "document/canvas/backend/html/event/on-drag": {
      const {
        event: { delta, distance },
      } = <DocumentEditorCanvasEventTargetHtmlBackendDrag>action;
      if (state.marquee) {
        return produce(state, (draft) => {
          draft.marquee!.x2 = draft.cursor_position.x;
          draft.marquee!.y2 = draft.cursor_position.y;
        });
      } else {
        if (!state.is_gesture_node_drag_move)
          // cancel if invalid state
          return state;
        if (!state.selected_node_id) return state;

        const nid = state.selected_node_id;

        const [dx, dy] = delta;

        return produce(state, (draft) => {
          const node = documentquery.__getNodeById(draft, nid);

          draft.document.nodes[nid] = nodeTransformReducer(node, {
            type: "move",
            dx: dx,
            dy: dy,
          });

          //
        });
      }
    }
    // #endregion drag event
    // #region resize handle event
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-start": {
      const { node_id, client_wh } = action;
      //

      return produce(state, (draft) => {
        draft.content_edit_mode = false;
        draft.is_gesture_node_drag_resize = true;
        draft.is_gesture_node_drag_move = false;
        draft.hovered_node_id = undefined;

        const node = documentquery.__getNodeById(draft, node_id);

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
        const node = documentquery.__getNodeById(draft, node_id);

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
        const node = documentquery.__getNodeById(draft, node_id);

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

    //
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-start": {
      const { node_id } = <
        DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDragStart
      >action;

      return produce(state, (draft) => {
        draft.selected_node_id = node_id;
        draft.is_gesture_node_drag_rotation = true;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-end": {
      const {} = <
        DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDragEnd
      >action;
      return produce(state, (draft) => {
        draft.is_gesture_node_drag_rotation = false;
      });
    }
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag": {
      const {
        node_id,
        event: { delta, distance },
      } = <
        DocumentEditorCanvasEventTargetHtmlBackendNodeOverlayRotationHandleDrag
      >action;

      const [dx, dy] = delta;
      // cancel if invalid state
      if (!state.is_gesture_node_drag_rotation) return state;

      const d = Math.round(dx);
      return produce(state, (draft) => {
        const node = documentquery.__getNodeById(draft, node_id);

        draft.document.nodes[node_id] = nodeReducer(node, {
          type: "node/change/rotation",
          rotation:
            ((node as grida.program.nodes.i.IRotation).rotation ?? 0) + d,
          node_id,
        });
      });
      //
    }

    // #endregion [html backend] canvas event target

    // #region [universal backend] canvas event target
    case "document/canvas/enter-content-edit-mode": {
      if (!state.selected_node_id) return state;
      const { type: nodeType } = documentquery.__getNodeById(
        state,
        state.selected_node_id
      );
      if (nodeType !== "text") return state;

      return produce(state, (draft) => {
        draft.content_edit_mode = "text";
      });
      break;
    }
    case "document/canvas/cursor-mode": {
      const { cursor_mode } = action;
      return produce(state, (draft) => {
        draft.cursor_mode = cursor_mode;
      });
    }
    // #endregion
    case "document/template/set/props": {
      const { data } = <TemplateEditorSetTemplatePropsAction>action;

      return produce(state, (draft) => {
        const root_template_instance = documentquery.__getNodeById(
          draft,
          draft.document.root_id!
        );
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
    case "node/change/locked":
    case "node/change/name":
    case "node/change/userdata":
    case "node/change/positioning":
    case "node/change/positioning-mode":
    case "node/change/size":
    case "node/change/component":
    case "node/change/href":
    case "node/change/target":
    case "node/change/src":
    case "node/change/props":
    case "node/change/opacity":
    case "node/change/rotation":
    case "node/change/cornerRadius":
    case "node/change/fill":
    case "node/change/border":
    case "node/change/fit":
    case "node/change/style":
    case "node/change/fontSize":
    case "node/change/fontWeight":
    case "node/change/letterSpacing":
    case "node/change/lineHeight":
    case "node/change/textAlign":
    case "node/change/textAlignVertical":
    case "node/change/text": {
      const { node_id } = <NodeChangeAction>action;
      return produce(state, (draft) => {
        const node = documentquery.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        draft.document.nodes[node_id] = nodeReducer(node, action);
      });
    }
    case "node/change/fontFamily": {
      const { node_id } = <NodeChangeAction>action;
      return produce(state, (draft) => {
        const node = documentquery.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        draft.document.nodes[node_id] = nodeReducer(node, action);

        if (action.fontFamily) {
          draft.googlefonts.push({ family: action.fontFamily });
        }
      });
    }
    case "document/template/override/change/*": {
      const { template_instance_node_id, action: __action } = <
        TemplateNodeOverrideChangeAction
      >action;

      return produce(state, (draft) => {
        const { node_id } = __action;
        const template_instance_node = documentquery.__getNodeById(
          draft,
          template_instance_node_id
        );

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
    default: {
      throw new Error(
        `unknown action type: "${(action as BuilderAction).type}"`
      );
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
      case "node/change/userdata": {
        const { userdata } = action;
        // double check if the userdata is serializable and k:v structure
        assert(
          userdata === undefined ||
            userdata === null ||
            (typeof userdata === "object" && !Array.isArray(userdata)),
          "userdata must be an k:v object"
        );
        draft.userdata = userdata;
        break;
      }
      case "node/change/locked": {
        draft.locked = action.locked;
        break;
      }
      case "node/change/name": {
        (draft as grida.program.nodes.i.IBaseNode).name =
          action.name || (node.type as string);
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
      case "node/change/size": {
        const { axis, length } = action;
        // TODO: check the sizing model (fixed or css)
        (draft as grida.program.nodes.i.ICSSDimension)[axis] = length;
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
      case "node/change/rotation": {
        (draft as Draft<grida.program.nodes.i.ICSSStylable>).rotation =
          action.rotation;
        break;
      }
      case "node/change/cornerRadius": {
        assert(
          draft.type === "rectangle" ||
            draft.type === "container" ||
            draft.type === "image",
          "node type does not support cornerRadius"
        );

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
        assert(
          draft.type === "vector" ||
            draft.type === "rectangle" ||
            draft.type === "ellipse" ||
            draft.type === "text" ||
            draft.type === "container"
        );
        switch (action.fill.type) {
          case "linear_gradient":
            draft.fill = { ...action.fill, id: `gradient-${v4()}` };
            break;
          case "radial_gradient":
            draft.fill = { ...action.fill, id: `gradient-${v4()}` };
            break;
          case "solid":
            draft.fill = action.fill;
        }

        break;
      }
      case "node/change/border": {
        assert(
          // draft.type === "vector" ||
          // draft.type === "rectangle" ||
          // draft.type === "ellipse" ||
          // draft.type === "text" ||
          draft.type === "container"
        );
        draft.border = action.border;
        break;
      }
      case "node/change/fit": {
        assert(draft.type === "image");
        draft.fit = action.fit;
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
      case "node/change/fontFamily": {
        assert(draft.type === "text");
        draft.fontFamily = action.fontFamily;
        break;
      }
      case "node/change/fontSize": {
        assert(draft.type === "text");
        draft.fontSize = action.fontSize;
        break;
      }
      case "node/change/fontWeight": {
        assert(draft.type === "text");
        draft.fontWeight = action.fontWeight;
        break;
      }
      case "node/change/letterSpacing": {
        assert(draft.type === "text");
        draft.letterSpacing = action.letterSpacing;
        break;
      }
      case "node/change/lineHeight": {
        assert(draft.type === "text");
        draft.lineHeight = action.lineHeight;
        break;
      }
      case "node/change/textAlign": {
        assert(draft.type === "text");
        draft.textAlign = action.textAlign;
        break;
      }
      case "node/change/textAlignVertical": {
        assert(draft.type === "text");
        draft.textAlignVertical = action.textAlignVertical;
        break;
      }

      default: {
        throw new Error(
          `unknown action type: "${(action as NodeChangeAction).type as string}"`
        );
      }
    }
  });
}

function insertNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  node_id: string,
  node: grida.program.nodes.Node
) {
  draft.document.nodes[node_id] = node;
  const parent_id = draft.document.root_id;
  (
    draft.document.nodes[parent_id] as grida.program.nodes.i.IChildren
  ).children?.push(node_id);
  draft.document_ctx.__ctx_nid_to_parent_id[node_id] = parent_id;

  // after
  draft.cursor_mode = { type: "cursor" };
  draft.selected_node_id = node_id;
  //
}

function deleteNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  node_id: string
) {
  draft.selected_node_id = undefined;
  draft.hovered_node_id = undefined;
  const node = draft.document.nodes[node_id];
  const children = "children" in node ? node.children : undefined;
  delete draft.document.nodes[node_id];
  for (const child_id of children || []) {
    delete draft.document.nodes[child_id];
  }
  const parent_id = draft.document_ctx.__ctx_nid_to_parent_id[node_id];
  if (parent_id) {
    const index = (
      draft.document.nodes[parent_id] as grida.program.nodes.i.IChildren
    ).children!.indexOf(node_id);
    if (index > -1) {
      // only splice array when item is found
      (
        draft.document.nodes[parent_id] as grida.program.nodes.i.IChildren
      ).children!.splice(index, 1);
    }
  }
}

function initialNode(
  type: grida.program.nodes.Node["type"],
  seed: Partial<Omit<grida.program.nodes.AnyNode, "type">> = {}
): grida.program.nodes.Node {
  const gray: grida.program.cg.Paint = {
    type: "solid",
    color: { r: 217, g: 217, b: 217, a: 1 },
  };

  const black: grida.program.cg.Paint = {
    type: "solid",
    color: { r: 0, g: 0, b: 0, a: 1 },
  };

  const id = v4();
  const base: grida.program.nodes.i.IBaseNode &
    grida.program.nodes.i.ISceneNode = {
    id: id,
    name: type,
    userdata: undefined,
    //
    locked: false,
    active: true,
  };

  const position: grida.program.nodes.i.IPositioning = {
    position: "absolute",
    top: 0,
    left: 0,
  };

  const styles: grida.program.nodes.i.ICSSStylable = {
    opacity: 1,
    zIndex: 0,
    rotation: 0,
    fill: gray,
    width: 100,
    height: 100,
    position: "absolute",
    border: undefined,
    style: {},
  };

  switch (type) {
    case "text": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "text",
        textAlign: "left",
        textAlignVertical: "top",
        textDecoration: "none",
        fontWeight: 400,
        fontSize: 14,
        fill: black,
        width: "auto",
        height: "auto",
        text: "Text",
        ...seed,
      } satisfies grida.program.nodes.TextNode;
    }
    case "container": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "container",
        expanded: false,
        cornerRadius: 0,
        ...seed,
      } satisfies grida.program.nodes.ContainerNode;
    }
    case "ellipse": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "ellipse",
        width: 100,
        height: 100,
        effects: [],
        ...seed,
      } satisfies grida.program.nodes.EllipseNode;
    }
    case "rectangle": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "rectangle",
        cornerRadius: 0,
        width: 100,
        height: 100,
        effects: [],
        ...seed,
      } satisfies grida.program.nodes.RectangleNode;
    }
    case "image": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "image",
        cornerRadius: 0,
        width: 100,
        height: 100,
        fit: "cover",
        fill: undefined,
        // TODO: replace with static url
        src: "/assets/image.png",
        ...seed,
      } satisfies grida.program.nodes.ImageNode;
    }
    case "line":
    case "vector":
    case "instance":
    case "template_instance": {
      throw new Error(`${type} insertion not supported`);
    }
  }
}

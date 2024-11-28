import { produce, type Draft } from "immer";

import type {
  BuilderAction,
  DocumentEditorCanvasEventTargetHtmlBackendKeyDown,
  DocumentEditorCanvasEventTargetHtmlBackendKeyUp,
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
  NodeOrderAction,
  NodeToggleAction,
  TemplateNodeOverrideChangeAction,
} from "../action";
import type { IDocumentEditorState, SurfaceRaycastTargeting } from "../types";
import { grida } from "@/grida";
import assert from "assert";
import { v4 } from "uuid";
import { documentquery } from "../document-query";
import nodeReducer from "./node.reducer";
import nodeTransformReducer from "./node-transform.reducer";
import initialNode from "./tools/initial-node";

const keyboard_key_bindings = {
  r: "rectangle",
  t: "text",
  o: "ellipse",
  f: "container",
  a: "container",
} as const;

export default function documentReducer<S extends IDocumentEditorState>(
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
        // Meta key (meta only)
        if (
          metaKey && // Meta key is pressed
          !altKey && // Alt key is not pressed
          !shiftKey && // Shift key is not pressed
          key === "Meta"
        ) {
          draft.surface_raycast_targeting.target = "deepest";
          self_updateSurfaceHoverState(draft);
        }
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
            self_deleteNode(draft, draft.selected_node_id);
          }
        } else if (metaKey && key === "v") {
          // Paste logic
          if (draft.clipboard) {
            const newNode = JSON.parse(JSON.stringify(draft.clipboard));
            newNode.id = v4(); // Assign a new unique ID
            const offset = 10; // Offset to avoid overlapping
            if (newNode.left !== undefined) newNode.left += offset;
            if (newNode.top !== undefined) newNode.top += offset;
            self_insertNode(draft, newNode.id, newNode);
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
                self_deleteNode(draft, draft.selected_node_id);
              }
            }
            break;
          }
        }
      });
    }
    case "document/canvas/backend/html/event/on-key-up": {
      const { key, altKey, metaKey, shiftKey } = <
        DocumentEditorCanvasEventTargetHtmlBackendKeyUp
      >action;
      return produce(state, (draft) => {
        if (key === "Meta") {
          draft.surface_raycast_targeting.target = "shallowest";
          self_updateSurfaceHoverState(draft);
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
      const { node_ids_from_point } = <
        DocumentEditorCanvasEventTargetHtmlBackendPointerMoveRaycast
      >action;
      return produce(state, (draft) => {
        draft.surface_raycast_detected_node_ids = node_ids_from_point;
        self_updateSurfaceHoverState(draft);
      });
    }
    case "document/canvas/backend/html/event/on-pointer-down": {
      const { node_ids_from_point } = <
        DocumentEditorCanvasEventTargetHtmlBackendPointerDown
      >action;
      return produce(state, (draft) => {
        if (draft.cursor_mode.type === "cursor") {
          draft.surface_raycast_detected_node_ids = node_ids_from_point;
          const { hovered_node_id } = self_updateSurfaceHoverState(draft);
          draft.selected_node_id = hovered_node_id;
        } else if (draft.cursor_mode.type === "insert") {
          const { node: nodetype } = draft.cursor_mode;
          const nnode = initialNode(nodetype, {
            // TODO: need to transform to a relative position (to root renderer or parent node)
            left: draft.cursor_position.x,
            top: draft.cursor_position.y,
          });
          self_insertNode(draft, nnode.id, nnode);
        }
      });
    }
    case "document/canvas/backend/html/event/on-pointer-up": {
      return produce(state, (draft) => {
        // clear all trasform state

        draft.surface_content_edit_mode = false;
        draft.is_gesture_node_drag_move = false;
        draft.is_gesture_node_drag_resize = false;
      });
    }
    // #region drag event
    case "document/canvas/backend/html/event/on-drag-start": {
      const {} = <DocumentEditorCanvasEventTargetHtmlBackendDragStart>action;
      return produce(state, (draft) => {
        draft.surface_content_edit_mode = false;
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
        draft.surface_content_edit_mode = false;
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
    case "document/canvas/content-edit-mode/try-enter": {
      if (!state.selected_node_id) return state;
      const node = documentquery.__getNodeById(state, state.selected_node_id);

      // only text node can enter the content edit mode
      if (node.type !== "text") return state;

      // the text node should have a string literal value assigned (we don't support props editing via surface)
      if (typeof node.text !== "string") return state;

      return produce(state, (draft) => {
        draft.surface_content_edit_mode = "text";
      });
      break;
    }
    case "document/canvas/content-edit-mode/try-exit": {
      return produce(state, (draft) => {
        draft.surface_content_edit_mode = false;
      });
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
    case "node/change/padding":
    case "node/change/layout":
    case "node/change/direction":
    case "node/change/mainAxisAlignment":
    case "node/change/crossAxisAlignment":
    case "node/change/gap":
    case "node/change/mainAxisGap":
    case "node/change/crossAxisGap":
    case "node/change/style":
    case "node/change/fontSize":
    case "node/change/fontWeight":
    case "node/change/fontFamily":
    case "node/change/letterSpacing":
    case "node/change/lineHeight":
    case "node/change/textAlign":
    case "node/change/textAlignVertical":
    case "node/change/maxlength":
    case "node/change/text": {
      const { node_id } = <NodeChangeAction>action;
      return produce(state, (draft) => {
        const node = documentquery.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        draft.document.nodes[node_id] = nodeReducer(node, action);

        // font family specific hook
        if (action.type === "node/change/fontFamily") {
          if (action.fontFamily) {
            draft.googlefonts.push({ family: action.fontFamily });
          }
        }
      });
    }
    //
    case "node/order/back":
    case "node/order/front": {
      const { node_id } = <NodeOrderAction>action;
      return produce(state, (draft) => {
        const parent_id = documentquery.getParentId(
          draft.document_ctx,
          node_id
        );
        if (!parent_id) return; // root node case
        const parent_node: Draft<grida.program.nodes.i.IChildren> =
          documentquery.__getNodeById(
            draft,
            parent_id
          ) as grida.program.nodes.i.IChildren;

        const childIndex = parent_node.children!.indexOf(node_id);
        assert(childIndex !== -1, "node not found in children");

        switch (action.type) {
          case "node/order/back": {
            // change the children id order - move the node_id to the first (first is the back)
            parent_node.children!.splice(childIndex, 1);
            parent_node.children!.unshift(node_id);
            break;
          }
          case "node/order/front": {
            // change the children id order - move the node_id to the last (last is the front)
            parent_node.children!.splice(childIndex, 1);
            parent_node.children!.push(node_id);
            break;
          }
        }
      });
    }
    //
    case "node/toggle/locked": {
      return produce(state, (draft) => {
        const { node_id } = <NodeToggleAction>action;
        const node = documentquery.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        node.locked = !node.locked;
      });
    }
    case "node/toggle/active": {
      return produce(state, (draft) => {
        const { node_id } = <NodeToggleAction>action;
        const node = documentquery.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        node.active = !node.active;
      });
    }
    //
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
    //
    //
    //
    case "document/schema/property/define": {
      return produce(state, (draft) => {
        const root_node = documentquery.__getNodeById(
          draft,
          draft.document.root_id
        );
        assert(root_node.type === "component");

        const property_name =
          action.name ??
          "new_property_" + Object.keys(root_node.properties).length + 1;
        root_node.properties[property_name] = action.definition ?? {
          type: "string",
        };
      });
    }
    case "document/schema/property/rename": {
      const { name, newName } = action;
      return produce(state, (draft) => {
        const root_node = documentquery.__getNodeById(
          draft,
          draft.document.root_id
        );
        assert(root_node.type === "component");

        // check for conflict
        if (root_node.properties[newName]) {
          return;
        }

        root_node.properties[newName] = root_node.properties[name];
        delete root_node.properties[name];
      });
    }
    case "document/schema/property/update": {
      return produce(state, (draft) => {
        const root_node = documentquery.__getNodeById(
          draft,
          draft.document.root_id
        );
        assert(root_node.type === "component");

        root_node.properties[action.name] = action.definition;
      });
    }
    case "document/schema/property/delete": {
      return produce(state, (draft) => {
        const root_node = documentquery.__getNodeById(
          draft,
          draft.document.root_id
        );
        assert(root_node.type === "component");

        delete root_node.properties[action.name];
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

function self_updateSurfaceHoverState<S extends IDocumentEditorState>(
  draft: Draft<S>
) {
  const target = getSurfaceRayTarget(draft.surface_raycast_detected_node_ids, {
    config: draft.surface_raycast_targeting,
    context: draft,
  });
  draft.hovered_node_id = target;
  return draft;
}

function getSurfaceRayTarget(
  node_ids_from_point: string[],
  {
    config,
    context,
  }: {
    config: SurfaceRaycastTargeting;
    context: IDocumentEditorState;
  }
): string | undefined {
  const {
    document: { root_id, nodes },
  } = context;

  // Filter the nodes based on the configuration
  const filteredNodes = node_ids_from_point.filter((node_id) => {
    if (config.ignores_root && node_id === root_id) {
      return false; // Ignore the root node if configured
    }

    const node = nodes[node_id];
    if (config.ignores_locked && node?.locked) {
      return false; // Ignore locked nodes if configured
    }

    return true; // Include this node
  });

  // Select the target based on the configuration
  if (config.target === "deepest") {
    return filteredNodes[0]; // Deepest node (first in the array)
  }

  if (config.target === "shallowest") {
    return filteredNodes[filteredNodes.length - 1]; // Shallowest node (last in the array)
  }

  if (config.target === "next") {
    // "Next" logic: find the shallowest node above the deepest one
    const deepestNode = filteredNodes[0];
    if (!deepestNode) return undefined;

    // Get the parent of the deepest node
    const parentNodeId = documentquery.getAncestors(
      context.document_ctx,
      deepestNode
    )[1];
    if (!parentNodeId) return deepestNode; // If no parent, fallback to the deepest node

    // Ensure the parent is part of the filtered nodes
    if (filteredNodes.includes(parentNodeId)) {
      return parentNodeId;
    }

    // Fallback to the deepest node if no valid parent is found
    return deepestNode;
  }

  // If no valid node is found, return undefined
  return undefined;
}

function self_insertNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  node_id: string,
  node: grida.program.nodes.Node
) {
  draft.document.nodes[node_id] = node;
  const parent_id = draft.document.root_id;
  const parent_node = draft.document.nodes[parent_id];

  if (!("children" in parent_node)) {
    // if not 'children' property, validate and initialize.
    assert(parent_node.type === "container");
    parent_node.children = [];
  }

  parent_node.children!.push(node_id);
  draft.document_ctx.__ctx_nid_to_parent_id[node_id] = parent_id;
  draft.document_ctx.__ctx_nid_to_children_ids[parent_id].push(node_id);

  // after
  draft.cursor_mode = { type: "cursor" };
  draft.selected_node_id = node_id;
  //
}

function self_deleteNode<S extends IDocumentEditorState>(
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

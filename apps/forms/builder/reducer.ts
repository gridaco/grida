import { produce, type Draft } from "immer";

import type {
  BuilderAction,
  //
  DocumentEditorCanvasEventTargetHtmlBackendPointerMove,
  DocumentEditorCanvasEventTargetHtmlBackendPointerDown,
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
        draft.href = action.href;
        break;
      }
      case "node/change/target": {
        draft.target = action.target;
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
        (
          draft as Draft<grida.program.nodes.i.IHtmlBackendCSSStylable>
        ).opacity = action.opacity;
        break;
      }
      case "node/change/style": {
        // assert(draft.type !== 'template_instance')
        (draft as Draft<grida.program.nodes.i.IHtmlBackendCSSStylable>).style =
          Object.assign(
            {},
            (draft as Draft<grida.program.nodes.i.IHtmlBackendCSSStylable>)
              .style,
            action.style
          );
        break;
      }
      case "node/change/text": {
        assert(draft.type === "text");
        draft.text = draft.text ?? null;
        break;
      }
    }
  });
}

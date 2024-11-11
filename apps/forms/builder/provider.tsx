import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import type { DocumentDispatcher, IDocumentEditorState } from "./types";
import type { Tokens } from "@/ast";
import { grida } from "@/grida";
import { useComputed } from "./template-builder/use-computed";
import {
  DataProvider,
  ProgramDataContextHost,
} from "@/grida/react-runtime/data-context/context";
import assert from "assert";

type Vector2 = [number, number];

const DocumentContext = createContext<IDocumentEditorState | null>(null);

const __noop: DocumentDispatcher = () => void 0;
const DocumentDispatcherContext = createContext<DocumentDispatcher>(__noop);

export function StandaloneDocumentEditor({
  state,
  dispatch,
  children,
}: React.PropsWithChildren<{
  state: IDocumentEditorState;
  dispatch?: DocumentDispatcher;
}>) {
  useEffect(() => {
    if (state.editable && !dispatch) {
      console.error(
        "DocumentEditor: dispatch is required when readonly is false"
      );
    }
  }, [state.editable, dispatch]);

  const __dispatch = state.editable ? dispatch ?? __noop : __noop;

  const rootnode = state.document.nodes[state.document.root_id];
  assert(rootnode, "root node is not found");
  const shallowRootProps = useMemo(() => {
    if (rootnode.type === "template_instance") {
      const defaultProps = state.templates![rootnode.template_id].default;
      return Object.assign({}, defaultProps, rootnode.props);
    } else {
      return {};
    }
  }, [rootnode]);

  return (
    <DocumentContext.Provider value={state}>
      <DocumentDispatcherContext.Provider value={__dispatch}>
        <ProgramDataContextHost>
          <DataProvider data={{ props: shallowRootProps }}>
            {children}
          </DataProvider>
        </ProgramDataContextHost>
      </DocumentDispatcherContext.Provider>
    </DocumentContext.Provider>
  );
}

function get_grida_node_elements_from_point(x: number, y: number) {
  const hits = window.document.elementsFromPoint(x, y);

  const node_elements = hits.filter((h) =>
    h.attributes.getNamedItem(
      grida.program.document.k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_ID_KEY
    )
  );

  return node_elements;
}

function useInternal() {
  const state = useContext(DocumentContext);
  if (!state) {
    throw new Error(
      "useDocument must be used within a StandaloneDocumentEditor"
    );
  }

  const dispatch = useContext(DocumentDispatcherContext);

  return useMemo(() => [state, dispatch] as const, [state, dispatch]);
}

export function useDocument() {
  const [state, dispatch] = useInternal();

  const { selected_node_id } = state;

  const selectNode = useCallback(
    (node_id: string) => {
      dispatch({
        type: "document/node/select",
        node_id,
      });
    },
    [dispatch]
  );

  const pointerEnterNode = useCallback(
    (node_id: string) => {
      dispatch({
        type: "document/node/on-pointer-enter",
        node_id,
      });
    },
    [dispatch]
  );

  const pointerLeaveNode = useCallback(
    (node_id: string) => {
      dispatch({
        type: "document/node/on-pointer-leave",
        node_id,
      });
    },
    [dispatch]
  );

  const changeNodeProps = useCallback(
    (node_id: string, key: string, value?: Tokens.StringValueExpression) => {
      dispatch({
        type: "node/change/props",
        node_id: node_id,
        props: {
          [key]: value,
        },
      });
    },
    [dispatch]
  );

  const clearSelection = useCallback(
    () =>
      dispatch({
        type: "document/node/select",
        node_id: undefined,
      }),
    [dispatch]
  );

  const changeNodeComponent = useCallback(
    (node_id: string, component_id: string) => {
      dispatch({
        type: "node/change/component",
        node_id: node_id,
        component_id: component_id,
      });
    },
    [dispatch]
  );

  const changeNodeText = useCallback(
    (node_id: string, text?: Tokens.StringValueExpression) => {
      dispatch({
        type: "node/change/text",
        node_id: node_id,
        text,
      });
    },
    [dispatch]
  );

  const changeNodeActive = useCallback(
    (node_id: string, hidden: boolean) => {
      dispatch({
        type: "node/change/active",
        node_id: node_id,
        active: hidden,
      });
    },
    [dispatch]
  );

  const changeNodePositioning = useCallback(
    (node_id: string, positioning: grida.program.nodes.i.IPositioning) => {
      dispatch({
        type: "node/change/positioning",
        node_id: node_id,
        positioning,
      });
    },
    [dispatch]
  );

  const changeNodePositioningMode = useCallback(
    (
      node_id: string,
      position: grida.program.nodes.i.IPositioning["position"]
    ) => {
      dispatch({
        type: "node/change/positioning-mode",
        node_id: node_id,
        position,
      });
    },
    [dispatch]
  );

  const changeNodeSrc = useCallback(
    (node_id: string, src?: Tokens.StringValueExpression) => {
      dispatch({
        type: "node/change/src",
        node_id: node_id,
        src,
      });
    },
    [dispatch]
  );

  const changeNodeHref = useCallback(
    (node_id: string, href?: grida.program.nodes.i.IHrefable["href"]) => {
      dispatch({
        type: "node/change/href",
        node_id: node_id,
        href,
      });
    },
    [dispatch]
  );

  const changeNodeTarget = useCallback(
    (node_id: string, target?: grida.program.nodes.i.IHrefable["target"]) => {
      dispatch({
        type: "node/change/target",
        node_id: node_id,
        target,
      });
    },
    [dispatch]
  );

  const changeNodeOpacity = useCallback(
    (node_id: string, opacity: number) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/opacity",
          node_id: node_id,
          opacity,
        });
      });
    },
    [dispatch]
  );

  const changeNodeFill = useCallback(
    (node_id: string, fill: grida.program.cg.PaintWithoutID) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/fill",
          node_id: node_id,
          fill,
        });
      });
    },
    [dispatch]
  );

  const changeNodeCornerRadius = useCallback(
    (
      node_id: string,
      cornerRadius: grida.program.nodes.i.IRectangleCorner["cornerRadius"]
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/cornerRadius",
          node_id: node_id,
          cornerRadius,
        });
      });
    },
    [dispatch]
  );

  const changeNodeStyle = useCallback(
    (
      node_id: string,
      key: keyof grida.program.css.ExplicitlySupportedCSSProperties,
      value: any
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/style",
          node_id: node_id,
          style: {
            [key]: value,
          },
        });
      });
    },
    [dispatch]
  );

  const changeNodeValue = useCallback(
    (node_id: string, key: string, value: any) => {
      dispatch({
        type: "node/change/props",
        node_id: node_id,
        props: {
          [key]: value,
        },
      });
    },
    [dispatch]
  );

  const selectedNode = useMemo(() => {
    if (!selected_node_id) return;
    return {
      component: (component_id: string) =>
        changeNodeComponent(selected_node_id!, component_id),
      text: (text?: Tokens.StringValueExpression) =>
        changeNodeText(selected_node_id!, text),
      style: (
        key: keyof grida.program.css.ExplicitlySupportedCSSProperties,
        value: any
      ) => changeNodeStyle(selected_node_id!, key, value),
      value: (key: string, value: any) =>
        changeNodeValue(selected_node_id!, key, value),
      // attributes
      active: (active: boolean) => changeNodeActive(selected_node_id!, active),
      src: (src?: Tokens.StringValueExpression) =>
        changeNodeSrc(selected_node_id!, src),
      href: (href?: grida.program.nodes.i.IHrefable["href"]) =>
        changeNodeHref(selected_node_id!, href),
      target: (target?: grida.program.nodes.i.IHrefable["target"]) =>
        changeNodeTarget(selected_node_id!, target),

      positioning: (value: grida.program.nodes.i.IPositioning) =>
        changeNodePositioning(selected_node_id!, value),
      positioningMode: (value: "absolute" | "relative") =>
        changeNodePositioningMode(selected_node_id!, value),

      //
      cornerRadius: (
        value: grida.program.nodes.i.IRectangleCorner["cornerRadius"]
      ) => changeNodeCornerRadius(selected_node_id!, value),
      fill: (value: grida.program.cg.PaintWithoutID) =>
        changeNodeFill(selected_node_id!, value),

      // stylable
      opacity: (value: number) => changeNodeOpacity(selected_node_id!, value),

      // style
      fontFamily: (value: string) =>
        changeNodeStyle(selected_node_id!, "fontFamily", value),
      fontWeight: (value: number) =>
        changeNodeStyle(selected_node_id!, "fontWeight", value),
      fontSize: (value?: number) =>
        changeNodeStyle(selected_node_id!, "fontSize", value),
      textAlign: (value: string) =>
        changeNodeStyle(selected_node_id!, "textAlign", value),
      textColor: (value: grida.program.css.RGBA) =>
        changeNodeStyle(selected_node_id!, "textColor", value),
      margin: (value?: number) =>
        changeNodeStyle(selected_node_id!, "margin", value),
      padding: (value?: number) =>
        changeNodeStyle(selected_node_id!, "padding", value),
      aspectRatio: (value?: number) =>
        changeNodeStyle(selected_node_id!, "aspectRatio", value),
      border: (value?: any) =>
        changeNodeStyle(selected_node_id!, "borderWidth", value.borderWidth),
      boxShadow: (value?: any) =>
        changeNodeStyle(selected_node_id!, "boxShadow", value.boxShadow),
      backgroundColor: (value?: grida.program.css.RGBA) =>
        changeNodeStyle(selected_node_id!, "backgroundColor", value),
      gap: (value?: number) => changeNodeStyle(selected_node_id!, "gap", value),
      flexDirection: (value?: string) =>
        changeNodeStyle(selected_node_id!, "flexDirection", value),
      flexWrap: (value?: string) =>
        changeNodeStyle(selected_node_id!, "flexWrap", value),
      justifyContent: (value?: string) =>
        changeNodeStyle(selected_node_id!, "justifyContent", value),
      alignItems: (value?: string) =>
        changeNodeStyle(selected_node_id!, "alignItems", value),
      cursor: (value?: string) =>
        changeNodeStyle(selected_node_id!, "cursor", value),
      objectFit: (value?: string) =>
        changeNodeStyle(selected_node_id!, "objectFit", value),
    };
  }, [
    selected_node_id,
    changeNodeComponent,
    changeNodeText,
    // changeNodeAttribute,
    changeNodeStyle,
    changeNodeValue,
  ]);

  return useMemo(() => {
    return {
      state,
      selected_node_id,
      selectedNode,
      selectNode,
      changeNodeActive,
      pointerEnterNode,
      pointerLeaveNode,
      changeNodeProps,
      clearSelection,
      changeNodeComponent,
      changeNodeText,
      changeNodeStyle,
      changeNodeValue,
    };
  }, [
    state,
    selected_node_id,
    selectedNode,
    selectNode,
    changeNodeActive,
    pointerEnterNode,
    pointerLeaveNode,
    changeNodeProps,
    clearSelection,
    changeNodeComponent,
    changeNodeText,
    changeNodeStyle,
    changeNodeValue,
  ]);
}

export function useEventTarget() {
  const [state, dispatch] = useInternal();

  const {
    is_gesture_node_drag_move: is_node_transforming,
    hovered_node_id,
    selected_node_id,
  } = state;

  const pointerMove = useCallback(
    (event: PointerEvent) => {
      const els = get_grida_node_elements_from_point(
        event.clientX,
        event.clientY
      );

      dispatch({
        type: "document/canvas/backend/html/event/on-pointer-move",
        node_ids_from_point: els.map((n) => n.id),
      });
    },
    [dispatch]
  );

  const pointerDown = useCallback(
    (event: PointerEvent) => {
      const els = get_grida_node_elements_from_point(
        event.clientX,
        event.clientY
      );

      dispatch({
        type: "document/canvas/backend/html/event/on-pointer-down",
        node_ids_from_point: els.map((n) => n.id),
      });
    },
    [dispatch]
  );

  const pointerUp = useCallback(
    (event: PointerEvent) => {
      dispatch({
        type: "document/canvas/backend/html/event/on-pointer-up",
      });
    },
    [dispatch]
  );

  const dragStart = useCallback(() => {
    dispatch({
      type: "document/canvas/backend/html/event/on-drag-start",
    });
  }, [dispatch]);

  const dragEnd = useCallback(() => {
    dispatch({
      type: "document/canvas/backend/html/event/on-drag-end",
    });
  }, [dispatch]);

  const drag = useCallback(
    (event: { delta: Vector2; distance: Vector2 }) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "document/canvas/backend/html/event/on-drag",
          event,
        });
      });
    },
    [dispatch]
  );

  // #region drag resize handle
  const dragResizeHandleStart = useCallback(
    (node_id: string, client_wh: { width: number; height: number }) => {
      dispatch({
        type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-start",
        node_id,
        client_wh,
      });
    },
    [dispatch]
  );
  const dragResizeHandleEnd = useCallback(
    (node_id: string) => {
      dispatch({
        type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-end",
        node_id,
      });
    },
    [dispatch]
  );
  const dragResizeHandle = useCallback(
    (
      node_id: string,
      anchor: "nw" | "ne" | "sw" | "se",
      event: { delta: Vector2; distance: Vector2 }
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag",
          node_id,
          anchor,
          event,
        });
      });
    },
    [dispatch]
  );
  // #endregion drag resize handle

  // #region drag resize handle
  const dragCornerRadiusHandleStart = useCallback(
    (node_id: string) => {
      dispatch({
        type: "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-start",
        node_id,
      });
    },
    [dispatch]
  );
  const dragCornerRadiusHandleEnd = useCallback(
    (node_id: string) => {
      dispatch({
        type: "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-end",
        node_id,
      });
    },
    [dispatch]
  );
  const dragCornerRadiusHandleHandle = useCallback(
    (
      node_id: string,
      anchor: "nw" | "ne" | "sw" | "se",
      event: { delta: Vector2; distance: Vector2 }
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag",
          node_id,
          anchor,
          event,
        });
      });
    },
    [dispatch]
  );
  // #endregion drag resize handle

  return useMemo(() => {
    return {
      hovered_node_id,
      selected_node_id,
      is_node_transforming,
      //
      dragResizeHandleStart,
      dragResizeHandleEnd,
      dragResizeHandle,
      //
      dragCornerRadiusHandleStart,
      dragCornerRadiusHandleEnd,
      dragCornerRadiusHandleHandle,
      //
      pointerMove,
      pointerDown,
      pointerUp,
      //
      dragStart,
      dragEnd,
      drag,
      //
    };
  }, [
    hovered_node_id,
    selected_node_id,
    is_node_transforming,
    //
    dragResizeHandleStart,
    dragResizeHandleEnd,
    dragResizeHandle,
    //
    dragCornerRadiusHandleStart,
    dragCornerRadiusHandleEnd,
    dragCornerRadiusHandleHandle,
    //
    pointerMove,
    pointerDown,
    pointerUp,
    //
    dragStart,
    dragEnd,
    drag,
    //
  ]);
}

/**
 * Must be used when root node is {@link grida.program.nodes.TemplateInstanceNode} node
 */
export function useRootTemplateInstanceNode() {
  const { state, changeNodeProps } = useDocument();

  const { document, templates } = state;

  const rootnode = document.nodes[document.root_id];

  assert(rootnode.type === "template_instance", "root node must be template");
  assert(templates && templates[rootnode.template_id], "template not found");

  const rootProperties = rootnode.properties || {};
  const rootProps = rootnode.props || {};
  const rootDefault = state.templates![rootnode.template_id].default || {};

  const changeRootProps = useCallback(
    (key: string, value: any) => {
      changeNodeProps(state.document.root_id, key, value);
    },
    [changeNodeProps, state.document.root_id]
  );

  return useMemo(
    () => ({
      rootProperties,
      rootProps,
      rootDefault,
      changeRootProps,
    }),
    [rootProperties, rootProps, rootDefault, changeRootProps]
  );
}

export function useNode(node_id: string) {
  const {
    state: {
      document: { nodes },
      templates,
    },
  } = useDocument();

  let node_definition: grida.program.nodes.Node | undefined = undefined;
  let node_overrides:
    | grida.program.document.template.NodeChanges[string]
    | undefined = undefined;

  if (nodes[node_id]) {
    node_overrides = undefined;
    node_definition = nodes[node_id];
  } else {
    assert(
      templates,
      'node is not found under "nodes", but templates are not provided for additional lookup'
    );
    // TODO: can do better with the query - performance
    // find the template definition that contains this node id
    const template_id = Object.keys(templates).find((k) => {
      return templates[k].nodes[node_id] !== undefined;
    });

    assert(
      template_id,
      `node_id ${node_id} is not found in any templates' node definitions`
    );

    const template_instance_node_id = Object.keys(nodes).find((k) => {
      const node = nodes[k];
      return (
        node.type === "template_instance" && node.template_id === template_id
      );
    });

    assert(
      template_instance_node_id,
      `template_instance node is not found for template_id ${template_id}`
    );

    const overrides = (
      nodes[
        template_instance_node_id
      ] as grida.program.nodes.TemplateInstanceNode
    ).overrides;

    node_overrides = overrides[node_id];
    node_definition = templates[template_id].nodes[node_id];
  }

  const node: grida.program.nodes.AnyNode = useMemo(() => {
    return Object.assign(
      {},
      node_definition,
      node_overrides || {}
    ) as grida.program.nodes.AnyNode;
  }, [node_definition, node_overrides]);

  return node;
}

export function useComputedNode(node_id: string) {
  const node = useNode(node_id);
  const { active, style, component_id, props, text, src, href } = node;
  const computed = useComputed({
    text: text,
    src: src,
    href: href,
    props: props,
  });

  return computed;
}

export function useTemplateDefinition(template_id: string) {
  const {
    state: { templates },
  } = useDocument();

  return templates![template_id];
}

export function useNodeDomElement(node_id: string) {
  return useMemo(() => {
    return document.getElementById(node_id);
  }, [node_id]);
}

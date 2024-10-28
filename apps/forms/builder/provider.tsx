import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import type {
  DocumentDispatcher,
  ITemplateEditorState,
  NodeSlotMeta,
} from "./types";
import type { Tokens } from "@/ast";

const DocumentContext = createContext<ITemplateEditorState | null>(null);

const __noop: DocumentDispatcher = () => void 0;
const DocumentDispatcherContext = createContext<DocumentDispatcher>(__noop);

export function StandaloneDocumentEditor({
  state,
  dispatch,
  children,
}: React.PropsWithChildren<{
  state: ITemplateEditorState;
  dispatch?: DocumentDispatcher;
}>) {
  useEffect(() => {
    if (!state.readonly && !dispatch) {
      console.error(
        "DocumentEditor: dispatch is required when readonly is false"
      );
    }
  }, [state.readonly, dispatch]);

  const __dispatch = state.readonly ? __noop : dispatch ?? __noop;

  return (
    <DocumentContext.Provider value={state}>
      <DocumentDispatcherContext.Provider value={__dispatch}>
        {children}
      </DocumentDispatcherContext.Provider>
    </DocumentContext.Provider>
  );
}

export function useDocument() {
  const document = useContext(DocumentContext);
  if (!document) {
    throw new Error("useDocument must be used within a DocumentEditor");
  }

  const dispatch = useContext(DocumentDispatcherContext);

  const { selected_node_id } = document;

  const selectNode = useCallback(
    (node_id: string, meta?: NodeSlotMeta) => {
      dispatch({
        type: "document/node/select",
        node_id,
        meta,
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

  const rootProperties = document.template.properties || {};
  const rootProps = document.template.props || {};

  const changeRootProps = useCallback(
    (key: string, value: any) => {
      dispatch({
        type: "document/template/change/props",
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
        type: "document/template/override/node/change/component",
        node_id: node_id,
        component_id: component_id,
      });
    },
    [dispatch]
  );

  const changeNodeText = useCallback(
    (node_id: string, text?: Tokens.StringValueExpression) => {
      dispatch({
        type: "document/template/override/node/change/text",
        node_id: node_id,
        text,
      });
    },
    [dispatch]
  );

  const changeNodeActive = useCallback(
    (node_id: string, hidden: boolean) => {
      dispatch({
        type: "document/template/override/node/change/active",
        node_id: node_id,
        active: hidden,
      });
    },
    [dispatch]
  );

  // const changeNodeAttribute = useCallback(
  //   (node_id: string, key: string, value: any) => {
  //     dispatch(
  //       composeDocumentAction(document_key, {
  //         type: "editor/document/node/attribute",
  //         node_id: node_id,
  //         data: {
  //           [key]: value,
  //         },
  //       })
  //     );
  //   },
  //   [dispatch, document_key]
  // );

  const changeNodeSrc = useCallback(
    (node_id: string, src?: string) => {
      dispatch({
        type: "document/template/override/node/change/src",
        node_id: node_id,
        src,
      });
    },
    [dispatch]
  );

  const changeNodeStyle = useCallback(
    (node_id: string, key: string, value: any) => {
      dispatch({
        type: "document/template/override/node/change/style",
        node_id: node_id,
        style: {
          [key]: value,
        },
      });
    },
    [dispatch]
  );

  const changeNodeValue = useCallback(
    (node_id: string, key: string, value: any) => {
      dispatch({
        type: "document/template/override/node/change/props",
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
      style: (key: string, value: any) =>
        changeNodeStyle(selected_node_id!, key, value),
      value: (key: string, value: any) =>
        changeNodeValue(selected_node_id!, key, value),
      // attributes
      active: (active: boolean) => changeNodeActive(selected_node_id!, active),
      src: (src?: string) => changeNodeSrc(selected_node_id!, src),

      // style
      opacity: (value: number) =>
        changeNodeStyle(selected_node_id!, "opacity", value),
      fontWeight: (value: number) =>
        changeNodeStyle(selected_node_id!, "fontWeight", value),
      fontSize: (value?: number) =>
        changeNodeStyle(selected_node_id!, "fontSize", value),
      textAlign: (value: string) =>
        changeNodeStyle(selected_node_id!, "textAlign", value),
      borderRadius: (value?: number) =>
        changeNodeStyle(selected_node_id!, "borderRadius", value),
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
      document,
      rootProps,
      rootProperties,
      selectedNode,
      selectNode,
      changeNodeActive,
      pointerEnterNode,
      pointerLeaveNode,
      changeRootProps,
      clearSelection,
      changeNodeComponent,
      changeNodeText,
      // changeNodeAttribute,
      changeNodeStyle,
      changeNodeValue,
    };
  }, [
    document,
    rootProps,
    rootProperties,
    selectedNode,
    selectNode,
    changeNodeActive,
    pointerEnterNode,
    pointerLeaveNode,
    changeRootProps,
    clearSelection,
    changeNodeComponent,
    changeNodeText,
    // changeNodeAttribute,
    changeNodeStyle,
    changeNodeValue,
  ]);
}

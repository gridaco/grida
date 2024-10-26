import assert from "assert";
import { useEditorState } from "./use-editor";
import { useCallback, useMemo } from "react";
import { EditorDocumentAction } from "./action";
import { BuilderAction } from "@/builder/action";
import { Tokens } from "@/ast";
import { UnknwonNodeMeta } from "@/builder/types";

function composeDocumentAction(
  document_key: "form/collection" | "form/startpage",
  action: BuilderAction
): EditorDocumentAction {
  return {
    type: "editor/document",
    key: document_key,
    action,
  };
}

export function useDocument(
  document_key: "form/startpage" | "form/collection"
) {
  const [state, dispatch] = useEditorState();
  assert(state.documents, "state.documents is required");
  const document = state.documents[document_key];
  assert(document, "document is required");

  const { selected_node_id } = document;

  const selectNode = useCallback(
    (node_id: string, meta?: UnknwonNodeMeta) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "document/node/select",
          node_id,
          meta,
        })
      );
    },
    [dispatch, document_key]
  );

  const pointerEnterNode = useCallback(
    (node_id: string) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "document/node/on-pointer-enter",
          node_id,
        })
      );
    },
    [dispatch, document_key]
  );

  const pointerLeaveNode = useCallback(
    (node_id: string) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "document/node/on-pointer-leave",
          node_id,
        })
      );
    },
    [dispatch, document_key]
  );

  const rootValues = document.template.props;
  const rootProperties = document.template.properties;

  const changeRootValues = useCallback(
    (key: string, value: any) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "document/template/change/props",
          props: {
            [key]: value,
          },
        })
      );
    },
    [dispatch, document_key]
  );

  const clearSelection = useCallback(
    () =>
      dispatch(
        composeDocumentAction(document_key, {
          type: "document/node/select",
          node_id: undefined,
        })
      ),
    [dispatch, document_key]
  );

  const changeNodeComponent = useCallback(
    (node_id: string, component_id: string) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "document/template/override/node/change/component",
          node_id: node_id,
          component_id: component_id,
        })
      );
    },
    [dispatch, document_key]
  );

  const changeNodeText = useCallback(
    (node_id: string, text?: Tokens.StringValueExpression) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "document/template/override/node/change/text",
          node_id: node_id,
          text,
        })
      );
    },
    [dispatch, document_key]
  );

  const changeNodeHidden = useCallback(
    (node_id: string, hidden: boolean) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "document/template/override/node/change/hidden",
          node_id: node_id,
          hidden,
        })
      );
    },
    [dispatch, document_key]
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
    (node_id: string, src: string) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "document/template/override/node/change/src",
          node_id: node_id,
          src,
        })
      );
    },
    [dispatch, document_key]
  );

  const changeNodeStyle = useCallback(
    (node_id: string, key: string, value: any) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "document/template/override/node/change/style",
          node_id: node_id,
          style: {
            [key]: value,
          },
        })
      );
    },
    [dispatch, document_key]
  );

  const changeNodeValue = useCallback(
    (node_id: string, key: string, value: any) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "document/template/override/node/change/props",
          node_id: node_id,
          props: {
            [key]: value,
          },
        })
      );
    },
    [dispatch, document_key]
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
      hidden: (hidden: boolean) => changeNodeHidden(selected_node_id!, hidden),
      src: (src: string) => changeNodeSrc(selected_node_id!, src),

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
      rootValues,
      rootProperties,
      selectedNode,
      selectNode,
      changeNodeHidden,
      pointerEnterNode,
      pointerLeaveNode,
      changeRootValues,
      clearSelection,
      changeNodeComponent,
      changeNodeText,
      // changeNodeAttribute,
      changeNodeStyle,
      changeNodeValue,
    };
  }, [
    document,
    rootValues,
    rootProperties,
    selectedNode,
    selectNode,
    changeNodeHidden,
    pointerEnterNode,
    pointerLeaveNode,
    changeRootValues,
    clearSelection,
    changeNodeComponent,
    changeNodeText,
    // changeNodeAttribute,
    changeNodeStyle,
    changeNodeValue,
  ]);
}

export function useCurrentDocument() {
  const [state, dispatch] = useEditorState();
  const { selected_page_id } = state;
  assert(selected_page_id, "selected_page_id is required");
  return useDocument(selected_page_id as any);
}

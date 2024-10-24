import assert from "assert";
import { useEditorState } from "./use-editor";
import { useCallback, useMemo } from "react";
import { EditorDocumentAction } from "./action";
import { BuilderAction } from "@/builder/action";
import { Tokens } from "@/ast";

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

  const rootValues = document.template.values;

  const changeRootValues = useCallback(
    (key: string, value: any) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "editor/template/node/property",
          values: {
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
          type: "editor/document/node/select",
          node_id: undefined,
        })
      ),
    [dispatch, document_key]
  );

  const changeNodeComponent = useCallback(
    (node_id: string, component_id: string) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "editor/document/node/switch-component",
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
          type: "editor/document/node/text",
          node_id: node_id,
          text,
        })
      );
    },
    [dispatch, document_key]
  );

  const changeNodeAttribute = useCallback(
    (node_id: string, key: string, value: any) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "editor/document/node/attribute",
          node_id: node_id,
          data: {
            [key]: value,
          },
        })
      );
    },
    [dispatch, document_key]
  );

  const changeNodeStyle = useCallback(
    (node_id: string, key: string, value: any) => {
      dispatch(
        composeDocumentAction(document_key, {
          type: "editor/document/node/style",
          node_id: node_id,
          data: {
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
          type: "editor/document/node/property",
          node_id: node_id,
          values: {
            [key]: value,
          },
        })
      );
    },
    [dispatch, document_key]
  );

  const changeSelectedNode = useMemo(
    () => ({
      component: (component_id: string) =>
        changeNodeComponent(selected_node_id!, component_id),
      text: (text?: Tokens.StringValueExpression) =>
        changeNodeText(selected_node_id!, text),
      attribute: (key: string, value: any) =>
        changeNodeAttribute(selected_node_id!, key, value),
      style: (key: string, value: any) =>
        changeNodeStyle(selected_node_id!, key, value),
      value: (key: string, value: any) =>
        changeNodeValue(selected_node_id!, key, value),
      // attributes
      hidden: (value: boolean) =>
        changeNodeAttribute(selected_node_id!, "hidden", value),

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
    }),
    [
      selected_node_id,
      changeNodeComponent,
      changeNodeText,
      changeNodeAttribute,
      changeNodeStyle,
      changeNodeValue,
    ]
  );

  return useMemo(() => {
    return {
      document,
      rootValues,
      changeSelectedNode,
      changeRootValues,
      clearSelection,
      changeNodeComponent,
      changeNodeText,
      changeNodeAttribute,
      changeNodeStyle,
      changeNodeValue,
    };
  }, [
    document,
    rootValues,
    changeSelectedNode,
    changeRootValues,
    clearSelection,
    changeNodeComponent,
    changeNodeText,
    changeNodeAttribute,
    changeNodeStyle,
    changeNodeValue,
  ]);
}

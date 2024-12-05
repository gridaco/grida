"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import {
  type DocumentDispatcher,
  type IDocumentEditorState,
  type IDocumentEditorInit,
  initDocumentEditorState,
  CursorMode,
  SurfaceRaycastTargeting,
} from "./types";
import type { Tokens } from "@/ast";
import { grida } from "@/grida";
import { useComputed } from "./nodes/use-computed";
import {
  DataProvider,
  ProgramDataContextHost,
} from "@/grida/react-runtime/data-context/context";
import assert from "assert";
import { documentquery } from "./document-query";
import { GoogleFontsManager } from "./components/google-fonts";
import { domapi } from "./domapi";
import { cmath } from "./math";
import { TCanvasEventTargetDragGestureState } from "./action";

type Vector2 = [number, number];

const DocumentContext = createContext<IDocumentEditorState | null>(null);

const __noop: DocumentDispatcher = () => void 0;
const DocumentDispatcherContext = createContext<DocumentDispatcher>(__noop);

export function StandaloneDocumentEditor({
  initial,
  editable,
  dispatch,
  children,
}: React.PropsWithChildren<{
  editable: boolean;
  initial: Omit<IDocumentEditorInit, "editable">;
  dispatch?: DocumentDispatcher;
}>) {
  useEffect(() => {
    if (editable && !dispatch) {
      console.error(
        "DocumentEditor: dispatch is required when readonly is false"
      );
    }
  }, [editable, dispatch]);

  const __dispatch = editable ? dispatch ?? __noop : __noop;

  const rootnode = initial.document.nodes[initial.document.root_id];
  assert(rootnode, "root node is not found");
  const shallowRootProps = useMemo(() => {
    if (rootnode.type === "component") {
      // transform property definitions to props with default values
      const virtual_props_from_definition = Object.entries(
        rootnode.properties
      ).reduce(
        (acc, [key, value]) => {
          acc[key] = value.default;
          return acc;
        },
        {} as Record<string, Tokens.StringValueExpression>
      );

      return virtual_props_from_definition;
    }
    if (rootnode.type === "template_instance") {
      const defaultProps = initial.templates![rootnode.template_id].default;
      return Object.assign({}, defaultProps, rootnode.props);
    } else {
      return {};
    }
  }, [rootnode]);

  return (
    <DocumentContext.Provider
      value={initDocumentEditorState({ ...initial, editable })}
    >
      <DocumentDispatcherContext.Provider value={__dispatch}>
        <ProgramDataContextHost>
          <DataProvider data={{ props: shallowRootProps }}>
            <EditorGoogleFontsManager>
              {/*  */}
              {children}
            </EditorGoogleFontsManager>
          </DataProvider>
        </ProgramDataContextHost>
      </DocumentDispatcherContext.Provider>
    </DocumentContext.Provider>
  );
}

function EditorGoogleFontsManager({ children }: React.PropsWithChildren<{}>) {
  const { state } = useDocument();

  const fonts = state.googlefonts;

  return (
    <GoogleFontsManager stylesheets fonts={fonts}>
      {children}
    </GoogleFontsManager>
  );
}

export function __useInternal() {
  const state = useContext(DocumentContext);
  if (!state) {
    throw new Error(
      "useDocument must be used within a StandaloneDocumentEditor"
    );
  }

  const dispatch = useContext(DocumentDispatcherContext);

  return useMemo(() => [state, dispatch] as const, [state, dispatch]);
}

function __useNodeActions(dispatch: DocumentDispatcher) {
  //
  //
  const selectNode = useCallback(
    (node_id: string) => {
      dispatch({
        type: "document/node/select",
        node_id,
      });
    },
    [dispatch]
  );

  const orderPushBack = useCallback(
    (node_id: string) => {
      dispatch({
        type: "node/order/back",
        node_id,
      });
    },
    [dispatch]
  );

  const orderBringFront = useCallback(
    (node_id: string) => {
      dispatch({
        type: "node/order/front",
        node_id,
      });
    },
    [dispatch]
  );

  const toggleNodeActive = useCallback(
    (node_id: string) => {
      dispatch({
        type: "node/toggle/active",
        node_id: node_id,
      });
    },
    [dispatch]
  );

  const toggleNodeLocked = useCallback(
    (node_id: string) => {
      dispatch({
        type: "node/toggle/locked",
        node_id: node_id,
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

  const changeNodeName = useCallback(
    (node_id: string, name: string) => {
      dispatch({
        type: "node/change/name",
        node_id: node_id,
        name: name,
      });
    },
    [dispatch]
  );

  const changeNodeUserData = useCallback(
    (node_id: string, userdata: unknown) => {
      dispatch({
        type: "node/change/userdata",
        node_id: node_id,
        userdata: userdata as any,
      });
    },
    [dispatch]
  );

  const changeNodeActive = useCallback(
    (node_id: string, active: boolean) => {
      dispatch({
        type: "node/change/active",
        node_id: node_id,
        active: active,
      });
    },
    [dispatch]
  );

  const changeNodeLocked = useCallback(
    (node_id: string, locked: boolean) => {
      dispatch({
        type: "node/change/locked",
        node_id: node_id,
        locked: locked,
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

  const changeNodeRotation = useCallback(
    (node_id: string, rotation: number) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/rotation",
          node_id: node_id,
          rotation,
        });
      });
    },
    [dispatch]
  );

  const changeNodeSize = useCallback(
    (
      node_id: string,
      axis: "width" | "height",
      length: grida.program.css.Length | "auto"
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/size",
          node_id: node_id,
          axis,
          length,
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

  const changeNodeFit = useCallback(
    (node_id: string, fit: grida.program.cg.BoxFit) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/fit",
          node_id: node_id,
          fit,
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

  // text style
  const changeTextNodeFontFamily = useCallback(
    (node_id: string, fontFamily: string | undefined) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/fontFamily",
          node_id: node_id,
          fontFamily,
        });
      });
    },
    [dispatch]
  );

  const changeTextNodeFontWeight = useCallback(
    (node_id: string, fontWeight: grida.program.cg.NFontWeight) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/fontWeight",
          node_id: node_id,
          fontWeight,
        });
      });
    },
    [dispatch]
  );

  const changeTextNodeFontSize = useCallback(
    (node_id: string, fontSize: number) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/fontSize",
          node_id: node_id,
          fontSize,
        });
      });
    },
    [dispatch]
  );

  const changeTextNodeTextAlign = useCallback(
    (node_id: string, textAlign: grida.program.cg.TextAlign) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/textAlign",
          node_id: node_id,
          textAlign,
        });
      });
    },
    [dispatch]
  );

  const changeTextNodeTextAlignVertical = useCallback(
    (
      node_id: string,
      textAlignVertical: grida.program.cg.TextAlignVertical
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/textAlignVertical",
          node_id: node_id,
          textAlignVertical,
        });
      });
    },
    [dispatch]
  );

  const changeTextNodeLineHeight = useCallback(
    (
      node_id: string,
      lineHeight: grida.program.nodes.TextNode["lineHeight"]
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/lineHeight",
          node_id: node_id,
          lineHeight,
        });
      });
    },
    [dispatch]
  );

  const changeTextNodeLetterSpacing = useCallback(
    (
      node_id: string,
      letterSpacing: grida.program.nodes.TextNode["letterSpacing"]
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/letterSpacing",
          node_id: node_id,
          letterSpacing,
        });
      });
    },
    [dispatch]
  );

  const changeTextNodeMaxlength = useCallback(
    (node_id: string, maxlength: number | undefined) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/maxlength",
          node_id: node_id,
          maxlength,
        });
      });
    },
    [dispatch]
  );

  //
  const changeNodeBorder = useCallback(
    (node_id: string, border: grida.program.css.Border | undefined) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/border",
          node_id: node_id,
          border: border,
        });
      });
    },
    [dispatch]
  );

  //

  const changeContainerNodePadding = useCallback(
    (node_id: string, padding: grida.program.nodes.i.IPadding["padding"]) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/padding",
          node_id: node_id,
          padding,
        });
      });
    },
    [dispatch]
  );

  const changeContainerNodeLayout = useCallback(
    (
      node_id: string,
      layout: grida.program.nodes.i.IFlexContainer["layout"]
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/layout",
          node_id: node_id,
          layout,
        });
      });
    },
    [dispatch]
  );

  const changeFlexContainerNodeDirection = useCallback(
    (node_id: string, direction: grida.program.cg.Axis) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/direction",
          node_id: node_id,
          direction,
        });
      });
    },
    [dispatch]
  );

  const changeFlexContainerNodeMainAxisAlignment = useCallback(
    (
      node_id: string,
      mainAxisAlignment: grida.program.cg.MainAxisAlignment
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/mainAxisAlignment",
          node_id: node_id,
          mainAxisAlignment,
        });
      });
    },
    [dispatch]
  );

  const changeFlexContainerNodeCrossAxisAlignment = useCallback(
    (
      node_id: string,
      crossAxisAlignment: grida.program.cg.CrossAxisAlignment
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/crossAxisAlignment",
          node_id: node_id,
          crossAxisAlignment,
        });
      });
    },
    [dispatch]
  );

  const changeFlexContainerNodeGap = useCallback(
    (
      node_id: string,
      gap: number | { mainAxisGap: number; crossAxisGap: number }
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/gap",
          node_id: node_id,
          gap,
        });
      });
    },
    [dispatch]
  );
  //

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

  return useMemo(
    () => ({
      selectNode,
      orderPushBack,
      orderBringFront,
      pointerEnterNode,
      pointerLeaveNode,
      toggleNodeActive,
      toggleNodeLocked,
      changeNodeActive,
      changeNodeLocked,
      changeNodeName,
      changeNodeUserData,
      changeNodeSize,
      changeNodeBorder,
      changeNodeProps,
      changeNodeComponent,
      changeNodeText,
      changeNodeStyle,
      changeNodeSrc,
      changeNodeHref,
      changeNodeTarget,
      changeNodePositioning,
      changeNodePositioningMode,
      changeNodeCornerRadius,
      changeNodeFill,
      changeNodeFit,
      changeNodeOpacity,
      changeNodeRotation,
      changeTextNodeFontFamily,
      changeTextNodeFontWeight,
      changeTextNodeFontSize,
      changeTextNodeTextAlign,
      changeTextNodeTextAlignVertical,
      changeTextNodeLineHeight,
      changeTextNodeLetterSpacing,
      changeTextNodeMaxlength,
      changeContainerNodePadding,
      changeContainerNodeLayout,
      changeFlexContainerNodeDirection,
      changeFlexContainerNodeMainAxisAlignment,
      changeFlexContainerNodeCrossAxisAlignment,
      changeFlexContainerNodeGap,
    }),
    [dispatch]
  );
}

export function useNodeAction(node_id: string | undefined) {
  const [_, dispatch] = __useInternal();
  const nodeActions = __useNodeActions(dispatch);

  return useMemo(() => {
    if (!node_id) return;
    return {
      pushBack: () => nodeActions.orderPushBack(node_id),
      bringFront: () => nodeActions.orderBringFront(node_id),
      toggleLocked: () => nodeActions.toggleNodeLocked(node_id),
      toggleActive: () => nodeActions.toggleNodeActive(node_id),
      component: (component_id: string) =>
        nodeActions.changeNodeComponent(node_id, component_id),
      text: (text?: Tokens.StringValueExpression) =>
        nodeActions.changeNodeText(node_id, text),
      style: (
        key: keyof grida.program.css.ExplicitlySupportedCSSProperties,
        value: any
      ) => nodeActions.changeNodeStyle(node_id, key, value),
      value: (key: string, value: any) =>
        nodeActions.changeNodeProps(node_id, key, value),
      // attributes
      userdata: (value: any) => nodeActions.changeNodeUserData(node_id, value),
      name: (name: string) => nodeActions.changeNodeName(node_id, name),
      active: (active: boolean) =>
        nodeActions.changeNodeActive(node_id, active),
      locked: (locked: boolean) =>
        nodeActions.changeNodeLocked(node_id, locked),
      src: (src?: Tokens.StringValueExpression) =>
        nodeActions.changeNodeSrc(node_id, src),
      href: (href?: grida.program.nodes.i.IHrefable["href"]) =>
        nodeActions.changeNodeHref(node_id, href),
      target: (target?: grida.program.nodes.i.IHrefable["target"]) =>
        nodeActions.changeNodeTarget(node_id, target),

      positioning: (value: grida.program.nodes.i.IPositioning) =>
        nodeActions.changeNodePositioning(node_id, value),
      positioningMode: (value: "absolute" | "relative") =>
        nodeActions.changeNodePositioningMode(node_id, value),

      //
      cornerRadius: (
        value: grida.program.nodes.i.IRectangleCorner["cornerRadius"]
      ) => nodeActions.changeNodeCornerRadius(node_id, value),
      fill: (value: grida.program.cg.PaintWithoutID) =>
        nodeActions.changeNodeFill(node_id, value),
      fit: (value: grida.program.cg.BoxFit) =>
        nodeActions.changeNodeFit(node_id, value),
      // stylable
      opacity: (value: number) => nodeActions.changeNodeOpacity(node_id, value),
      rotation: (value: number) =>
        nodeActions.changeNodeRotation(node_id, value),
      width: (value: grida.program.css.Length | "auto") =>
        nodeActions.changeNodeSize(node_id, "width", value),
      height: (value: grida.program.css.Length | "auto") =>
        nodeActions.changeNodeSize(node_id, "height", value),

      // text style
      fontFamily: (value: string) =>
        nodeActions.changeTextNodeFontFamily(node_id, value),
      fontWeight: (value: grida.program.cg.NFontWeight) =>
        nodeActions.changeTextNodeFontWeight(node_id, value),
      fontSize: (value: number) =>
        nodeActions.changeTextNodeFontSize(node_id, value),
      textAlign: (value: grida.program.cg.TextAlign) =>
        nodeActions.changeTextNodeTextAlign(node_id, value),
      textAlignVertical: (value: grida.program.cg.TextAlignVertical) =>
        nodeActions.changeTextNodeTextAlignVertical(node_id, value),
      lineHeight: (value: grida.program.nodes.TextNode["lineHeight"]) =>
        nodeActions.changeTextNodeLineHeight(node_id, value),
      letterSpacing: (value: grida.program.nodes.TextNode["letterSpacing"]) =>
        nodeActions.changeTextNodeLetterSpacing(node_id, value),
      maxLength: (value: number | undefined) =>
        nodeActions.changeTextNodeMaxlength(node_id, value),

      // border
      border: (value: grida.program.css.Border | undefined) =>
        nodeActions.changeNodeBorder(node_id, value),

      padding: (value: grida.program.nodes.i.IPadding["padding"]) =>
        nodeActions.changeContainerNodePadding(node_id, value),
      // margin: (value?: number) =>
      //   changeNodeStyle(node_id, "margin", value),

      // layout
      layout: (value: grida.program.nodes.i.IFlexContainer["layout"]) =>
        nodeActions.changeContainerNodeLayout(node_id, value),
      direction: (value: grida.program.cg.Axis) =>
        nodeActions.changeFlexContainerNodeDirection(node_id, value),
      // flexWrap: (value?: string) =>
      //   changeNodeStyle(node_id, "flexWrap", value),
      mainAxisAlignment: (value: grida.program.cg.MainAxisAlignment) =>
        nodeActions.changeFlexContainerNodeMainAxisAlignment(node_id, value),
      crossAxisAlignment: (value: grida.program.cg.CrossAxisAlignment) =>
        nodeActions.changeFlexContainerNodeCrossAxisAlignment(node_id, value),
      gap: (value: number | { mainAxisGap: number; crossAxisGap: number }) =>
        nodeActions.changeFlexContainerNodeGap(node_id, value),

      // css style
      aspectRatio: (value?: number) =>
        nodeActions.changeNodeStyle(node_id, "aspectRatio", value),
      boxShadow: (value?: any) =>
        nodeActions.changeNodeStyle(node_id, "boxShadow", value.boxShadow),
      cursor: (value?: string) =>
        nodeActions.changeNodeStyle(node_id, "cursor", value),
    };
  }, [node_id, nodeActions]);
}

export function useDocument() {
  const [state, dispatch] = __useInternal();

  const { selected_node_ids } = state;

  const nodeActions = __useNodeActions(dispatch);

  const cut = useCallback(
    (target: "selection" | (string & {}) = "selection") => {
      dispatch({
        type: "cut",
        target: target,
      });
    },
    [dispatch]
  );

  const copy = useCallback(
    (target: "selection" | (string & {}) = "selection") => {
      dispatch({
        type: "copy",
        target: target,
      });
    },
    [dispatch]
  );

  const paste = useCallback(() => {
    dispatch({
      type: "paste",
    });
  }, [dispatch]);

  const deleteNode = useCallback(
    (target: "selection" | (string & {}) = "selection") => {
      dispatch({
        type: "delete",
        target: target,
      });
    },
    [dispatch]
  );

  const nudge = useCallback(
    (
      target: "selection" | (string & {}) = "selection",
      axis: "x" | "y",
      delta: number = 1
    ) => {
      dispatch({
        type: "nudge",
        delta,
        axis,
        target,
      });
    },
    [dispatch]
  );

  const align = useCallback(
    (
      target: "selection" | (string & {}) = "selection",
      alignment: {
        horizontal?: "none" | "min" | "max" | "center";
        vertical?: "none" | "min" | "max" | "center";
      }
    ) => {
      dispatch({
        type: "align",
        target,
        alignment,
      });
    },
    [dispatch]
  );

  const configureSurfaceRaycastTargeting = useCallback(
    (config: Partial<SurfaceRaycastTargeting>) => {
      dispatch({
        type: "config/surface/raycast-targeting",
        config,
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

  const getNodeById = useCallback(
    (node_id: string): grida.program.nodes.Node => {
      return documentquery.__getNodeById(state, node_id);
    },
    [state.document.nodes]
  );

  const getNodeDepth = useCallback(
    (node_id: string) => {
      const parent_ids = [];
      let current_id = node_id;

      // Traverse up the tree to collect parent IDs
      while (state.document_ctx.__ctx_nid_to_parent_id[current_id]) {
        const parent_id = state.document_ctx.__ctx_nid_to_parent_id[current_id];
        parent_ids.push(parent_id);
        if (current_id === parent_id) {
          reportError("parent_id is same as current_id");
          break;
        }
        current_id = parent_id;
      }

      return parent_ids.length;
    },
    [state.document_ctx]
  );

  const getNodeAbsoluteRotation = useCallback(
    (node_id: string) => {
      const parent_ids = [];
      let current_id = node_id;

      // Traverse up the tree to collect parent IDs
      while (state.document_ctx.__ctx_nid_to_parent_id[current_id]) {
        const parent_id = state.document_ctx.__ctx_nid_to_parent_id[current_id];
        parent_ids.push(parent_id);
        if (current_id === parent_id) {
          reportError("parent_id is same as current_id");
          break;
        }
        current_id = parent_id;
      }
      parent_ids.reverse();

      // Calculate the absolute rotation
      let rotation = 0;
      try {
        for (const parent_id of parent_ids) {
          const parent_node = getNodeById(parent_id);
          assert(parent_node, `parent node not found: ${parent_id}`);
          if ("rotation" in parent_node) {
            rotation += parent_node.rotation ?? 0;
          }
        }

        // finally, add the node's own rotation
        const node = getNodeById(node_id);
        assert(node, `node not found: ${node_id}`);
        if ("rotation" in node) {
          rotation += node.rotation ?? 0;
        }
      } catch (e) {
        reportError(e);
      }

      return rotation;
    },
    [state.document_ctx, getNodeById]
  );

  const insertNode = useCallback(
    (prototype: grida.program.nodes.NodePrototype) => {
      dispatch({
        type: "document/insert",
        prototype,
      });
    },
    [dispatch]
  );

  const schemaDefineProperty = useCallback(
    (name?: string, definition?: grida.program.schema.PropertyDefinition) => {
      dispatch({
        type: "document/schema/property/define",
        name: name,
        definition: definition,
      });
    },
    [dispatch]
  );

  const schemaRenameProperty = useCallback(
    (name: string, newName: string) => {
      dispatch({
        type: "document/schema/property/rename",
        name,
        newName,
      });
    },
    [dispatch]
  );

  const schemaUpdateProperty = useCallback(
    (name: string, definition: grida.program.schema.PropertyDefinition) => {
      dispatch({
        type: "document/schema/property/update",
        name: name,
        definition: definition,
      });
    },
    [dispatch]
  );

  const schemaDeleteProperty = useCallback(
    (name: string) => {
      dispatch({ type: "document/schema/property/delete", name: name });
    },
    [dispatch]
  );

  const selectedNodeActions = useNodeAction(
    selected_node_ids.length === 1 ? selected_node_ids[0] : undefined
  );
  const selectedNode =
    selected_node_ids.length === 1 ? selectedNodeActions : undefined;

  return useMemo(() => {
    return {
      state,
      selected_node_ids,
      selectedNode,
      //
      cut,
      copy,
      paste,
      deleteNode,
      nudge,
      align,
      configureSurfaceRaycastTargeting,
      //
      clearSelection,
      getNodeDepth,
      getNodeAbsoluteRotation,
      insertNode,
      ...nodeActions,
      schemaDefineProperty,
      schemaRenameProperty,
      schemaUpdateProperty,
      schemaDeleteProperty,
    };
  }, [
    state,
    selected_node_ids,
    selectedNode,
    //
    cut,
    copy,
    paste,
    deleteNode,
    nudge,
    align,
    configureSurfaceRaycastTargeting,
    //
    clearSelection,
    getNodeDepth,
    getNodeAbsoluteRotation,
    insertNode,
    nodeActions,
    schemaDefineProperty,
    schemaRenameProperty,
    schemaUpdateProperty,
    schemaDeleteProperty,
  ]);
}

function throttle<T extends (...args: any[]) => void>(
  func: T,
  limit: number
): T {
  let inThrottle: boolean;
  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  } as T;
}

export function useEventTargetCSSCursor() {
  const [state] = __useInternal();

  const { cursor_mode } = state;

  return useMemo(() => {
    switch (cursor_mode.type) {
      case "cursor": {
        return "default";
      }
      case "insert": {
        switch (cursor_mode.node) {
          case "text":
            return "text";
          case "rectangle":
          case "ellipse":
          case "container":
          case "image":
          case "line":
            return "crosshair";
        }
      }
    }
  }, [cursor_mode]);
}

export function useEventTarget() {
  const [state, dispatch] = __useInternal();

  const {
    is_gesture_node_drag_move: is_node_transforming,
    hovered_node_id,
    selected_node_ids,
    surface_content_edit_mode: content_edit_mode,
    cursor_mode,
    marquee,
  } = state;

  const setCursorMode = useCallback(
    (cursor_mode: CursorMode) => {
      dispatch({
        type: "document/canvas/cursor-mode",
        cursor_mode,
      });
    },
    [dispatch]
  );

  const _throttled_pointer_move_with_raycast = useCallback(
    throttle((event: PointerEvent, position) => {
      // this is throttled - as it is expensive
      const els = domapi.get_grida_node_elements_from_point(
        event.clientX,
        event.clientY
      );

      dispatch({
        type: "document/canvas/backend/html/event/on-pointer-move-raycast",
        node_ids_from_point: els.map((n) => n.id),
        position,
        shiftKey: event.shiftKey,
      });
    }, 30),
    [dispatch]
  );

  const __canvas_space_position = (
    pointer_event: PointerEvent | MouseEvent
  ) => {
    const { clientX, clientY } = pointer_event;

    const canvas_rect = domapi.get_viewport_rect();
    const position = {
      x: clientX - canvas_rect.left,
      y: clientY - canvas_rect.top,
    };

    return position;
  };

  const pointerMove = useCallback(
    (event: PointerEvent) => {
      const position = __canvas_space_position(event);

      dispatch({
        type: "document/canvas/backend/html/event/on-pointer-move",
        position: position,
      });

      _throttled_pointer_move_with_raycast(event, position);
    },
    [dispatch, _throttled_pointer_move_with_raycast]
  );

  const pointerDown = useCallback(
    (event: PointerEvent) => {
      const els = domapi.get_grida_node_elements_from_point(
        event.clientX,
        event.clientY
      );

      dispatch({
        type: "document/canvas/backend/html/event/on-pointer-down",
        node_ids_from_point: els.map((n) => n.id),
        shiftKey: event.shiftKey,
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

  const click = useCallback(
    (event: MouseEvent) => {
      const position = __canvas_space_position(event);
      dispatch({
        type: "document/canvas/backend/html/event/on-click",
        position,
      });
    },
    [dispatch]
  );

  /**
   * Try to enter content edit mode - only works when the selected node is a text or vector node
   *
   * when triggered on such invalid context, it should be a no-op
   */
  const tryEnterContentEditMode = useCallback(() => {
    dispatch({
      type: "document/canvas/content-edit-mode/try-enter",
    });
  }, [dispatch]);

  const tryExitContentEditMode = useCallback(() => {
    dispatch({
      type: "document/canvas/content-edit-mode/try-exit",
    });
  }, [dispatch]);

  const dragStart = useCallback(
    (event: PointerEvent) => {
      dispatch({
        type: "document/canvas/backend/html/event/on-drag-start",
        shiftKey: event.shiftKey,
      });
    },
    [dispatch]
  );

  const dragEnd = useCallback(
    (event: PointerEvent) => {
      if (marquee) {
        const contained: string[] = [];

        const els = domapi.get_grida_node_elements();
        const viewportdomrect = domapi.get_viewport_rect();
        const viewport_pos = [viewportdomrect.x, viewportdomrect.y];
        const translate: [number, number] = [
          state.translate ? state.translate[0] : 0,
          state.translate ? state.translate[1] : 0,
        ];

        const marqueerect = cmath.rect.fromPoints([
          [marquee.x1, marquee.y1],
          [marquee.x2, marquee.y2],
        ]);
        marqueerect.x = marqueerect.x - translate[0];
        marqueerect.y = marqueerect.y - translate[1];

        els?.forEach((el) => {
          const eldomrect = el.getBoundingClientRect();
          const elrect = {
            x: eldomrect.x - translate[0] - viewport_pos[0],
            y: eldomrect.y - translate[1] - viewport_pos[1],
            width: eldomrect.width,
            height: eldomrect.height,
          };
          if (cmath.rect.intersects(elrect, marqueerect)) {
            contained.push(el.id);
          }
        });

        dispatch({
          type: "document/canvas/backend/html/event/on-drag-end",
          node_ids_from_area: contained,
          shiftKey: event.shiftKey,
        });

        return;
      }
      dispatch({
        type: "document/canvas/backend/html/event/on-drag-end",
        shiftKey: event.shiftKey,
      });
    },
    [dispatch, marquee, state.translate]
  );

  const drag = useCallback(
    (event: TCanvasEventTargetDragGestureState) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "document/canvas/backend/html/event/on-drag",
          event,
        });
      });
    },
    [dispatch]
  );

  //
  const layerClick = useCallback(
    (selection: string[], event: MouseEvent) => {
      const els = domapi.get_grida_node_elements_from_point(
        event.clientX,
        event.clientY
      );

      dispatch({
        type: "document/canvas/backend/html/event/node-overlay/on-click",
        selection: selection,
        node_ids_from_point: els.map((n) => n.id),
        shiftKey: event.shiftKey,
      });
    },
    [dispatch]
  );
  const layerDragStart = useCallback(
    (selection: string[], event: TCanvasEventTargetDragGestureState) => {
      dispatch({
        type: "document/canvas/backend/html/event/node-overlay/on-drag-start",
        selection,
        event,
      });
    },
    [dispatch]
  );
  const layerDragEnd = useCallback(
    (selection: string[], event: TCanvasEventTargetDragGestureState) => {
      dispatch({
        type: "document/canvas/backend/html/event/node-overlay/on-drag-end",
        selection,
        event,
      });
    },
    [dispatch]
  );
  const layerDrag = useCallback(
    (selection: string[], event: TCanvasEventTargetDragGestureState) => {
      dispatch({
        type: "document/canvas/backend/html/event/node-overlay/on-drag",
        selection,
        event,
      });
    },
    [dispatch]
  );
  //

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
      event: TCanvasEventTargetDragGestureState
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
  const dragCornerRadiusHandle = useCallback(
    (
      node_id: string,
      anchor: "nw" | "ne" | "sw" | "se",
      event: TCanvasEventTargetDragGestureState
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

  // #region drag rotate handle
  const dragRotationHandleStart = useCallback(
    (node_id: string) => {
      dispatch({
        type: "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-start",
        node_id,
      });
    },
    [dispatch]
  );
  const dragRotationHandleEnd = useCallback(
    (node_id: string) => {
      dispatch({
        type: "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-end",
        node_id,
      });
    },
    [dispatch]
  );
  const dragRotationHandle = useCallback(
    (
      node_id: string,
      anchor: "nw" | "ne" | "sw" | "se",
      event: TCanvasEventTargetDragGestureState
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag",
          node_id,
          anchor,
          event,
        });
      });
    },
    [dispatch]
  );
  // #endregion drag rotate handle

  return useMemo(() => {
    return {
      marquee,
      cursor_mode,
      setCursorMode,
      //
      hovered_node_id,
      selected_node_ids,
      is_node_transforming,
      content_edit_mode,
      //
      dragResizeHandleStart,
      dragResizeHandleEnd,
      dragResizeHandle,
      //
      dragCornerRadiusHandleStart,
      dragCornerRadiusHandleEnd,
      dragCornerRadiusHandle,
      //
      dragRotationHandleStart,
      dragRotationHandleEnd,
      dragRotationHandle,
      //
      pointerMove,
      pointerDown,
      pointerUp,
      click,
      //
      tryEnterContentEditMode,
      tryExitContentEditMode,
      //
      dragStart,
      dragEnd,
      drag,
      //
      layerClick,
      layerDragStart,
      layerDragEnd,
      layerDrag,
      //
    };
  }, [
    marquee,
    cursor_mode,
    setCursorMode,
    //
    hovered_node_id,
    selected_node_ids,
    is_node_transforming,
    content_edit_mode,
    //
    dragResizeHandleStart,
    dragResizeHandleEnd,
    dragResizeHandle,
    //
    dragCornerRadiusHandleStart,
    dragCornerRadiusHandleEnd,
    dragCornerRadiusHandle,
    //
    dragRotationHandleStart,
    dragRotationHandleEnd,
    dragRotationHandle,
    //
    pointerMove,
    pointerDown,
    pointerUp,
    click,
    //
    tryEnterContentEditMode,
    tryExitContentEditMode,
    //
    dragStart,
    dragEnd,
    drag,
    //
    layerClick,
    layerDragStart,
    layerDragEnd,
    layerDrag,
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

export function useNode(node_id: string): grida.program.nodes.AnyNode & {
  meta: {
    is_component_consumer: boolean;
  };
} {
  const {
    state: {
      document: { nodes, root_id },
      templates,
    },
  } = useDocument();

  const root = nodes[root_id];

  let node_definition: grida.program.nodes.Node | undefined = undefined;
  let node_change: grida.program.nodes.NodeChange = undefined;

  if (nodes[node_id]) {
    node_change = undefined;
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

    node_change = overrides[node_id];
    node_definition = templates[template_id].nodes[node_id];
  }

  const node: grida.program.nodes.AnyNode = useMemo(() => {
    return Object.assign(
      {},
      node_definition,
      node_change || {}
    ) as grida.program.nodes.AnyNode;
  }, [node_definition, node_change]);

  const is_component_consumer =
    root.type === "component" ||
    root.type === "instance" ||
    root.type === "template_instance";

  return {
    ...node,
    meta: {
      is_component_consumer: is_component_consumer,
    },
  };
}

export function useComputedNode(node_id: string) {
  const node = useNode(node_id);
  const { active, style, component_id, props, text, html, src, href } = node;
  const computed = useComputed({
    text: text,
    html: html,
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

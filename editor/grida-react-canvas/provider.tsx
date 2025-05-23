"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  type DocumentDispatcher,
  type IDocumentEditorState,
  type IDocumentEditorInit,
  initDocumentEditorState,
  ToolMode,
  SurfaceRaycastTargeting,
} from "./state";
import type { tokens } from "@grida/tokens";
import grida from "@grida/schema";
import { useComputed } from "./nodes/use-computed";
import {
  DataProvider,
  ProgramDataContextHost,
} from "@/grida-react-program-context/data-context/context";
import assert from "assert";
import { document } from "./document-query";
import { GoogleFontsManager } from "./components/google-fonts";
import { domapi } from "./domapi";
import { cmath } from "@grida/cmath";
import type { TCanvasEventTargetDragGestureState, TChange } from "./action";
import mixed, { PropertyCompareFn } from "@grida/mixed-properties";
import deepEqual from "deep-equal";
import iosvg from "@grida/io-svg";
import { toast } from "sonner";
import { BitmapEditorBrush } from "@grida/bitmap";
import { is_direct_component_consumer } from "@/grida-canvas-utils/utils/supports";
import type cg from "@grida/cg";
import nid from "./reducers/tools/id";

const CONFIG_CANVAS_TRANSFORM_SCALE_MIN = 0.02;
const CONFIG_CANVAS_TRANSFORM_SCALE_MAX = 256;

const DocumentContext = createContext<IDocumentEditorState | null>(null);

const __noop: DocumentDispatcher = () => void 0;
const DocumentDispatcherContext = createContext<DocumentDispatcher>(__noop);

export function StandaloneDocumentEditor({
  initial,
  editable,
  dispatch,
  children,
  debug = false,
}: React.PropsWithChildren<{
  editable: boolean;
  debug?: boolean;
  initial: Omit<IDocumentEditorInit, "editable" | "debug">;
  dispatch?: DocumentDispatcher;
}>) {
  useEffect(() => {
    if (editable && !dispatch) {
      console.error(
        "DocumentEditor: dispatch is required when readonly is false"
      );
    }
  }, [editable, dispatch]);

  const __dispatch = useMemo(
    () => (editable ? (dispatch ?? __noop) : __noop),
    [editable]
  );

  const state = useMemo(
    () => initDocumentEditorState({ ...initial, editable, debug }),
    [initial, editable, debug]
  );

  // TODO:
  // const rootnode = initial.document.nodes[initial.document.root_id];
  // assert(rootnode, "root node is not found");
  // const shallowRootProps = useMemo(() => {
  //   if (rootnode.type === "component") {
  //     // transform property definitions to props with default values
  //     const virtual_props_from_definition = Object.entries(
  //       rootnode.properties
  //     ).reduce(
  //       (acc, [key, value]) => {
  //         acc[key] = value.default;
  //         return acc;
  //       },
  //       {} as Record<string, tokens.StringValueExpression>
  //     );

  //     return virtual_props_from_definition;
  //   }
  //   if (rootnode.type === "template_instance") {
  //     const defaultProps = initial.templates![rootnode.template_id].default;
  //     return Object.assign({}, defaultProps, rootnode.props);
  //   } else {
  //     return {};
  //   }
  // }, [rootnode]);

  const props = Object.entries(state.document.properties ?? {}).reduce(
    (acc, [key, value]) => {
      acc[key] = value.default;
      return acc;
    },
    {} as Record<string, tokens.StringValueExpression>
  );

  return (
    <DocumentContext.Provider value={state}>
      <DocumentDispatcherContext.Provider value={__dispatch}>
        <ProgramDataContextHost>
          <DataProvider data={{ props: props }}>
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

function __useDispatch() {
  return useContext(DocumentDispatcherContext);
}

function __useInternal() {
  const state = useContext(DocumentContext);
  if (!state) {
    throw new Error(
      "useDocument must be used within a StandaloneDocumentEditor"
    );
  }

  const dispatch = __useDispatch();

  return useMemo(() => [state, dispatch] as const, [state, dispatch]);
}

function __useNodeActions(dispatch: DocumentDispatcher) {
  const order = useCallback(
    (node_id: string, order: "back" | "front" | number) => {
      dispatch({
        type: "order",
        target: node_id,
        order: order,
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

  const toggleNodeBold = useCallback(
    (node_id: string) => {
      dispatch({
        type: "node/toggle/bold",
        node_id: node_id,
      });
    },
    [dispatch]
  );

  const hoverNode = useCallback(
    (node_id: string, event: "enter" | "leave") => {
      dispatch({
        type: "hover",
        target: node_id,
        event,
      });
    },
    [dispatch]
  );

  const hoverEnterNode = useCallback(
    (node_id: string) => hoverNode(node_id, "enter"),
    [hoverNode]
  );

  const hoverLeaveNode = useCallback(
    (node_id: string) => hoverNode(node_id, "leave"),
    [hoverNode]
  );

  const changeNodeProps = useCallback(
    (node_id: string, key: string, value?: tokens.StringValueExpression) => {
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
    (node_id: string, text?: tokens.StringValueExpression) => {
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
    (node_id: string, src?: tokens.StringValueExpression) => {
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
    (node_id: string, opacity: TChange<number>) => {
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
    (node_id: string, rotation: TChange<number>) => {
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
      value: grida.program.css.LengthPercentage | "auto"
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/size",
          node_id: node_id,
          axis,
          value: value,
        });
      });
    },
    [dispatch]
  );

  const changeNodeFill = useCallback(
    (
      node_id: string,
      fill:
        | grida.program.nodes.i.props.SolidPaintToken
        | cg.PaintWithoutID
        | null
    ) => {
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

  const changeNodeStroke = useCallback(
    (
      node_id: string,
      stroke:
        | grida.program.nodes.i.props.SolidPaintToken
        | cg.PaintWithoutID
        | null
    ) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/stroke",
          node_id: node_id,
          stroke,
        });
      });
    },
    [dispatch]
  );

  const changeNodeStrokeWidth = useCallback(
    (node_id: string, strokeWidth: TChange<number>) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/stroke-width",
          node_id: node_id,
          strokeWidth,
        });
      });
    },
    [dispatch]
  );

  const changeNodeStrokeCap = useCallback(
    (node_id: string, strokeCap: cg.StrokeCap) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/stroke-cap",
          node_id: node_id,
          strokeCap,
        });
      });
    },
    [dispatch]
  );

  const changeNodeFit = useCallback(
    (node_id: string, fit: cg.BoxFit) => {
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
    (node_id: string, fontWeight: cg.NFontWeight) => {
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
    (node_id: string, fontSize: TChange<number>) => {
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
    (node_id: string, textAlign: cg.TextAlign) => {
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
    (node_id: string, textAlignVertical: cg.TextAlignVertical) => {
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
      lineHeight: TChange<grida.program.nodes.TextNode["lineHeight"]>
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
      letterSpacing: TChange<grida.program.nodes.TextNode["letterSpacing"]>
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

  const changeNodeBoxShadow = useCallback(
    (node_id: string, boxShadow?: cg.BoxShadow) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "node/change/box-shadow",
          node_id: node_id,
          boxShadow,
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
    (node_id: string, direction: cg.Axis) => {
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
    (node_id: string, mainAxisAlignment: cg.MainAxisAlignment) => {
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
    (node_id: string, crossAxisAlignment: cg.CrossAxisAlignment) => {
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

  const changeNodeMouseCursor = useCallback(
    (node_id: string, cursor: cg.SystemMouseCursor) => {
      dispatch({
        type: "node/change/mouse-cursor",
        node_id,
        cursor,
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

  return useMemo(
    () => ({
      order,
      hoverNode,
      hoverEnterNode,
      hoverLeaveNode,
      toggleNodeActive,
      toggleNodeLocked,
      toggleNodeBold,
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
      changeNodeMouseCursor,
      changeNodeSrc,
      changeNodeHref,
      changeNodeTarget,
      changeNodePositioning,
      changeNodePositioningMode,
      changeNodeCornerRadius,
      changeNodeFill,
      changeNodeStroke,
      changeNodeStrokeWidth,
      changeNodeStrokeCap,
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
      changeNodeBoxShadow,
      changeContainerNodeLayout,
      changeFlexContainerNodeDirection,
      changeFlexContainerNodeMainAxisAlignment,
      changeFlexContainerNodeCrossAxisAlignment,
      changeFlexContainerNodeGap,
    }),
    [dispatch]
  );
}

type NudgeUXConfig = {
  /**
   * when gesture is true, it will set the gesture state to trigger the surface guide rendering.
   *
   * @default true
   */
  gesture: boolean;
  /**
   * delay in ms to toggle off the gesture state
   *
   * @default 500
   */
  delay: number;
};

function __useGestureNudgeState(dispatch: DocumentDispatcher) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const __gesture_nudge_debounced = useCallback(
    (state: "on" | "off", delay: number) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        dispatch({
          type: "gesture/nudge",
          state: "off",
        });
      }, delay);
    },
    [dispatch]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return __gesture_nudge_debounced;
}

export function useNodeAction(node_id: string | undefined) {
  const dispatch = __useDispatch();
  const nodeActions = __useNodeActions(dispatch);

  return useMemo(() => {
    if (!node_id) return;
    return {
      order: (order: "back" | "front" | number) =>
        nodeActions.order(node_id, order),
      toggleLocked: () => nodeActions.toggleNodeLocked(node_id),
      toggleActive: () => nodeActions.toggleNodeActive(node_id),
      toggleBold: () => nodeActions.toggleNodeBold(node_id),
      component: (component_id: string) =>
        nodeActions.changeNodeComponent(node_id, component_id),
      text: (text?: tokens.StringValueExpression) =>
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
      src: (src?: tokens.StringValueExpression) =>
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
      fill: (
        value:
          | grida.program.nodes.i.props.SolidPaintToken
          | cg.PaintWithoutID
          | null
      ) => nodeActions.changeNodeFill(node_id, value),
      stroke: (
        value:
          | grida.program.nodes.i.props.SolidPaintToken
          | cg.PaintWithoutID
          | null
      ) => nodeActions.changeNodeStroke(node_id, value),
      strokeWidth: (change: TChange<number>) =>
        nodeActions.changeNodeStrokeWidth(node_id, change),
      strokeCap: (value: cg.StrokeCap) =>
        nodeActions.changeNodeStrokeCap(node_id, value),
      fit: (value: cg.BoxFit) => nodeActions.changeNodeFit(node_id, value),
      // stylable
      opacity: (change: TChange<number>) =>
        nodeActions.changeNodeOpacity(node_id, change),
      rotation: (change: TChange<number>) =>
        nodeActions.changeNodeRotation(node_id, change),
      width: (value: grida.program.css.LengthPercentage | "auto") =>
        nodeActions.changeNodeSize(node_id, "width", value),
      height: (value: grida.program.css.LengthPercentage | "auto") =>
        nodeActions.changeNodeSize(node_id, "height", value),

      // text style
      fontFamily: (value: string) =>
        nodeActions.changeTextNodeFontFamily(node_id, value),
      fontWeight: (value: cg.NFontWeight) =>
        nodeActions.changeTextNodeFontWeight(node_id, value),
      fontSize: (change: TChange<number>) =>
        nodeActions.changeTextNodeFontSize(node_id, change),
      textAlign: (value: cg.TextAlign) =>
        nodeActions.changeTextNodeTextAlign(node_id, value),
      textAlignVertical: (value: cg.TextAlignVertical) =>
        nodeActions.changeTextNodeTextAlignVertical(node_id, value),
      lineHeight: (
        change: TChange<grida.program.nodes.TextNode["lineHeight"]>
      ) => nodeActions.changeTextNodeLineHeight(node_id, change),
      letterSpacing: (
        change: TChange<grida.program.nodes.TextNode["letterSpacing"]>
      ) => nodeActions.changeTextNodeLetterSpacing(node_id, change),
      maxLength: (value: number | undefined) =>
        nodeActions.changeTextNodeMaxlength(node_id, value),

      // border
      border: (value: grida.program.css.Border | undefined) =>
        nodeActions.changeNodeBorder(node_id, value),

      padding: (value: grida.program.nodes.i.IPadding["padding"]) =>
        nodeActions.changeContainerNodePadding(node_id, value),
      // margin: (value?: number) =>
      //   changeNodeStyle(node_id, "margin", value),
      boxShadow: (value?: cg.BoxShadow) =>
        nodeActions.changeNodeBoxShadow(node_id, value),

      // layout
      layout: (value: grida.program.nodes.i.IFlexContainer["layout"]) =>
        nodeActions.changeContainerNodeLayout(node_id, value),
      direction: (value: cg.Axis) =>
        nodeActions.changeFlexContainerNodeDirection(node_id, value),
      // flexWrap: (value?: string) =>
      //   changeNodeStyle(node_id, "flexWrap", value),
      mainAxisAlignment: (value: cg.MainAxisAlignment) =>
        nodeActions.changeFlexContainerNodeMainAxisAlignment(node_id, value),
      crossAxisAlignment: (value: cg.CrossAxisAlignment) =>
        nodeActions.changeFlexContainerNodeCrossAxisAlignment(node_id, value),
      gap: (value: number | { mainAxisGap: number; crossAxisGap: number }) =>
        nodeActions.changeFlexContainerNodeGap(node_id, value),

      // css style
      aspectRatio: (value?: number) =>
        nodeActions.changeNodeStyle(node_id, "aspectRatio", value),
      cursor: (value: cg.SystemMouseCursor) =>
        nodeActions.changeNodeMouseCursor(node_id, value),
    };
  }, [node_id, nodeActions]);
}

const compareProperty: PropertyCompareFn<grida.program.nodes.UnknwonNode> = (
  key,
  a,
  b
): boolean => {
  switch (key) {
    case "fill":
    case "stroke":
      // support gradient (as the id should be ignored)
      const { id: __, ..._a } = (a ?? {}) as cg.AnyPaint;
      const { id: _, ..._b } = (b ?? {}) as cg.AnyPaint;
      return deepEqual(_a, _b);
  }
  return deepEqual(a, b);
};

export function useSelection() {
  const [state, dispatch] = __useInternal();
  const __actions = __useNodeActions(dispatch);
  const selection = state.selection;

  const nodes = useMemo(() => {
    return selection.map((node_id) => {
      return state.document.nodes[node_id];
    });
  }, [selection, state.document.nodes]);

  const mixedProperties = useMemo(
    () =>
      mixed<grida.program.nodes.UnknwonNode, typeof grida.mixed>(
        nodes as grida.program.nodes.UnknwonNode[],
        {
          idKey: "id",
          ignoredKey: ["id", "type", "userdata"],
          compare: compareProperty,
          mixed: grida.mixed,
        }
      ),
    [nodes]
  );

  const name = useCallback(
    (value: string) => {
      selection.forEach((id) => {
        __actions.changeNodeName(id, value);
      });
    },
    [selection, __actions]
  );

  const copy = useCallback(() => {
    dispatch({
      type: "copy",
      target: "selection",
    });
  }, [dispatch]);

  const active = useCallback(
    (value: boolean) => {
      selection.forEach((id) => {
        __actions.changeNodeActive(id, value);
      });
    },
    [selection, __actions]
  );

  const locked = useCallback(
    (value: boolean) => {
      selection.forEach((id) => {
        __actions.changeNodeLocked(id, value);
      });
    },
    [selection, __actions]
  );

  const rotation = useCallback(
    (change: TChange<number>) => {
      mixedProperties.rotation?.ids.forEach((id) => {
        __actions.changeNodeRotation(id, change);
      });
    },
    [mixedProperties.rotation?.ids, __actions]
  );

  const opacity = useCallback(
    (change: TChange<number>) => {
      mixedProperties.opacity?.ids.forEach((id) => {
        __actions.changeNodeOpacity(id, change);
      });
    },
    [mixedProperties.opacity?.ids, __actions]
  );

  const width = useCallback(
    (value: grida.program.css.LengthPercentage | "auto") => {
      mixedProperties.width?.ids.forEach((id) => {
        __actions.changeNodeSize(id, "width", value);
      });
    },
    [mixedProperties.width?.ids, __actions]
  );

  const height = useCallback(
    (value: grida.program.css.LengthPercentage | "auto") => {
      mixedProperties.height?.ids.forEach((id) => {
        __actions.changeNodeSize(id, "height", value);
      });
    },
    [mixedProperties.height?.ids, __actions]
  );

  const positioningMode = useCallback(
    (position: grida.program.nodes.i.IPositioning["position"]) => {
      mixedProperties.position?.ids.forEach((id) => {
        __actions.changeNodePositioningMode(id, position);
      });
    },
    [mixedProperties.position?.ids, __actions]
  );

  const fontFamily = useCallback(
    (value: string) => {
      mixedProperties.fontFamily?.ids.forEach((id) => {
        __actions.changeTextNodeFontFamily(id, value);
      });
    },
    [mixedProperties.fontFamily?.ids, __actions]
  );

  const fontWeight = useCallback(
    (value: cg.NFontWeight) => {
      mixedProperties.fontWeight?.ids.forEach((id) => {
        __actions.changeTextNodeFontWeight(id, value);
      });
    },
    [mixedProperties.fontWeight?.ids, __actions]
  );

  const fontSize = useCallback(
    (change: TChange<number>) => {
      mixedProperties.fontSize?.ids.forEach((id) => {
        __actions.changeTextNodeFontSize(id, change);
      });
    },
    [mixedProperties.fontSize?.ids, __actions]
  );

  const lineHeight = useCallback(
    (change: TChange<grida.program.nodes.TextNode["lineHeight"]>) => {
      mixedProperties.lineHeight?.ids.forEach((id) => {
        __actions.changeTextNodeLineHeight(id, change);
      });
    },
    [mixedProperties.lineHeight?.ids, __actions]
  );

  const letterSpacing = useCallback(
    (change: TChange<grida.program.nodes.TextNode["letterSpacing"]>) => {
      mixedProperties.letterSpacing?.ids.forEach((id) => {
        __actions.changeTextNodeLetterSpacing(id, change);
      });
    },
    [mixedProperties.letterSpacing?.ids, __actions]
  );

  const textAlign = useCallback(
    (value: cg.TextAlign) => {
      mixedProperties.textAlign?.ids.forEach((id) => {
        __actions.changeTextNodeTextAlign(id, value);
      });
    },
    [mixedProperties.textAlign?.ids, __actions]
  );

  const textAlignVertical = useCallback(
    (value: cg.TextAlignVertical) => {
      mixedProperties.textAlignVertical?.ids.forEach((id) => {
        __actions.changeTextNodeTextAlignVertical(id, value);
      });
    },
    [mixedProperties.textAlignVertical?.ids, __actions]
  );

  const fit = useCallback(
    (value: cg.BoxFit) => {
      mixedProperties.fit?.ids.forEach((id) => {
        __actions.changeNodeFit(id, value);
      });
    },
    [mixedProperties.fit?.ids, __actions]
  );

  const fill = useCallback(
    (
      value:
        | grida.program.nodes.i.props.SolidPaintToken
        | cg.PaintWithoutID
        | null
    ) => {
      mixedProperties.fill?.ids.forEach((id) => {
        __actions.changeNodeFill(id, value);
      });
    },
    [mixedProperties.fill?.ids, __actions]
  );

  const stroke = useCallback(
    (
      value:
        | grida.program.nodes.i.props.SolidPaintToken
        | cg.PaintWithoutID
        | null
    ) => {
      mixedProperties.stroke?.ids.forEach((id) => {
        __actions.changeNodeStroke(id, value);
      });
    },
    [mixedProperties.stroke?.ids, __actions]
  );

  const strokeWidth = useCallback(
    (change: TChange<number>) => {
      mixedProperties.strokeWidth?.ids.forEach((id) => {
        __actions.changeNodeStrokeWidth(id, change);
      });
    },
    [mixedProperties.strokeWidth?.ids, __actions]
  );

  const strokeCap = useCallback(
    (value: cg.StrokeCap) => {
      mixedProperties.strokeCap?.ids.forEach((id) => {
        __actions.changeNodeStrokeCap(id, value);
      });
    },
    [mixedProperties.strokeCap?.ids, __actions]
  );

  const layout = useCallback(
    (value: grida.program.nodes.i.IFlexContainer["layout"]) => {
      mixedProperties.layout?.ids.forEach((id) => {
        __actions.changeContainerNodeLayout(id, value);
      });
    },
    [mixedProperties.layout?.ids, __actions]
  );

  const direction = useCallback(
    (value: cg.Axis) => {
      mixedProperties.direction?.ids.forEach((id) => {
        __actions.changeFlexContainerNodeDirection(id, value);
      });
    },
    [mixedProperties.direction?.ids, __actions]
  );

  const mainAxisAlignment = useCallback(
    (value: cg.MainAxisAlignment) => {
      mixedProperties.mainAxisAlignment?.ids.forEach((id) => {
        __actions.changeFlexContainerNodeMainAxisAlignment(id, value);
      });
    },
    [mixedProperties.mainAxisAlignment?.ids, __actions]
  );

  const crossAxisAlignment = useCallback(
    (value: cg.CrossAxisAlignment) => {
      mixedProperties.crossAxisAlignment?.ids.forEach((id) => {
        __actions.changeFlexContainerNodeCrossAxisAlignment(id, value);
      });
    },
    [mixedProperties.crossAxisAlignment?.ids, __actions]
  );

  const cornerRadius = useCallback(
    (value: grida.program.nodes.i.IRectangleCorner["cornerRadius"]) => {
      mixedProperties.cornerRadius?.ids.forEach((id) => {
        __actions.changeNodeCornerRadius(id, value);
      });
    },
    [mixedProperties.cornerRadius?.ids, __actions]
  );

  const cursor = useCallback(
    (value: cg.SystemMouseCursor) => {
      mixedProperties.cursor?.ids.forEach((id) => {
        __actions.changeNodeMouseCursor(id, value);
      });
    },
    [mixedProperties.cursor?.ids, __actions]
  );

  const actions = useMemo(
    () => ({
      copy,
      active,
      locked,
      name,
      rotation,
      opacity,
      width,
      height,
      positioningMode,
      fontWeight,
      fontFamily,
      fontSize,
      lineHeight,
      letterSpacing,
      textAlign,
      textAlignVertical,
      fit,
      fill,
      stroke,
      strokeWidth,
      strokeCap,
      layout,
      direction,
      mainAxisAlignment,
      crossAxisAlignment,
      cornerRadius,
      cursor,
    }),
    [
      copy,
      active,
      locked,
      name,
      rotation,
      opacity,
      width,
      height,
      positioningMode,
      fontWeight,
      fontFamily,
      fontSize,
      lineHeight,
      letterSpacing,
      textAlign,
      textAlignVertical,
      fit,
      fill,
      stroke,
      strokeWidth,
      strokeCap,
      layout,
      direction,
      mainAxisAlignment,
      crossAxisAlignment,
      cornerRadius,
      cursor,
    ]
  );

  return useMemo(() => {
    return {
      selection,
      nodes,
      properties: mixedProperties,
      actions,
    };
  }, [selection, nodes, mixedProperties, actions]);
  //
}

export function useSelectionPaints() {
  const [state, dispatch] = __useInternal();
  const __actions = __useNodeActions(dispatch);
  const selection = state.selection;

  const ids = useMemo(
    // selection & its recursive children
    () => [
      ...selection,
      ...selection
        .map((s) => document.getChildren(state.document_ctx, s, true))
        .flat(),
    ],
    [selection, state.document_ctx]
  );

  const allnodes = useMemo(() => {
    return ids.map((node_id) => {
      return state.document.nodes[node_id];
    });
  }, [ids, state.document.nodes]);

  const mixedProperties = useMemo(
    () =>
      mixed<grida.program.nodes.UnknwonNode, typeof grida.mixed>(
        allnodes as grida.program.nodes.UnknwonNode[],
        {
          idKey: "id",
          ignoredKey: (key) => {
            return ![
              "fill",
              // TODO: support stroke
              // "stroke"
            ].includes(key);
          },
          compare: compareProperty,
          mixed: grida.mixed,
        }
      ),
    [allnodes]
  );

  const paints = mixedProperties.fill?.values ?? [];

  const setPaint = useCallback(
    (
      index: number,
      value:
        | grida.program.nodes.i.props.SolidPaintToken
        | cg.PaintWithoutID
        | null
        | null
    ) => {
      const group = paints[index];
      group.ids.forEach((id) => {
        __actions.changeNodeFill(id, value);
      });
    },
    [paints, __actions]
  );

  return useMemo(() => {
    return {
      selection,
      ids,
      paints,
      setPaint,
    };
  }, [selection, paints, ids, setPaint]);
}

export function useDocument() {
  const [state, dispatch] = __useInternal();

  const {
    selection,
    transform,
    scene_id,
    document: { scenes },
  } = state;

  const { order: _, ...nodeActions } = __useNodeActions(dispatch);

  const createNodeId = useCallback(() => {
    return nid();
  }, []);

  const loadScene = useCallback(
    (scene: string) => {
      dispatch({
        type: "load",
        scene,
      });
    },
    [dispatch]
  );

  const createScene = useCallback(
    (scene?: grida.program.document.SceneInit) => {
      dispatch({
        type: "scenes/new",
        scene,
      });
    },
    [dispatch]
  );

  const deleteScene = useCallback(
    (scene: string) => {
      dispatch({
        type: "scenes/delete",
        scene,
      });
    },
    [dispatch]
  );

  const duplicateScene = useCallback(
    (scene: string) => {
      dispatch({
        type: "scenes/duplicate",
        scene,
      });
    },
    [dispatch]
  );

  const renameScene = useCallback(
    (scene: string, name: string) => {
      dispatch({
        type: "scenes/change/name",
        scene,
        name,
      });
    },
    [dispatch]
  );

  const select = useCallback(
    (...selectors: grida.program.document.Selector[]) =>
      dispatch({
        type: "select",
        selectors: selectors,
      }),
    [dispatch]
  );

  const blur = useCallback(
    () =>
      dispatch({
        type: "blur",
      }),
    [dispatch]
  );

  const undo = useCallback(() => {
    dispatch({
      type: "undo",
    });
  }, [dispatch]);

  const redo = useCallback(() => {
    dispatch({
      type: "redo",
    });
  }, [dispatch]);

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

  const duplicate = useCallback(
    (target: "selection" | (string & {}) = "selection") => {
      dispatch({
        type: "duplicate",
        target,
      });
    },
    [dispatch]
  );

  const clipboardColor = state.user_clipboard_color;

  const setClipboardColor = useCallback(
    (color: cg.RGBA8888) => {
      dispatch({
        type: "clip/color",
        color,
      });
    },
    [dispatch]
  );

  const deleteNode = useCallback(
    (target: "selection" | (string & {}) = "selection") => {
      dispatch({
        type: "delete",
        target: target,
      });
    },
    [dispatch]
  );

  const __gesture_nudge = useCallback(
    (state: "on" | "off") => {
      dispatch({
        type: "gesture/nudge",
        state,
      });
    },
    [dispatch]
  );

  const __gesture_nudge_debounced = __useGestureNudgeState(dispatch);

  const nudge = useCallback(
    (
      target: "selection" | (string & {}) = "selection",
      axis: "x" | "y",
      delta: number = 1,
      config: NudgeUXConfig = {
        delay: 500,
        gesture: true,
      }
    ) => {
      const { gesture = true, delay = 500 } = config;

      if (gesture) {
        // Trigger gesture
        __gesture_nudge("on");

        // Debounce to turn off gesture
        __gesture_nudge_debounced("off", delay);
      }

      dispatch({
        type: "nudge",
        delta,
        axis,
        target,
      });
    },
    [dispatch]
  );

  const nudgeResize = useCallback(
    (
      target: "selection" | (string & {}) = "selection",
      axis: "x" | "y",
      delta: number = 1
    ) => {
      dispatch({
        type: "nudge-resize",
        delta,
        axis,
        target,
      });
    },
    [dispatch]
  );

  const a11yarrow = useCallback(
    (
      target: "selection" | (string & {}) = "selection",
      direction: "up" | "down" | "left" | "right",
      shiftKey: boolean = false,
      config: NudgeUXConfig = {
        delay: 500,
        gesture: true,
      }
    ) => {
      const { gesture = true, delay = 500 } = config;

      const a11ytypes = {
        up: "a11y/up",
        down: "a11y/down",
        left: "a11y/left",
        right: "a11y/right",
      } as const;

      if (gesture) {
        // Trigger gesture
        __gesture_nudge("on");

        // Debounce to turn off gesture
        __gesture_nudge_debounced("off", delay);
      }

      dispatch({
        type: a11ytypes[direction],
        target,
        shiftKey,
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

  const order = useCallback(
    (
      target: "selection" | (string & {}) = "selection",
      order: "back" | "front" | number
    ) => {
      dispatch({
        type: "order",
        target: target,
        order,
      });
    },
    [dispatch]
  );

  const mv = useCallback(
    (source: string[], target: string, index?: number) => {
      dispatch({
        type: "mv",
        source,
        target,
        index,
      });
    },
    [dispatch]
  );

  const distributeEvenly = useCallback(
    (target: "selection" | string[] = "selection", axis: "x" | "y") => {
      dispatch({
        type: "distribute-evenly",
        target,
        axis,
      });
    },
    [dispatch]
  );

  const autoLayout = useCallback(
    (target: "selection" | string[] = "selection") => {
      dispatch({
        type: "autolayout",
        target,
      });
    },
    [dispatch]
  );

  const contain = useCallback(
    (target: "selection" | string[] = "selection") => {
      dispatch({
        type: "contain",
        target,
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

  const configureMeasurement = useCallback(
    (measurement: "on" | "off") => {
      dispatch({
        type: "config/surface/measurement",
        measurement,
      });
    },
    [dispatch]
  );

  const configureTranslateWithCloneModifier = useCallback(
    (translate_with_clone: "on" | "off") => {
      dispatch({
        type: "config/modifiers/translate-with-clone",
        translate_with_clone,
      });
    },
    [dispatch]
  );

  const configureTranslateWithAxisLockModifier = useCallback(
    (tarnslate_with_axis_lock: "on" | "off") => {
      dispatch({
        type: "config/modifiers/translate-with-axis-lock",
        tarnslate_with_axis_lock,
      });
    },
    [dispatch]
  );

  const configureTransformWithCenterOriginModifier = useCallback(
    (transform_with_center_origin: "on" | "off") => {
      dispatch({
        type: "config/modifiers/transform-with-center-origin",
        transform_with_center_origin,
      });
    },
    [dispatch]
  );

  const configureTransformWithPreserveAspectRatioModifier = useCallback(
    (transform_with_preserve_aspect_ratio: "on" | "off") => {
      dispatch({
        type: "config/modifiers/transform-with-preserve-aspect-ratio",
        transform_with_preserve_aspect_ratio,
      });
    },
    [dispatch]
  );

  const configureRotateWithQuantizeModifier = useCallback(
    (rotate_with_quantize: number | "off") => {
      dispatch({
        type: "config/modifiers/rotate-with-quantize",
        rotate_with_quantize,
      });
    },
    [dispatch]
  );

  const toggleActive = useCallback(
    (target: "selection" | (string & {}) = "selection") => {
      const target_ids = target === "selection" ? selection : [target];
      target_ids.forEach((node_id) => {
        dispatch({
          type: "node/toggle/active",
          node_id: node_id,
        });
      });
    },
    [dispatch, selection]
  );

  const toggleLocked = useCallback(
    (target: "selection" | (string & {}) = "selection") => {
      const target_ids = target === "selection" ? selection : [target];
      target_ids.forEach((node_id) => {
        dispatch({
          type: "node/toggle/locked",
          node_id: node_id,
        });
      });
    },
    [dispatch, selection]
  );

  const toggleBold = useCallback(
    (target: "selection" | (string & {}) = "selection") => {
      const target_ids = target === "selection" ? selection : [target];
      target_ids.forEach((node_id) => {
        dispatch({
          type: "node/toggle/bold",
          node_id: node_id,
        });
      });
    },
    [dispatch, selection]
  );

  const setOpacity = useCallback(
    (target: "selection" | (string & {}) = "selection", opacity: number) => {
      const target_ids = target === "selection" ? selection : [target];
      target_ids.forEach((node_id) => {
        dispatch({
          type: "node/change/opacity",
          node_id: node_id,
          opacity: { type: "set", value: opacity },
        });
      });
    },
    [dispatch, selection]
  );

  const getNodeById = useCallback(
    (node_id: string): grida.program.nodes.Node => {
      return document.__getNodeById(state, node_id);
    },
    [state.document.nodes]
  );

  const getNodeDepth = useCallback(
    (node_id: string) => {
      return document.getDepth(state.document_ctx, node_id);
    },
    [state.document_ctx]
  );

  const getNodeAbsoluteRotation = useCallback(
    (node_id: string) => {
      const parent_ids = document.getAncestors(state.document_ctx, node_id);

      let rotation = 0;
      // Calculate the absolute rotation
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
        type: "insert",
        prototype,
      });
    },
    [dispatch]
  );

  const schemaDefineProperty = useCallback(
    (name?: string, definition?: grida.program.schema.PropertyDefinition) => {
      dispatch({
        type: "document/properties/define",
        key: name,
        definition: definition,
      });
    },
    [dispatch]
  );

  const schemaRenameProperty = useCallback(
    (name: string, newName: string) => {
      dispatch({
        type: "document/properties/rename",
        key: name,
        newKey: newName,
      });
    },
    [dispatch]
  );

  const schemaUpdateProperty = useCallback(
    (name: string, definition: grida.program.schema.PropertyDefinition) => {
      dispatch({
        type: "document/properties/update",
        key: name,
        definition: definition,
      });
    },
    [dispatch]
  );

  const schemaPutProperty = useCallback(
    (name: string, definition: grida.program.schema.PropertyDefinition) => {
      dispatch({
        type: "document/properties/put",
        key: name,
        definition: definition,
      });
    },
    [dispatch]
  );

  const schemaDeleteProperty = useCallback(
    (name: string) => {
      dispatch({ type: "document/properties/delete", key: name });
    },
    [dispatch]
  );

  return useMemo(() => {
    return {
      state,
      selection,
      transform,
      //
      scenes,
      scene_id,
      loadScene,
      createScene,
      deleteScene,
      duplicateScene,
      renameScene,

      //
      select,
      blur,
      undo,
      redo,
      cut,
      copy,
      paste,
      duplicate,
      clipboardColor,
      setClipboardColor,
      deleteNode,
      nudge,
      nudgeResize,
      a11yarrow,
      align,
      order,
      mv,
      distributeEvenly,
      autoLayout,
      contain,
      configureSurfaceRaycastTargeting,
      configureMeasurement,
      configureTranslateWithCloneModifier,
      configureTranslateWithAxisLockModifier,
      configureTransformWithCenterOriginModifier,
      configureTransformWithPreserveAspectRatioModifier,
      configureRotateWithQuantizeModifier,
      //
      toggleActive,
      toggleLocked,
      toggleBold,
      //
      setOpacity,
      //
      createNodeId,
      getNodeById,
      getNodeDepth,
      getNodeAbsoluteRotation,
      insertNode,
      ...nodeActions,
      schemaDefineProperty,
      schemaRenameProperty,
      schemaUpdateProperty,
      schemaPutProperty,
      schemaDeleteProperty,
    };
  }, [
    state,
    selection,
    transform,
    //
    scenes,
    scene_id,
    loadScene,
    createScene,
    deleteScene,
    duplicateScene,
    renameScene,
    //
    select,
    blur,
    undo,
    redo,
    cut,
    copy,
    paste,
    duplicate,
    clipboardColor,
    setClipboardColor,
    deleteNode,
    nudge,
    nudgeResize,
    a11yarrow,
    align,
    order,
    mv,
    distributeEvenly,
    autoLayout,
    contain,
    configureSurfaceRaycastTargeting,
    configureMeasurement,
    configureTranslateWithCloneModifier,
    configureTranslateWithAxisLockModifier,
    configureTransformWithCenterOriginModifier,
    configureTransformWithPreserveAspectRatioModifier,
    configureRotateWithQuantizeModifier,
    //
    toggleActive,
    toggleLocked,
    toggleBold,
    //
    setOpacity,
    //
    createNodeId,
    getNodeById,
    getNodeDepth,
    getNodeAbsoluteRotation,
    insertNode,
    nodeActions,
    schemaDefineProperty,
    schemaRenameProperty,
    schemaUpdateProperty,
    schemaPutProperty,
    schemaDeleteProperty,
  ]);
}

type UseScene = grida.program.document.Scene & {
  selection: IDocumentEditorState["selection"];
  transform: IDocumentEditorState["transform"];
  hovered_node_id: IDocumentEditorState["hovered_node_id"];
  hovered_vertex_idx: IDocumentEditorState["hovered_vertex_idx"];
  document_ctx: IDocumentEditorState["document_ctx"];
  setBackgroundColor: (
    backgroundColor: grida.program.document.ISceneBackground["backgroundColor"]
  ) => void;
};

export function useScene(scene_id: string): UseScene {
  const [state, dispatch] = __useInternal();

  const {
    selection,
    transform,
    hovered_node_id,
    hovered_vertex_idx,
    document_ctx,
  } = state;

  const setBackgroundColor = useCallback(
    (
      backgroundColor: grida.program.document.ISceneBackground["backgroundColor"]
    ) => {
      if (!scene_id) return;
      dispatch({
        type: "scenes/change/background-color",
        scene: scene_id,
        backgroundColor,
      });
    },
    [dispatch, scene_id]
  );

  const scene = state.document.scenes[scene_id];
  return {
    selection,
    transform,
    hovered_node_id,
    hovered_vertex_idx,
    document_ctx,
    ...scene,
    setBackgroundColor,
  };
}

export function useCurrentScene(): UseScene {
  const [state] = __useInternal();
  return useScene(state.scene_id!);
}

function animateTransformTo(
  from: cmath.Transform,
  to: cmath.Transform,
  update: (t: cmath.Transform) => void
) {
  const duration = 200; // ms
  const start = performance.now();

  function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  function step(now: number) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);

    const next: cmath.Transform = [
      [0, 0, 0],
      [0, 0, 0],
    ] as cmath.Transform;

    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        next[i][j] = lerp(from[i][j], to[i][j], progress);
      }
    }

    update(next);

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

export function useTransform() {
  const [_, dispatch] = __useInternal();
  const scene = useCurrentScene();

  const { transform } = scene;

  const scale = useCallback(
    (
      factor: number | cmath.Vector2,
      origin: cmath.Vector2 | "center" = "center"
    ) => {
      const [fx, fy] = typeof factor === "number" ? [factor, factor] : factor;
      const _scale = transform[0][0];
      let ox, oy: number;
      if (origin === "center") {
        // Canvas size (you need to know or pass this)
        const { width, height } = domapi.get_viewport_rect();

        // Calculate the absolute transform origin
        ox = width / 2;
        oy = height / 2;
      } else {
        [ox, oy] = origin;
      }

      const sx = cmath.clamp(
        fx,
        CONFIG_CANVAS_TRANSFORM_SCALE_MIN,
        CONFIG_CANVAS_TRANSFORM_SCALE_MAX
      );

      const sy = cmath.clamp(
        fy,
        CONFIG_CANVAS_TRANSFORM_SCALE_MIN,
        CONFIG_CANVAS_TRANSFORM_SCALE_MAX
      );

      const [tx, ty] = cmath.transform.getTranslate(transform);

      // calculate the offset that should be applied with scale with css transform.
      const [newx, newy] = [
        ox - (ox - tx) * (sx / _scale),
        oy - (oy - ty) * (sy / _scale),
      ];

      const next: cmath.Transform = [
        [sx, transform[0][1], newx],
        [transform[1][0], sy, newy],
      ];

      dispatch({
        type: "transform",
        transform: next,
      });
    },
    [dispatch, transform]
  );

  /**
   * Transform to fit
   */
  const fit = useCallback(
    (
      selector: grida.program.document.Selector,
      options: {
        margin?: number | [number, number, number, number];
        animate?: boolean;
      } = {
        margin: 64,
        animate: false,
      }
    ) => {
      const ids = document.querySelector(
        scene.document_ctx,
        scene.selection,
        selector
      );

      const cdom = new domapi.CanvasDOM(scene.transform);

      const rects = ids
        .map((id) => cdom.getNodeBoundingRect(id))
        .filter((r) => r) as cmath.Rectangle[];

      if (rects.length === 0) {
        return;
      }

      const area = cmath.rect.union(rects);

      const _view = domapi.get_viewport_rect();
      const view = { x: 0, y: 0, width: _view.width, height: _view.height };

      const transform = cmath.ext.viewport.transformToFit(
        view,
        area,
        options.margin
      );

      if (options.animate) {
        animateTransformTo(scene.transform, transform, (t) => {
          dispatch({
            type: "transform",
            transform: t,
          });
        });
      } else {
        dispatch({
          type: "transform",
          transform: transform,
        });
      }
    },
    [
      dispatch,
      scene.document_ctx,
      scene.transform,
      scene.selection,
      scene.children,
    ]
  );

  const zoomIn = useCallback(() => {
    const prevscale = transform[0][0];
    const nextscale = cmath.quantize(prevscale * 2, 0.01);

    scale(nextscale);
    //
  }, [dispatch, scale, transform]);

  const zoomOut = useCallback(() => {
    const prevscale = transform[0][0];
    const nextscale = cmath.quantize(prevscale / 2, 0.01);

    scale(nextscale);
    //
  }, [dispatch, scale, transform]);

  const setTransform = useCallback(
    (transform: cmath.Transform) => {
      dispatch({
        type: "transform",
        transform,
      });
    },
    [dispatch]
  );

  return useMemo(() => {
    const transform = scene.transform;
    const scaleX = transform[0][0];
    const scaleY = transform[1][1];
    const matrix = `matrix(${transform[0][0]}, ${transform[1][0]}, ${transform[0][1]}, ${transform[1][1]}, ${transform[0][2]}, ${transform[1][2]})`;
    return {
      transform,
      scaleX,
      scaleY,
      style: {
        transformOrigin: "0 0",
        transform: matrix,
      } as React.CSSProperties,
      setTransform,
      scale,
      fit,
      zoomIn,
      zoomOut,
    };
  }, [transform, setTransform, scale, fit, zoomIn, zoomOut]);
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

  const { tool } = state;

  return useMemo(() => {
    switch (tool.type) {
      case "cursor":
        return "default";
      case "hand":
        return "grab";
      case "zoom":
        return "zoom-in";
      case "insert": {
        switch (tool.node) {
          case "text":
            return "text";
          case "rectangle":
          case "ellipse":
          case "container":
          case "image":
            return "crosshair";
        }
      }
      case "draw":
        return "crosshair";
      case "path":
        return "crosshair";
      case "brush":
      case "eraser":
      case "flood-fill":
        return "cell";
    }
  }, [tool]);
}

export function useEventTarget() {
  const [state, dispatch] = __useInternal();
  const scene = useCurrentScene();

  const { guides, edges } = scene;

  const {
    pointer,
    transform,
    surface_snapping,
    gesture,
    dragging,
    hovered_node_id,
    dropzone,
    selection,
    content_edit_mode,
    tool,
    brush,
    marquee,
    debug,
    pixelgrid,
    ruler,
    features,
  } = state;

  const is_node_transforming = gesture.type !== "idle";
  const is_node_translating =
    gesture.type === "translate" ||
    gesture.type === "sort" ||
    gesture.type === "nudge" ||
    gesture.type === "gap";
  const is_node_scaling = gesture.type === "scale";

  const setRulerState = useCallback(
    (state: "on" | "off") => {
      dispatch({
        type: "surface/ruler",
        state,
      });
    },
    [dispatch]
  );

  const setPixelGridState = useCallback(
    (state: "on" | "off") => {
      dispatch({
        type: "surface/pixel-grid",
        state,
      });
    },
    [dispatch]
  );

  const setTool = useCallback(
    (tool: ToolMode) => {
      dispatch({
        type: "surface/tool",
        tool: tool,
      });
    },
    [dispatch]
  );

  const changeBrush = useCallback(
    (brush: BitmapEditorBrush) => {
      dispatch({
        type: "surface/brush",
        brush,
      });
    },
    [dispatch]
  );

  const changeBrushSize = useCallback(
    (size: TChange<number>) => {
      dispatch({
        type: "surface/brush/size",
        size,
      });
    },
    [dispatch]
  );

  const changeBrushOpacity = useCallback(
    (opacity: TChange<number>) => {
      dispatch({
        type: "surface/brush/opacity",
        opacity,
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
        type: "event-target/event/on-pointer-move-raycast",
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

  const zoom = useCallback(
    (delta: number, origin: cmath.Vector2) => {
      const _scale = transform[0][0];
      // the origin point of the zooming point in x, y (surface space)
      const [ox, oy] = origin;

      // Apply proportional zooming
      const scale = _scale + _scale * delta;

      const newscale = cmath.clamp(
        scale,
        CONFIG_CANVAS_TRANSFORM_SCALE_MIN,
        CONFIG_CANVAS_TRANSFORM_SCALE_MAX
      );
      const [tx, ty] = cmath.transform.getTranslate(transform);

      // calculate the offset that should be applied with scale with css transform.
      const [newx, newy] = [
        ox - (ox - tx) * (newscale / _scale),
        oy - (oy - ty) * (newscale / _scale),
      ];

      const next: cmath.Transform = [
        [newscale, transform[0][1], newx],
        [transform[1][0], newscale, newy],
      ];

      dispatch({
        type: "transform",
        transform: next,
      });
    },
    [transform, dispatch]
  );

  const pan = useCallback(
    (delta: [dx: number, dy: number]) => {
      dispatch({
        type: "transform",
        transform: cmath.transform.translate(transform, delta),
      });
    },
    [dispatch, transform]
  );

  const pointerMove = useCallback(
    (event: PointerEvent) => {
      const position = __canvas_space_position(event);

      dispatch({
        type: "event-target/event/on-pointer-move",
        position_canvas: position,
        position_client: { x: event.clientX, y: event.clientY },
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
        type: "event-target/event/on-pointer-down",
        node_ids_from_point: els.map((n) => n.id),
        shiftKey: event.shiftKey,
      });
    },
    [dispatch]
  );

  const pointerUp = useCallback(
    (event: PointerEvent) => {
      dispatch({
        type: "event-target/event/on-pointer-up",
      });
    },
    [dispatch]
  );

  const click = useCallback(
    (event: MouseEvent) => {
      const els = domapi.get_grida_node_elements_from_point(
        event.clientX,
        event.clientY
      );

      dispatch({
        type: "event-target/event/on-click",
        node_ids_from_point: els.map((n) => n.id),
        shiftKey: event.shiftKey,
      });
    },
    [dispatch]
  );

  const doubleClick = useCallback(
    (event: MouseEvent) => {
      dispatch({
        type: "event-target/event/on-double-click",
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
      type: "surface/content-edit-mode/try-enter",
    });
  }, [dispatch]);

  const tryExitContentEditMode = useCallback(() => {
    dispatch({
      type: "surface/content-edit-mode/try-exit",
    });
  }, [dispatch]);

  const tryToggleContentEditMode = useCallback(() => {
    if (content_edit_mode) {
      tryExitContentEditMode();
    } else {
      tryEnterContentEditMode();
    }
  }, [dispatch, content_edit_mode]);

  const dragStart = useCallback(
    (event: PointerEvent) => {
      dispatch({
        type: "event-target/event/on-drag-start",
        shiftKey: event.shiftKey,
      });
    },
    [dispatch]
  );

  const dragEnd = useCallback(
    (event: PointerEvent) => {
      if (marquee) {
        // test area in canvas space
        const area = cmath.rect.fromPoints([marquee.a, marquee.b]);

        const cdom = new domapi.CanvasDOM(transform);
        const contained = cdom.getNodesIntersectsArea(area);

        dispatch({
          type: "event-target/event/on-drag-end",
          node_ids_from_area: contained,
          shiftKey: event.shiftKey,
        });

        return;
      }
      dispatch({
        type: "event-target/event/on-drag-end",
        shiftKey: event.shiftKey,
      });
    },
    [dispatch, marquee, transform]
  );

  const drag = useCallback(
    (event: TCanvasEventTargetDragGestureState) => {
      requestAnimationFrame(() => {
        dispatch({
          type: "event-target/event/on-drag",
          event,
        });
      });
    },
    [dispatch]
  );

  //
  const multipleSelectionOverlayClick = useCallback(
    (selection: string[], event: MouseEvent) => {
      const els = domapi.get_grida_node_elements_from_point(
        event.clientX,
        event.clientY
      );

      dispatch({
        type: "event-target/event/multiple-selection-overlay/on-click",
        selection: selection,
        node_ids_from_point: els.map((n) => n.id),
        shiftKey: event.shiftKey,
      });
    },
    [dispatch]
  );

  //

  const startGuideGesture = useCallback(
    (axis: cmath.Axis, idx: number | -1) => {
      dispatch({
        type: "surface/gesture/start",
        gesture: {
          idx: idx,
          type: "guide",
          axis,
        },
      });
    },
    [dispatch]
  );

  const deleteGuide = useCallback(
    (idx: number) => {
      dispatch({
        type: "surface/guide/delete",
        idx,
      });
    },
    [dispatch]
  );

  const startScaleGesture = useCallback(
    (selection: string | string[], direction: cmath.CardinalDirection) => {
      dispatch({
        type: "surface/gesture/start",
        gesture: {
          type: "scale",
          selection: Array.isArray(selection) ? selection : [selection],
          direction,
        },
      });
    },
    [dispatch]
  );

  const startSortGesture = useCallback(
    (selection: string | string[], node_id: string) => {
      dispatch({
        type: "surface/gesture/start",
        gesture: {
          type: "sort",
          selection: Array.isArray(selection) ? selection : [selection],
          node_id,
        },
      });
    },
    [dispatch]
  );

  const startGapGesture = useCallback(
    (selection: string | string[], axis: "x" | "y") => {
      dispatch({
        type: "surface/gesture/start",
        gesture: {
          type: "gap",
          selection: selection,
          axis,
        },
      });
    },
    [dispatch]
  );

  // #region drag resize handle
  const startCornerRadiusGesture = useCallback(
    (selection: string) => {
      dispatch({
        type: "surface/gesture/start",
        gesture: {
          type: "corner-radius",
          node_id: selection,
        },
      });
    },
    [dispatch]
  );
  // #endregion drag resize handle

  const startRotateGesture = useCallback(
    (selection: string) => {
      dispatch({
        type: "surface/gesture/start",
        gesture: {
          type: "rotate",
          selection,
        },
      });
    },
    [dispatch]
  );

  return useMemo(() => {
    return {
      zoom,
      pan,
      //
      pointer,
      transform,
      debug,
      features,
      gesture,
      dragging,
      surface_snapping,
      //
      marquee,
      tool,
      setTool,
      brush,
      changeBrush,
      changeBrushSize,
      changeBrushOpacity,
      //
      ruler,
      setRulerState,
      guides,
      startGuideGesture,
      deleteGuide,
      //
      edges,
      //
      pixelgrid,
      setPixelGridState,
      //
      hovered_node_id,
      dropzone,
      selection,
      is_node_transforming,
      is_node_translating,
      is_node_scaling,
      content_edit_mode,
      //

      startScaleGesture,
      startSortGesture,
      startGapGesture,
      startCornerRadiusGesture,
      startRotateGesture,
      //
      pointerMove,
      pointerDown,
      pointerUp,
      click,
      doubleClick,
      //
      tryEnterContentEditMode,
      tryExitContentEditMode,
      tryToggleContentEditMode,
      //
      dragStart,
      dragEnd,
      drag,
      //
      multipleSelectionOverlayClick,
      //
    };
  }, [
    zoom,
    pan,
    //
    pointer,
    transform,
    debug,
    features,
    gesture,
    dragging,
    surface_snapping,
    //
    marquee,
    tool,
    setTool,
    brush,
    changeBrush,
    changeBrushSize,
    changeBrushOpacity,
    //
    ruler,
    setRulerState,
    guides,
    startGuideGesture,
    deleteGuide,
    //
    edges,
    //
    pixelgrid,
    setPixelGridState,
    //
    hovered_node_id,
    dropzone,
    selection,
    //
    is_node_transforming,
    is_node_translating,
    is_node_scaling,
    //
    content_edit_mode,
    //
    startScaleGesture,
    startSortGesture,
    startGapGesture,
    startCornerRadiusGesture,
    startRotateGesture,
    //
    pointerMove,
    pointerDown,
    pointerUp,
    click,
    doubleClick,
    //
    tryEnterContentEditMode,
    tryExitContentEditMode,
    tryToggleContentEditMode,
    //
    dragStart,
    dragEnd,
    drag,
    //
    multipleSelectionOverlayClick,
    //
  ]);
}

export function useDataTransferEventTarget() {
  const [state, dispatch] = __useInternal();

  const canvasXY = useCallback(
    (xy: cmath.Vector2) => {
      const viewportdomrect = domapi.get_viewport_rect();
      const viewport_pos: cmath.Vector2 = [
        viewportdomrect.x,
        viewportdomrect.y,
      ];
      const translate = cmath.transform.getTranslate(state.transform);
      return cmath.vector2.sub(xy, viewport_pos, translate);
    },
    [state.transform]
  );

  const paste = useCallback(() => {
    dispatch({
      type: "paste",
    });
  }, [dispatch]);

  const insertNode = useCallback(
    (prototype: grida.program.nodes.NodePrototype) => {
      dispatch({
        type: "insert",
        prototype,
      });
    },
    [dispatch]
  );

  const insertText = useCallback(
    (
      text: string,
      position?: {
        clientX: number;
        clientY: number;
      }
    ) => {
      const [x, y] = canvasXY(
        position ? [position.clientX, position.clientY] : [0, 0]
      );

      const node = {
        type: "text",
        text: text,
        width: "auto",
        height: "auto",
        left: x,
        top: y,
      } satisfies grida.program.nodes.NodePrototype;
      insertNode(node);
    },
    [insertNode, canvasXY]
  );

  const insertImage = useCallback(
    (
      name: string,
      file: File,
      position?: {
        clientX: number;
        clientY: number;
      }
    ) => {
      const [x, y] = canvasXY(
        position ? [position.clientX, position.clientY] : [0, 0]
      );

      const url = URL.createObjectURL(file);
      const node = {
        type: "image",
        name: name,
        width: "auto",
        height: "auto",
        fit: "cover",
        src: url,
        left: x,
        top: y,
      } satisfies grida.program.nodes.NodePrototype;
      insertNode(node);
    },
    [insertNode, canvasXY]
  );

  const insertSVG = useCallback(
    (
      name: string,
      svg: string,
      position?: {
        clientX: number;
        clientY: number;
      }
    ) => {
      const optimized = iosvg.v0.optimize(svg).data;
      iosvg.v0
        .convert(optimized, {
          name: name,
          currentColor: { r: 0, g: 0, b: 0, a: 1 },
        })
        .then((result) => {
          if (result) {
            result = result as grida.program.nodes.i.IPositioning &
              grida.program.nodes.i.IFixedDimension;

            const center_dx =
              typeof result.width === "number" ? result.width / 2 : 0;

            const center_dy =
              typeof result.height === "number" ? result.height / 2 : 0;

            const [x, y] = canvasXY(
              cmath.vector2.sub(
                position ? [position.clientX, position.clientY] : [0, 0],
                [center_dx, center_dy]
              )
            );

            result.left = x;
            result.top = y;
            insertNode(result);
          } else {
            throw new Error("Failed to convert SVG");
          }
        });
    },
    [insertNode, canvasXY]
  );

  const insertFromFile = useCallback(
    (
      file: File,
      position?: {
        clientX: number;
        clientY: number;
      }
    ) => {
      const type = file.type || file.name.split(".").pop() || file.name;
      const is_svg = type === "image/svg+xml";
      const is_png = type === "image/png";
      const is_jpg = type === "image/jpeg";
      const is_gif = type === "image/gif";

      if (is_svg) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const svgContent = e.target?.result as string;
          const name = file.name.split(".svg")[0];
          insertSVG(name, svgContent, position);
        };
        reader.readAsText(file);
        return;
      }

      if (is_png || is_jpg || is_gif) {
        const name = file.name.split(".")[0];
        insertImage(name, file, position);
        return;
      }

      toast.error(`insertion of file type ${type} is not supported`);
    },
    [insertImage, insertSVG]
  );

  const onpaste = useCallback(
    (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      // cancel if on contenteditable / form element
      if (
        event.target instanceof HTMLElement &&
        (event.target as HTMLElement).isContentEditable
      )
        return;
      if (event.target instanceof HTMLInputElement) return;
      if (event.target instanceof HTMLTextAreaElement) return;

      if (!event.clipboardData) {
        paste();
        return;
      }

      const items = event.clipboardData.items;

      let pasted_from_data_transfer = false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            insertFromFile(file, {
              clientX: window.innerWidth / 2,
              clientY: window.innerHeight / 2,
            });
            pasted_from_data_transfer = true;
          }
        } else if (item.kind === "string" && item.type === "text/plain") {
          pasted_from_data_transfer = true;
          item.getAsString((data) => {
            insertText(data, {
              clientX: window.innerWidth / 2,
              clientY: window.innerHeight / 2,
            });
          });
        }
      }

      if (!pasted_from_data_transfer) {
        event.preventDefault();
        paste();
      }
    },
    [insertFromFile, insertText]
  );

  const ondragover = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const ondrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const knwondata = event.dataTransfer.getData("x-grida-data-transfer");
      if (knwondata) {
        const data = JSON.parse(knwondata);
        switch (data.type) {
          case "svg":
            const { name, src } = data;
            const task = fetch(src, {
              cache: "no-store",
            }).then((res) =>
              res.text().then((text) => {
                insertSVG(name, text, event);
              })
            );

            toast.promise(task, {
              loading: "Loading...",
              success: "Inserted",
              error: "Failed to insert SVG",
            });
            break;
          default:
            // unknown
            break;
        }
        //
        return;
      }
      const files = event.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        insertFromFile(file, event);
      }
    },
    [insertFromFile]
  );
  //

  return { onpaste, ondragover, ondrop, insertText };
}

export function useClipboardSync() {
  const { state } = useDocument();

  useEffect(() => {
    try {
      if (state.user_clipboard) {
        const serializedData = JSON.stringify(state.user_clipboard);
        const htmltxt = `<meta>${serializedData}`;
        const blob = new Blob([htmltxt], {
          type: "text/html",
        });

        const clipboardItem = new ClipboardItem({
          "text/html": blob,
          // Optional: Add plain text for fallback
          // TODO: copy content as texts. (if text)
          // "text/plain": new Blob([serializedData], { type: "text/plain" }),
        });
        navigator.clipboard.write([clipboardItem]);
      }
    } catch (e) {
      //
    }
  }, [state.user_clipboard]);
  //
}

export function useSurfacePathEditor() {
  const [state, dispatch] = __useInternal();
  assert(state.content_edit_mode && state.content_edit_mode.type === "path");

  const { hovered_vertex_idx: hovered_point, tool } = state;
  const { node_id, selected_vertices, a_point, path_cursor_position, next_ta } =
    state.content_edit_mode;
  const node = state.document.nodes[node_id] as grida.program.nodes.PathNode;

  const vertices = node.vectorNetwork.vertices;
  const segments = node.vectorNetwork.segments;

  // offset of the points (node position)
  const offset: cmath.Vector2 = [node.left!, node.top!];

  const selectVertex = useCallback(
    (vertex: number) => {
      if (tool.type === "path") {
        return;
      }
      dispatch({
        type: "select-vertex",
        target: {
          node_id,
          vertex,
        },
      });
    },
    [tool.type, dispatch, node_id]
  );

  const onVertexHover = useCallback(
    (vertex: number, eventType: "enter" | "leave") => {
      dispatch({
        type: "hover-vertex",
        event: eventType,
        target: {
          node_id,
          vertex,
        },
      });
    },
    [dispatch, node_id]
  );

  const onVertexDragStart = useCallback(
    (vertex: number) => {
      dispatch({
        type: "surface/gesture/start",
        gesture: {
          type: "translate-vertex",
          vertex,
          node_id,
        },
      });
    },
    [dispatch, node_id]
  );

  const onVertexDelete = useCallback(
    (vertex: number) => {
      dispatch({
        type: "delete-vertex",
        target: {
          node_id,
          vertex: vertex,
        },
      });
    },
    [node_id, dispatch]
  );

  const onCurveControlPointDragStart = useCallback(
    (segment: number, control: "ta" | "tb") => {
      dispatch({
        type: "surface/gesture/start",
        gesture: {
          type: "curve",
          node_id,
          control,
          segment,
        },
      });
    },
    [dispatch, node_id]
  );

  return useMemo(
    () => ({
      node_id,
      path_cursor_position,
      vertices,
      segments,
      offset,
      selected_vertices,
      hovered_point,
      a_point,
      next_ta,
      selectVertex,
      onVertexHover,
      onVertexDragStart,
      onVertexDelete,
      onCurveControlPointDragStart,
    }),
    [
      //
      node_id,
      path_cursor_position,
      vertices,
      segments,
      offset,
      selected_vertices,
      hovered_point,
      a_point,
      next_ta,
      selectVertex,
      onVertexHover,
      onVertexDragStart,
      onVertexDelete,
      onCurveControlPointDragStart,
    ]
  );
}

/**
 * Must be used when root node is {@link grida.program.nodes.TemplateInstanceNode} node
 */
export function useRootTemplateInstanceNode(root_id: string) {
  const { state, changeNodeProps } = useDocument();

  const { document, templates } = state;

  const rootnode = document.nodes[root_id];

  assert(rootnode.type === "template_instance", "root node must be template");
  assert(templates && templates[rootnode.template_id], "template not found");

  const rootProperties = rootnode.properties || {};
  const rootProps = rootnode.props || {};
  const rootDefault = state.templates![rootnode.template_id].default || {};

  const changeRootProps = useCallback(
    (key: string, value: any) => {
      changeNodeProps(root_id, key, value);
    },
    [changeNodeProps, root_id]
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

class EditorConsumerError extends Error {
  context: any;
  constructor(message: string, context: any) {
    super(message); // Pass message to the parent Error class
    this.name = this.constructor.name; // Set the error name
    this.context = context; // Attach the context object
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toString(): string {
    return `${this.name}: ${this.message} - Context: ${JSON.stringify(this.context)}`;
  }
}

export type NodeWithMeta = grida.program.nodes.UnknwonNode & {
  meta: {
    is_component_consumer: boolean;
    is_flex_parent: boolean;
  };
};

export function useNode(node_id: string): NodeWithMeta {
  assert(node_id, "node_id is required");
  const { state } = useDocument();

  const {
    document: { nodes },
    templates,
  } = state;

  let node_definition: grida.program.nodes.Node | undefined = undefined;
  let node_change: grida.program.nodes.NodeChange = undefined;

  if (nodes[node_id]) {
    node_change = undefined;
    node_definition = nodes[node_id];
  } else {
    assert(
      templates,
      new EditorConsumerError(
        `node '${node_id}' is not found under "nodes", but templates are not provided for additional lookup`,
        { state }
      )
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

  const node: grida.program.nodes.UnknwonNode = useMemo(() => {
    return Object.assign(
      {},
      node_definition,
      node_change || {}
    ) as grida.program.nodes.UnknwonNode;
  }, [node_definition, node_change]);

  const is_flex_parent = node.type === "container" && node.layout === "flex";

  // TODO: also check the ancestor nodes
  const is_component_consumer = is_direct_component_consumer(node.type);

  return {
    ...node,
    meta: {
      is_component_consumer,
      is_flex_parent,
    },
  };
}

/**
 * @param node_id self or child node id
 */
export function useTopNode(node_id: string) {
  const { state } = useDocument();
  const top_id = document.getTopId(state.document_ctx, node_id)!;
  return useNode(top_id);
}

export function useComputedNode(
  node_id: string
): grida.program.nodes.UnknwonComputedNode {
  const node = useNode(node_id);
  const { active, style, component_id, props, text, html, src, href, fill } =
    node;

  const computed = useComputed(
    {
      text,
      html,
      src,
      href,
      props,
      fill,
    },
    true
  );

  return computed as grida.program.nodes.UnknownNodeProperties as grida.program.nodes.UnknwonComputedNode;
}

namespace internal {
  /**
   * @deprecated
   * @returns
   * This model does not work. it's a proof of concept. - will be removed
   */
  export function __createApiProxyNode_experimental(
    node: grida.program.nodes.Node,
    context: {
      dispatcher: DocumentDispatcher;
    }
  ): grida.program.nodes.Node {
    const p = new Proxy(
      { ...node },
      {
        get(target, prop, receiver) {
          return Reflect.get(target, prop, receiver);
        },
        set(target, prop, value, receiver) {
          switch (prop as keyof grida.program.nodes.UnknwonNode) {
            case "width":
              context.dispatcher({
                type: "node/change/size",
                axis: "width",
                node_id: node.id,
                value: value,
              });
              return true;
            case "height":
              context.dispatcher({
                type: "node/change/size",
                axis: "height",
                node_id: node.id,
                value: value,
              });
              return true;
            case "top":
            case "right":
            case "bottom":
            case "left":
              context.dispatcher({
                type: "node/change/positioning",
                node_id: node.id,
                positioning: {
                  position: "absolute",
                  [prop]: value,
                },
              });
              return true;
            case "opacity": {
              context.dispatcher({
                type: "node/change/opacity",
                node_id: node.id,
                opacity: value,
              });
              return true;
            }
            case "rotation": {
              context.dispatcher({
                type: "node/change/rotation",
                node_id: node.id,
                rotation: value,
              });
              return true;
            }
            case "fill": {
              context.dispatcher({
                type: "node/change/fill",
                node_id: node.id,
                fill: value,
              });
              return true;
            }
            case "cornerRadius": {
              context.dispatcher({
                type: "node/change/cornerRadius",
                node_id: node.id,
                cornerRadius: value,
              });
              return true;
            }
            default:
              console.error(`Unsupported property: ${prop.toString()}`);
          }

          return false;
        },
      }
    );
    return p;
  }
}

export function useTemplateDefinition(template_id: string) {
  const {
    state: { templates },
  } = useDocument();

  return templates![template_id];
}

const __not_implemented = (...args: any): any => {
  throw new Error("not implemented");
};
export function useEditorApi() {
  const document = useDocument();
  const dispatcher = __useDispatch();

  const getNodeById: grida.program.api.IStandaloneEditorApi["getNodeById"] =
    useCallback(
      (id: grida.program.api.NodeID) => {
        const nodedata = document.state.document.nodes[id];
        return internal.__createApiProxyNode_experimental(nodedata, {
          dispatcher,
        });
      },
      [document.state.document.nodes]
    );

  const createRectangle = useCallback(
    (props: Omit<grida.program.nodes.NodePrototype, "type"> = {}) => {
      dispatcher({
        type: "insert",
        prototype: {
          type: "rectangle",
          ...props,
        } as grida.program.nodes.NodePrototype,
      });
    },
    [dispatcher]
  );

  const createEllipse = useCallback(
    (props: Omit<grida.program.nodes.NodePrototype, "type">) => {
      dispatcher({
        type: "insert",
        prototype: {
          type: "ellipse",
          ...props,
        } as grida.program.nodes.NodePrototype,
      });
    },
    [dispatcher]
  );

  const editor: grida.program.api.IStandaloneEditorApi = useMemo(() => {
    return {
      selection: document.selection,
      getNodeById,
      createRectangle,
      createEllipse,
      createText: __not_implemented,
      getNodeDepth: document.getNodeDepth,
      getNodeAbsoluteRotation: document.getNodeAbsoluteRotation,
      select: document.select,
      blur: document.blur,
      undo: document.undo,
      redo: document.redo,
      cut: document.cut,
      copy: document.copy,
      paste: document.paste,
      duplicate: document.duplicate,
      delete: document.deleteNode,
      rename: document.changeNodeName,
      nudge: document.nudge,
      nudgeResize: document.nudgeResize,
      align: document.align,
      order: document.order,
      distributeEvenly: document.distributeEvenly,
      configureSurfaceRaycastTargeting:
        document.configureSurfaceRaycastTargeting,
      configureMeasurement: document.configureMeasurement,
      configureTranslateWithCloneModifier:
        document.configureTranslateWithCloneModifier,
      configureTranslateWithAxisLockModifier:
        document.configureTranslateWithAxisLockModifier,
      configureTransformWithCenterOriginModifier:
        document.configureTransformWithCenterOriginModifier,
      configureTransformWithPreserveAspectRatioModifier:
        document.configureTransformWithPreserveAspectRatioModifier,
      configureRotateWithQuantizeModifier:
        document.configureRotateWithQuantizeModifier,
      toggleActive: document.toggleActive,
      toggleLocked: document.toggleLocked,
      toggleBold: document.toggleBold,
      setOpacity: document.setOpacity,
    };
  }, [document, getNodeById, createRectangle, createEllipse]);

  return editor;
}

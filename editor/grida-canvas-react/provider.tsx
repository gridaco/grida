"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { editor } from "@/grida-canvas";
import type { tokens } from "@grida/tokens";
import grida from "@grida/schema";
import iosvg from "@grida/io-svg";
import type cg from "@grida/cg";
import { useComputed } from "./nodes/use-computed";
import {
  DataProvider,
  ProgramDataContextHost,
} from "@/grida-react-program-context/data-context/context";
import { GoogleFontsManager } from "./components/google-fonts";
import { domapi } from "../grida-canvas/backends/dom";
import cmath from "@grida/cmath";
import type {
  Action,
  TCanvasEventTargetDragGestureState,
  TChange,
} from "@/grida-canvas/action";
import mixed, { PropertyCompareFn } from "@grida/mixed-properties";
import deepEqual from "deep-equal";
import { toast } from "sonner";
import { is_direct_component_consumer } from "@/grida-canvas-utils/utils/supports";
import { Editor } from "@/grida-canvas/editor";
import { EditorContext, useCurrentEditor, useEditorState } from "./use-editor";
import assert from "assert";

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

type Dispatcher = (action: Action) => void;

function EditorGoogleFontsManager({ children }: React.PropsWithChildren<{}>) {
  const editor = useCurrentEditor();
  const fonts = useEditorState(editor, (state) => state.googlefonts);

  return (
    <GoogleFontsManager stylesheets fonts={fonts}>
      {children}
    </GoogleFontsManager>
  );
}

export function StandaloneDocumentEditor({
  editor,
  children,
}: React.PropsWithChildren<{ editor: Editor }>) {
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

  //   const props = Object.entries(state.document.properties ?? {}).reduce(
  //     (acc, [key, value]) => {
  //       acc[key] = value.default;
  //       return acc;
  //     },
  //     {} as Record<string, tokens.StringValueExpression>
  //   );

  return (
    <EditorContext.Provider value={editor}>
      <ProgramDataContextHost>
        {/* <DataProvider data={{ props: props }}> */}
        <DataProvider>
          <EditorGoogleFontsManager>{children}</EditorGoogleFontsManager>
        </DataProvider>
      </ProgramDataContextHost>
    </EditorContext.Provider>
  );
}

function __useGestureNudgeState(dispatch: Dispatcher) {
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

export function useNodeActions(node_id: string | undefined) {
  const instance = useCurrentEditor();

  return useMemo(() => {
    if (!node_id) return;
    return {
      toggleLocked: () => instance.toggleNodeLocked(node_id),
      toggleActive: () => instance.toggleNodeActive(node_id),
      toggleBold: () => instance.toggleNodeBold(node_id),
      component: (component_id: string) =>
        instance.changeNodeComponent(node_id, component_id),
      text: (text?: tokens.StringValueExpression) =>
        instance.changeNodeText(node_id, text),
      style: (
        key: keyof grida.program.css.ExplicitlySupportedCSSProperties,
        value: any
      ) => instance.changeNodeStyle(node_id, key, value),
      value: (key: string, value: any) =>
        instance.changeNodeProps(node_id, key, value),
      // attributes
      userdata: (value: any) => instance.changeNodeUserData(node_id, value),
      name: (name: string) => instance.changeNodeName(node_id, name),
      active: (active: boolean) => instance.changeNodeActive(node_id, active),
      locked: (locked: boolean) => instance.changeNodeLocked(node_id, locked),
      src: (src?: tokens.StringValueExpression) =>
        instance.changeNodeSrc(node_id, src),
      href: (href?: grida.program.nodes.i.IHrefable["href"]) =>
        instance.changeNodeHref(node_id, href),
      target: (target?: grida.program.nodes.i.IHrefable["target"]) =>
        instance.changeNodeTarget(node_id, target),

      positioning: (value: grida.program.nodes.i.IPositioning) =>
        instance.changeNodePositioning(node_id, value),
      positioningMode: (value: "absolute" | "relative") =>
        instance.changeNodePositioningMode(node_id, value),

      //
      cornerRadius: (
        value: grida.program.nodes.i.IRectangleCorner["cornerRadius"]
      ) => instance.changeNodeCornerRadius(node_id, value),
      fill: (
        value:
          | grida.program.nodes.i.props.SolidPaintToken
          | cg.PaintWithoutID
          | null
      ) => instance.changeNodeFill(node_id, value),
      stroke: (
        value:
          | grida.program.nodes.i.props.SolidPaintToken
          | cg.PaintWithoutID
          | null
      ) => instance.changeNodeStroke(node_id, value),
      strokeWidth: (change: TChange<number>) =>
        instance.changeNodeStrokeWidth(node_id, change),
      strokeCap: (value: cg.StrokeCap) =>
        instance.changeNodeStrokeCap(node_id, value),
      fit: (value: cg.BoxFit) => instance.changeNodeFit(node_id, value),
      // stylable
      opacity: (change: TChange<number>) =>
        instance.changeNodeOpacity(node_id, change),
      rotation: (change: TChange<number>) =>
        instance.changeNodeRotation(node_id, change),
      width: (value: grida.program.css.LengthPercentage | "auto") =>
        instance.changeNodeSize(node_id, "width", value),
      height: (value: grida.program.css.LengthPercentage | "auto") =>
        instance.changeNodeSize(node_id, "height", value),

      // text style
      fontFamily: (value: string) =>
        instance.changeTextNodeFontFamily(node_id, value),
      fontWeight: (value: cg.NFontWeight) =>
        instance.changeTextNodeFontWeight(node_id, value),
      fontSize: (change: TChange<number>) =>
        instance.changeTextNodeFontSize(node_id, change),
      textAlign: (value: cg.TextAlign) =>
        instance.changeTextNodeTextAlign(node_id, value),
      textAlignVertical: (value: cg.TextAlignVertical) =>
        instance.changeTextNodeTextAlignVertical(node_id, value),
      lineHeight: (
        change: TChange<grida.program.nodes.TextNode["lineHeight"]>
      ) => instance.changeTextNodeLineHeight(node_id, change),
      letterSpacing: (
        change: TChange<grida.program.nodes.TextNode["letterSpacing"]>
      ) => instance.changeTextNodeLetterSpacing(node_id, change),
      maxLength: (value: number | undefined) =>
        instance.changeTextNodeMaxlength(node_id, value),

      // border
      border: (value: grida.program.css.Border | undefined) =>
        instance.changeNodeBorder(node_id, value),

      padding: (value: grida.program.nodes.i.IPadding["padding"]) =>
        instance.changeContainerNodePadding(node_id, value),
      // margin: (value?: number) =>
      //   changeNodeStyle(node_id, "margin", value),
      boxShadow: (value?: cg.BoxShadow) =>
        instance.changeNodeBoxShadow(node_id, value),

      // layout
      layout: (value: grida.program.nodes.i.IFlexContainer["layout"]) =>
        instance.changeContainerNodeLayout(node_id, value),
      direction: (value: cg.Axis) =>
        instance.changeFlexContainerNodeDirection(node_id, value),
      // flexWrap: (value?: string) =>
      //   changeNodeStyle(node_id, "flexWrap", value),
      mainAxisAlignment: (value: cg.MainAxisAlignment) =>
        instance.changeFlexContainerNodeMainAxisAlignment(node_id, value),
      crossAxisAlignment: (value: cg.CrossAxisAlignment) =>
        instance.changeFlexContainerNodeCrossAxisAlignment(node_id, value),
      gap: (value: number | { mainAxisGap: number; crossAxisGap: number }) =>
        instance.changeFlexContainerNodeGap(node_id, value),

      // css style
      aspectRatio: (value?: number) =>
        instance.changeNodeStyle(node_id, "aspectRatio", value),
      cursor: (value: cg.SystemMouseCursor) =>
        instance.changeNodeMouseCursor(node_id, value),
    };
  }, [node_id, instance]);
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

export function useCurrentSelection() {
  const instance = useCurrentEditor();
  const state = useEditorState(instance, (state) => ({
    selection: state.selection,
    document: state.document,
  }));
  const dispatch = React.useCallback(
    (action: Action) => instance.dispatch(action),
    [instance]
  );

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
        instance.changeNodeName(id, value);
      });
    },
    [selection, instance.changeNodeName]
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
        instance.changeNodeActive(id, value);
      });
    },
    [selection, instance.changeNodeActive]
  );

  const locked = useCallback(
    (value: boolean) => {
      selection.forEach((id) => {
        instance.changeNodeLocked(id, value);
      });
    },
    [selection, instance.changeNodeLocked]
  );

  const rotation = useCallback(
    (change: TChange<number>) => {
      mixedProperties.rotation?.ids.forEach((id) => {
        instance.changeNodeRotation(id, change);
      });
    },
    [mixedProperties.rotation?.ids, instance.changeNodeRotation]
  );

  const opacity = useCallback(
    (change: TChange<number>) => {
      mixedProperties.opacity?.ids.forEach((id) => {
        instance.changeNodeOpacity(id, change);
      });
    },
    [mixedProperties.opacity?.ids, instance.changeNodeOpacity]
  );

  const width = useCallback(
    (value: grida.program.css.LengthPercentage | "auto") => {
      mixedProperties.width?.ids.forEach((id) => {
        instance.changeNodeSize(id, "width", value);
      });
    },
    [mixedProperties.width?.ids, instance.changeNodeSize]
  );

  const height = useCallback(
    (value: grida.program.css.LengthPercentage | "auto") => {
      mixedProperties.height?.ids.forEach((id) => {
        instance.changeNodeSize(id, "height", value);
      });
    },
    [mixedProperties.height?.ids, instance.changeNodeSize]
  );

  const positioningMode = useCallback(
    (position: grida.program.nodes.i.IPositioning["position"]) => {
      mixedProperties.position?.ids.forEach((id) => {
        instance.changeNodePositioningMode(id, position);
      });
    },
    [mixedProperties.position?.ids, instance.changeNodePositioningMode]
  );

  const fontFamily = useCallback(
    (value: string) => {
      mixedProperties.fontFamily?.ids.forEach((id) => {
        instance.changeTextNodeFontFamily(id, value);
      });
    },
    [mixedProperties.fontFamily?.ids, instance.changeTextNodeFontFamily]
  );

  const fontWeight = useCallback(
    (value: cg.NFontWeight) => {
      mixedProperties.fontWeight?.ids.forEach((id) => {
        instance.changeTextNodeFontWeight(id, value);
      });
    },
    [mixedProperties.fontWeight?.ids, instance.changeTextNodeFontWeight]
  );

  const fontSize = useCallback(
    (change: TChange<number>) => {
      mixedProperties.fontSize?.ids.forEach((id) => {
        instance.changeTextNodeFontSize(id, change);
      });
    },
    [mixedProperties.fontSize?.ids, instance.changeTextNodeFontSize]
  );

  const lineHeight = useCallback(
    (change: TChange<grida.program.nodes.TextNode["lineHeight"]>) => {
      mixedProperties.lineHeight?.ids.forEach((id) => {
        instance.changeTextNodeLineHeight(id, change);
      });
    },
    [mixedProperties.lineHeight?.ids, instance.changeTextNodeLineHeight]
  );

  const letterSpacing = useCallback(
    (change: TChange<grida.program.nodes.TextNode["letterSpacing"]>) => {
      mixedProperties.letterSpacing?.ids.forEach((id) => {
        instance.changeTextNodeLetterSpacing(id, change);
      });
    },
    [mixedProperties.letterSpacing?.ids, instance.changeTextNodeLetterSpacing]
  );

  const textAlign = useCallback(
    (value: cg.TextAlign) => {
      mixedProperties.textAlign?.ids.forEach((id) => {
        instance.changeTextNodeTextAlign(id, value);
      });
    },
    [mixedProperties.textAlign?.ids, instance.changeTextNodeTextAlign]
  );

  const textAlignVertical = useCallback(
    (value: cg.TextAlignVertical) => {
      mixedProperties.textAlignVertical?.ids.forEach((id) => {
        instance.changeTextNodeTextAlignVertical(id, value);
      });
    },
    [
      mixedProperties.textAlignVertical?.ids,
      instance.changeTextNodeTextAlignVertical,
    ]
  );

  const fit = useCallback(
    (value: cg.BoxFit) => {
      mixedProperties.fit?.ids.forEach((id) => {
        instance.changeNodeFit(id, value);
      });
    },
    [mixedProperties.fit?.ids, instance.changeNodeFit]
  );

  const fill = useCallback(
    (
      value:
        | grida.program.nodes.i.props.SolidPaintToken
        | cg.PaintWithoutID
        | null
    ) => {
      mixedProperties.fill?.ids.forEach((id) => {
        instance.changeNodeFill(id, value);
      });
    },
    [mixedProperties.fill?.ids, instance.changeNodeFill]
  );

  const stroke = useCallback(
    (
      value:
        | grida.program.nodes.i.props.SolidPaintToken
        | cg.PaintWithoutID
        | null
    ) => {
      mixedProperties.stroke?.ids.forEach((id) => {
        instance.changeNodeStroke(id, value);
      });
    },
    [mixedProperties.stroke?.ids, instance.changeNodeStroke]
  );

  const strokeWidth = useCallback(
    (change: TChange<number>) => {
      mixedProperties.strokeWidth?.ids.forEach((id) => {
        instance.changeNodeStrokeWidth(id, change);
      });
    },
    [mixedProperties.strokeWidth?.ids, instance.changeNodeStrokeWidth]
  );

  const strokeCap = useCallback(
    (value: cg.StrokeCap) => {
      mixedProperties.strokeCap?.ids.forEach((id) => {
        instance.changeNodeStrokeCap(id, value);
      });
    },
    [mixedProperties.strokeCap?.ids, instance.changeNodeStrokeCap]
  );

  const layout = useCallback(
    (value: grida.program.nodes.i.IFlexContainer["layout"]) => {
      mixedProperties.layout?.ids.forEach((id) => {
        instance.changeContainerNodeLayout(id, value);
      });
    },
    [mixedProperties.layout?.ids, instance.changeContainerNodeLayout]
  );

  const direction = useCallback(
    (value: cg.Axis) => {
      mixedProperties.direction?.ids.forEach((id) => {
        instance.changeFlexContainerNodeDirection(id, value);
      });
    },
    [mixedProperties.direction?.ids, instance.changeFlexContainerNodeDirection]
  );

  const mainAxisAlignment = useCallback(
    (value: cg.MainAxisAlignment) => {
      mixedProperties.mainAxisAlignment?.ids.forEach((id) => {
        instance.changeFlexContainerNodeMainAxisAlignment(id, value);
      });
    },
    [
      mixedProperties.mainAxisAlignment?.ids,
      instance.changeFlexContainerNodeMainAxisAlignment,
    ]
  );

  const crossAxisAlignment = useCallback(
    (value: cg.CrossAxisAlignment) => {
      mixedProperties.crossAxisAlignment?.ids.forEach((id) => {
        instance.changeFlexContainerNodeCrossAxisAlignment(id, value);
      });
    },
    [
      mixedProperties.crossAxisAlignment?.ids,
      instance.changeFlexContainerNodeCrossAxisAlignment,
    ]
  );

  const cornerRadius = useCallback(
    (value: grida.program.nodes.i.IRectangleCorner["cornerRadius"]) => {
      mixedProperties.cornerRadius?.ids.forEach((id) => {
        instance.changeNodeCornerRadius(id, value);
      });
    },
    [mixedProperties.cornerRadius?.ids, instance.changeNodeCornerRadius]
  );

  const cursor = useCallback(
    (value: cg.SystemMouseCursor) => {
      mixedProperties.cursor?.ids.forEach((id) => {
        instance.changeNodeMouseCursor(id, value);
      });
    },
    [mixedProperties.cursor?.ids, instance.changeNodeMouseCursor]
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
  const instance = useCurrentEditor();
  const state = useEditorState(instance, (state) => ({
    selection: state.selection,
    document: state.document,
    document_ctx: state.document_ctx,
  }));

  const selection = state.selection;

  const ids = useMemo(
    // selection & its recursive children
    () => [
      ...selection,
      ...selection
        .map((s) => editor.dq.getChildren(state.document_ctx, s, true))
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
        instance.changeNodeFill(id, value);
      });
    },
    [paints, instance.changeNodeFill]
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

export function useEditorFlagsState() {
  const instance = useCurrentEditor();
  const flags = useEditorState(instance, (state) => state.flags);
  const debug = useEditorState(instance, (state) => state.debug);

  return useMemo(() => {
    return {
      flags,
      debug,
    };
  }, [flags, debug]);
}

export function useEditorSurface(): {
  a11yarrow: (
    target: "selection" | editor.NodeID,
    direction: "up" | "down" | "left" | "right",
    shiftKey: boolean,
    config?: editor.api.NudgeUXConfig
  ) => void;
  nudge: (
    target: "selection" | editor.NodeID,
    axis: "x" | "y",
    delta: number,
    config?: editor.api.NudgeUXConfig
  ) => void;
  getNodeAbsoluteRotation: (node_id: editor.NodeID) => number;
} {
  const editor = useCurrentEditor();

  const dispatch = React.useCallback(
    (action: Action) => editor.dispatch(action),
    [editor]
  );

  // Keep React-specific functions
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
      target: "selection" | editor.NodeID = "selection",
      axis: "x" | "y",
      delta: number = 1,
      config: editor.api.NudgeUXConfig = {
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

  const a11yarrow = useCallback(
    (
      target: "selection" | editor.NodeID,
      direction: "up" | "down" | "left" | "right",
      shiftKey: boolean,
      config: editor.api.NudgeUXConfig = {
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
        type: `a11y/${direction}`,
        target,
        shiftKey,
      });
    },
    [dispatch]
  );

  const getNodeAbsoluteRotation = useCallback(
    (node_id: editor.NodeID) => {
      const node = editor.getNodeById(node_id);
      return (node as any).rotation ?? 0;
    },
    [editor]
  );

  return {
    nudge,
    a11yarrow,
    getNodeAbsoluteRotation,
  };
}

interface UseSelectionState {
  selection: editor.state.IEditorState["selection"];
  hovered_node_id: editor.state.IEditorState["hovered_node_id"];
}

export function useSelectionState(): UseSelectionState {
  const editor = useCurrentEditor();
  return useEditorState<UseSelectionState>(editor, (state) => ({
    selection: state.selection,
    hovered_node_id: state.hovered_node_id,
  }));
}

interface UseDocumentState {
  document: editor.state.IEditorState["document"];
  document_ctx: editor.state.IEditorState["document_ctx"];
}

export function useDocumentState(): UseDocumentState {
  const editor = useCurrentEditor();
  return useEditorState<UseDocumentState>(
    editor,
    (state) =>
      ({
        document: state.document,
        document_ctx: state.document_ctx,
      }) satisfies UseDocumentState
  );
}

type UseSceneState = grida.program.document.Scene & {
  selection: editor.state.IEditorState["selection"];
  hovered_node_id: editor.state.IEditorState["hovered_node_id"];
  hovered_vertex_idx: editor.state.IEditorState["hovered_vertex_idx"];
  document_ctx: editor.state.IEditorState["document_ctx"];
};

export function useSceneState(scene_id: string): UseSceneState {
  const editor = useCurrentEditor();
  return useEditorState(editor, (state) => {
    return {
      selection: state.selection,
      hovered_node_id: state.hovered_node_id,
      hovered_vertex_idx: state.hovered_vertex_idx,
      document_ctx: state.document_ctx,
      ...state.document.scenes[scene_id],
    } satisfies Omit<UseSceneState, "setBackgroundColor">;
  });
}

export function useCurrentSceneState(): UseSceneState {
  const editor = useCurrentEditor();
  const scene_id = useEditorState(editor, (state) => {
    return state.scene_id!;
  });
  return useSceneState(scene_id);
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

interface UseCameraActions {
  scale: (
    factor: number | cmath.Vector2,
    origin: cmath.Vector2 | "center"
  ) => void;
  fit: (
    selector: grida.program.document.Selector,
    options?: {
      margin?: number | [number, number, number, number];
      animate?: boolean;
    }
  ) => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export function useCameraActions(): UseCameraActions {
  const instance = useCurrentEditor();

  const scale = useCallback(
    (
      factor: number | cmath.Vector2,
      origin: cmath.Vector2 | "center" = "center"
    ) => {
      const { transform } = instance.state;
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
        editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MIN,
        editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MAX
      );

      const sy = cmath.clamp(
        fy,
        editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MIN,
        editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MAX
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

      instance.transform(next);
    },
    [instance]
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
      const { document_ctx, selection, transform } = instance.state;
      const ids = editor.dq.querySelector(document_ctx, selection, selector);

      const cdom = new domapi.CanvasDOM(transform);

      const rects = ids
        .map((id) => cdom.getNodeBoundingRect(id))
        .filter((r) => r) as cmath.Rectangle[];

      if (rects.length === 0) {
        return;
      }

      const area = cmath.rect.union(rects);

      const _view = domapi.get_viewport_rect();
      const view = { x: 0, y: 0, width: _view.width, height: _view.height };

      const next_transform = cmath.ext.viewport.transformToFit(
        view,
        area,
        options.margin
      );

      if (options.animate) {
        animateTransformTo(transform, next_transform, (t) => {
          instance.transform(t);
        });
      } else {
        instance.transform(next_transform);
      }
    },
    [instance]
  );

  const zoomIn = useCallback(() => {
    const { transform } = instance.state;
    const prevscale = transform[0][0];
    const nextscale = cmath.quantize(prevscale * 2, 0.01);

    scale(nextscale);
    //
  }, [scale]);

  const zoomOut = useCallback(() => {
    const { transform } = instance.state;
    const prevscale = transform[0][0];
    const nextscale = cmath.quantize(prevscale / 2, 0.01);

    scale(nextscale);
    //
  }, [scale]);

  return {
    scale,
    fit,
    zoomIn,
    zoomOut,
  };
}

export function useTransform() {
  const editor = useCurrentEditor();
  const transform = useEditorState(editor, (state) => state.transform);

  return useMemo(() => {
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
    };
  }, [transform]);
}

export function useEventTargetCSSCursor() {
  const editor = useCurrentEditor();
  const tool = useEditorState(editor, (state) => state.tool);

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

export function usePointerState(): editor.state.IEditorState["pointer"] {
  const editor = useCurrentEditor();
  return useEditorState(editor, (state) => state.pointer);
}

interface UseToolState {
  tool: editor.state.IEditorState["tool"];
  content_edit_mode: editor.state.IEditorState["content_edit_mode"];
}

export function useToolState(): UseToolState {
  const editor = useCurrentEditor();
  const tool = useEditorState(editor, (state) => state.tool);
  const content_edit_mode = useEditorState(
    editor,
    (state) => state.content_edit_mode
  );

  return useMemo(() => {
    return {
      tool,
      content_edit_mode,
    };
  }, [tool, content_edit_mode]);
}

export function useBrushState() {
  const editor = useCurrentEditor();
  return useEditorState(editor, (state) => state.brush);
}

interface UseEventTarget {
  transform: editor.state.IEditorState["transform"];
  gesture: editor.state.IEditorState["gesture"];
  dragging: editor.state.IEditorState["dragging"];
  hovered_node_id: editor.state.IEditorState["hovered_node_id"];
  dropzone: editor.state.IEditorState["dropzone"];
  surface_snapping: editor.state.IEditorState["surface_snapping"];
  is_node_transforming: boolean;
  is_node_translating: boolean;
  is_node_scaling: boolean;

  selection: editor.state.IEditorState["selection"];
  marquee: editor.state.IEditorState["marquee"];
  edges: grida.program.document.Edge2D[];
  guides: grida.program.document.Guide2D[];
  pixelgrid: editor.state.IEditorState["pixelgrid"];
  ruler: editor.state.IEditorState["ruler"];

  // Actions/callbacks (write)
  zoom: (delta: number, origin: cmath.Vector2) => void;
  pan: (delta: [number, number]) => void;
  //
  setPixelGridState: (state: "on" | "off") => void;
  setRulerState: (state: "on" | "off") => void;
  deleteGuide: (idx: number) => void;

  startGuideGesture: (axis: cmath.Axis, idx: number | -1) => void;
  startScaleGesture: (
    selection: string | string[],
    direction: cmath.CardinalDirection
  ) => void;
  startSortGesture: (selection: string | string[], node_id: string) => void;
  startGapGesture: (selection: string | string[], axis: "x" | "y") => void;
  startCornerRadiusGesture: (selection: string) => void;
  startRotateGesture: (selection: string) => void;

  pointerDown: (event: PointerEvent) => void;
  pointerUp: (event: PointerEvent) => void;
  pointerMove: (event: PointerEvent) => void;

  click: (event: MouseEvent) => void;
  doubleClick: (event: MouseEvent) => void;

  dragStart: (event: PointerEvent) => void;
  dragEnd: (event: PointerEvent) => void;
  drag: (event: TCanvasEventTargetDragGestureState) => void;

  multipleSelectionOverlayClick: (
    selection: string[],
    event: MouseEvent
  ) => void;
}

export function useEventTarget(): UseEventTarget {
  // const [state, dispatch] = __useInternal();
  const instance = useCurrentEditor();
  const state = useEditorState(instance, (state) => ({
    transform: state.transform,
    surface_snapping: state.surface_snapping,
    gesture: state.gesture,
    dragging: state.dragging,
    hovered_node_id: state.hovered_node_id,
    dropzone: state.dropzone,
    selection: state.selection,
    content_edit_mode: state.content_edit_mode,
    tool: state.tool,
    brush: state.brush,
    marquee: state.marquee,
    debug: state.debug,
    pixelgrid: state.pixelgrid,
    ruler: state.ruler,
    flags: state.flags,
  }));
  const scene = useCurrentSceneState();

  const dispatch = useCallback(
    (action: Action) => {
      instance.dispatch(action);
    },
    [instance]
  );

  const { guides, edges } = scene;

  const {
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
    flags,
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
        editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MIN,
        editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MAX
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
    [dispatch, transform]
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
      transform,
      debug,
      flags,
      gesture,
      dragging,
      surface_snapping,
      //
      marquee,
      tool,
      brush,
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
    transform,
    debug,
    flags,
    gesture,
    dragging,
    surface_snapping,
    //
    marquee,
    tool,
    brush,
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
    dragStart,
    dragEnd,
    drag,
    //
    multipleSelectionOverlayClick,
    //
  ]);
}

export function useDataTransferEventTarget() {
  const instance = useCurrentEditor();
  const state = useEditorState(instance, (state) => ({
    transform: state.transform,
  }));

  const dispatch = useCallback(
    (action: Action) => {
      instance.dispatch(action);
    },
    [instance]
  );

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
  // const { state } = useDocument();
  const instance = useCurrentEditor();
  const state = useEditorState(instance, (state) => ({
    user_clipboard: state.user_clipboard,
  }));

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
  // const [state, dispatch] = __useInternal();
  const instance = useCurrentEditor();
  const state = useEditorState(instance, (state) => ({
    content_edit_mode: state.content_edit_mode,
    document: state.document,
    hovered_vertex_idx: state.hovered_vertex_idx,
    tool: state.tool,
  }));
  const dispatch = React.useCallback(
    (action: Action) => instance.dispatch(action),
    [instance]
  );
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
      instance.selectVertex(node_id, vertex);
    },
    [tool.type, instance.selectVertex, node_id]
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
      instance.deleteVertex(node_id, vertex);
    },
    [node_id, instance.deleteVertex]
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
  const editor = useCurrentEditor();
  const templates = useEditorState(editor, (state) => state.templates);
  const { document } = useDocumentState();

  const rootnode = document.nodes[root_id];

  assert(rootnode.type === "template_instance", "root node must be template");
  assert(templates && templates[rootnode.template_id], "template not found");

  const rootProperties = rootnode.properties || {};
  const rootProps = rootnode.props || {};
  const rootDefault = templates![rootnode.template_id].default || {};

  const changeRootProps = useCallback(
    (key: string, value: any) => {
      editor.changeNodeProps(root_id, key, value);
    },
    [editor, root_id]
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

export type NodeWithMeta = grida.program.nodes.UnknwonNode & {
  meta: {
    is_component_consumer: boolean;
    is_flex_parent: boolean;
  };
};

export function useNodeState<Selected>(
  node_id: string,
  selector: (state: grida.program.nodes.UnknwonNode) => Selected
) {
  const instance = useCurrentEditor();
  return useEditorState(instance, (state) => {
    const node = state.document.nodes[node_id];
    return selector(node as grida.program.nodes.UnknwonNode);
  });
}

/**
 * @deprecated use {@link useNodeState} instead
 * @returns
 */
export function useNode(node_id: string): NodeWithMeta {
  assert(node_id, "node_id is required");
  // const { state } = useDocument();
  const instance = useCurrentEditor();
  const state = useEditorState(instance, (state) => ({
    document: state.document,
    templates: state.templates,
  }));

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

export function useComputedNode(
  node_id: string
): grida.program.nodes.UnknwonComputedNode {
  const { props, text, html, src, href, fill } = useNodeState(
    node_id,
    (node) => ({
      props: node.props,
      text: node.text,
      html: node.html,
      src: node.src,
      href: node.href,
      fill: node.fill,
    })
  );

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

export function useTemplateDefinition(template_id: string) {
  // const {
  //   state: { templates },
  // } = useDocument();
  const instance = useCurrentEditor();
  const templates = useEditorState(instance, (state) => state.templates);

  return templates![template_id];
}

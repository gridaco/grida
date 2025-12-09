"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { editor } from "@/grida-canvas";
import grida from "@grida/schema";
import { io } from "@grida/io";
import type { tokens } from "@grida/tokens";
import cg from "@grida/cg";
import { useComputed } from "@/grida-canvas-react-renderer-dom/nodes/use-computed";
import {
  DataProvider,
  ProgramDataContextHost,
} from "@/grida-react-program-context/data-context/context";
import type { Action } from "@/grida-canvas/action";
import equal from "fast-deep-equal";
import { is_direct_component_consumer } from "@/grida-canvas/utils/supports";
import { Editor } from "@/grida-canvas/editor";
import { EditorContext, useCurrentEditor, useEditorState } from "./use-editor";
import assert from "assert";
import { cursors } from "../components/cursor/cursor-data";

type Dispatcher = (action: Action) => void;

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
        <DataProvider>{children}</DataProvider>
      </ProgramDataContextHost>
    </EditorContext.Provider>
  );
}

export function useNodeActions(node_id: string | undefined) {
  const instance = useCurrentEditor();

  return useMemo(() => {
    if (!node_id) return;
    const node = instance.doc.getNodeById(node_id);
    return {
      toggleLocked: () => instance.commands.toggleNodeLocked(node_id),
      toggleActive: () => instance.commands.toggleNodeActive(node_id),
      toggleBold: () => instance.toggleTextNodeBold(node_id),
      toggleItalic: () => instance.toggleTextNodeItalic(node_id),
      toggleUnderline: () => instance.commands.toggleTextNodeUnderline(node_id),
      toggleLineThrough: () =>
        instance.commands.toggleTextNodeLineThrough(node_id),
      component: (component_id: string) =>
        instance.commands.changeNodePropertyComponent(node_id, component_id),
      text: (text: tokens.StringValueExpression | null) =>
        instance.commands.changeNodePropertyText(node_id, text),
      style: (
        key: keyof grida.program.css.ExplicitlySupportedCSSProperties,
        value: any
      ) => instance.commands.changeNodePropertyStyle(node_id, key, value),
      value: (key: string, value: any) =>
        instance.commands.changeNodePropertyProps(node_id, key, value),
      // attributes
      userdata: (value: any) =>
        instance.commands.changeNodeUserData(node_id, value),
      name: (name: string) => {
        node.name = name;
      },
      active: (active: boolean) => {
        node.active = active;
      },
      locked: (locked: boolean) => {
        node.locked = locked;
      },
      src: (src?: tokens.StringValueExpression) =>
        instance.commands.changeNodePropertySrc(node_id, src),
      href: (href?: grida.program.nodes.i.IHrefable["href"]) =>
        instance.commands.changeNodePropertyHref(node_id, href),
      target: (target?: grida.program.nodes.i.IHrefable["target"]) =>
        instance.commands.changeNodePropertyTarget(node_id, target),

      positioning: (value: grida.program.nodes.i.IPositioning) =>
        instance.commands.changeNodePropertyPositioning(node_id, value),
      positioningMode: (value: "absolute" | "relative") =>
        instance.commands.changeNodePropertyPositioningMode(node_id, value),

      //
      corner_radius: (value: cg.CornerRadius) =>
        instance.commands.changeNodePropertyCornerRadius(node_id, value),
      cornerRadiusDelta: (delta: number) =>
        instance.commands.changeNodePropertyCornerRadiusWithDelta(
          node_id,
          delta
        ),
      pointCount: (value: number) =>
        instance.commands.changeNodePropertyPointCount(node_id, value),
      innerRadius: (value: number) =>
        instance.commands.changeNodePropertyInnerRadius(node_id, value),
      arcData: (value: grida.program.nodes.i.IEllipseArcData) =>
        instance.commands.changeNodePropertyArcData(node_id, value),
      fill_paints: (fills: cg.Paint[]) =>
        instance.commands.changeNodePropertyFills(node_id, fills),
      stroke_paints: (strokes: cg.Paint[]) =>
        instance.commands.changeNodePropertyStrokes(node_id, strokes),
      addFill: (fill: cg.Paint, at?: "start" | "end") =>
        instance.commands.addNodeFill(node_id, fill, at),
      addStroke: (stroke: cg.Paint, at?: "start" | "end") =>
        instance.commands.addNodeStroke(node_id, stroke, at),
      strokeWidth: (change: editor.api.NumberChange) =>
        instance.commands.changeNodePropertyStrokeWidth(node_id, change),
      strokeTopWidth: (value: number) =>
        instance.commands.changeNodePropertyStrokeTopWidth(node_id, value),
      strokeRightWidth: (value: number) =>
        instance.commands.changeNodePropertyStrokeRightWidth(node_id, value),
      strokeBottomWidth: (value: number) =>
        instance.commands.changeNodePropertyStrokeBottomWidth(node_id, value),
      strokeLeftWidth: (value: number) =>
        instance.commands.changeNodePropertyStrokeLeftWidth(node_id, value),
      strokeAlign: (value: cg.StrokeAlign) =>
        instance.commands.changeNodePropertyStrokeAlign(node_id, value),
      strokeCap: (value: cg.StrokeCap) =>
        instance.commands.changeNodePropertyStrokeCap(node_id, value),
      strokeJoin: (value: cg.StrokeJoin) =>
        instance.commands.changeNodePropertyStrokeJoin(node_id, value),
      strokeMiterLimit: (value: number) =>
        instance.commands.changeNodePropertyStrokeMiterLimit(node_id, value),
      strokeDashArray: (value: number[] | undefined) =>
        instance.commands.changeNodePropertyStrokeDashArray(node_id, value),
      fit: (value: cg.BoxFit) =>
        instance.commands.changeNodePropertyFit(node_id, value),
      // stylable
      opacity: (change: editor.api.NumberChange) => node.changeOpacity(change),
      blend_mode: (value: cg.LayerBlendMode) => {
        node.blend_mode = value;
      },
      maskType: (value: cg.LayerMaskType) => {
        node.mask = value;
      },
      rotation: node.changeRotation,
      width: (value: grida.program.css.LengthPercentage | "auto") =>
        instance.commands.changeNodeSize(node_id, "width", value),
      height: (value: grida.program.css.LengthPercentage | "auto") =>
        instance.commands.changeNodeSize(node_id, "height", value),

      // text style
      fontFamily: (value: string, force?: boolean) =>
        instance.changeTextNodeFontFamilySync(node_id, value, force),
      fontWeight: (value: cg.NFontWeight) =>
        instance.commands.changeTextNodeFontWeight(node_id, value),
      fontKerning: (value: boolean) =>
        instance.commands.changeTextNodeFontKerning(node_id, value),
      fontWidth: (value: number) =>
        instance.commands.changeTextNodeFontWidth(node_id, value),
      fontFeature: (key: cg.OpenTypeFeature, value: boolean) =>
        instance.commands.changeTextNodeFontFeature(node_id, key, value),
      fontVariation: (key: string, value: number) =>
        instance.commands.changeTextNodeFontVariation(node_id, key, value),
      fontOpticalSizing: (value: cg.OpticalSizing) =>
        instance.commands.changeTextNodeFontOpticalSizing(node_id, value),
      fontStyle: (change: editor.api.FontStyleChangeDescription) =>
        instance.changeTextNodeFontStyle(node_id, change),
      fontSize: (change: editor.api.NumberChange) =>
        instance.commands.changeTextNodeFontSize(node_id, change),
      textAlign: (value: cg.TextAlign) =>
        instance.commands.changeTextNodeTextAlign(node_id, value),
      textAlignVertical: (value: cg.TextAlignVertical) =>
        instance.commands.changeTextNodeTextAlignVertical(node_id, value),
      textTransform: (value: cg.TextTransform) =>
        instance.commands.changeTextNodeTextTransform(node_id, value),
      textDecorationLine: (value: cg.TextDecorationLine) =>
        instance.commands.changeTextNodeTextDecorationLine(node_id, value),
      textDecorationStyle: (value: cg.TextDecorationStyle) =>
        instance.commands.changeTextNodeTextDecorationStyle(node_id, value),
      textDecorationThickness: (value: cg.TextDecorationThicknessPercentage) =>
        instance.commands.changeTextNodeTextDecorationThickness(node_id, value),
      textDecorationColor: (value: cg.TextDecorationColor) =>
        instance.commands.changeTextNodeTextDecorationColor(node_id, value),
      textDecorationSkipInk: (value: cg.TextDecorationSkipInkFlag) =>
        instance.commands.changeTextNodeTextDecorationSkipInk(node_id, value),
      lineHeight: (change: editor.api.NumberChange) =>
        instance.commands.changeTextNodeLineHeight(node_id, change),
      letterSpacing: (
        change: editor.api.TChange<
          grida.program.nodes.TextNode["letter_spacing"]
        >
      ) => instance.commands.changeTextNodeLetterSpacing(node_id, change),
      wordSpacing: (
        change: editor.api.TChange<grida.program.nodes.TextNode["word_spacing"]>
      ) => instance.commands.changeTextNodeWordSpacing(node_id, change),
      maxLength: (value: number | undefined) =>
        instance.commands.changeTextNodeMaxlength(node_id, value),
      maxLines: (value: number | null) =>
        instance.commands.changeTextNodeMaxLines(node_id, value),

      // border
      border: (value: grida.program.css.Border | undefined) =>
        instance.commands.changeNodePropertyBorder(node_id, value),

      padding: (value: grida.program.nodes.i.IPadding["padding"]) =>
        instance.commands.changeContainerNodePadding(node_id, value),
      // margin: (value?: number) =>
      //   changeNodeStyle(node_id, "margin", value),
      feShadows: (value?: cg.FeShadow[]) =>
        instance.commands.changeNodeFeShadows(node_id, value),
      feBlur: (value?: cg.FeLayerBlur) =>
        instance.commands.changeNodeFeBlur(node_id, value),
      feBackdropBlur: (value?: cg.FeBackdropBlur) =>
        instance.commands.changeNodeFeBackdropBlur(node_id, value),

      // layout
      layout: (value: grida.program.nodes.i.IFlexContainer["layout"]) =>
        instance.commands.changeContainerNodeLayout(node_id, value),
      direction: (value: cg.Axis) =>
        instance.commands.changeFlexContainerNodeDirection(node_id, value),
      layoutWrap: (value: "wrap" | "nowrap") =>
        instance.commands.changeFlexContainerNodeWrap(node_id, value),
      mainAxisAlignment: (value: cg.MainAxisAlignment) =>
        instance.commands.changeFlexContainerNodeMainAxisAlignment(
          node_id,
          value
        ),
      crossAxisAlignment: (value: cg.CrossAxisAlignment) =>
        instance.commands.changeFlexContainerNodeCrossAxisAlignment(
          node_id,
          value
        ),
      gap: (
        value: number | { main_axis_gap: number; cross_axis_gap: number }
      ) => instance.commands.changeFlexContainerNodeGap(node_id, value),

      // css style
      aspectRatio: (value?: number) =>
        instance.commands.changeNodePropertyStyle(
          node_id,
          "aspectRatio",
          value
        ),
      cursor: (value: cg.SystemMouseCursor) =>
        instance.commands.changeNodePropertyMouseCursor(node_id, value),
    };
  }, [node_id, instance]);
}

export function useCurrentSelectionIds() {
  const instance = useCurrentEditor();
  const selection = useEditorState(instance, (state) => state.selection);
  return selection;
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

type UseSceneState = grida.program.nodes.SceneNode & {
  children_refs: string[];
  selection: editor.state.IEditorState["selection"];
  hovered_node_id: editor.state.IEditorState["hovered_node_id"];
  document_ctx: editor.state.IEditorState["document_ctx"];
};

export function useSceneState(scene_id: string): UseSceneState {
  const editor = useCurrentEditor();
  return useEditorState(editor, (state) => {
    const scene = state.document.nodes[
      scene_id
    ] as grida.program.nodes.SceneNode;
    const children_refs = state.document.links[scene_id] || [];
    return {
      selection: state.selection,
      hovered_node_id: state.hovered_node_id,
      document_ctx: state.document_ctx,
      ...scene,
      children_refs,
    } satisfies UseSceneState;
  });
}

export function useCurrentSceneState(): UseSceneState {
  const editor = useCurrentEditor();
  const scene_id = useEditorState(editor, (state) => {
    return state.scene_id!;
  });
  return useSceneState(scene_id);
}

export function useBackendState() {
  const editor = useCurrentEditor();
  return editor.backend;
}

export function useTransformState() {
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

/**
 * Hook to detect when the canvas is actively being transformed (panned, zoomed, etc.)
 *
 * @returns `true` when the canvas transform is changing, `false` when stable
 * @example
 * ```tsx
 * const isTransforming = useIsTransforming();
 * if (isTransforming) {
 *   // Canvas is being panned, zoomed, or otherwise transformed
 * }
 * ```
 */
export function useIsTransforming() {
  const editor = useCurrentEditor();
  const transform = useEditorState(editor, (state) => state.transform);
  const prevTransformRef = useRef(transform);
  const [isTransforming, setIsTransforming] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const hasChanged = !equal(transform, prevTransformRef.current);

    if (hasChanged) {
      setIsTransforming(true);

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set timeout to mark as not transforming after a short delay
      timeoutRef.current = setTimeout(() => {
        setIsTransforming(false);
      }, 100); // 100ms delay to detect when transform stops
    }

    // Update the previous transform reference
    prevTransformRef.current = transform;
  }, [transform]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return isTransforming;
}

export function useEventTargetCSSCursor() {
  const editor = useCurrentEditor();
  const tool = useEditorState(editor, (state) => state.tool);
  const istyping = useEditorState(
    editor,
    (state) => state.local_cursor_chat.is_open
  );

  return useMemo(() => {
    if (istyping) {
      // when typing, we show a fake cursor (see CursorChatInput)
      return "none";
    }
    switch (tool.type) {
      case "cursor":
        return cursors.default_png.css;
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
      case "lasso":
        return "crosshair";
    }
  }, [tool, istyping]);
}

export function usePointerState(): editor.state.IEditorState["pointer"] {
  const editor = useCurrentEditor();
  return useEditorState(editor, (state) => state.pointer);
}

export function useMultiplayerCursorState(): editor.state.IEditorMultiplayerCursorState["cursors"] {
  const editor = useCurrentEditor();
  return useEditorState(editor, (state) => state.cursors);
}

export function useToolState(): editor.state.IEditorState["tool"] {
  const editor = useCurrentEditor();
  return useEditorState(editor, (state) => state.tool);
}

/**
 * @deprecated {@link useContentEditModeState} can be expensive for certain modes.
 * @returns
 */
export function useContentEditModeState(): editor.state.IEditorState["content_edit_mode"] {
  const editor = useCurrentEditor();

  return useEditorState(editor, (state) => state.content_edit_mode);
}

export function useContentEditModeMinimalState():
  | { type: editor.state.ContentEditModeState["type"]; node_id: string }
  | undefined {
  const editor = useCurrentEditor();

  return useEditorState(editor, (state) => {
    const content_edit_mode = state.content_edit_mode;
    if (!content_edit_mode) return undefined;
    return {
      type: content_edit_mode.type,
      node_id: content_edit_mode.node_id,
    };
  });
}

export function useBrushState() {
  const editor = useCurrentEditor();
  return useEditorState(editor, (state) => state.brush);
}

interface UseA11yArrow {
  a11yarrow: (
    target: "selection" | editor.NodeID,
    direction: "up" | "down" | "left" | "right",
    shiftKey: boolean,
    config?: editor.api.NudgeUXConfig
  ) => void;
}

function __use_off_gesture_nudge_state(onOff: () => void) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const __gesture_nudge_debounced = useCallback(
    (delay: number) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        onOff();
      }, delay);
    },
    [onOff]
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

export function useA11yArrow(): UseA11yArrow {
  const instance = useCurrentEditor();

  const off = useCallback(() => {
    instance.surface.surfaceLockNudgeGesture("off");
  }, [instance]);

  const __gesture_nudge_debounced = __use_off_gesture_nudge_state(off);

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
        instance.surface.surfaceLockNudgeGesture("on");

        // Debounce to turn off gesture
        __gesture_nudge_debounced(delay);
      }

      instance.surface.a11yArrow(direction, shiftKey);
    },
    [instance]
  );

  return {
    a11yarrow,
  };
}

interface UseGestureState {
  gesture: editor.state.IEditorState["gesture"];
  is_node_transforming: boolean;
  is_node_translating: boolean;
  is_node_scaling: boolean;
}

export function useGestureState(): UseGestureState {
  const instance = useCurrentEditor();

  const gesture = useEditorState(instance, (state) => state.gesture);

  const is_node_transforming = gesture.type !== "idle";
  const is_node_translating =
    gesture.type === "translate" ||
    gesture.type === "sort" ||
    gesture.type === "nudge";
  const is_node_scaling = gesture.type === "scale";

  return {
    gesture,
    is_node_transforming,
    is_node_translating,
    is_node_scaling,
  };
}

export function useClipboardSync() {
  const instance = useCurrentEditor();
  const user_clipboard = useEditorState(
    instance,
    (state) => state.user_clipboard
  );
  const vector_clipboard = useEditorState(instance, (state) =>
    state.content_edit_mode?.type === "vector"
      ? state.content_edit_mode.clipboard
      : null
  );

  useEffect(() => {
    try {
      if (vector_clipboard) {
        const txt = `grida:vn:${btoa(JSON.stringify(vector_clipboard))}`;
        navigator.clipboard.writeText(txt);
      } else if (user_clipboard) {
        const items = io.clipboard.encode(user_clipboard);

        if (items) {
          const clipboardItem = new ClipboardItem(items);
          navigator.clipboard.write([clipboardItem]);
        }
      }
    } catch (e) {
      reportError(e);
    }
  }, [user_clipboard, vector_clipboard]);
  //
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
      editor.commands.changeNodePropertyProps(root_id, key, value);
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
      new editor.api.EditorConsumerVerboseError(
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
 * @deprecated - expensive
 */
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
  const editor = useCurrentEditor();
  const templates = useEditorState(editor, (state) => state.templates);

  return templates![template_id];
}

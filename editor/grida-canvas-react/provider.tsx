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
import type cg from "@grida/cg";
import { useComputed } from "@/grida-canvas-react-renderer-dom/nodes/use-computed";
import {
  DataProvider,
  ProgramDataContextHost,
} from "@/grida-react-program-context/data-context/context";
import { GoogleFontsManager } from "./components/google-fonts";
import cmath from "@grida/cmath";
import type { Action } from "@/grida-canvas/action";
import equal from "fast-deep-equal";
import { toast } from "sonner";
import { is_direct_component_consumer } from "@/grida-canvas/utils/supports";
import { Editor } from "@/grida-canvas/editor";
import { EditorContext, useCurrentEditor, useEditorState } from "./use-editor";
import assert from "assert";
import nid from "../grida-canvas/reducers/tools/id";
import * as google from "@grida/fonts/google";

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

  useEffect(() => {
    if (editor.state.webfontlist.items.length === 0) {
      google.fetchWebfontList().then((webfontlist) => {
        editor.dispatch({ type: "webfonts/list/load", webfontlist });
      });
    }
  }, [editor]);

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
      toggleUnderline: () => instance.toggleNodeUnderline(node_id),
      toggleLineThrough: () => instance.toggleNodeLineThrough(node_id),
      component: (component_id: string) =>
        instance.changeNodeComponent(node_id, component_id),
      text: (text: tokens.StringValueExpression | null) =>
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
      cornerRadius: (value: cg.CornerRadius) =>
        instance.changeNodeCornerRadius(node_id, value),
      pointCount: (value: number) =>
        instance.changeNodePointCount(node_id, value),
      innerRadius: (value: number) =>
        instance.changeNodeInnerRadius(node_id, value),
      arcData: (value: grida.program.nodes.i.IEllipseArcData) =>
        instance.changeNodeArcData(node_id, value),
      fill: (
        value: grida.program.nodes.i.props.SolidPaintToken | cg.Paint | null
      ) => instance.changeNodeFill(node_id, value),
      stroke: (
        value: grida.program.nodes.i.props.SolidPaintToken | cg.Paint | null
      ) => instance.changeNodeStroke(node_id, value),
      strokeWidth: (change: editor.api.NumberChange) =>
        instance.changeNodeStrokeWidth(node_id, change),
      strokeAlign: (value: cg.StrokeAlign) =>
        instance.changeNodeStrokeAlign(node_id, value),
      strokeCap: (value: cg.StrokeCap) =>
        instance.changeNodeStrokeCap(node_id, value),
      fit: (value: cg.BoxFit) => instance.changeNodeFit(node_id, value),
      // stylable
      opacity: (change: editor.api.NumberChange) =>
        instance.changeNodeOpacity(node_id, change),
      blendMode: (value: cg.BlendMode) =>
        instance.changeNodeBlendMode(node_id, value),
      rotation: (change: editor.api.NumberChange) =>
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
      fontSize: (change: editor.api.NumberChange) =>
        instance.changeTextNodeFontSize(node_id, change),
      textAlign: (value: cg.TextAlign) =>
        instance.changeTextNodeTextAlign(node_id, value),
      textAlignVertical: (value: cg.TextAlignVertical) =>
        instance.changeTextNodeTextAlignVertical(node_id, value),
      textTransform: (value: cg.TextTransform) =>
        instance.changeTextNodeTextTransform(node_id, value),
      textDecorationLine: (value: cg.TextDecorationLine) =>
        instance.changeTextNodeTextDecorationLine(node_id, value),
      textDecorationStyle: (value: cg.TextDecorationStyle) =>
        instance.changeTextNodeTextDecorationStyle(node_id, value),
      textDecorationThickness: (value: cg.TextDecorationThicknessPercentage) =>
        instance.changeTextNodeTextDecorationThickness(node_id, value),
      textDecorationColor: (value: cg.TextDecorationColor) =>
        instance.changeTextNodeTextDecorationColor(node_id, value),
      textDecorationSkipInk: (value: cg.TextDecorationSkipInkFlag) =>
        instance.changeTextNodeTextDecorationSkipInk(node_id, value),
      lineHeight: (change: editor.api.NumberChange) =>
        instance.changeTextNodeLineHeight(node_id, change),
      letterSpacing: (
        change: editor.api.TChange<
          grida.program.nodes.TextNode["letterSpacing"]
        >
      ) => instance.changeTextNodeLetterSpacing(node_id, change),
      maxLength: (value: number | undefined) =>
        instance.changeTextNodeMaxlength(node_id, value),
      maxLines: (value: number | null) =>
        instance.changeTextNodeMaxLines(node_id, value),

      // border
      border: (value: grida.program.css.Border | undefined) =>
        instance.changeNodeBorder(node_id, value),

      padding: (value: grida.program.nodes.i.IPadding["padding"]) =>
        instance.changeContainerNodePadding(node_id, value),
      // margin: (value?: number) =>
      //   changeNodeStyle(node_id, "margin", value),
      feShadows: (value?: cg.FeShadow[]) =>
        instance.changeNodeFeShadows(node_id, value),
      feBlur: (value?: cg.FeBlur) => instance.changeNodeFeBlur(node_id, value),
      feBackdropBlur: (value?: cg.FeBlur) =>
        instance.changeNodeFeBackdropBlur(node_id, value),

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

type UseSceneState = grida.program.document.Scene & {
  selection: editor.state.IEditorState["selection"];
  hovered_node_id: editor.state.IEditorState["hovered_node_id"];
  document_ctx: editor.state.IEditorState["document_ctx"];
};

export function useSceneState(scene_id: string): UseSceneState {
  const editor = useCurrentEditor();
  return useEditorState(editor, (state) => {
    return {
      selection: state.selection,
      hovered_node_id: state.hovered_node_id,
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
      case "lasso":
        return "crosshair";
    }
  }, [tool]);
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

interface UseMultipleSelectionOverlayClick {
  multipleSelectionOverlayClick: (
    selection: string[],
    event: MouseEvent
  ) => void;
}

export function useMultipleSelectionOverlayClick(): UseMultipleSelectionOverlayClick {
  const instance = useCurrentEditor();
  const dispatch = useCallback(
    (action: Action) => {
      instance.dispatch(action);
    },
    [instance]
  );

  const multipleSelectionOverlayClick = useCallback(
    (selection: string[], event: MouseEvent) => {
      const ids = instance.getNodeIdsFromPointerEvent(event);

      dispatch({
        type: "event-target/event/multiple-selection-overlay/on-click",
        selection: selection,
        node_ids_from_point: ids,
        shiftKey: event.shiftKey,
      });
    },
    [dispatch]
  );

  return useMemo(() => {
    return {
      multipleSelectionOverlayClick,
    };
  }, [multipleSelectionOverlayClick]);
}

interface UseA11yActions {
  a11yarrow: (
    target: "selection" | editor.NodeID,
    direction: "up" | "down" | "left" | "right",
    shiftKey: boolean,
    config?: editor.api.NudgeUXConfig
  ) => void;
  a11yalign: (alignment: {
    horizontal?: "min" | "max" | "center";
    vertical?: "min" | "max" | "center";
  }) => void;
  nudge: (
    target: "selection" | editor.NodeID,
    axis: "x" | "y",
    delta: number,
    config?: editor.api.NudgeUXConfig
  ) => void;
}
export function useA11yActions(): UseA11yActions {
  const instance = useCurrentEditor();
  const dispatch = useCallback(
    (action: Action) => {
      instance.dispatch(action);
    },
    [instance]
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

  const a11yalign = useCallback(
    (alignment: {
      horizontal?: "min" | "max" | "center";
      vertical?: "min" | "max" | "center";
    }) => {
      dispatch({ type: "a11y/align", alignment });
    },
    [dispatch]
  );

  return {
    nudge,
    a11yarrow,
    a11yalign,
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
    gesture.type === "nudge" ||
    gesture.type === "gap";
  const is_node_scaling = gesture.type === "scale";

  return {
    gesture,
    is_node_transforming,
    is_node_translating,
    is_node_scaling,
  };
}

export function useDataTransferEventTarget() {
  const instance = useCurrentEditor();
  const state = useEditorState(instance, (state) => ({
    transform: state.transform,
  }));
  const current_clipboard = useEditorState(instance, (s) => s.user_clipboard);

  const insertText = useCallback(
    (
      text: string,
      position?: {
        clientX: number;
        clientY: number;
      }
    ) => {
      const [x, y] = instance.clientPointToCanvasPoint(
        position ? [position.clientX, position.clientY] : [0, 0]
      );

      const node = instance.createTextNode();
      node.$.name = text;
      node.$.text = text;
      node.$.left = x;
      node.$.top = y;
      node.$.fill = {
        type: "solid",
        color: { r: 0, g: 0, b: 0, a: 1 },
      } as cg.Paint;
    },
    [instance]
  );

  const insertImage = useCallback(
    async (
      name: string,
      file: File,
      position?: {
        clientX: number;
        clientY: number;
      }
    ) => {
      const [x, y] = instance.clientPointToCanvasPoint(
        position ? [position.clientX, position.clientY] : [0, 0]
      );

      // TODO: uploader is not implemented. use uploader configured by user.
      const url = URL.createObjectURL(file);
      const image = await instance.createImage(url);
      const node = instance.createImageNode(image);
      node.$.position = "absolute";
      node.$.name = name;
      node.$.left = x;
      node.$.top = y;
    },
    [instance]
  );

  const insertSVG = useCallback(
    async (
      name: string,
      svg: string,
      position?: {
        clientX: number;
        clientY: number;
      }
    ) => {
      const node = await instance.createNodeFromSvg(svg);

      const center_dx =
        typeof node.$.width === "number" && node.$.width > 0
          ? node.$.width / 2
          : 0;

      const center_dy =
        typeof node.$.height === "number" && node.$.height > 0
          ? node.$.height / 2
          : 0;

      const [x, y] = instance.clientPointToCanvasPoint(
        cmath.vector2.sub(
          position ? [position.clientX, position.clientY] : [0, 0],
          [center_dx, center_dy]
        )
      );

      node.$.name = name;
      node.$.left = x;
      node.$.top = y;
    },
    [instance]
  );

  const insertFromFile = useCallback(
    (
      type: io.clipboard.ValidFileType,
      file: File,
      position?: {
        clientX: number;
        clientY: number;
      }
    ) => {
      if (type === "image/svg+xml") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const svgContent = e.target?.result as string;
          const name = file.name.split(".svg")[0];
          insertSVG(name, svgContent, position);
        };
        reader.readAsText(file);
        return;
      } else if (
        type === "image/png" ||
        type === "image/jpeg" ||
        type === "image/gif"
      ) {
        const name = file.name.split(".")[0];
        insertImage(name, file, position);
        return;
      }
    },
    [insertImage, insertSVG]
  );

  /**
   * pasting from os clipboard (or fallbacks to local clipboard)
   *
   * 1. if the payload contains valid grida payload, insert it (or if identical to local clipboard, paste it)
   * 2. if the payload contains text/plain, image/png, image/jpeg, image/gif, image/svg+xml, insert it
   * 3. if the payload contains no valid payload, fallback to local clipboard, and paste it
   *
   */
  const onpaste = useCallback(
    async (event: ClipboardEvent) => {
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
        instance.paste();
        return;
      }

      let pasted_from_data_transfer = false;

      // NOTE: the read of the clipboard data should be non-blocking. (in safari, this will fail without any error)
      const items = (
        await Promise.all(
          Array.from(event.clipboardData.items).map(async (item) => {
            try {
              const payload = await io.clipboard.decode(item);
              return payload;
            } catch {
              return null;
            }
          })
        )
      ).filter((item) => item !== null);

      const vector_payload = items.find(
        (item) => item.type === "text" && item.text.startsWith("grida:vn:")
      );
      if (vector_payload) {
        try {
          assert(vector_payload.type === "text");
          const net = JSON.parse(
            atob(vector_payload.text.slice("grida:vn:".length))
          );
          instance.dispatch({ type: "paste", vector_network: net });
          pasted_from_data_transfer = true;
        } catch {}
      }

      if (pasted_from_data_transfer) {
        event.preventDefault();
      } else {
        const grida_payload = items.find((item) => item.type === "clipboard");

        // 1. if there is a grida html clipboard, use it and ignore all others.
        if (grida_payload) {
          if (
            current_clipboard?.payload_id === grida_payload.clipboard.payload_id
          ) {
            instance.paste();
            pasted_from_data_transfer = true;
          } else {
            grida_payload.clipboard.prototypes.forEach((p) => {
              const sub =
                grida.program.nodes.factory.create_packed_scene_document_from_prototype(
                  p,
                  nid
                );
              instance.insert({ document: sub });
            });
            pasted_from_data_transfer = true;
          }
        }
        // 2. if the payload contains text/plain, image/png, image/jpeg, image/gif, image/svg+xml, insert it
        else {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            try {
              switch (item.type) {
                case "text": {
                  const { text } = item;
                  insertText(text, {
                    clientX: window.innerWidth / 2,
                    clientY: window.innerHeight / 2,
                  });
                  pasted_from_data_transfer = true;
                  break;
                }
                case "image/gif":
                case "image/jpeg":
                case "image/png":
                case "image/svg+xml": {
                  const { type, file } = item;
                  insertFromFile(type, file, {
                    clientX: window.innerWidth / 2,
                    clientY: window.innerHeight / 2,
                  });
                  pasted_from_data_transfer = true;
                  break;
                }
              }
            } catch {}
          }
        }

        // 3. if the payload contains no valid payload, fallback to local clipboard, and paste it
        if (!pasted_from_data_transfer) {
          instance.paste();
          event.preventDefault();
        }
      }
    },
    [instance, insertFromFile, insertText, current_clipboard]
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
        const [valid, type] = io.clipboard.filetype(file);
        if (valid) {
          insertFromFile(type, file, event);
        } else {
          toast.error(`file type '${type}' is not supported`);
        }
      }
    },
    [insertFromFile]
  );
  //

  return { onpaste, ondragover, ondrop, insertText };
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
        const items = io.clipboard.encode(
          user_clipboard as io.clipboard.ClipboardPayload
        );

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

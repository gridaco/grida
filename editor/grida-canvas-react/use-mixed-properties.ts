import { useCallback, useMemo } from "react";
import { editor } from "@/grida-canvas";
import { useCurrentEditor, useEditorState } from "./use-editor";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";
import mixed from "@grida/mixed-properties";
import type cg from "@grida/cg";

// export function useMixedPropertiesSelector(
//   ids: string[],
//   selector: grida.program.nodes.UnknownNodeProperties<boolean>
// ) {
//   const instance = useCurrentEditor();
//   const nodes = useEditorState(instance, (state) =>
//     ids.map((id) => state.document.nodes[id])
//   );
//   //
// }

export type MixedPropertiesEditor = ReturnType<typeof useMixedProperties>;

/**
 * @deprecated expensive
 */
export function useMixedProperties(selection: string[]) {
  const instance = useCurrentEditor();
  const nodes = useEditorState(instance, (state) =>
    selection.map((id) => state.document.nodes[id])
  );

  const mixedProperties = useMemo(
    () =>
      mixed<grida.program.nodes.UnknwonNode, typeof grida.mixed>(
        nodes as grida.program.nodes.UnknwonNode[],
        {
          idKey: "id",
          ignoredKey: ["id", "type", "userdata"],
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
    instance.copy("selection");
  }, [instance]);

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
    (change: editor.api.NumberChange) => {
      mixedProperties.rotation?.ids.forEach((id) => {
        instance.changeNodeRotation(id, change);
      });
    },
    [mixedProperties.rotation?.ids, instance.changeNodeRotation]
  );

  const opacity = useCallback(
    (change: editor.api.NumberChange) => {
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
    (change: editor.api.NumberChange) => {
      mixedProperties.fontSize?.ids.forEach((id) => {
        instance.changeTextNodeFontSize(id, change);
      });
    },
    [mixedProperties.fontSize?.ids, instance.changeTextNodeFontSize]
  );

  const lineHeight = useCallback(
    (change: editor.api.NumberChange) => {
      mixedProperties.lineHeight?.ids.forEach((id) => {
        instance.changeTextNodeLineHeight(id, change);
      });
    },
    [mixedProperties.lineHeight?.ids, instance.changeTextNodeLineHeight]
  );

  const letterSpacing = useCallback(
    (
      change: editor.api.TChange<grida.program.nodes.TextNode["letterSpacing"]>
    ) => {
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
    (value: grida.program.nodes.i.props.SolidPaintToken | cg.Paint | null) => {
      const ids = mixedProperties.fill?.ids;
      if (!ids) return;
      instance.changeNodeFill(ids, value);
    },
    [mixedProperties.fill?.ids, instance]
  );

  const stroke = useCallback(
    (value: grida.program.nodes.i.props.SolidPaintToken | cg.Paint | null) => {
      const ids = mixedProperties.stroke?.ids;
      if (!ids) return;
      instance.changeNodeStroke(ids, value);
    },
    [mixedProperties.stroke?.ids, instance]
  );

  const strokeWidth = useCallback(
    (change: editor.api.NumberChange) => {
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
    (value: cg.CornerRadius) => {
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

/**
 * @deprecated expensive
 */
export function useMixedPaints() {
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
        .map((s) => dq.getChildren(state.document_ctx, s, true))
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
        | cg.Paint
        | null
        | null
    ) => {
      const group = paints[index];
      instance.changeNodeFill(group.ids, value);
    },
    [paints, instance]
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

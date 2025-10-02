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
export function useMixedProperties(ids: string[]) {
  const instance = useCurrentEditor();
  const nodes = useEditorState(instance, (state) =>
    ids.map((id) => state.document.nodes[id])
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
      ids.forEach((id) => {
        instance.commands.changeNodeName(id, value);
      });
    },
    [ids, instance.commands]
  );

  const copy = useCallback(() => {
    instance.commands.copy("selection");
  }, [instance]);

  const active = useCallback(
    (value: boolean) => {
      ids.forEach((id) => {
        instance.commands.changeNodeActive(id, value);
      });
    },
    [ids, instance.commands]
  );

  const locked = useCallback(
    (value: boolean) => {
      ids.forEach((id) => {
        instance.commands.changeNodeLocked(id, value);
      });
    },
    [ids, instance.commands]
  );

  const rotation = useCallback(
    (change: editor.api.NumberChange) => {
      mixedProperties.rotation?.ids.forEach((id) => {
        instance.doc.getNodeById(id)?.changeRotation(change);
      });
    },
    [mixedProperties.rotation?.ids, instance]
  );

  const opacity = useCallback(
    (change: editor.api.NumberChange) => {
      mixedProperties.opacity?.ids.forEach((id) => {
        instance.doc.getNodeById(id)?.changeOpacity(change);
      });
    },
    [mixedProperties.opacity?.ids, instance]
  );

  const width = useCallback(
    (value: grida.program.css.LengthPercentage | "auto") => {
      mixedProperties.width?.ids.forEach((id) => {
        instance.commands.changeNodeSize(id, "width", value);
      });
    },
    [mixedProperties.width?.ids, instance.commands]
  );

  const height = useCallback(
    (value: grida.program.css.LengthPercentage | "auto") => {
      mixedProperties.height?.ids.forEach((id) => {
        instance.commands.changeNodeSize(id, "height", value);
      });
    },
    [mixedProperties.height?.ids, instance.commands]
  );

  const positioningMode = useCallback(
    (position: grida.program.nodes.i.IPositioning["position"]) => {
      mixedProperties.position?.ids.forEach((id) => {
        instance.commands.changeNodePropertyPositioningMode(id, position);
      });
    },
    [mixedProperties.position?.ids, instance.commands]
  );

  const fontFamily = useCallback(
    (value: string, force?: boolean) => {
      mixedProperties.fontFamily?.ids.forEach((id) => {
        instance.changeTextNodeFontFamilySync(id, value, force);
      });
    },
    [mixedProperties.fontFamily?.ids, instance.changeTextNodeFontFamilySync]
  );

  const fontWeight = useCallback(
    (value: cg.NFontWeight) => {
      mixedProperties.fontWeight?.ids.forEach((id) => {
        instance.commands.changeTextNodeFontWeight(id, value);
      });
    },
    [mixedProperties.fontWeight?.ids, instance.commands]
  );

  const fontKerning = useCallback(
    (value: boolean) => {
      mixedProperties.fontKerning?.ids.forEach((id) => {
        instance.commands.changeTextNodeFontKerning(id, value);
      });
    },
    [mixedProperties.fontKerning?.ids, instance.commands]
  );

  const fontWidth = useCallback(
    (value: number) => {
      mixedProperties.fontWidth?.ids.forEach((id) => {
        instance.commands.changeTextNodeFontWidth(id, value);
      });
    },
    [mixedProperties.fontWidth?.ids, instance.commands]
  );

  const fontStyle = useCallback(
    (change: editor.api.FontStyleChangeDescription) => {
      mixedProperties.fontStyleItalic?.ids.forEach((id) => {
        instance.changeTextNodeFontStyle(id, change);
      });
    },
    [mixedProperties.fontStyleItalic?.ids, instance.changeTextNodeFontStyle]
  );

  const fontOpticalSizing = useCallback(
    (value: cg.OpticalSizing) => {
      mixedProperties.fontOpticalSizing?.ids.forEach((id) => {
        instance.commands.changeTextNodeFontOpticalSizing(id, value);
      });
    },
    [mixedProperties.fontOpticalSizing?.ids, instance.commands]
  );

  const fontVariation = useCallback(
    (key: string, value: number) => {
      mixedProperties.fontWeight?.ids.forEach((id) => {
        instance.commands.changeTextNodeFontVariation(id, key, value);
      });
    },
    [mixedProperties.fontWeight?.ids, instance.commands]
  );

  const fontSize = useCallback(
    (change: editor.api.NumberChange) => {
      mixedProperties.fontSize?.ids.forEach((id) => {
        instance.commands.changeTextNodeFontSize(id, change);
      });
    },
    [mixedProperties.fontSize?.ids, instance.commands]
  );

  const lineHeight = useCallback(
    (change: editor.api.NumberChange) => {
      mixedProperties.lineHeight?.ids.forEach((id) => {
        instance.commands.changeTextNodeLineHeight(id, change);
      });
    },
    [mixedProperties.lineHeight?.ids, instance.commands]
  );

  const letterSpacing = useCallback(
    (
      change: editor.api.TChange<grida.program.nodes.TextNode["letterSpacing"]>
    ) => {
      mixedProperties.letterSpacing?.ids.forEach((id) => {
        instance.commands.changeTextNodeLetterSpacing(id, change);
      });
    },
    [mixedProperties.letterSpacing?.ids, instance.commands]
  );

  const wordSpacing = useCallback(
    (
      change: editor.api.TChange<grida.program.nodes.TextNode["wordSpacing"]>
    ) => {
      mixedProperties.wordSpacing?.ids.forEach((id) => {
        instance.commands.changeTextNodeWordSpacing(id, change);
      });
    },
    [mixedProperties.wordSpacing?.ids, instance.commands]
  );

  const textAlign = useCallback(
    (value: cg.TextAlign) => {
      mixedProperties.textAlign?.ids.forEach((id) => {
        instance.commands.changeTextNodeTextAlign(id, value);
      });
    },
    [mixedProperties.textAlign?.ids, instance.commands]
  );

  const textAlignVertical = useCallback(
    (value: cg.TextAlignVertical) => {
      mixedProperties.textAlignVertical?.ids.forEach((id) => {
        instance.commands.changeTextNodeTextAlignVertical(id, value);
      });
    },
    [mixedProperties.textAlignVertical?.ids, instance.commands]
  );

  const fit = useCallback(
    (value: cg.BoxFit) => {
      mixedProperties.fit?.ids.forEach((id) => {
        instance.commands.changeNodePropertyFit(id, value);
      });
    },
    [mixedProperties.fit?.ids, instance.commands]
  );

  const fill = useCallback(
    (value: grida.program.nodes.i.props.SolidPaintToken | cg.Paint | null) => {
      const paints = value === null ? [] : [value as cg.Paint];
      instance.commands.changeNodePropertyFills(ids, paints);
    },
    [ids, instance.commands]
  );

  const stroke = useCallback(
    (value: grida.program.nodes.i.props.SolidPaintToken | cg.Paint | null) => {
      const paints = value === null ? [] : [value as cg.Paint];
      instance.commands.changeNodePropertyStrokes(ids, paints);
    },
    [ids, instance.commands]
  );

  const strokeWidth = useCallback(
    (change: editor.api.NumberChange) => {
      mixedProperties.strokeWidth?.ids.forEach((id) => {
        instance.commands.changeNodePropertyStrokeWidth(id, change);
      });
    },
    [mixedProperties.strokeWidth?.ids, instance.commands]
  );

  const strokeCap = useCallback(
    (value: cg.StrokeCap) => {
      mixedProperties.strokeCap?.ids.forEach((id) => {
        instance.commands.changeNodePropertyStrokeCap(id, value);
      });
    },
    [mixedProperties.strokeCap?.ids, instance.commands]
  );

  const layout = useCallback(
    (value: grida.program.nodes.i.IFlexContainer["layout"]) => {
      mixedProperties.layout?.ids.forEach((id) => {
        instance.commands.changeContainerNodeLayout(id, value);
      });
    },
    [mixedProperties.layout?.ids, instance.commands]
  );

  const direction = useCallback(
    (value: cg.Axis) => {
      mixedProperties.direction?.ids.forEach((id) => {
        instance.commands.changeFlexContainerNodeDirection(id, value);
      });
    },
    [mixedProperties.direction?.ids, instance.commands]
  );

  const mainAxisAlignment = useCallback(
    (value: cg.MainAxisAlignment) => {
      mixedProperties.mainAxisAlignment?.ids.forEach((id) => {
        instance.commands.changeFlexContainerNodeMainAxisAlignment(id, value);
      });
    },
    [mixedProperties.mainAxisAlignment?.ids, instance.commands]
  );

  const crossAxisAlignment = useCallback(
    (value: cg.CrossAxisAlignment) => {
      mixedProperties.crossAxisAlignment?.ids.forEach((id) => {
        instance.commands.changeFlexContainerNodeCrossAxisAlignment(id, value);
      });
    },
    [mixedProperties.crossAxisAlignment?.ids, instance.commands]
  );

  const cornerRadius = useCallback(
    (value: cg.CornerRadius) => {
      mixedProperties.cornerRadius?.ids.forEach((id) => {
        instance.commands.changeNodePropertyCornerRadius(id, value);
      });
    },
    [mixedProperties.cornerRadius?.ids, instance.commands]
  );

  const cursor = useCallback(
    (value: cg.SystemMouseCursor) => {
      mixedProperties.cursor?.ids.forEach((id) => {
        instance.commands.changeNodePropertyMouseCursor(id, value);
      });
    },
    [mixedProperties.cursor?.ids, instance.commands]
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
      fontFamily,
      fontWeight,
      fontKerning,
      fontWidth,
      fontStyle,
      fontOpticalSizing,
      fontVariation,
      fontSize,
      lineHeight,
      letterSpacing,
      wordSpacing,
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
      fontFamily,
      fontWeight,
      fontKerning,
      fontWidth,
      fontStyle,
      fontOpticalSizing,
      fontVariation,
      fontSize,
      lineHeight,
      letterSpacing,
      wordSpacing,
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
      selection: ids,
      nodes,
      properties: mixedProperties,
      actions,
    };
  }, [ids, nodes, mixedProperties, actions]);
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
      value: grida.program.nodes.i.props.SolidPaintToken | cg.Paint | null
    ) => {
      const group = paints[index];
      const paintsArray = value === null ? [] : [value as cg.Paint];
      instance.commands.changeNodePropertyFills(group.ids, paintsArray);
    },
    [paints, instance.commands]
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

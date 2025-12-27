import { useCallback, useMemo } from "react";
import { editor } from "@/grida-canvas";
import { useCurrentEditor, useEditorState } from "./use-editor";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";
import mixed from "@grida/mixed-properties";
import type cg from "@grida/cg";
import equal from "fast-deep-equal";

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
        instance.doc.getNodeById(id).name = value;
      });
    },
    [ids, instance]
  );

  const copy = useCallback(() => {
    instance.commands.copy("selection");
  }, [instance]);

  const active = useCallback(
    (value: boolean) => {
      ids.forEach((id) => {
        instance.doc.getNodeById(id).active = value;
      });
    },
    [ids, instance]
  );

  const locked = useCallback(
    (value: boolean) => {
      ids.forEach((id) => {
        instance.doc.getNodeById(id).locked = value;
      });
    },
    [ids, instance]
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
      mixedProperties.font_family?.ids.forEach((id) => {
        instance.changeTextNodeFontFamilySync(id, value, force);
      });
    },
    [mixedProperties.font_family?.ids, instance.changeTextNodeFontFamilySync]
  );

  const fontWeight = useCallback(
    (value: cg.NFontWeight) => {
      mixedProperties.font_weight?.ids.forEach((id) => {
        instance.commands.changeTextNodeFontWeight(id, value);
      });
    },
    [mixedProperties.font_weight?.ids, instance.commands]
  );

  const fontKerning = useCallback(
    (value: boolean) => {
      mixedProperties.font_kerning?.ids.forEach((id) => {
        instance.commands.changeTextNodeFontKerning(id, value);
      });
    },
    [mixedProperties.font_kerning?.ids, instance.commands]
  );

  const fontWidth = useCallback(
    (value: number) => {
      mixedProperties.font_width?.ids.forEach((id) => {
        instance.commands.changeTextNodeFontWidth(id, value);
      });
    },
    [mixedProperties.font_width?.ids, instance.commands]
  );

  const fontStyle = useCallback(
    (change: editor.api.FontStyleChangeDescription) => {
      mixedProperties.font_style_italic?.ids.forEach((id) => {
        instance.changeTextNodeFontStyle(id, change);
      });
    },
    [mixedProperties.font_style_italic?.ids, instance.changeTextNodeFontStyle]
  );

  const fontOpticalSizing = useCallback(
    (value: cg.OpticalSizing) => {
      mixedProperties.font_optical_sizing?.ids.forEach((id) => {
        instance.commands.changeTextNodeFontOpticalSizing(id, value);
      });
    },
    [mixedProperties.font_optical_sizing?.ids, instance.commands]
  );

  const fontVariation = useCallback(
    (key: string, value: number) => {
      mixedProperties.font_weight?.ids.forEach((id) => {
        instance.commands.changeTextNodeFontVariation(id, key, value);
      });
    },
    [mixedProperties.font_weight?.ids, instance.commands]
  );

  const fontSize = useCallback(
    (change: editor.api.NumberChange) => {
      mixedProperties.font_size?.ids.forEach((id) => {
        instance.commands.changeTextNodeFontSize(id, change);
      });
    },
    [mixedProperties.font_size?.ids, instance.commands]
  );

  const lineHeight = useCallback(
    (change: editor.api.NumberChange) => {
      mixedProperties.line_height?.ids.forEach((id) => {
        instance.commands.changeTextNodeLineHeight(id, change);
      });
    },
    [mixedProperties.line_height?.ids, instance.commands]
  );

  const letterSpacing = useCallback(
    (
      change: editor.api.TChange<grida.program.nodes.TextNode["letter_spacing"]>
    ) => {
      mixedProperties.letter_spacing?.ids.forEach((id) => {
        instance.commands.changeTextNodeLetterSpacing(id, change);
      });
    },
    [mixedProperties.letter_spacing?.ids, instance.commands]
  );

  const wordSpacing = useCallback(
    (
      change: editor.api.TChange<grida.program.nodes.TextNode["word_spacing"]>
    ) => {
      mixedProperties.word_spacing?.ids.forEach((id) => {
        instance.commands.changeTextNodeWordSpacing(id, change);
      });
    },
    [mixedProperties.word_spacing?.ids, instance.commands]
  );

  const textAlign = useCallback(
    (value: cg.TextAlign) => {
      mixedProperties.text_align?.ids.forEach((id) => {
        instance.commands.changeTextNodeTextAlign(id, value);
      });
    },
    [mixedProperties.text_align?.ids, instance.commands]
  );

  const textAlignVertical = useCallback(
    (value: cg.TextAlignVertical) => {
      mixedProperties.text_align_vertical?.ids.forEach((id) => {
        instance.commands.changeTextNodeTextAlignVertical(id, value);
      });
    },
    [mixedProperties.text_align_vertical?.ids, instance.commands]
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
      mixedProperties.stroke_width?.ids.forEach((id) => {
        instance.commands.changeNodePropertyStrokeWidth(id, change);
      });
    },
    [mixedProperties.stroke_width?.ids, instance.commands]
  );

  const strokeCap = useCallback(
    (value: cg.StrokeCap) => {
      mixedProperties.stroke_cap?.ids.forEach((id) => {
        instance.commands.changeNodePropertyStrokeCap(id, value);
      });
    },
    [mixedProperties.stroke_cap?.ids, instance.commands]
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
      mixedProperties.main_axis_alignment?.ids.forEach((id) => {
        instance.commands.changeFlexContainerNodeMainAxisAlignment(id, value);
      });
    },
    [mixedProperties.main_axis_alignment?.ids, instance.commands]
  );

  const crossAxisAlignment = useCallback(
    (value: cg.CrossAxisAlignment) => {
      mixedProperties.cross_axis_alignment?.ids.forEach((id) => {
        instance.commands.changeFlexContainerNodeCrossAxisAlignment(id, value);
      });
    },
    [mixedProperties.cross_axis_alignment?.ids, instance.commands]
  );

  const gap = useCallback(
    (value: number | { main_axis_gap: number; cross_axis_gap: number }) => {
      mixedProperties.main_axis_gap?.ids.forEach((id) => {
        instance.commands.changeFlexContainerNodeGap(id, value);
      });
    },
    [mixedProperties.main_axis_gap?.ids, instance.commands]
  );

  const padding = useCallback(
    (value: grida.program.nodes.i.IPadding) => {
      mixedProperties.padding_top?.ids.forEach((id) => {
        instance.commands.changeContainerNodePadding(id, value);
      });
    },
    [mixedProperties.padding_top?.ids, instance.commands]
  );

  const corner_radius = useCallback(
    (value: cg.CornerRadius) => {
      mixedProperties.corner_radius?.ids.forEach((id) => {
        instance.commands.changeNodePropertyCornerRadius(id, value);
      });
    },
    [mixedProperties.corner_radius?.ids, instance.commands]
  );

  const cursor = useCallback(
    (value: cg.SystemMouseCursor) => {
      mixedProperties.cursor?.ids.forEach((id) => {
        instance.commands.changeNodePropertyMouseCursor(id, value);
      });
    },
    [mixedProperties.cursor?.ids, instance.commands]
  );

  const blendMode = useCallback(
    (value: cg.LayerBlendMode) => {
      mixedProperties.blend_mode?.ids.forEach((id) => {
        instance.doc.getNodeById(id).blend_mode = value;
      });
    },
    [mixedProperties.blend_mode?.ids, instance]
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
      font_family: fontFamily,
      fontWeight,
      fontKerning,
      fontWidth,
      fontStyle,
      fontOpticalSizing,
      fontVariation,
      font_size: fontSize,
      line_height: lineHeight,
      letter_spacing: letterSpacing,
      wordSpacing,
      text_align: textAlign,
      text_align_vertical: textAlignVertical,
      fit,
      fill,
      stroke,
      stroke_width: strokeWidth,
      stroke_cap: strokeCap,
      layout,
      direction,
      main_axis_alignment: mainAxisAlignment,
      cross_axis_alignment: crossAxisAlignment,
      gap,
      padding,
      corner_radius,
      cursor,
      blend_mode: blendMode,
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
      gap,
      padding,
      corner_radius,
      cursor,
      blendMode,
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
 *
 * @todo This function is expensive because it resolves all paint values at once.
 * The UI only initially shows a partial set (n values). Optimize this by:
 * - First limiting by n and early exiting
 * - Adding a method to load all values on demand
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

  // TODO: @grida/mixed-properties should support array properties (e.g., fill_paints[] per node)
  // Once array handling is added to mixed(), replace this custom logic with normalized nodes + mixed()
  const paintEntries = useMemo(() => {
    const entries: Array<{ nodeId: string; paint: cg.Paint }> = [];
    for (const node of allnodes as grida.program.nodes.UnknwonNode[]) {
      const { paints } = editor.resolvePaints(node, "fill", 0);
      const activePaints = paints.filter((p) => p?.active !== false);
      for (const paint of activePaints) {
        entries.push({ nodeId: node.id, paint });
      }
    }
    return entries;
  }, [allnodes]);

  const paints = useMemo(() => {
    // Group by paint value (using deep equality)
    const paintGroups: Array<{ value: cg.Paint; ids: string[] }> = [];

    for (const { nodeId, paint } of paintEntries) {
      // Find existing group with same paint value
      const existingGroup = paintGroups.find((group) =>
        equal(group.value, paint)
      );

      if (existingGroup) {
        if (!existingGroup.ids.includes(nodeId)) {
          existingGroup.ids.push(nodeId);
        }
      } else {
        paintGroups.push({ value: paint, ids: [nodeId] });
      }
    }

    return paintGroups;
  }, [paintEntries]);

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

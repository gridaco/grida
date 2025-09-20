"use client";

import React from "react";
import { PropertyLine, PropertyLineLabel } from "../ui";
import { PaintControl } from "../controls/paint";
import { StrokeWidthControl } from "../controls/stroke-width";
import { StrokeAlignControl } from "../controls/stroke-align";
import { StrokeCapControl } from "../controls/stroke-cap";
import {
  useBackendState,
  useNodeActions,
  useNodeState,
} from "@/grida-canvas-react/provider";
import cg from "@grida/cg";
import { ChunkPaints } from "./chunk-paints";

export function SectionStrokes({
  node_id,
  config = {
    stroke_cap: "on",
  },
}: {
  node_id: string;
  config?: {
    stroke_cap: "on" | "off";
  };
}) {
  const backend = useBackendState();
  const { stroke, strokes, strokeWidth, strokeAlign, strokeCap, type } =
    useNodeState(node_id, (node) => ({
      stroke: node.stroke,
      strokes: node.strokes,
      strokeWidth: node.strokeWidth,
      strokeAlign: node.strokeAlign,
      strokeCap: node.strokeCap,
      type: node.type,
    }));

  const is_text_node = type === "text";
  const isCanvasBackend = backend === "canvas";
  const paints = isCanvasBackend
    ? Array.isArray(strokes) && strokes.length > 0
      ? strokes
      : stroke
        ? [stroke]
        : []
    : stroke
      ? [stroke]
      : [];
  const has_stroke_paint = paints.length > 0;
  const actions = useNodeActions(node_id)!;

  const handleAddStroke = React.useCallback(() => {
    const paint: cg.Paint = {
      type: "solid",
      color: { r: 0, g: 0, b: 0, a: paints.length > 0 ? 0.5 : 1 },
    };
    // Append new paint to the end (top-most in render order)
    actions.addStroke(paint, "end");

    if (!strokeWidth || strokeWidth === 0) {
      actions.strokeWidth({ type: "set", value: 1 });
    }

    if (is_text_node && !strokeAlign) {
      actions.strokeAlign("outside");
    }
  }, [actions, strokeWidth, is_text_node, strokeAlign, paints.length]);

  const handleUpdateStrokes = React.useCallback(
    (paints: any[]) => {
      actions.strokes(paints);
    },
    [actions]
  );

  const handleRemoveStroke = React.useCallback(
    (index: number) => {
      const currentStrokes = Array.isArray(strokes)
        ? [...strokes]
        : stroke
          ? [stroke]
          : [];
      currentStrokes.splice(index, 1);
      actions.strokes(currentStrokes);
    },
    [actions, stroke, strokes]
  );

  const additionalContent = has_stroke_paint && (
    <div className="mt-4 space-y-2">
      <PropertyLine>
        <PropertyLineLabel>Width</PropertyLineLabel>
        <StrokeWidthControl
          value={strokeWidth}
          onValueCommit={actions.strokeWidth}
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Align</PropertyLineLabel>
        <StrokeAlignControl
          value={strokeAlign}
          onValueChange={actions.strokeAlign}
        />
      </PropertyLine>
      <PropertyLine hidden={config.stroke_cap === "off"}>
        <PropertyLineLabel>Cap</PropertyLineLabel>
        <StrokeCapControl value={strokeCap} onValueChange={actions.strokeCap} />
      </PropertyLine>
    </div>
  );

  return (
    <ChunkPaints
      node_id={node_id}
      paintTarget="stroke"
      title="Strokes"
      ControlComponent={PaintControl}
      onAddPaint={handleAddStroke}
      onRemovePaint={handleRemoveStroke}
      onUpdatePaints={handleUpdateStrokes}
      additionalContent={additionalContent}
    />
  );
}

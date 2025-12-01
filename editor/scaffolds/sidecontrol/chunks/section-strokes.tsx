"use client";

import React from "react";
import kolor from "@grida/color";
import { PropertyLine, PropertyLineLabel } from "../ui";
import { PaintControl } from "../controls/paint";
import {
  StrokeWidthControl,
  StrokeWidth4Control,
} from "../controls/stroke-width";
import { StrokeAlignControl } from "../controls/stroke-align";
import { StrokeCapControl } from "../controls/stroke-cap";
import { StrokeJoinControl } from "../controls/stroke-join";
import { StrokeMiterLimitControl } from "../controls/stroke-miter-limit";
import { StrokeClassControl, StrokeClass } from "../controls/stroke-class";
import { StrokeDashArrayControl } from "../controls/stroke-dasharray";
import {
  useBackendState,
  useNodeActions,
  useNodeState,
} from "@/grida-canvas-react/provider";
import cg from "@grida/cg";
import { ChunkPaints } from "./chunk-paints";
import { supports } from "@/grida-canvas/utils/supports";

export function SectionStrokes({
  node_id,
  config = {
    stroke_cap: "on",
    stroke_join: "on",
  },
}: {
  node_id: string;
  config?: {
    stroke_cap: "on" | "off";
    stroke_join: "on" | "off";
  };
}) {
  const backend = useBackendState();
  const {
    stroke,
    strokes,
    strokeWidth,
    strokeTopWidth,
    strokeRightWidth,
    strokeBottomWidth,
    strokeLeftWidth,
    strokeAlign,
    strokeCap,
    strokeJoin,
    strokeMiterLimit,
    strokeDashArray,
    type,
  } = useNodeState(node_id, (node) => ({
    stroke: node.stroke,
    strokes: node.strokes,
    strokeWidth: node.strokeWidth,
    strokeTopWidth: node.strokeTopWidth,
    strokeRightWidth: node.strokeRightWidth,
    strokeBottomWidth: node.strokeBottomWidth,
    strokeLeftWidth: node.strokeLeftWidth,
    strokeAlign: node.strokeAlign,
    strokeCap: node.strokeCap,
    strokeJoin: node.strokeJoin,
    strokeMiterLimit: node.strokeMiterLimit,
    strokeDashArray: node.strokeDashArray,
    type: node.type,
  }));

  const is_text_node = type === "text";
  const isCanvasBackend = backend === "canvas";
  const supportsStrokeWidth4 = supports.strokeWidth4(type, { backend });

  // Compute stroke width value for the control
  const strokeWidthValue = React.useMemo(() => {
    // Check if any individual side widths are defined
    const hasIndividualWidths =
      strokeTopWidth !== undefined ||
      strokeRightWidth !== undefined ||
      strokeBottomWidth !== undefined ||
      strokeLeftWidth !== undefined;

    if (hasIndividualWidths) {
      const fallbackWidth = strokeWidth ?? 1;
      return {
        top: strokeTopWidth ?? fallbackWidth,
        right: strokeRightWidth ?? fallbackWidth,
        bottom: strokeBottomWidth ?? fallbackWidth,
        left: strokeLeftWidth ?? fallbackWidth,
      };
    }

    return strokeWidth ?? 1;
  }, [
    strokeWidth,
    strokeTopWidth,
    strokeRightWidth,
    strokeBottomWidth,
    strokeLeftWidth,
  ]);
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

  // Derive stroke class from dash array
  const strokeClass: StrokeClass =
    strokeDashArray &&
    Array.isArray(strokeDashArray) &&
    strokeDashArray.length > 0
      ? "dashed"
      : "solid";

  // Handle stroke class change
  const handleStrokeClassChange = React.useCallback(
    (newClass: StrokeClass) => {
      if (newClass === "solid") {
        // Solid → clear dash array
        actions.strokeDashArray(undefined);
      } else {
        // Dashed → set default pattern
        actions.strokeDashArray([2]);
      }
    },
    [actions]
  );

  const handleAddStroke = React.useCallback(() => {
    const paint: cg.Paint = {
      type: "solid",
      color: kolor.colorformats.newRGB888A32F(
        0,
        0,
        0,
        paints.length > 0 ? 0.5 : 1
      ),
      active: true,
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
        {supportsStrokeWidth4 ? (
          <StrokeWidth4Control
            value={strokeWidthValue}
            onValueCommit={(v) => {
              if (typeof v === "number") {
                // Uniform value - set strokeWidth
                actions.strokeWidth({ type: "set", value: v });
                // Also set all individual widths to the same value
                actions.strokeTopWidth(v);
                actions.strokeRightWidth(v);
                actions.strokeBottomWidth(v);
                actions.strokeLeftWidth(v);
              } else {
                // Individual values - set each side
                actions.strokeTopWidth(v.top);
                actions.strokeRightWidth(v.right);
                actions.strokeBottomWidth(v.bottom);
                actions.strokeLeftWidth(v.left);
              }
            }}
          />
        ) : (
          <StrokeWidthControl
            value={strokeWidth}
            onValueCommit={actions.strokeWidth}
          />
        )}
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
      <PropertyLine hidden={config.stroke_join === "off"}>
        <PropertyLineLabel>Join</PropertyLineLabel>
        <StrokeJoinControl
          value={strokeJoin}
          onValueChange={actions.strokeJoin}
        />
      </PropertyLine>
      <PropertyLine
        hidden={config.stroke_join === "off" || strokeJoin !== "miter"}
      >
        <PropertyLineLabel>Miter</PropertyLineLabel>
        <StrokeMiterLimitControl
          value={strokeMiterLimit}
          onValueChange={actions.strokeMiterLimit}
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Style</PropertyLineLabel>
        <StrokeClassControl
          value={strokeClass}
          onValueChange={handleStrokeClassChange}
        />
      </PropertyLine>
      <PropertyLine hidden={!strokeDashArray || strokeDashArray.length === 0}>
        <PropertyLineLabel>Dash</PropertyLineLabel>
        <StrokeDashArrayControl
          value={strokeDashArray}
          onValueCommit={actions.strokeDashArray}
        />
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

"use client";

import React from "react";
import kolor from "@grida/color";
import { PropertyRows, PropertyRow, PropertyLineLabel } from "../ui";
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
    stroke_paints,
    stroke_width,
    rectangular_stroke_width_top,
    rectangular_stroke_width_right,
    rectangular_stroke_width_bottom,
    rectangular_stroke_width_left,
    stroke_align,
    stroke_cap,
    stroke_join,
    stroke_miter_limit,
    stroke_dash_array,
    type,
  } = useNodeState(node_id, (node) => ({
    stroke: node.stroke,
    stroke_paints: node.stroke_paints,
    stroke_width: node.stroke_width,
    rectangular_stroke_width_top: node.rectangular_stroke_width_top,
    rectangular_stroke_width_right: node.rectangular_stroke_width_right,
    rectangular_stroke_width_bottom: node.rectangular_stroke_width_bottom,
    rectangular_stroke_width_left: node.rectangular_stroke_width_left,
    stroke_align: node.stroke_align,
    stroke_cap: node.stroke_cap,
    stroke_join: node.stroke_join,
    stroke_miter_limit: node.stroke_miter_limit,
    stroke_dash_array: node.stroke_dash_array,
    type: node.type,
  }));

  const is_text_node = type === "text";
  const isCanvasBackend = backend === "canvas";
  const supportsStrokeWidth4 = supports.strokeWidth4(type, { backend });

  // Compute stroke width value for the control
  const strokeWidthValue = React.useMemo(() => {
    // Check if any individual side widths are defined
    const hasIndividualWidths =
      rectangular_stroke_width_top !== undefined ||
      rectangular_stroke_width_right !== undefined ||
      rectangular_stroke_width_bottom !== undefined ||
      rectangular_stroke_width_left !== undefined;

    if (hasIndividualWidths) {
      const fallbackWidth = stroke_width ?? 1;
      return {
        top: rectangular_stroke_width_top ?? fallbackWidth,
        right: rectangular_stroke_width_right ?? fallbackWidth,
        bottom: rectangular_stroke_width_bottom ?? fallbackWidth,
        left: rectangular_stroke_width_left ?? fallbackWidth,
      };
    }

    return stroke_width ?? 1;
  }, [
    stroke_width,
    rectangular_stroke_width_top,
    rectangular_stroke_width_right,
    rectangular_stroke_width_bottom,
    rectangular_stroke_width_left,
  ]);
  const paints = isCanvasBackend
    ? Array.isArray(stroke_paints) && stroke_paints.length > 0
      ? stroke_paints
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
    stroke_dash_array &&
    Array.isArray(stroke_dash_array) &&
    stroke_dash_array.length > 0
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
      color: kolor.colorformats.newRGBA32F(
        0,
        0,
        0,
        paints.length > 0 ? 0.5 : 1
      ),
      active: true,
    };
    // Append new paint to the end (top-most in render order)
    // ensureStrokeWidth: true ensures stroke is visible by setting width to 1 if not set or 0
    actions.addStroke(paint, "end", true);

    if (is_text_node && !stroke_align) {
      actions.strokeAlign("outside");
    }
  }, [actions, is_text_node, stroke_align, paints.length]);

  const handleUpdateStrokes = React.useCallback(
    (paints: any[]) => {
      actions.stroke_paints(paints);
    },
    [actions]
  );

  const handleRemoveStroke = React.useCallback(
    (index: number) => {
      const currentStrokes = Array.isArray(stroke_paints)
        ? [...stroke_paints]
        : stroke
          ? [stroke]
          : [];
      currentStrokes.splice(index, 1);
      actions.stroke_paints(currentStrokes);
    },
    [actions, stroke, stroke_paints]
  );

  const additionalContent = has_stroke_paint && (
    <PropertyRows>
      <PropertyRow>
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
            value={stroke_width}
            onValueCommit={actions.strokeWidth}
          />
        )}
      </PropertyRow>
      <PropertyRow>
        <PropertyLineLabel>Align</PropertyLineLabel>
        <StrokeAlignControl
          value={stroke_align}
          onValueChange={actions.strokeAlign}
        />
      </PropertyRow>
      <PropertyRow hidden={config.stroke_cap === "off"}>
        <PropertyLineLabel>Cap</PropertyLineLabel>
        <StrokeCapControl
          value={stroke_cap}
          onValueChange={actions.strokeCap}
        />
      </PropertyRow>
      <PropertyRow hidden={config.stroke_join === "off"}>
        <PropertyLineLabel>Join</PropertyLineLabel>
        <StrokeJoinControl
          value={stroke_join}
          onValueChange={actions.strokeJoin}
        />
      </PropertyRow>
      <PropertyRow
        hidden={config.stroke_join === "off" || stroke_join !== "miter"}
      >
        <PropertyLineLabel>Miter</PropertyLineLabel>
        <StrokeMiterLimitControl
          value={stroke_miter_limit}
          onValueChange={actions.strokeMiterLimit}
        />
      </PropertyRow>
      <PropertyRow>
        <PropertyLineLabel>Style</PropertyLineLabel>
        <StrokeClassControl
          value={strokeClass}
          onValueChange={handleStrokeClassChange}
        />
      </PropertyRow>
      <PropertyRow
        hidden={!stroke_dash_array || stroke_dash_array.length === 0}
      >
        <PropertyLineLabel>Dash</PropertyLineLabel>
        <StrokeDashArrayControl
          value={stroke_dash_array}
          onValueCommit={actions.strokeDashArray}
        />
      </PropertyRow>
    </PropertyRows>
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

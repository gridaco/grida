"use client";

import React from "react";
import kolor from "@grida/color";
import {
  PropertySection,
  PropertySectionContent,
  PropertySectionHeaderItem,
  PropertySectionHeaderLabel,
  PropertyRows,
  PropertyRow,
  PropertyLineLabel,
} from "../ui";
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
import { ChunkPaints } from "./chunk-paints";
import { PaintControl } from "../controls/paint";
import { supports } from "@/grida-canvas/utils/supports";
import {
  useCurrentEditor,
  useMixedProperties,
  useBackendState,
  useNodeActions,
  useNodeState,
} from "@/grida-canvas-react";

import cg from "@grida/cg";
import grida from "@grida/schema";

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
      onAddPaint={handleAddStroke}
      onRemovePaint={handleRemoveStroke}
      onUpdatePaints={handleUpdateStrokes}
      additionalContent={additionalContent}
    />
  );
}

export function SectionStrokesMixed({
  ids,
  supports_stroke_cap,
}: {
  ids: string[];
  supports_stroke_cap: boolean;
}) {
  const instance = useCurrentEditor();

  const mp = useMixedProperties(ids, (node) => {
    return {
      stroke: node.stroke,
      stroke_width: node.stroke_width,
      stroke_cap: node.stroke_cap,
      stroke_align: node.stroke_align,
      stroke_join: node.stroke_join,
      stroke_miter_limit: node.stroke_miter_limit,
    };
  });

  const stroke = mp.stroke;
  const stroke_width = mp.stroke_width;
  const stroke_cap = mp.stroke_cap;
  const stroke_align = mp.stroke_align;
  const stroke_join = mp.stroke_join;
  const stroke_miter_limit = mp.stroke_miter_limit;

  const has_stroke = Boolean(stroke?.value) && stroke?.value !== grida.mixed;

  return (
    <PropertySection className="border-b">
      {/* TODO: Refactor this stroke section to use @editor/scaffolds/sidecontrol/chunks/section-strokes.tsx
          for mixed/multiple selection as well. Currently, this section manually handles stroke width
          visibility (setting to 1 if unset/0) in a "dirty way" - this should be moved to use the
          centralized `ensureStrokeWidth` parameter in `addNodeStroke`/`changeNodePropertyStrokes`. */}
      <PropertySectionHeaderItem>
        <PropertySectionHeaderLabel>Strokes</PropertySectionHeaderLabel>
      </PropertySectionHeaderItem>
      <PropertySectionContent>
        <PropertyRow>
          <PropertyLineLabel>Color</PropertyLineLabel>
          <PaintControl
            value={stroke?.mixed || stroke?.partial ? undefined : stroke?.value}
            onValueChange={(value) => {
              const paints = value === null ? [] : [value as cg.Paint];
              instance.commands.changeNodePropertyStrokes(ids, paints);
            }}
            onValueAdd={(value) => {
              const paints = value === null ? [] : [value as cg.Paint];
              // Use centralized ensureStrokeWidth behavior.
              instance.commands.changeNodePropertyStrokes(ids, paints, true);
            }}
          />
        </PropertyRow>
        <PropertyRow hidden={!has_stroke}>
          <PropertyLineLabel>Width</PropertyLineLabel>
          <StrokeWidthControl
            value={stroke_width?.value}
            onValueCommit={(change) => {
              const target = stroke_width?.ids ?? ids;
              target.forEach((id) => {
                instance.commands.changeNodePropertyStrokeWidth(id, change);
              });
            }}
          />
        </PropertyRow>
        <PropertyRow hidden={!has_stroke || !supports_stroke_cap}>
          <PropertyLineLabel>Cap</PropertyLineLabel>
          <StrokeCapControl
            value={stroke_cap?.value}
            onValueChange={(value) => {
              const target = stroke_cap?.ids ?? ids;
              target.forEach((id) => {
                instance.commands.changeNodePropertyStrokeCap(id, value);
              });
            }}
          />
        </PropertyRow>
        <PropertyRow hidden={!has_stroke}>
          <PropertyLineLabel>Align</PropertyLineLabel>
          <StrokeAlignControl
            value={stroke_align?.value}
            onValueChange={(value) => {
              const target = stroke_align?.ids ?? ids;
              target.forEach((id) => {
                instance.commands.changeNodePropertyStrokeAlign(id, value);
              });
            }}
          />
        </PropertyRow>
        <PropertyRow hidden={!has_stroke}>
          <PropertyLineLabel>Join</PropertyLineLabel>
          <StrokeJoinControl
            value={stroke_join?.value}
            onValueChange={(value) => {
              const target = stroke_join?.ids ?? ids;
              target.forEach((id) => {
                instance.commands.changeNodePropertyStrokeJoin(id, value);
              });
            }}
          />
        </PropertyRow>
        <PropertyRow
          hidden={
            !has_stroke ||
            stroke_join?.value === grida.mixed ||
            (stroke_join?.value !== undefined && stroke_join?.value !== "miter")
          }
        >
          <PropertyLineLabel>Miter</PropertyLineLabel>
          <StrokeMiterLimitControl
            value={stroke_miter_limit?.value}
            onValueChange={(value) => {
              const target = stroke_miter_limit?.ids ?? ids;
              target.forEach((id) => {
                instance.commands.changeNodePropertyStrokeMiterLimit(id, value);
              });
            }}
          />
        </PropertyRow>
      </PropertySectionContent>
    </PropertySection>
  );
}

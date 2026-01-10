"use client";

import React from "react";
import {
  PropertySection,
  PropertySectionContent,
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
import {
  ChunkPaints,
  usePaintContentEditMode,
  SectionPaintsHeader,
} from "./chunk-paints";
import { supports } from "@/grida-canvas/utils/supports";
import {
  useCurrentEditor,
  useMixedProperties,
  useBackendState,
  useNodeActions,
  useNodeState,
} from "@/grida-canvas-react";
import { editor } from "@/grida-canvas";
import cg from "@grida/cg";
import grida from "@grida/schema";
import kolor from "@grida/color";

function getNextStrokePaint(currentPaints: cg.Paint[]): cg.Paint {
  return {
    type: "solid",
    color: kolor.colorformats.newRGBA32F(
      0,
      0,
      0,
      currentPaints.length > 0 ? 0.5 : 1
    ),
    active: true,
  };
}

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
  const instance = useCurrentEditor();
  const actions = useNodeActions(node_id)!;

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

  const is_text_node = type === "tspan";
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

  // Resolve paints using the same logic as editor.resolvePaints
  // If stroke_paints is an array (even if empty), use it. Otherwise, fall back to legacy stroke property.
  const paints = Array.isArray(stroke_paints)
    ? stroke_paints
    : stroke
      ? [stroke]
      : [];
  const has_stroke_paint = paints.length > 0;

  // Track which paint is currently open (user-controlled state)
  const [openPaintIndex, setOpenPaintIndex] = React.useState<number | null>(
    null
  );

  // Use content edit mode hook
  const {
    selectedGradientStop,
    currentlyOpenIndex,
    handleSelectGradientStop,
    handleOpenChange: handleOpenChangeFromHook,
  } = usePaintContentEditMode({
    node_id,
    paintTarget: "stroke",
    paints,
    openPaintIndex,
  });

  // Reset user-controlled state when content edit mode changes to a different node
  React.useEffect(() => {
    const { content_edit_mode } = instance.state;
    if (content_edit_mode && content_edit_mode.node_id !== node_id) {
      setOpenPaintIndex(null);
    }
  }, [instance, node_id]);

  // Reset open state when node_id changes (different node selected)
  const prevNodeIdRef = React.useRef(node_id);
  React.useEffect(() => {
    if (prevNodeIdRef.current !== node_id) {
      prevNodeIdRef.current = node_id;
      setOpenPaintIndex(null);
    }
  }, [node_id]);

  const handleOpenChange = React.useCallback(
    (paintIndex: number, open: boolean) => {
      if (open) {
        setOpenPaintIndex(paintIndex);
      } else {
        setOpenPaintIndex(null);
      }
      handleOpenChangeFromHook(paintIndex, open);
    },
    [handleOpenChangeFromHook]
  );

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
    const paint = getNextStrokePaint(paints);
    // Append new paint to the end (top-most in render order)
    // ensureStrokeWidth: true ensures stroke is visible by setting width to 1 if not set or 0
    actions.addStroke(paint, "end", true);

    if (is_text_node && !stroke_align) {
      actions.strokeAlign("outside");
    }
  }, [actions, is_text_node, stroke_align, paints]);

  const handleValueChange = React.useCallback(
    (paints: cg.Paint[]) => {
      actions.stroke_paints(paints);
    },
    [actions]
  );

  const empty = paints.length === 0;

  return (
    <PropertySection
      data-empty={empty}
      className="border-b pb-2 [&[data-empty='true']]:pb-0"
    >
      <SectionPaintsHeader
        title="Strokes"
        onAddPaint={isCanvasBackend ? handleAddStroke : undefined}
        showAddButton={isCanvasBackend}
      />
      {!empty && (
        <>
          <ChunkPaints
            value={paints}
            onValueChange={handleValueChange}
            contentEditMode={{
              onSelectGradientStop: handleSelectGradientStop,
              onOpenChange: handleOpenChange,
              selectedGradientStop,
              openPaintIndex: currentlyOpenIndex,
            }}
          />
          {has_stroke_paint && (
            <PropertySectionContent>
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
                  hidden={
                    config.stroke_join === "off" || stroke_join !== "miter"
                  }
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
            </PropertySectionContent>
          )}
        </>
      )}
    </PropertySection>
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
  const backend = useBackendState();

  // Get stroke_paints for all nodes using useMixedProperties
  const mp = useMixedProperties(ids, (node) => {
    const { paints } = editor.resolvePaints(node, "stroke", 0);
    return {
      stroke_paints: paints,
      stroke_width: node.stroke_width,
      stroke_cap: node.stroke_cap,
      stroke_align: node.stroke_align,
      stroke_join: node.stroke_join,
      stroke_miter_limit: node.stroke_miter_limit,
    };
  });

  const isCanvasBackend = backend === "canvas";

  // Check if all nodes have identical paint arrays
  const paintArrays = React.useMemo(() => {
    if (!mp.stroke_paints) return null;
    // useMixedProperties returns mixed/partial/consistent structure
    if (mp.stroke_paints.mixed === true || mp.stroke_paints.partial === true) {
      return null;
    }
    // If consistent, all nodes have the same value (could be empty array)
    return mp.stroke_paints.value ?? [];
  }, [mp.stroke_paints]);

  const paintsAreIdentical = paintArrays !== null;
  const commonPaints = paintsAreIdentical ? paintArrays : [];

  const stroke_width = mp.stroke_width;
  const stroke_cap = mp.stroke_cap;
  const stroke_align = mp.stroke_align;
  const stroke_join = mp.stroke_join;
  const stroke_miter_limit = mp.stroke_miter_limit;

  // Check if any node has non-empty strokes (for showing stroke properties even when mixed)
  const hasAnyStroke = React.useMemo(() => {
    if (!mp.stroke_paints) return false;
    // If consistent value exists, check if it's non-empty
    if (
      !mp.stroke_paints.mixed &&
      !mp.stroke_paints.partial &&
      mp.stroke_paints.value !== undefined
    ) {
      return (
        Array.isArray(mp.stroke_paints.value) &&
        mp.stroke_paints.value.length > 0
      );
    }
    // If mixed/partial, check if any of the values have non-empty arrays
    // values is always present in MixedProperty type
    return mp.stroke_paints.values.some((entry) => {
      const paints = entry.value;
      return Array.isArray(paints) && paints.length > 0;
    });
  }, [mp.stroke_paints]);

  const handleAddStroke = React.useCallback(() => {
    const paint = getNextStrokePaint(commonPaints);
    const currentPaints = [...commonPaints, paint];
    instance.commands.changeNodePropertyStrokes(ids, currentPaints, true);
  }, [commonPaints, ids, instance]);

  const handleValueChange = React.useCallback(
    (paints: cg.Paint[]) => {
      instance.commands.changeNodePropertyStrokes(ids, paints);
    },
    [ids, instance]
  );

  const empty = commonPaints.length === 0;

  return (
    <PropertySection
      data-empty={empty && !paintsAreIdentical}
      className="border-b pb-2 [&[data-empty='true']]:pb-0"
    >
      <SectionPaintsHeader
        title="Strokes"
        onAddPaint={
          isCanvasBackend && paintsAreIdentical ? handleAddStroke : undefined
        }
        showAddButton={isCanvasBackend && paintsAreIdentical}
      />
      {!paintsAreIdentical ? (
        <PropertySectionContent>
          <PropertyRow>
            <span className="text-[10px] text-muted-foreground/80">
              Mixed stroke paints
            </span>
          </PropertyRow>
        </PropertySectionContent>
      ) : !empty ? (
        <ChunkPaints value={commonPaints} onValueChange={handleValueChange} />
      ) : null}
      {hasAnyStroke && (
        <PropertySectionContent>
          <PropertyRows>
            <PropertyRow>
              <PropertyLineLabel>Width</PropertyLineLabel>
              <StrokeWidthControl
                value={stroke_width?.value}
                onValueCommit={(change) => {
                  stroke_width.ids.forEach((id) => {
                    instance.commands.changeNodePropertyStrokeWidth(id, change);
                  });
                }}
              />
            </PropertyRow>
            <PropertyRow hidden={!hasAnyStroke}>
              <PropertyLineLabel>Align</PropertyLineLabel>
              <StrokeAlignControl
                value={stroke_align?.value}
                onValueChange={(value) => {
                  stroke_align.ids.forEach((id) => {
                    instance.commands.changeNodePropertyStrokeAlign(id, value);
                  });
                }}
              />
            </PropertyRow>
            <PropertyRow hidden={!hasAnyStroke || !supports_stroke_cap}>
              <PropertyLineLabel>Cap</PropertyLineLabel>
              <StrokeCapControl
                value={stroke_cap?.value}
                onValueChange={(value) => {
                  stroke_cap.ids.forEach((id) => {
                    instance.commands.changeNodePropertyStrokeCap(id, value);
                  });
                }}
              />
            </PropertyRow>
            <PropertyRow hidden={!hasAnyStroke}>
              <PropertyLineLabel>Join</PropertyLineLabel>
              <StrokeJoinControl
                value={stroke_join?.value}
                onValueChange={(value) => {
                  stroke_join.ids.forEach((id) => {
                    instance.commands.changeNodePropertyStrokeJoin(id, value);
                  });
                }}
              />
            </PropertyRow>
            <PropertyRow
              hidden={
                !hasAnyStroke ||
                stroke_join?.value === grida.mixed ||
                (stroke_join?.value !== undefined &&
                  stroke_join?.value !== "miter")
              }
            >
              <PropertyLineLabel>Miter</PropertyLineLabel>
              <StrokeMiterLimitControl
                value={stroke_miter_limit?.value}
                onValueChange={(value) => {
                  stroke_miter_limit.ids.forEach((id) => {
                    instance.commands.changeNodePropertyStrokeMiterLimit(
                      id,
                      value
                    );
                  });
                }}
              />
            </PropertyRow>
          </PropertyRows>
        </PropertySectionContent>
      )}
    </PropertySection>
  );
}

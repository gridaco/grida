"use client";

import React from "react";
import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderActions,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { PropertyLine, PropertyLineLabel } from "../ui";
import { PaintControl } from "../controls/paint";
import { StrokeWidthControl } from "../controls/stroke-width";
import { StrokeAlignControl } from "../controls/stroke-align";
import { StrokeCapControl } from "../controls/stroke-cap";
import { Button } from "@/components/ui-editor/button";
import { PlusIcon, MinusIcon } from "@radix-ui/react-icons";
import {
  useBackendState,
  useNodeActions,
  useNodeState,
} from "@/grida-canvas-react/provider";
import cg from "@grida/cg";
import grida from "@grida/schema";

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
  // TODO: LEGACY_PAINT_MODEL
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
    actions.addStroke(paint, "start");

    if (!strokeWidth || strokeWidth === 0) {
      actions.strokeWidth({ type: "set", value: 1 });
    }

    if (is_text_node && !strokeAlign) {
      actions.strokeAlign("outside");
    }
  }, [actions, strokeWidth, is_text_node, strokeAlign, paints.length]);

  const renderStrokeControl = (
    paint: grida.program.nodes.i.props.PropsPaintValue | undefined,
    index: number
  ) => (
    <PropertyLine key={index}>
      <div className="flex items-center w-full gap-2">
        <div className="flex-1">
          <PaintControl
            value={paint}
            onValueChange={(value) => {
              const currentStrokes = Array.isArray(strokes)
                ? [...strokes]
                : stroke
                  ? [stroke]
                  : [];
              currentStrokes[index] = value as any;
              actions.strokes(currentStrokes);
            }}
            onValueAdd={(value) => {
              const currentStrokes = Array.isArray(strokes)
                ? [...strokes]
                : stroke
                  ? [stroke]
                  : [];
              currentStrokes[index] = value as any;
              actions.strokes(currentStrokes);
              if (!strokeWidth || strokeWidth === 0) {
                actions.strokeWidth({ type: "set", value: 1 });
              }
              if (is_text_node && !strokeAlign) {
                actions.strokeAlign("outside");
              }
            }}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            const currentStrokes = Array.isArray(strokes)
              ? [...strokes]
              : stroke
                ? [stroke]
                : [];
            currentStrokes.splice(index, 1);
            actions.strokes(currentStrokes);
          }}
          className="cursor-pointer"
          tabIndex={-1}
        >
          <MinusIcon className="size-3.5" />
        </Button>
      </div>
    </PropertyLine>
  );

  const empty = paints.length === 0;

  return (
    <SidebarSection
      data-empty={empty}
      className="border-b pb-4 [&[data-empty='true']]:pb-0"
    >
      <SidebarSectionHeaderItem
        onClick={isCanvasBackend ? handleAddStroke : undefined}
      >
        <SidebarSectionHeaderLabel>Strokes</SidebarSectionHeaderLabel>
        {isCanvasBackend && (
          <SidebarSectionHeaderActions>
            <Button variant="ghost" size="xs">
              <PlusIcon className="size-3" />
            </Button>
          </SidebarSectionHeaderActions>
        )}
      </SidebarSectionHeaderItem>
      {!empty && (
        <SidebarMenuSectionContent className="space-y-2">
          {isCanvasBackend
            ? paints.map((paint, index) => renderStrokeControl(paint, index))
            : renderStrokeControl(paints[0], 0)}
          {has_stroke_paint && (
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
                <StrokeCapControl
                  value={strokeCap}
                  onValueChange={actions.strokeCap}
                />
              </PropertyLine>
            </div>
          )}
        </SidebarMenuSectionContent>
      )}
    </SidebarSection>
  );
}

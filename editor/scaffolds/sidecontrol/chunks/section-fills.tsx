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
import { FillControl } from "../controls/fill";
import { Button } from "@/components/ui-editor/button";
import { PlusIcon, MinusIcon } from "@radix-ui/react-icons";
import {
  useBackendState,
  useNodeActions,
  useNodeState,
} from "@/grida-canvas-react/provider";
import { useCurrentEditor, useEditorState } from "@/grida-canvas-react";
import cg from "@grida/cg";
import grida from "@grida/schema";

export function SectionFills({ node_id }: { node_id: string }) {
  const instance = useCurrentEditor();
  const backend = useBackendState();
  const { content_edit_mode } = useEditorState(instance, (state) => ({
    content_edit_mode: state.content_edit_mode,
  }));

  // TODO: LEGACY_PAINT_MODEL
  const { fill, fills } = useNodeState(node_id, (node) => ({
    fill: node.fill,
    fills: node.fills,
  }));

  const gradientMode =
    content_edit_mode?.type === "paint/gradient" &&
    content_edit_mode.node_id === node_id &&
    (content_edit_mode.paint_target ?? "fill") === "fill"
      ? content_edit_mode
      : undefined;
  const gradientPaintIndex = gradientMode?.paint_index ?? 0;

  const actions = useNodeActions(node_id)!;
  const isCanvasBackend = backend === "canvas";
  const paints = isCanvasBackend
    ? Array.isArray(fills) && fills.length > 0
      ? fills
      : fill
        ? [fill]
        : []
    : fill
      ? [fill]
      : [];

  const handleAddFill = React.useCallback(() => {
    const paint: cg.Paint = {
      type: "solid",
      color: { r: 0, g: 0, b: 0, a: paints.length > 0 ? 0.5 : 1 },
    };
    actions.addFill(paint, "start");
  }, [actions, paints.length]);

  const renderFillControl = (
    paint: grida.program.nodes.i.props.PropsPaintValue | undefined,
    index: number
  ) => {
    const selectedGradientStop =
      gradientMode && gradientPaintIndex === index
        ? gradientMode.selected_stop
        : undefined;

    return (
      <PropertyLine key={index}>
        <div className="flex items-center w-full gap-2">
          <div className="flex-1">
            <FillControl
              value={paint}
              onValueChange={(value) => {
                const currentFills = Array.isArray(fills)
                  ? [...fills]
                  : fill
                    ? [fill]
                    : [];
                currentFills[index] = value as any;
                actions.fills(currentFills);
              }}
              selectedGradientStop={selectedGradientStop}
              onSelectedGradientStopChange={(stop) => {
                instance.selectGradientStop(node_id, stop, {
                  paintTarget: "fill",
                  paintIndex: index,
                });
              }}
              onOpenChange={(open) => {
                if (open) {
                  instance.tryEnterContentEditMode(node_id, "paint/gradient", {
                    paintTarget: "fill",
                    paintIndex: index,
                  });
                } else {
                  instance.tryExitContentEditMode();
                }
              }}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              const currentFills = Array.isArray(fills)
                ? [...fills]
                : fill
                  ? [fill]
                  : [];
              currentFills.splice(index, 1);
              actions.fills(currentFills);
            }}
            className="cursor-pointer"
            tabIndex={-1}
          >
            <MinusIcon className="size-3.5" />
          </Button>
        </div>
      </PropertyLine>
    );
  };

  const empty = paints.length === 0;

  return (
    <SidebarSection
      data-empty={empty}
      className="border-b pb-4 [&[data-empty='true']]:pb-0"
    >
      <SidebarSectionHeaderItem
        onClick={isCanvasBackend ? handleAddFill : undefined}
      >
        <SidebarSectionHeaderLabel>Fills</SidebarSectionHeaderLabel>
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
            ? paints.map((paint, index) => renderFillControl(paint, index))
            : renderFillControl(paints[0], 0)}
        </SidebarMenuSectionContent>
      )}
    </SidebarSection>
  );
}

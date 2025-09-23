"use client";

import React from "react";
import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderActions,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { PropertyLine } from "../ui";
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

export interface ChunkPaintsProps {
  node_id: string;
  paintTarget: "fill" | "stroke";
  title: string;
  ControlComponent: React.ComponentType<{
    value?: grida.program.nodes.i.props.PropsPaintValue;
    onValueChange?: (value: any) => void;
    onValueAdd?: (value: any) => void;
    selectedGradientStop?: number;
    onSelectedGradientStopChange?: (stop: number) => void;
    onOpenChange?: (open: boolean) => void;
  }>;
  onAddPaint?: (paint: cg.Paint) => void;
  onRemovePaint?: (index: number) => void;
  onUpdatePaints?: (paints: any[]) => void;
  additionalContent?: React.ReactNode;
}

export function ChunkPaints({
  node_id,
  paintTarget,
  title,
  ControlComponent,
  onAddPaint,
  onRemovePaint,
  onUpdatePaints,
  additionalContent,
}: ChunkPaintsProps) {
  const instance = useCurrentEditor();
  const backend = useBackendState();
  const { content_edit_mode } = useEditorState(instance, (state) => ({
    content_edit_mode: state.content_edit_mode,
  }));

  // Get paint data based on target
  const paintData = useNodeState(node_id, (node) => {
    if (paintTarget === "fill") {
      return {
        paint: node.fill,
        paints: node.fills,
      };
    } else {
      return {
        paint: node.stroke,
        paints: node.strokes,
      };
    }
  });

  const { paint, paints } = paintData;

  const gradientMode =
    content_edit_mode?.type === "paint/gradient" &&
    content_edit_mode.node_id === node_id &&
    (content_edit_mode.paint_target ?? "fill") === paintTarget
      ? content_edit_mode
      : undefined;
  const gradientPaintIndex = gradientMode?.paint_index ?? 0;

  const actions = useNodeActions(node_id)!;
  const isCanvasBackend = backend === "canvas";
  const paintList = isCanvasBackend
    ? Array.isArray(paints) && paints.length > 0
      ? paints
      : paint
        ? [paint]
        : []
    : paint
      ? [paint]
      : [];

  const handleAddPaint = React.useCallback(() => {
    const newPaint: cg.Paint = {
      type: "solid",
      color: { r: 0, g: 0, b: 0, a: paintList.length > 0 ? 0.5 : 1 },
      active: true,
    };

    if (onAddPaint) {
      onAddPaint(newPaint);
    } else {
      // Default behavior
      if (paintTarget === "fill") {
        actions.addFill(newPaint, "end");
      } else {
        actions.addStroke(newPaint, "end");
      }
    }
  }, [actions, paintList.length, paintTarget, onAddPaint]);

  const renderPaintControl = (
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
            <ControlComponent
              value={paint}
              onValueChange={(value) => {
                if (onUpdatePaints) {
                  const currentPaints = Array.isArray(paints)
                    ? [...paints]
                    : paint
                      ? [paint]
                      : [];
                  currentPaints[index] = value as any;
                  onUpdatePaints(currentPaints);
                } else {
                  // Default behavior
                  if (paintTarget === "fill") {
                    const currentFills = Array.isArray(paints)
                      ? [...paints]
                      : paint
                        ? [paint]
                        : [];
                    currentFills[index] = value as any;
                    actions.fills(currentFills as any);
                  } else {
                    const currentStrokes = Array.isArray(paints)
                      ? [...paints]
                      : paint
                        ? [paint]
                        : [];
                    currentStrokes[index] = value as any;
                    actions.strokes(currentStrokes as any);
                  }
                }
              }}
              selectedGradientStop={selectedGradientStop}
              onSelectedGradientStopChange={(stop) => {
                instance.selectGradientStop(node_id, stop, {
                  paintTarget,
                  paintIndex: index,
                });
              }}
              onOpenChange={(open) => {
                if (open) {
                  instance.tryEnterContentEditMode(node_id, "paint/gradient", {
                    paintTarget,
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
              if (onRemovePaint) {
                onRemovePaint(index);
              } else {
                // Default behavior
                if (paintTarget === "fill") {
                  const currentFills = Array.isArray(paints)
                    ? [...paints]
                    : paint
                      ? [paint]
                      : [];
                  currentFills.splice(index, 1);
                  actions.fills(currentFills as any);
                } else {
                  const currentStrokes = Array.isArray(paints)
                    ? [...paints]
                    : paint
                      ? [paint]
                      : [];
                  currentStrokes.splice(index, 1);
                  actions.strokes(currentStrokes as any);
                }
              }
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

  const empty = paintList.length === 0;

  return (
    <SidebarSection
      data-empty={empty}
      className="border-b pb-4 [&[data-empty='true']]:pb-0"
    >
      <SidebarSectionHeaderItem
        onClick={isCanvasBackend ? handleAddPaint : undefined}
      >
        <SidebarSectionHeaderLabel>{title}</SidebarSectionHeaderLabel>
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
          {paintList
            .slice()
            .reverse()
            .map((paint, displayIndex) =>
              renderPaintControl(paint, paintList.length - 1 - displayIndex)
            )}
          {additionalContent}
        </SidebarMenuSectionContent>
      )}
    </SidebarSection>
  );
}

"use client";

import React from "react";
import kolor from "@grida/color";
import {
  DndContext,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderActions,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { PropertyLine } from "../ui";
import { Button } from "@/components/ui-editor/button";
import { Checkbox } from "@/components/ui-editor/checkbox";
import { PlusIcon, MinusIcon } from "@radix-ui/react-icons";
import {
  useBackendState,
  useNodeActions,
  useNodeState,
} from "@/grida-canvas-react/provider";
import { useCurrentEditor, useEditorState } from "@/grida-canvas-react";
import cg from "@grida/cg";
import grida from "@grida/schema";

// Hook for managing drag and drop sorting logic
interface PaintItem {
  id: string;
  paint: any;
  index: number;
}

interface UsePaintSortingProps {
  displayPaintItems: PaintItem[];
  shouldEnableSorting: boolean;
  onUpdatePaints: (paints: any[]) => void;
}

function usePaintSorting({
  displayPaintItems,
  shouldEnableSorting,
  onUpdatePaints,
}: UsePaintSortingProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    })
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      if (!shouldEnableSorting) {
        return;
      }

      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = displayPaintItems.findIndex(
        (item) => item.id === active.id
      );
      const newIndex = displayPaintItems.findIndex(
        (item) => item.id === over.id
      );

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const newDisplayOrder = arrayMove(displayPaintItems, oldIndex, newIndex);
      const newPaintOrder = newDisplayOrder
        .slice()
        .reverse()
        .map((item) => item.paint);

      onUpdatePaints(newPaintOrder);
    },
    [displayPaintItems, shouldEnableSorting, onUpdatePaints]
  );

  const modifiers = shouldEnableSorting ? [restrictToVerticalAxis] : undefined;

  return {
    sensors,
    handleDragEnd,
    modifiers,
  };
}

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
    open?: boolean;
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

  // TODO: LEGACY_PAINT_MODEL
  const paintData = useNodeState<{
    paint: cg.Paint;
    paints: cg.Paint[];
  }>(node_id, (node) => {
    if (paintTarget === "fill") {
      return {
        paint: node.fill as cg.Paint,
        paints: node.fill_paints as cg.Paint[],
      };
    } else {
      return {
        paint: node.stroke as cg.Paint,
        paints: node.stroke_paints as cg.Paint[],
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

  const imageMode =
    content_edit_mode?.type === "paint/image" &&
    content_edit_mode.node_id === node_id &&
    (content_edit_mode.paint_target ?? "fill") === paintTarget
      ? content_edit_mode
      : undefined;
  const imagePaintIndex = imageMode?.paint_index ?? 0;

  // Track which paint is currently open (user-controlled state)
  const [openPaintIndex, setOpenPaintIndex] = React.useState<number | null>(
    null
  );

  // Determine which paint should be open
  // Priority: 1) User opened paint, 2) Image edit mode, 3) None
  const currentlyOpenIndex = React.useMemo((): number | null => {
    // If user has opened a paint, that takes priority
    if (openPaintIndex !== null) {
      return openPaintIndex;
    }

    // If in image edit mode, open that paint
    if (imageMode) {
      return imagePaintIndex;
    }

    return null;
  }, [openPaintIndex, imageMode, imagePaintIndex]);

  // Reset user-controlled state when content edit mode changes or node changes
  React.useEffect(() => {
    if (!content_edit_mode || content_edit_mode.node_id !== node_id) {
      setOpenPaintIndex(null);
    }
  }, [content_edit_mode, node_id]);

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

  const paintItems = React.useMemo(
    () =>
      paintList.map((paintItem, index) => ({
        id: `paint-${index}`,
        paint: paintItem,
        index,
      })),
    [paintList]
  );

  const displayPaintItems = React.useMemo(
    () => [...paintItems].reverse(),
    [paintItems]
  );

  const shouldEnableSorting =
    isCanvasBackend && Array.isArray(paints) && paintItems.length > 1;

  const updatePaints = React.useCallback(
    (nextPaints: any[]) => {
      if (onUpdatePaints) {
        onUpdatePaints(nextPaints);
      } else {
        paintTarget === "fill"
          ? actions.fill_paints(nextPaints as any)
          : actions.stroke_paints(nextPaints as any);
      }
    },
    [actions, onUpdatePaints, paintTarget]
  );

  const createPaintsCopy = React.useCallback(() => {
    return Array.isArray(paints) ? [...paints] : paint ? [paint] : [];
  }, [paint, paints]);

  const handleValueChange = React.useCallback(
    (index: number, value: any) => {
      const currentPaints = createPaintsCopy();
      currentPaints[index] = value;
      updatePaints(currentPaints);
    },
    [createPaintsCopy, updatePaints]
  );

  const handleTogglePaintActive = React.useCallback(
    (index: number, active: boolean) => {
      const currentPaints = createPaintsCopy();
      const targetPaint = currentPaints[index];

      if (!targetPaint) {
        return;
      }

      currentPaints[index] = { ...targetPaint, active };
      updatePaints(currentPaints);
    },
    [createPaintsCopy, updatePaints]
  );

  const handleRemovePaintAt = React.useCallback(
    (index: number) => {
      if (onRemovePaint) {
        onRemovePaint(index);
        return;
      }

      const currentPaints = createPaintsCopy();
      currentPaints.splice(index, 1);
      updatePaints(currentPaints);
    },
    [createPaintsCopy, onRemovePaint, updatePaints]
  );

  const handleSelectGradientStop = React.useCallback(
    (paintIndex: number, stop: number) => {
      instance.surface.surfaceSelectGradientStop(node_id, stop, {
        paintTarget,
        paintIndex,
      });
    },
    [instance, node_id, paintTarget]
  );

  const handleOpenChange = React.useCallback(
    (paintIndex: number, open: boolean) => {
      if (open) {
        // User opened a paint - this takes priority
        setOpenPaintIndex(paintIndex);

        const paint_at_index = paintList[paintIndex];
        if (!paint_at_index) return; // Safety check

        switch (paint_at_index.type) {
          case "linear_gradient":
          case "radial_gradient":
          case "sweep_gradient":
          case "diamond_gradient": {
            instance.surface.surfaceTryEnterContentEditMode(
              node_id,
              "paint/gradient",
              {
                paintTarget,
                paintIndex,
              }
            );
            break;
          }
          case "image": {
            instance.surface.surfaceTryEnterContentEditMode(
              node_id,
              "paint/image",
              {
                paintTarget,
                paintIndex,
              }
            );
            break;
          }
        }
      } else {
        // User closed the paint
        setOpenPaintIndex(null);
        instance.surface.surfaceTryExitContentEditMode();
      }
    },
    [instance, node_id, paintTarget, paintList]
  );

  // Use the custom hook for drag and drop sorting
  const { sensors, handleDragEnd, modifiers } = usePaintSorting({
    displayPaintItems,
    shouldEnableSorting,
    onUpdatePaints: updatePaints,
  });

  const handleAddPaint = React.useCallback(() => {
    const newPaint: cg.Paint = {
      type: "solid",
      color: kolor.colorformats.newRGBA32F(
        0,
        0,
        0,
        paintList.length > 0 ? 0.5 : 1
      ),
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
          <DndContext
            sensors={sensors}
            onDragEnd={handleDragEnd}
            modifiers={modifiers}
          >
            <SortableContext
              items={displayPaintItems.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {displayPaintItems.map(({ id, paint: itemPaint, index }) => {
                  const selectedGradientStop =
                    gradientMode && gradientPaintIndex === index
                      ? gradientMode.selected_stop
                      : undefined;

                  // Use centralized open state logic
                  const isOpen = currentlyOpenIndex === index;

                  return (
                    <PaintRow
                      key={id}
                      id={id}
                      paint={itemPaint}
                      index={index}
                      ControlComponent={ControlComponent}
                      onToggleActive={handleTogglePaintActive}
                      onValueChange={handleValueChange}
                      onRemove={handleRemovePaintAt}
                      onSelectGradientStop={handleSelectGradientStop}
                      onOpenChange={handleOpenChange}
                      selectedGradientStop={selectedGradientStop}
                      disableSorting={!shouldEnableSorting}
                      open={isOpen}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          {additionalContent}
        </SidebarMenuSectionContent>
      )}
    </SidebarSection>
  );
}

interface PaintRowProps {
  id: string;
  paint: grida.program.nodes.i.props.PropsPaintValue | undefined;
  index: number;
  ControlComponent: ChunkPaintsProps["ControlComponent"];
  onToggleActive: (index: number, active: boolean) => void;
  onValueChange: (index: number, value: any) => void;
  onRemove: (index: number) => void;
  onSelectGradientStop: (index: number, stop: number) => void;
  onOpenChange: (index: number, open: boolean) => void;
  selectedGradientStop?: number;
  disableSorting?: boolean;
  open?: boolean;
}

function PaintRow({
  id,
  paint,
  index,
  ControlComponent,
  onToggleActive,
  onValueChange,
  onRemove,
  onSelectGradientStop,
  onOpenChange,
  selectedGradientStop,
  disableSorting,
  open,
}: PaintRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: disableSorting });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform) ?? undefined,
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };

  return (
    <PropertyLine>
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center w-full gap-2"
        {...attributes}
        {...listeners}
      >
        <Checkbox
          checked={Boolean(paint?.active)}
          onCheckedChange={(checked) => {
            onToggleActive(index, Boolean(checked));
          }}
        />
        <div className="flex-1">
          <ControlComponent
            value={paint}
            onValueChange={(value) => {
              onValueChange(index, value);
            }}
            selectedGradientStop={selectedGradientStop}
            onSelectedGradientStopChange={(stop) => {
              onSelectGradientStop(index, stop);
            }}
            onOpenChange={(open) => {
              onOpenChange(index, open);
            }}
            open={open}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(index);
          }}
          className="cursor-pointer"
          tabIndex={-1}
        >
          <MinusIcon className="size-3.5" />
        </Button>
      </div>
    </PropertyLine>
  );
}

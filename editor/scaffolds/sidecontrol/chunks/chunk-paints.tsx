"use client";

import React from "react";
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
  PropertySectionContent,
  PropertyRow,
  PropertyRows,
  PropertySectionHeaderItem,
  PropertySectionHeaderLabel,
  PropertySectionHeaderActions,
} from "../ui";
import { Button } from "@/components/ui-editor/button";
import { Checkbox } from "@/components/ui-editor/checkbox";
import { PlusIcon, MinusIcon } from "@radix-ui/react-icons";
import { PaintControl } from "../controls/paint";
import { useCurrentEditor, useEditorState } from "@/grida-canvas-react";
import cg from "@grida/cg";

interface PaintItem {
  id: string;
  paint: cg.Paint;
  index: number;
}

/**
 * Hook to manage content edit mode activation/deactivation for paints.
 * Handles gradient and image edit mode based on paint type changes.
 *
 * This hook is shared between fill and stroke paint controls.
 */
export function usePaintContentEditMode({
  node_id,
  paintTarget,
  paints,
  openPaintIndex,
}: {
  node_id: string;
  paintTarget: "fill" | "stroke";
  paints: cg.Paint[];
  openPaintIndex: number | null;
}) {
  const instance = useCurrentEditor();
  const { content_edit_mode } = useEditorState(instance, (state) => ({
    content_edit_mode: state.content_edit_mode,
  }));

  const gradientMode =
    content_edit_mode?.type === "paint/gradient" &&
    content_edit_mode.node_id === node_id &&
    (content_edit_mode.paint_target ?? "fill") === paintTarget
      ? content_edit_mode
      : undefined;

  const imageMode =
    content_edit_mode?.type === "paint/image" &&
    content_edit_mode.node_id === node_id &&
    (content_edit_mode.paint_target ?? "fill") === paintTarget
      ? content_edit_mode
      : undefined;

  // Helper function to activate edit mode based on paint type
  const tryActivateEditModeForPaint = React.useCallback(
    (paintIndex: number) => {
      const paint_at_index = paints[paintIndex];
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
    },
    [instance, node_id, paintTarget, paints]
  );

  // Activate edit mode when paint type changes to gradient/image while panel is open
  // Also exit edit mode when paint type changes away from gradient/image
  React.useEffect(() => {
    if (openPaintIndex !== null) {
      // Validate index is within bounds
      if (openPaintIndex < 0 || openPaintIndex >= paints.length) {
        return;
      }
      const openPaint = paints[openPaintIndex];
      if (!openPaint) return;

      // Check if we need to activate gradient edit mode
      if (cg.isGradientPaint(openPaint)) {
        const isAlreadyInGradientMode =
          gradientMode &&
          gradientMode.paint_index === openPaintIndex &&
          gradientMode.paint_target === paintTarget;

        if (!isAlreadyInGradientMode) {
          tryActivateEditModeForPaint(openPaintIndex);
        }
      }
      // Check if we need to activate image edit mode
      else if (openPaint.type === "image") {
        const isAlreadyInImageMode =
          imageMode &&
          imageMode.paint_index === openPaintIndex &&
          imageMode.paint_target === paintTarget;

        if (!isAlreadyInImageMode) {
          tryActivateEditModeForPaint(openPaintIndex);
        }
      }
      // Exit edit mode if paint type changed to something that doesn't support edit mode
      else {
        const isInGradientMode =
          gradientMode &&
          gradientMode.paint_index === openPaintIndex &&
          gradientMode.paint_target === paintTarget;
        const isInImageMode =
          imageMode &&
          imageMode.paint_index === openPaintIndex &&
          imageMode.paint_target === paintTarget;

        if (isInGradientMode || isInImageMode) {
          instance.surface.surfaceTryExitContentEditMode();
        }
      }
    }
  }, [
    paints,
    openPaintIndex,
    paintTarget,
    tryActivateEditModeForPaint,
    gradientMode,
    imageMode,
    instance,
  ]);

  const handleSelectGradientStop = React.useCallback(
    (paintIndex: number, stop: number) => {
      instance.surface.surfaceSelectGradientStop(node_id, stop, {
        paintTarget,
        paintIndex,
      });
    },
    [instance, node_id, paintTarget]
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
      return imageMode.paint_index;
    }

    return null;
  }, [openPaintIndex, imageMode]);

  const handleOpenChange = React.useCallback(
    (paintIndex: number, open: boolean) => {
      if (open) {
        // User opened a paint - this takes priority
        tryActivateEditModeForPaint(paintIndex);
      } else {
        // User closed the paint
        instance.surface.surfaceTryExitContentEditMode();
      }
    },
    [tryActivateEditModeForPaint, instance]
  );

  const selectedGradientStop =
    gradientMode && gradientMode.paint_index === currentlyOpenIndex
      ? gradientMode.selected_stop
      : undefined;

  return {
    selectedGradientStop,
    currentlyOpenIndex,
    handleSelectGradientStop,
    handleOpenChange,
  };
}

/**
 * Hook for managing drag and drop sorting logic
 */
function usePaintSorting({
  displayPaintItems,
  disabled,
  onValueChange,
}: {
  displayPaintItems: PaintItem[];
  disabled: boolean;
  onValueChange: (paints: cg.Paint[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    })
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      if (disabled) {
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

      onValueChange(newPaintOrder);
    },
    [displayPaintItems, disabled, onValueChange]
  );

  const modifiers = disabled ? undefined : [restrictToVerticalAxis];

  return {
    sensors,
    handleDragEnd,
    modifiers,
  };
}

/**
 * Universal presentational component for managing paint arrays (fills or strokes).
 * Does not consume editor or node state directly - accepts values and callbacks.
 * Only renders the paint list, no header or additional content.
 */
export function ChunkPaints({
  value: paints,
  onValueChange,
  contentEditMode,
}: {
  value: cg.Paint[];
  onValueChange: (paints: cg.Paint[]) => void;
  contentEditMode?: {
    onSelectGradientStop: (paintIndex: number, stop: number) => void;
    onOpenChange: (paintIndex: number, open: boolean) => void;
    selectedGradientStop?: number;
    openPaintIndex?: number | null;
  };
}) {
  const paintItems = React.useMemo(
    () =>
      paints.map((paintItem, index) => ({
        id: `paint-${index}`,
        paint: paintItem,
        index,
      })),
    [paints]
  );

  const displayPaintItems = React.useMemo(
    () => [...paintItems].reverse(),
    [paintItems]
  );

  const disabled = paintItems.length <= 1;

  // Use the custom hook for drag and drop sorting
  const { sensors, handleDragEnd, modifiers } = usePaintSorting({
    displayPaintItems,
    disabled,
    onValueChange,
  });

  if (paints.length === 0) {
    return null;
  }

  // If openPaintIndex is omitted, PaintControl should be uncontrolled (manage its own popover open state).
  // If openPaintIndex is provided (including null), PaintControl becomes controlled.
  const isOpenControlled = contentEditMode?.openPaintIndex !== undefined;

  return (
    <PropertySectionContent>
      <DndContext
        sensors={sensors}
        onDragEnd={handleDragEnd}
        modifiers={modifiers}
      >
        <SortableContext
          items={displayPaintItems.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <PropertyRows>
            {displayPaintItems.map(({ id, paint: itemPaint, index }) => {
              const isOpen = isOpenControlled
                ? contentEditMode?.openPaintIndex === index
                : undefined;

              const rowSelectedGradientStop =
                isOpenControlled &&
                contentEditMode?.selectedGradientStop !== undefined &&
                contentEditMode?.openPaintIndex === index
                  ? contentEditMode.selectedGradientStop
                  : undefined;

              return (
                <PaintRow
                  key={id}
                  id={id}
                  paint={itemPaint}
                  onToggleActive={(active) => {
                    const next = paints.slice();
                    const target = next[index];
                    if (!target) return;
                    next[index] = { ...target, active };
                    onValueChange(next);
                  }}
                  onValueChange={(value) => {
                    const next = paints.slice();
                    next[index] = value;
                    onValueChange(next);
                  }}
                  onRemove={() => {
                    const next = paints.slice();
                    next.splice(index, 1);
                    onValueChange(next);
                  }}
                  onSelectGradientStop={
                    contentEditMode?.onSelectGradientStop
                      ? (stop) =>
                          contentEditMode.onSelectGradientStop(index, stop)
                      : undefined
                  }
                  onOpenChange={
                    contentEditMode?.onOpenChange
                      ? (open) => contentEditMode.onOpenChange(index, open)
                      : undefined
                  }
                  selectedGradientStop={rowSelectedGradientStop}
                  disableSorting={disabled}
                  open={isOpen}
                />
              );
            })}
          </PropertyRows>
        </SortableContext>
      </DndContext>
    </PropertySectionContent>
  );
}

/**
 * Header component for paint sections (fills/strokes).
 * Handles the title and add button.
 */
export function SectionPaintsHeader({
  title,
  onAddPaint,
  showAddButton = false,
}: {
  title: string;
  onAddPaint?: () => void;
  showAddButton?: boolean;
}) {
  return (
    <PropertySectionHeaderItem onClick={showAddButton ? onAddPaint : undefined}>
      <PropertySectionHeaderLabel>{title}</PropertySectionHeaderLabel>
      {showAddButton && (
        <PropertySectionHeaderActions>
          <Button variant="ghost" size="icon">
            <PlusIcon className="size-3" />
          </Button>
        </PropertySectionHeaderActions>
      )}
    </PropertySectionHeaderItem>
  );
}

function PaintRow({
  id,
  paint,
  onToggleActive,
  onValueChange,
  onRemove,
  onSelectGradientStop,
  onOpenChange,
  selectedGradientStop,
  disableSorting,
  open,
}: {
  id: string;
  paint: cg.Paint | undefined;
  onToggleActive: (active: boolean) => void;
  onValueChange: (value: cg.Paint) => void;
  onRemove: () => void;
  onSelectGradientStop?: (stop: number) => void;
  onOpenChange?: (open: boolean) => void;
  selectedGradientStop?: number;
  disableSorting?: boolean;
  open?: boolean;
}) {
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
    <PropertyRow ref={setNodeRef} {...attributes} {...listeners} style={style}>
      <div className="flex items-center w-full gap-2">
        <Checkbox
          checked={Boolean(paint?.active)}
          onCheckedChange={(checked) => {
            onToggleActive(Boolean(checked));
          }}
        />
        <div className="flex-1">
          <PaintControl
            value={paint}
            onValueChange={(value) => {
              onValueChange(value as cg.Paint);
            }}
            selectedGradientStop={selectedGradientStop}
            onSelectedGradientStopChange={
              onSelectGradientStop
                ? (stop) => onSelectGradientStop(stop)
                : undefined
            }
            onOpenChange={
              onOpenChange ? (open) => onOpenChange(open) : undefined
            }
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
            onRemove();
          }}
          className="cursor-pointer"
          tabIndex={-1}
        >
          <MinusIcon className="size-3.5" />
        </Button>
      </div>
    </PropertyRow>
  );
}

"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SearchInput } from "./components/search-input";
import { useDebounce } from "@uidotdev/usehooks";
import { ButtonIcon } from "@radix-ui/react-icons";
import { useCurrentEditor } from "@/grida-canvas-react";
import { toast } from "sonner";
import { prototypes } from "../playground/widgets";

export type WidgetAsset = {
  name: string;
  type: string;
};

export type WidgetsBrowserProps = {
  onDragStart?: (
    widget: WidgetAsset,
    event: React.DragEvent<HTMLButtonElement>
  ) => void;
};

const COLUMN_COUNT = 3;
const GRID_GAP_PX = 12; // tailwind gap-3
const GRID_PADDING_X_PX = 4; // tailwind px-1 per side
const SEARCH_INPUT_DEBOUNCE_MS = 250;

const WIDGETS: WidgetAsset[] = [
  { name: "text", type: "text" },
  { name: "rich text", type: "rich text" },
  { name: "note", type: "note" },
  { name: "image", type: "image" },
  { name: "video", type: "video" },
  { name: "icon", type: "icon" },
  { name: "embed", type: "embed" },
  { name: "column", type: "column" },
  { name: "row", type: "row" },
  { name: "cards", type: "cards" },
  { name: "button", type: "button" },
  { name: "avatar", type: "avatar" },
  { name: "badge", type: "badge" },
  { name: "separator", type: "separator" },
];

function useWidgets() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, SEARCH_INPUT_DEBOUNCE_MS);

  const filteredWidgets = useMemo(() => {
    if (!debouncedQuery.trim()) return WIDGETS;
    const term = debouncedQuery.toLowerCase();
    return WIDGETS.filter((widget) => widget.name.toLowerCase().includes(term));
  }, [debouncedQuery]);

  return {
    widgets: filteredWidgets,
    query,
    setQuery,
  };
}

type WidgetGridCellProps = {
  widget: WidgetAsset;
  cellSize: number;
  onClick: (widget: WidgetAsset) => void;
  onDragStart?: (
    widget: WidgetAsset,
    event: React.DragEvent<HTMLButtonElement>
  ) => void;
};

const WidgetGridCell = ({
  widget,
  cellSize,
  onClick,
  onDragStart,
}: WidgetGridCellProps) => {
  return (
    <Tooltip key={widget.name}>
      <div className="h-full">
        <TooltipTrigger asChild>
          <button
            className="relative flex aspect-square w-full flex-col items-center justify-center gap-1 p-1.5 hover:bg-muted transition text-foreground/80 rounded-sm border border-border/50"
            draggable={!!onDragStart}
            onClick={() => {
              void onClick(widget);
            }}
            onDragStart={(e) => {
              if (onDragStart) {
                onDragStart(widget, e);
              }
            }}
            style={{ maxHeight: cellSize }}
          >
            <ButtonIcon className="size-6 text-foreground/60" />
            <div className="text-xs text-center line-clamp-2 leading-tight px-1">
              {widget.name}
            </div>
          </button>
        </TooltipTrigger>
      </div>
      <TooltipContent
        side="bottom"
        sideOffset={0}
        className="pointer-events-none"
      >
        {widget.name}
      </TooltipContent>
    </Tooltip>
  );
};

export function WidgetsBrowser({ onDragStart }: WidgetsBrowserProps) {
  const instance = useCurrentEditor();
  const { widgets, query, setQuery } = useWidgets();
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const [cellSize, setCellSize] = useState(100);

  const handleInsert = useCallback(
    async (widget: WidgetAsset) => {
      const task = (async () => {
        const prototype = (prototypes as any)[widget.type];
        if (!prototype) {
          throw new Error(`Widget "${widget.type}" not found`);
        }
        instance.commands.insertNode(prototype);
      })();

      toast.promise(task, {
        loading: "Inserting widget...",
        success: "Widget inserted",
        error: "Failed to insert widget",
      });
    },
    [instance.commands]
  );

  React.useEffect(() => {
    const el = scrollParentRef.current;
    if (!el) return;

    const updateCellSize = () => {
      const width = el.clientWidth;
      if (!width) return;
      const availableWidth =
        width - GRID_PADDING_X_PX * 2 - GRID_GAP_PX * (COLUMN_COUNT - 1);
      const next = availableWidth > 0 ? availableWidth / COLUMN_COUNT : 100;
      setCellSize(next);
    };

    updateCellSize();
    const observer = new ResizeObserver(updateCellSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rowHeight = useMemo(
    () => Math.max(cellSize + GRID_GAP_PX, 60),
    [cellSize]
  );

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(widgets.length / COLUMN_COUNT),
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  });

  return (
    <div className="text-sm pointer-events-auto bg-background h-full flex flex-col">
      <header className="space-y-2 border-b">
        <div className="flex gap-2 p-2">
          <SearchInput
            placeholder="Search widgets"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>
      {widgets.length === 0 && (
        <div className="text-xs text-muted-foreground p-4">
          No widgets found. Try another search.
        </div>
      )}
      <div
        ref={scrollParentRef}
        className="relative w-full flex-1 min-h-0 overflow-auto py-1"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowIndex = virtualRow.index;
            const rowStart = virtualRow.start;
            const rowItems: (WidgetAsset | null)[] = [];
            for (let i = 0; i < COLUMN_COUNT; i++) {
              const itemIndex = rowIndex * COLUMN_COUNT + i;
              rowItems.push(widgets[itemIndex] ?? null);
            }

            return (
              <div
                key={virtualRow.key}
                className="grid gap-3 px-1"
                style={{
                  gridTemplateColumns: `repeat(${COLUMN_COUNT}, minmax(0, 1fr))`,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${rowStart}px)`,
                  height: virtualRow.size,
                }}
              >
                {rowItems.map((widget, idx) => {
                  if (!widget) {
                    return <div key={`empty-${virtualRow.key}-${idx}`} />;
                  }
                  return (
                    <WidgetGridCell
                      key={widget.name}
                      widget={widget}
                      cellSize={cellSize}
                      onClick={handleInsert}
                      onDragStart={onDragStart}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SearchInput } from "./components/search-input";
import { LoadingIndicator } from "./components/loading-indicator";
import { useDebounce } from "@uidotdev/usehooks";

export type ShapeAsset = {
  name: string;
  src: string;
};

export type ShapesBrowserProps = {
  onInsert?: (shape: ShapeAsset) => Promise<void> | void;
  onDragStart?: (
    shape: ShapeAsset,
    event: React.DragEvent<HTMLButtonElement>
  ) => void;
};

const COLUMN_COUNT = 3;
const GRID_GAP_PX = 12; // tailwind gap-3
const GRID_PADDING_X_PX = 4; // tailwind px-1 per side
const SEARCH_INPUT_DEBOUNCE_MS = 250;

// TODO: use grida library api
function useGridaStdShapes() {
  const base = "https://grida-std.s3.us-west-1.amazonaws.com/shapes-basic";
  const json = `${base}/info.json`;

  const [shapes, setShapes] = useState<ShapeAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadShapes = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(json);
        if (cancelled) return;
        if (!res.ok) {
          throw new Error("Failed to fetch shapes");
        }
        const data = await res.json();
        if (cancelled) return;
        setShapes(
          data.map(({ name }: { name: string }) => ({
            name: name,
            src: `${base}/${name}`,
          }))
        );
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load shapes");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void loadShapes();
    return () => {
      cancelled = true;
    };
  }, []);

  return { shapes, loading, error };
}

function useShapes() {
  const { shapes, loading, error } = useGridaStdShapes();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, SEARCH_INPUT_DEBOUNCE_MS);

  const filteredShapes = useMemo(() => {
    if (!debouncedQuery.trim()) return shapes;
    const term = debouncedQuery.toLowerCase();
    return shapes.filter((shape) => shape.name.toLowerCase().includes(term));
  }, [shapes, debouncedQuery]);

  return {
    shapes: filteredShapes,
    loading,
    error,
    query,
    setQuery,
  };
}

type ShapeGridCellProps = {
  shape: ShapeAsset;
  cellSize: number;
  onClick: (shape: ShapeAsset) => void;
  onDragStart?: (
    shape: ShapeAsset,
    event: React.DragEvent<HTMLButtonElement>
  ) => void;
};

const ShapeGridCell = ({
  shape,
  cellSize,
  onClick,
  onDragStart,
}: ShapeGridCellProps) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <Tooltip key={shape.name} disableHoverableContent>
      <div className="h-full">
        <TooltipTrigger asChild>
          <button
            className="relative flex aspect-square w-full flex-col items-center justify-center gap-1 p-1.5 hover:bg-muted transition text-foreground/80 rounded-sm"
            draggable={!!onDragStart}
            onClick={() => {
              void onClick(shape);
            }}
            onDragStart={(e) => {
              if (onDragStart) {
                onDragStart(shape, e);
              }
            }}
            style={{ maxHeight: cellSize }}
          >
            <div
              className="pointer-events-none absolute inset-1 rounded-sm bg-muted/40 animate-pulse"
              style={{ opacity: loaded ? 0 : 1 }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shape.src}
              alt={shape.name}
              loading="lazy"
              className="relative z-10 h-10 w-10 object-contain dark:invert transition-opacity duration-150"
              style={{ opacity: loaded ? 1 : 0 }}
              onLoad={() => setLoaded(true)}
            />
          </button>
        </TooltipTrigger>
      </div>
      <TooltipContent
        side="bottom"
        sideOffset={0}
        className="pointer-events-none"
      >
        {shape.name}
      </TooltipContent>
    </Tooltip>
  );
};

export function ShapesBrowser({ onInsert, onDragStart }: ShapesBrowserProps) {
  const { shapes, loading, error, query, setQuery } = useShapes();
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const [cellSize, setCellSize] = useState(100);

  const handleInsert = useCallback(
    async (shape: ShapeAsset) => {
      if (!onInsert) return;
      await onInsert(shape);
    },
    [onInsert]
  );

  useEffect(() => {
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
    count: Math.ceil(shapes.length / COLUMN_COUNT),
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  });

  return (
    <div className="text-sm pointer-events-auto bg-background h-full flex flex-col">
      <header className="space-y-2 border-b">
        <div className="flex gap-2 p-2">
          <SearchInput
            placeholder="Search shapes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>
      <LoadingIndicator loading={loading} />
      {error && (
        <div className="text-xs text-destructive px-2 pt-2">
          Failed to load: {error}
        </div>
      )}
      {!loading && !error && shapes.length === 0 && (
        <div className="text-xs text-muted-foreground p-4">
          No shapes found. Try another search.
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
            const rowItems: (ShapeAsset | null)[] = [];
            for (let i = 0; i < COLUMN_COUNT; i++) {
              const itemIndex = rowIndex * COLUMN_COUNT + i;
              rowItems.push(shapes[itemIndex] ?? null);
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
                {rowItems.map((shape, idx) => {
                  if (!shape) {
                    return <div key={`empty-${virtualRow.key}-${idx}`} />;
                  }
                  return (
                    <ShapeGridCell
                      key={shape.name}
                      shape={shape}
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

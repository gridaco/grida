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
import { Pill } from "./components/pills";
import { LoadingIndicator } from "./components/loading-indicator";
import { useDebounce } from "@uidotdev/usehooks";
import { cn } from "@/components/lib/utils";
import { SlashIcon } from "@radix-ui/react-icons";
import {
  IconsBrowserItem,
  fetchLogos as fetchLogosFromApi,
  type IconVariantFilters,
} from "./lib-icons";

export type { IconsBrowserItem } from "./lib-icons";

const GRID_GAP_PX = 12; // tailwind gap-3
const GRID_PADDING_X_PX = 4; // tailwind px-1 per side
const SEARCH_INPUT_DEBOUNCE_MS = 250;
const LOGO_FIXED_HEIGHT = 60; // Fixed height for logos

type LogoKind = "symbol" | "wordmark";
type LogoTheme = "light" | "dark";

type LogoFilters = {
  kind: LogoKind;
  theme: LogoTheme;
};

export type LogosBrowserProps = {
  onInsert?: (logo: IconsBrowserItem) => Promise<void> | void;
  onDragStart?: (
    logo: IconsBrowserItem,
    event: React.DragEvent<HTMLButtonElement>
  ) => void;
  onShouldThemeChange?: (theme: LogoTheme) => void;
};

function useLogos(onShouldThemeChange?: (theme: LogoTheme) => void) {
  const [logos, setLogos] = useState<IconsBrowserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, SEARCH_INPUT_DEBOUNCE_MS);
  const [filters, setFilters] = useState<LogoFilters>({
    kind: "symbol",
    theme: "light",
  });

  const fetchLogos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const variants: IconVariantFilters = {
        kind: filters.kind,
        theme: filters.theme,
      };
      const list = await fetchLogosFromApi({
        query: debouncedQuery.trim() || undefined,
        variants,
      });
      setLogos(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logos");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, filters.kind, filters.theme]);

  useEffect(() => {
    void fetchLogos();
  }, [fetchLogos]);

  const selectKind = useCallback((kind: LogoKind) => {
    setFilters((prev) => ({ ...prev, kind }));
  }, []);

  const selectTheme = useCallback(
    (theme: LogoTheme) => {
      setFilters((prev) => ({ ...prev, theme }));
      onShouldThemeChange?.(theme);
    },
    [onShouldThemeChange]
  );

  return {
    logos,
    loading,
    error,
    query,
    setQuery,
    kind: filters.kind,
    theme: filters.theme,
    selectKind,
    selectTheme,
  };
}

type LogoGridCellProps = {
  logo: IconsBrowserItem;
  cellSize: number;
  theme: LogoTheme;
  onClick: (logo: IconsBrowserItem) => void;
  onDragStart?: (
    logo: IconsBrowserItem,
    event: React.DragEvent<HTMLButtonElement>
  ) => void;
};

const LogoGridCell = ({
  logo,
  cellSize,
  theme,
  onClick,
  onDragStart,
}: LogoGridCellProps) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <Tooltip key={logo.id}>
      <div className="h-full">
        <TooltipTrigger asChild>
          <button
            className="relative flex w-full flex-col items-center justify-center gap-1 p-2 hover:bg-muted/50 transition rounded-sm border border-border/50"
            draggable={!!onDragStart}
            onClick={() => {
              void onClick(logo);
            }}
            onDragStart={(e) => {
              if (onDragStart) {
                onDragStart(logo, e);
              }
            }}
            style={{
              minHeight: LOGO_FIXED_HEIGHT + 16, // Fixed height + padding
              maxHeight: cellSize,
            }}
          >
            <div
              className={cn("pointer-events-none absolute inset-2 rounded-sm")}
              style={{ opacity: loaded ? 0 : 1 }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logo.download}
              alt={logo.name}
              loading="lazy"
              className="relative z-10 object-contain transition-opacity duration-150"
              style={{
                opacity: loaded ? 1 : 0,
                height: LOGO_FIXED_HEIGHT,
                width: "auto",
                maxWidth: "100%",
              }}
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
        {logo.name}
      </TooltipContent>
    </Tooltip>
  );
};

export function LogosBrowser({
  onInsert,
  onDragStart,
  onShouldThemeChange,
}: LogosBrowserProps) {
  const {
    logos,
    loading,
    error,
    query,
    setQuery,
    kind,
    theme,
    selectKind,
    selectTheme,
  } = useLogos(onShouldThemeChange);
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const [cellSize, setCellSize] = useState(100);

  // Dynamic column count based on kind
  const COLUMN_COUNT = kind === "symbol" ? 3 : 2;

  const handleInsert = useCallback(
    async (logo: IconsBrowserItem) => {
      if (!onInsert) return;
      await onInsert(logo);
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
  }, [COLUMN_COUNT]);

  const rowHeight = useMemo(
    () => Math.max(LOGO_FIXED_HEIGHT + 32 + GRID_GAP_PX, 80),
    []
  );

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(logos.length / COLUMN_COUNT),
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  });

  return (
    <div className="text-sm pointer-events-auto bg-background h-full flex flex-col">
      <header className="space-y-2 border-b">
        <div className="flex gap-2 pt-2 px-2">
          <SearchInput
            placeholder="Search logos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="w-full pb-2">
          <div className="px-2 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Pill
                label="Symbol"
                active={kind === "symbol"}
                onClick={() => selectKind("symbol")}
              />
              <Pill
                label="Wordmark"
                active={kind === "wordmark"}
                onClick={() => selectKind("wordmark")}
              />
            </div>
            <SlashIcon className="size-3 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <Pill
                label="Light"
                active={theme === "light"}
                onClick={() => selectTheme("light")}
              />
              <Pill
                label="Dark"
                active={theme === "dark"}
                onClick={() => selectTheme("dark")}
              />
            </div>
          </div>
        </div>
      </header>
      <LoadingIndicator loading={loading} />
      {error && (
        <div className="text-xs text-destructive px-2 pt-2">
          Failed to load: {error}
        </div>
      )}
      {!loading && !error && logos.length === 0 && (
        <div className="text-xs text-muted-foreground p-4">
          No logos found. Try another search.
        </div>
      )}
      <div
        ref={scrollParentRef}
        className={cn(
          "relative w-full flex-1 min-h-0 overflow-auto py-1",
          theme === "dark" && "dark dark:bg-black"
        )}
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
            const rowItems: (IconsBrowserItem | null)[] = [];
            for (let i = 0; i < COLUMN_COUNT; i++) {
              const itemIndex = rowIndex * COLUMN_COUNT + i;
              rowItems.push(logos[itemIndex] ?? null);
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
                {rowItems.map((logo, idx) => {
                  if (!logo) {
                    return <div key={`empty-${virtualRow.key}-${idx}`} />;
                  }
                  return (
                    <LogoGridCell
                      key={logo.id}
                      logo={logo}
                      cellSize={cellSize}
                      theme={theme}
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

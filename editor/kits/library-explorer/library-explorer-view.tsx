"use client";

import {
  createContext,
  forwardRef,
  memo,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import {
  useInfiniteLoader,
  useMasonry,
  usePositioner,
  useResizeObserver,
  useScrollToIndex,
  type LoadMoreItemsCallback,
} from "masonic";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import { LibraryCard, LibrarySelectionAction } from "./library-card";
import {
  LibraryExplorer,
  type LibraryExplorerItem,
  type LibraryExplorerLoadTicket,
  type LibraryExplorerPageLoader,
  type LibraryExplorerSource,
} from "./library-explorer";
import { LibraryExplorerViewport } from "./library-explorer-viewport";
import { LibraryFocusFeedback } from "./library-focus-feedback";

const DEFAULT_PAGE_SIZE = 30;

type CardContextValue = Readonly<{
  selectedIds: ReadonlySet<string>;
  disabled: boolean;
  compact: boolean;
  onOpen: (item: LibraryExplorerItem) => void;
  onToggle: (item: LibraryExplorerItem) => void;
  focusFeedback: LibraryFocusFeedback;
}>;

const CardContext = createContext<CardContextValue | null>(null);

function MasonryCard({
  data,
  width,
}: {
  data: LibraryExplorerItem;
  width: number;
}) {
  const context = useContext(CardContext);
  if (!context) return null;
  return (
    <LibraryCard
      item={data}
      width={width}
      selected={context.selectedIds.has(data.id)}
      disabled={context.disabled}
      compact={context.compact}
      onOpen={context.onOpen}
      onToggle={context.onToggle}
      focusFeedback={context.focusFeedback}
    />
  );
}

export type LibraryExplorerViewHandle = Readonly<{
  navigate(item: LibraryExplorerItem): void;
}>;

export type LibraryExplorerViewProps = Readonly<{
  initialSource: LibraryExplorerSource;
  loadPage: LibraryExplorerPageLoader;
  selectedIds: ReadonlySet<string>;
  onToggle: (item: LibraryExplorerItem) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  disabled?: boolean;
  compact?: boolean;
  maxColumnCount?: number;
  pageSize?: number;
  className?: string;
}>;

/**
 * A scoped Library browser: infinite feed, nested similar-object navigation,
 * and per-entry scroll restoration. I/O and selection remain host-owned.
 *
 * Manual regression: `test/desktop-library-explorer-navigation.md`.
 */
export const LibraryExplorerView = memo(
  forwardRef<LibraryExplorerViewHandle, LibraryExplorerViewProps>(
    function LibraryExplorerView(
      {
        initialSource,
        loadPage,
        selectedIds,
        onToggle,
        scrollContainerRef,
        disabled = false,
        compact = false,
        maxColumnCount = compact ? 10 : 6,
        pageSize = DEFAULT_PAGE_SIZE,
        className,
      },
      ref
    ) {
      const [explorer] = useState(() => new LibraryExplorer(initialSource));
      const snapshot = useSyncExternalStore(
        explorer.subscribe,
        explorer.getSnapshot,
        explorer.getSnapshot
      );
      const { route, state } = snapshot.current;
      const [focusFeedback] = useState(() => new LibraryFocusFeedback());
      const [viewport] = useState(() => new LibraryExplorerViewport());
      const viewportSnapshot = useSyncExternalStore(
        viewport.subscribe,
        viewport.getSnapshot,
        viewport.getSnapshot
      );

      useEffect(() => () => focusFeedback.dispose(), [focusFeedback]);

      const rootRef = useRef<HTMLDivElement | null>(null);
      const gridRef = useRef<HTMLDivElement | null>(null);
      const backButtonRef = useRef<HTMLButtonElement | null>(null);

      useEffect(() => {
        const container = scrollContainerRef.current;
        const root = rootRef.current;
        const grid = gridRef.current;
        if (!container || !root || !grid) return;
        return viewport.attach(container, root, grid);
      }, [route, scrollContainerRef, viewport]);
      useEffect(() => () => viewport.dispose(), [viewport]);

      const runLoad = useCallback(
        async (ticket: LibraryExplorerLoadTicket) => {
          try {
            const page = await loadPage(ticket.source, ticket.range);
            explorer.finishLoad(ticket, page);
          } catch {
            explorer.failLoad(ticket);
          }
        },
        [explorer, loadPage]
      );

      useEffect(() => {
        if (state.phase !== "idle") return;
        const ticket = explorer.startLoad(0, pageSize - 1, false);
        if (!ticket) return;
        void runLoad(ticket);
      }, [explorer, pageSize, route, runLoad, state.phase]);

      const positioner = usePositioner(
        {
          width: Math.max(0, viewportSnapshot.width),
          columnWidth: compact ? 128 : 180,
          columnGutter: compact ? 8 : 12,
          rowGutter: compact ? 8 : 12,
          maxColumnCount,
        },
        [route, compact, maxColumnCount]
      );
      const resizeObserver = useResizeObserver(positioner);

      const captureScroll = useCallback(() => {
        return viewport.capture(state.items, positioner);
      }, [positioner, state.items, viewport]);

      const open = useCallback(
        (item: LibraryExplorerItem) => {
          if (disabled) return;
          explorer.open(item, captureScroll(), viewport.rootOffsetTop());
        },
        [captureScroll, disabled, explorer, viewport]
      );

      const back = useCallback(() => {
        explorer.back(captureScroll());
      }, [captureScroll, explorer]);

      const cardContext = useMemo<CardContextValue>(
        () => ({
          selectedIds,
          disabled,
          compact,
          onOpen: open,
          onToggle,
          focusFeedback,
        }),
        [compact, disabled, focusFeedback, onToggle, open, selectedIds]
      );

      const maybeLoadMore = useInfiniteLoader<
        LibraryExplorerItem,
        LoadMoreItemsCallback<LibraryExplorerItem>
      >(
        async (startIndex, stopIndex) => {
          // Masonic's loader range is inclusive at both ends.
          const ticket = explorer.startLoad(startIndex, stopIndex, true);
          if (!ticket) return;
          await runLoad(ticket);
        },
        {
          minimumBatchSize: pageSize,
          isItemLoaded: (index, items) => index < items.length,
          totalItems:
            state.exactCount ??
            (state.exhausted ? state.items.length : undefined),
        }
      );

      const retry = useCallback(() => {
        const ticket = explorer.retryLoad();
        if (ticket) void runLoad(ticket);
      }, [explorer, runLoad]);

      const scrollToIndex = useScrollToIndex(positioner, {
        element: scrollContainerRef.current,
        height: viewportSnapshot.height,
        align: "center",
        offset: viewportSnapshot.gridOffsetTop,
      });
      const itemIndex = useMemo(
        () => new Map(state.items.map((item, index) => [item.id, index])),
        [state.items]
      );

      useImperativeHandle(
        ref,
        () => ({
          navigate(item) {
            const index = itemIndex.get(item.id);
            if (index === undefined) {
              open(item);
              return;
            }
            scrollToIndex(index);
            focusFeedback.flash(item.id, { focus: true });
          },
        }),
        [focusFeedback, itemIndex, open, scrollToIndex]
      );

      const previousRouteRef = useRef(route);
      const restorationRef = useRef({
        items: state.items,
        scroll: state.scroll,
        focusId: state.focusId,
        positioner,
      });
      restorationRef.current = {
        items: state.items,
        scroll: state.scroll,
        focusId: state.focusId,
        positioner,
      };
      useEffect(() => {
        if (previousRouteRef.current === route) return;
        previousRouteRef.current = route;

        const restoration = restorationRef.current;
        return viewport.restore(
          restoration.items,
          restoration.positioner,
          restoration.scroll,
          () => {
            if (restoration.focusId) {
              focusFeedback.focus(restoration.focusId);
            } else if (route.kind === "object") {
              backButtonRef.current?.focus({ preventScroll: true });
            }
          }
        );
      }, [focusFeedback, route, viewport]);

      const grid = useMasonry<LibraryExplorerItem>({
        positioner,
        resizeObserver,
        items: state.items,
        height: viewportSnapshot.height,
        scrollTop: Math.max(
          0,
          viewportSnapshot.scrollTop - viewportSnapshot.gridOffsetTop
        ),
        isScrolling: viewportSnapshot.isScrolling,
        overscanBy: 2,
        itemKey: (item) => item.id,
        role: "list",
        tabIndex: -1,
        render: MasonryCard,
        onRender: maybeLoadMore,
      });

      const selectedObject =
        route.kind === "object" && selectedIds.has(route.object.id);
      const focusedObjectAspect =
        route.kind === "object" &&
        route.object.width &&
        route.object.width > 0 &&
        route.object.height &&
        route.object.height > 0
          ? route.object.width / route.object.height
          : null;

      return (
        <div
          ref={rootRef}
          data-testid="library-explorer"
          className={cn("min-w-0", className)}
        >
          {route.kind === "object" && (
            <>
              <div className="sticky top-3 z-30 ml-2 w-fit">
                <Button
                  ref={backButtonRef}
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Back"
                  disabled={disabled}
                  onClick={back}
                  className="size-12 bg-background/90 shadow-sm backdrop-blur hover:bg-background"
                >
                  <ArrowLeftIcon className="size-6" />
                </Button>
              </div>
              <section className="mx-auto w-full max-w-5xl px-6">
                <div className="flex min-h-[50vh] items-start justify-center pb-10">
                  <div
                    // Keep the original centered row's exact width: the
                    // rendered image plus its 17rem padded copy column.
                    // The ring is decorative and does not enter layout.
                    style={
                      focusedObjectAspect
                        ? {
                            width: `min(100%, calc(${focusedObjectAspect * 80}vh + 17rem))`,
                          }
                        : undefined
                    }
                    className={cn(
                      "flex min-w-0 items-start rounded-xl ring-1 ring-border",
                      !focusedObjectAspect && "w-fit max-w-full"
                    )}
                  >
                    <div
                      // Constrain the overlay frame itself to the rendered
                      // image's 80vh aspect box. Constraining only <img> leaves
                      // a wider frame at large viewports and detaches Add.
                      style={
                        focusedObjectAspect
                          ? {
                              aspectRatio: String(focusedObjectAspect),
                              width: `min(100%, ${focusedObjectAspect * 80}vh)`,
                            }
                          : undefined
                      }
                      className={cn(
                        "group relative min-w-0 shrink overflow-hidden rounded-xl bg-muted/30",
                        focusedObjectAspect ? "max-w-full" : "w-fit max-w-full"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={route.object.url}
                        alt={route.object.title}
                        width={route.object.width}
                        height={route.object.height}
                        draggable={false}
                        className={cn(
                          "block select-none object-contain",
                          focusedObjectAspect
                            ? "size-full"
                            : "max-h-[80vh] max-w-full"
                        )}
                      />
                      <div className="absolute right-2 top-2">
                        <LibrarySelectionAction
                          selected={selectedObject}
                          disabled={disabled}
                          size="large"
                          onToggle={() => onToggle(route.object)}
                        />
                      </div>
                    </div>
                    <p className="w-[17rem] shrink-0 pb-4 pl-4 pr-5 pt-5 text-sm text-muted-foreground">
                      {route.object.title}
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}

          <div ref={gridRef}>
            {state.phase === "error" && state.items.length === 0 && (
              <div
                role="alert"
                className="flex flex-col items-center justify-center gap-3 py-20 text-center text-sm text-muted-foreground"
              >
                <p>Couldn’t load the Library.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={retry}
                >
                  Try again
                </Button>
              </div>
            )}

            {state.phase === "ready" && state.items.length === 0 && (
              <p
                role="status"
                className="py-20 text-center text-sm text-muted-foreground"
              >
                No references found.
              </p>
            )}

            {(state.phase === "idle" || state.phase === "loading") &&
              state.items.length === 0 && (
                <div
                  role="status"
                  className="flex items-center justify-center py-20 text-xs text-muted-foreground"
                >
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Loading the Library…
                </div>
              )}

            <CardContext.Provider value={cardContext}>
              {grid}
            </CardContext.Provider>

            {state.loadingMore && (
              <div
                role="status"
                className="flex items-center justify-center py-8 text-xs text-muted-foreground"
              >
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Loading more…
              </div>
            )}

            {state.failedLoad?.append && (
              <div
                role="alert"
                className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"
              >
                <span>Couldn’t load more.</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={retry}
                >
                  Try again
                </Button>
              </div>
            )}
          </div>
        </div>
      );
    }
  )
);

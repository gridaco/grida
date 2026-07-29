/**
 * The dedicated **editor-pane** `design_search` picker — the artwork-station
 * gather+curate step, given room to breathe. The agent proposes an initial
 * search and pauses; the workbench auto-opens this as a virtual tab. The user
 * may refine that search, browse multiple directions, and select references
 * across them before committing the picks (or skipping), which resolves the
 * paused tool call.
 *
 * Same engine as the real `/library` gallery: **`masonic`** for the staggered
 * masonry (row-major, best-first reading order) + virtualization, and
 * `useInfiniteLoader` for paging. The one difference is the scroll source —
 * `<Masonry>` binds to `window.scrollY`, which doesn't move inside a fixed-height
 * pane, so we drive masonic's lower-level `useMasonry` from the pane's own scroll
 * container (its documented custom-scroll-container path). masonic still owns the
 * layout, column math, and cell recycling; we only feed it `scrollTop`/`height`.
 *
 * Library pins are URLs — nothing is downloaded; a pick carries its image url
 * straight through to image-to-image (see `design-search-card.tsx`).
 *
 * Manual regression: `test/desktop-agent-chat-library-search-refinement.md`.
 */

"use client";

import {
  createContext,
  type FormEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useInfiniteLoader,
  useMasonry,
  usePositioner,
  useResizeObserver,
  useScrollToIndex,
  type LoadMoreItemsCallback,
} from "masonic";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import {
  ArrowRightIcon,
  CheckIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import type { AgentDesignSearch } from "@grida/agent/tools/design-search";
import { DesignSearchExplorer } from "@/kits/agent-chat";
import {
  DESIGN_SEARCH_PAGE,
  resolveDesignSearchPage,
} from "@/scaffolds/desktop/shared/design-search";
import {
  pickQuery,
  pickToolCallId,
  type DesignSearchSession,
} from "./design-search-tab";
import { DesignSearchFocusFeedback } from "./design-search-focus-feedback";

type Pin = AgentDesignSearch.DesignSearchResult;

/** Inner padding of the scroll container, subtracted from its measured width so
 *  masonic's columns lay out within the padding box. */
const GRID_PAD = 12;

/** Selection passed to masonic-rendered cells via context (not props): masonic
 *  memoizes cells, but a consumed context still re-renders them on toggle. */
const SelectionContext = createContext<{
  explorer: DesignSearchExplorer;
  toggle: (pin: Pin) => void;
  disabled: boolean;
  focusFeedback: DesignSearchFocusFeedback | null;
}>({
  explorer: DesignSearchExplorer.create(""),
  toggle: () => {},
  disabled: false,
  focusFeedback: null,
});

/** One masonry cell — masonic passes `{ index, data, width }`; we size the cell
 *  to the pin's aspect ratio (no per-item measurement). */
function ReferenceCard({ data: pin, width }: { data: Pin; width: number }) {
  const { explorer, toggle, disabled, focusFeedback } =
    useContext(SelectionContext);
  const selected = explorer.isSelected(pin.id);
  const [showAddedLabel, setShowAddedLabel] = useState(false);
  const addedLabelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aspect = pin.width && pin.height ? pin.width / pin.height : 1;
  const height = width / aspect;

  useEffect(() => {
    return () => {
      if (addedLabelTimerRef.current !== null) {
        clearTimeout(addedLabelTimerRef.current);
      }
    };
  }, []);

  const toggleSelection = () => {
    if (addedLabelTimerRef.current !== null) {
      clearTimeout(addedLabelTimerRef.current);
      addedLabelTimerRef.current = null;
    }

    if (selected) {
      setShowAddedLabel(false);
    } else {
      setShowAddedLabel(true);
      addedLabelTimerRef.current = setTimeout(() => {
        setShowAddedLabel(false);
        addedLabelTimerRef.current = null;
      }, 100);
    }

    toggle(pin);
  };

  return (
    <div
      ref={focusFeedback?.ref(pin.id)}
      style={{ width, height }}
      className={cn(
        "group relative block rounded-lg border-2 border-transparent transition",
        selected && "ring-2 ring-primary/25"
      )}
    >
      <div className="relative size-full overflow-hidden rounded-[inherit]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pin.url}
          alt={pin.title}
          loading="lazy"
          className={cn(
            "size-full object-cover transition",
            selected && "brightness-90"
          )}
        />
        <button
          type="button"
          disabled={disabled}
          aria-pressed={selected}
          onClick={toggleSelection}
          title={selected ? "Remove from selection" : "Add to selection"}
          className={cn(
            "group/action absolute right-1.5 top-1.5 z-20 flex items-center justify-center rounded-full px-2 py-1 text-xs font-medium shadow transition-all disabled:opacity-50",
            selected
              ? cn(
                  "bg-primary text-primary-foreground",
                  showAddedLabel
                    ? "gap-1"
                    : "gap-0 hover:gap-1 focus-visible:gap-1"
                )
              : "bg-background/90 text-foreground opacity-0 hover:bg-background group-hover:opacity-100 focus-visible:opacity-100"
          )}
        >
          {selected ? (
            <>
              <CheckIcon className="size-3.5" />
              <span
                className={cn(
                  "overflow-hidden whitespace-nowrap transition-all duration-150",
                  showAddedLabel
                    ? "max-w-12 opacity-100"
                    : "max-w-0 opacity-0 group-hover/action:max-w-12 group-hover/action:opacity-100 group-focus-visible/action:max-w-12 group-focus-visible/action:opacity-100"
                )}
              >
                Added
              </span>
            </>
          ) : (
            <>
              <PlusIcon className="size-3.5" />
              Add
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function SelectionBar({
  pins,
  disabled,
  onRemove,
  onUse,
  resultIndexById,
  onNavigate,
}: {
  pins: Pin[];
  disabled: boolean;
  onRemove: (id: string) => void;
  onUse: () => void;
  resultIndexById: ReadonlyMap<string, number>;
  onNavigate: (id: string, index: number) => void;
}) {
  if (pins.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex min-w-64 max-w-[min(30rem,100%)] items-center gap-2 rounded-xl border border-background/10 bg-foreground/95 p-1.5 shadow-lg backdrop-blur">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 overflow-visible">
          {pins.map((pin) => {
            const resultIndex = resultIndexById.get(pin.id);
            return (
              <div
                key={pin.id}
                className="group relative size-11 shrink-0 rounded-md border border-background/15"
              >
                <button
                  type="button"
                  disabled={disabled || resultIndex === undefined}
                  onClick={() => {
                    if (resultIndex !== undefined) {
                      onNavigate(pin.id, resultIndex);
                    }
                  }}
                  aria-label={`Show ${pin.title} in results`}
                  className="block size-full cursor-pointer overflow-hidden rounded-[inherit] disabled:cursor-default"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pin.url}
                    alt=""
                    draggable={false}
                    className="size-full select-none object-cover"
                  />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemove(pin.id)}
                  aria-label={`Remove ${pin.title}`}
                  className="pointer-events-none absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-background text-foreground opacity-0 shadow ring-1 ring-foreground/10 transition hover:scale-105 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 disabled:opacity-50"
                >
                  <XIcon className="size-2.5" />
                </button>
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          disabled={disabled}
          onClick={onUse}
          aria-label={`Use ${pins.length} reference${pins.length === 1 ? "" : "s"}`}
          className="mx-4 h-8 shrink-0 rounded-full px-4 py-2 has-[>svg]:px-4"
        >
          Use
          <ArrowRightIcon />
        </Button>
      </div>
    </div>
  );
}

export function EditorPaneDesignSearch({
  session,
}: {
  session: DesignSearchSession;
}) {
  const toolCallId = pickToolCallId(session.entry);
  return (
    <DesignSearchPicker
      key={toolCallId}
      session={session}
      toolCallId={toolCallId}
      initialQuery={pickQuery(session.entry)}
    />
  );
}

function DesignSearchPicker({
  session,
  toolCallId,
  initialQuery,
}: {
  session: DesignSearchSession;
  toolCallId: string;
  initialQuery: string;
}) {
  const { onPick, busy } = session;
  const [draftQuery, setDraftQuery] = useState(initialQuery);
  const [explorer, setExplorer] = useState(() =>
    DesignSearchExplorer.create(initialQuery)
  );
  const explorerRef = useRef(explorer);
  const focusFeedback = useMemo(() => new DesignSearchFocusFeedback(), []);

  useEffect(() => () => focusFeedback.dispose(), [focusFeedback]);

  const [items, setItems] = useState<Pin[]>([]);
  const [count, setCount] = useState<number | undefined>(undefined);
  const [seeded, setSeeded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const loadingRef = useRef(false);

  // Append a page, de-duped by id (a relevance window can repeat across ranges).
  const appendPage = useCallback((page: Pin[]) => {
    setItems((cur) => {
      const seen = new Set(cur.map((p) => p.id));
      return [...cur, ...page.filter((p) => !seen.has(p.id))];
    });
  }, []);

  // Seed the first page on the initial or user-refined query.
  // masonic's loader can't pull page 0 (nothing renders from an empty grid), so
  // we fetch it; the loader pages from there.
  useEffect(() => {
    const ticket = explorer.ticket();
    const fresh = () => explorerRef.current.accepts(ticket);
    setItems([]);
    setCount(undefined);
    setSeeded(false);
    setError(false);
    setLoadingMore(false);
    loadingRef.current = true;
    void resolveDesignSearchPage(ticket.query, [0, DESIGN_SEARCH_PAGE - 1])
      .then(({ items: page, count: total }) => {
        if (!fresh()) return;
        setCount(total);
        appendPage(page);
      })
      .catch(() => {
        if (fresh()) setError(true);
      })
      .finally(() => {
        if (fresh()) {
          setSeeded(true);
          loadingRef.current = false;
        }
      });
    return () => {
      // A newer query revision invalidates the ticket; nothing else to tear down.
    };
  }, [explorer.query, explorer.revision, appendPage]);

  // Subsequent pages — masonic's infinite loader, mirroring the `/library`
  // gallery (inclusive `[start, stop - 1]` range; batch = page size).
  const maybeLoadMore = useInfiniteLoader<Pin, LoadMoreItemsCallback<Pin>>(
    async (startIndex, stopIndex) => {
      if (loadingRef.current) return;
      const ticket = explorer.ticket();
      loadingRef.current = true;
      setLoadingMore(true);
      try {
        const { items: page, count: total } = await resolveDesignSearchPage(
          ticket.query,
          [startIndex, stopIndex - 1]
        );
        if (!explorerRef.current.accepts(ticket)) return;
        setCount(total);
        appendPage(page);
      } catch {
        /* a transient page error just stops paging; the seed/grid stay. */
      } finally {
        if (explorerRef.current.accepts(ticket)) {
          loadingRef.current = false;
          setLoadingMore(false);
        }
      }
    },
    {
      minimumBatchSize: DESIGN_SEARCH_PAGE,
      isItemLoaded: (index, loaded) => index < loaded.length,
      totalItems: count,
    }
  );

  // ── custom scroll container wiring (feeds masonic the pane's scroll) ──
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollStop = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setIsScrolling(true);
    if (scrollStop.current) clearTimeout(scrollStop.current);
    scrollStop.current = setTimeout(() => setIsScrolling(false), 120);
  }, []);

  const positioner = usePositioner(
    {
      width: Math.max(0, size.width - GRID_PAD * 2),
      columnWidth: 180,
      columnGutter: 12,
      rowGutter: 12,
      maxColumnCount: 6,
    },
    // Query refinement replaces the item list. Clear masonic's index cache at
    // the same boundary so it never renders a prior index against the new list.
    [explorer.revision]
  );
  const resizeObserver = useResizeObserver(positioner);
  const scrollToResult = useScrollToIndex(positioner, {
    element: scrollRef,
    height: size.height,
    align: "center",
  });
  const navigateToResult = useCallback(
    (id: string, index: number) => {
      scrollToResult(index);
      focusFeedback.flash(id);
    },
    [focusFeedback, scrollToResult]
  );

  const toggle = useCallback(
    (pin: Pin) => {
      if (busy || submitted) return;
      const next = explorerRef.current.toggle(pin);
      explorerRef.current = next;
      setExplorer(next);
    },
    [busy, submitted]
  );

  function submit(output: AgentDesignSearch.DesignSearchOutput) {
    if (submitted) return;
    setSubmitted(true);
    onPick(toolCallId, output);
  }

  const disabled = busy || submitted;

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.currentTarget
      .querySelector<HTMLInputElement>('input[type="search"]')
      ?.blur();
    if (disabled) return;
    const current = explorerRef.current;
    const next = current.refine(draftQuery);
    setDraftQuery(next.query);
    if (next === current) return;

    // Publish the new revision to the async guard before React commits it, so a
    // page from the old query cannot win the event/effect timing gap.
    explorerRef.current = next;
    setExplorer(next);
    setItems([]);
    setCount(undefined);
    setSeeded(false);
    setError(false);
    setLoadingMore(false);
    loadingRef.current = false;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }

  function removeSelected(id: string) {
    if (disabled) return;
    const next = explorerRef.current.remove(id);
    explorerRef.current = next;
    setExplorer(next);
  }

  // Stable context identity so a scroll tick (setScrollTop/setIsScrolling fire
  // on every scroll frame) doesn't push a new value to every masonry cell and
  // defeat its memoization — only an actual selection/disabled change should.
  const selectionContext = useMemo(
    () => ({ explorer, toggle, disabled, focusFeedback }),
    [explorer, toggle, disabled, focusFeedback]
  );

  // TODO: Preserve per-query results before navigating selections from earlier
  // searches. For now, only thumbnails still present in `items` are navigable,
  // and Masonic's index helper scrolls to them immediately rather than smoothly.
  const resultIndexById = useMemo(
    () => new Map(items.map((item, index) => [item.id, index])),
    [items]
  );

  const grid = useMasonry<Pin>({
    positioner,
    resizeObserver,
    items,
    height: size.height,
    scrollTop,
    isScrolling,
    overscanBy: 2,
    itemKey: (data) => data.id,
    render: ReferenceCard,
    onRender: maybeLoadMore,
  });

  return (
    <div className="relative flex h-full w-full flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <form onSubmit={search} className="min-w-0 flex-1">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search the Library"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Search the Library"
              disabled={disabled}
              className="h-8 pl-8"
            />
          </div>
        </form>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto p-3 pb-24"
      >
        {error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-sm text-muted-foreground">
            <p>The library search failed.</p>
          </div>
        )}

        {!error && seeded && items.length === 0 && (
          <p className="py-20 text-center text-sm text-muted-foreground">
            No matching references. Try another search.
          </p>
        )}

        {!seeded && items.length === 0 && !error && (
          <div className="flex items-center justify-center py-20 text-xs text-muted-foreground">
            <Loader2Icon className="mr-2 size-4 animate-spin" />
            Searching the library…
          </div>
        )}

        <SelectionContext.Provider value={selectionContext}>
          {grid}
        </SelectionContext.Provider>

        {loadingMore && (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            <Loader2Icon className="mr-2 size-4 animate-spin" />
            Loading more…
          </div>
        )}
      </div>

      <SelectionBar
        pins={explorer.selectedPins}
        disabled={disabled}
        onRemove={removeSelected}
        onUse={() => submit({ picked: explorer.selectedPins })}
        resultIndexById={resultIndexById}
        onNavigate={navigateToResult}
      />
    </div>
  );
}

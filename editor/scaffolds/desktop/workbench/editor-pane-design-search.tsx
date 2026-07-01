/**
 * The dedicated **editor-pane** `design_search` picker — the artwork-station
 * gather+curate step, given room to breathe. The agent proposes a keyword and
 * pauses; the workbench auto-opens this as a virtual tab. The user browses a
 * large, staggered gallery of library references (multi-select) and commits the
 * picks (or skips), which resolves the paused tool call.
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
 */

"use client";

import {
  createContext,
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
  type LoadMoreItemsCallback,
} from "masonic";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import { CheckIcon, ImagesIcon, Loader2Icon } from "lucide-react";
import type { AgentDesignSearch } from "@grida/agent/tools/design-search";
import {
  DESIGN_SEARCH_PAGE,
  resolveDesignSearchPage,
} from "@/scaffolds/desktop/shared/design-search";
import {
  pickQuery,
  pickToolCallId,
  type DesignSearchSession,
} from "./design-search-tab";

type Pin = AgentDesignSearch.DesignSearchResult;

/** Inner padding of the scroll container, subtracted from its measured width so
 *  masonic's columns lay out within the padding box. */
const GRID_PAD = 12;

/** Selection passed to masonic-rendered cells via context (not props): masonic
 *  memoizes cells, but a consumed context still re-renders them on toggle. */
const SelectionContext = createContext<{
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  disabled: boolean;
}>({ selected: new Set(), toggle: () => {}, disabled: false });

/** One masonry cell — masonic passes `{ index, data, width }`; we size the cell
 *  to the pin's aspect ratio (no per-item measurement). */
function ReferenceCard({ data: pin, width }: { data: Pin; width: number }) {
  const { selected, toggle, disabled } = useContext(SelectionContext);
  const on = selected.has(pin.id);
  const aspect = pin.width && pin.height ? pin.width / pin.height : 1;
  const height = width / aspect;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => toggle(pin.id)}
      title={pin.title}
      style={{ width, height }}
      className={cn(
        "group relative block overflow-hidden rounded-lg border-2 transition",
        on ? "border-primary" : "border-transparent hover:border-border"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pin.url}
        alt={pin.title}
        loading="lazy"
        className="size-full object-cover"
      />
      {on && (
        <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
          <CheckIcon className="size-3.5" />
        </span>
      )}
    </button>
  );
}

export function EditorPaneDesignSearch({
  session,
}: {
  session: DesignSearchSession;
}) {
  const { entry, onPick, busy } = session;
  const toolCallId = pickToolCallId(entry);
  const query = pickQuery(entry);

  const [items, setItems] = useState<Pin[]>([]);
  const [count, setCount] = useState<number | undefined>(undefined);
  const [seeded, setSeeded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);

  const loadingRef = useRef(false);

  // Append a page, de-duped by id (a relevance window can repeat across ranges).
  const appendPage = useCallback((page: Pin[]) => {
    setItems((cur) => {
      const seen = new Set(cur.map((p) => p.id));
      return [...cur, ...page.filter((p) => !seen.has(p.id))];
    });
  }, []);

  // Seed the first page on a new pending call (new toolCallId) or new keyword.
  // masonic's loader can't pull page 0 (nothing renders from an empty grid), so
  // we fetch it; the loader pages from there.
  useEffect(() => {
    let live = true;
    setItems([]);
    setCount(undefined);
    setSeeded(false);
    setError(false);
    setSelected(new Set());
    setSubmitted(false);
    loadingRef.current = true;
    void resolveDesignSearchPage(query, [0, DESIGN_SEARCH_PAGE - 1])
      .then(({ items: page, count: total }) => {
        if (!live) return;
        setCount(total);
        appendPage(page);
      })
      .catch(() => {
        if (live) setError(true);
      })
      .finally(() => {
        if (live) setSeeded(true);
        loadingRef.current = false;
      });
    return () => {
      live = false;
    };
  }, [toolCallId, query, appendPage]);

  // Subsequent pages — masonic's infinite loader, mirroring the `/library`
  // gallery (inclusive `[start, stop - 1]` range; batch = page size).
  const maybeLoadMore = useInfiniteLoader<Pin, LoadMoreItemsCallback<Pin>>(
    async (startIndex, stopIndex) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoadingMore(true);
      try {
        const { items: page, count: total } = await resolveDesignSearchPage(
          query,
          [startIndex, stopIndex - 1]
        );
        setCount(total);
        appendPage(page);
      } catch {
        /* a transient page error just stops paging; the seed/grid stay. */
      } finally {
        loadingRef.current = false;
        setLoadingMore(false);
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

  const positioner = usePositioner({
    width: Math.max(0, size.width - GRID_PAD * 2),
    columnWidth: 180,
    columnGutter: 12,
    rowGutter: 12,
    maxColumnCount: 6,
  });
  const resizeObserver = useResizeObserver(positioner);

  const toggle = useCallback(
    (id: string) => {
      if (busy || submitted) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [busy, submitted]
  );

  function submit(output: AgentDesignSearch.DesignSearchOutput) {
    if (submitted) return;
    setSubmitted(true);
    onPick(toolCallId, output);
  }

  const disabled = busy || submitted;

  // Stable context identity so a scroll tick (setScrollTop/setIsScrolling fire
  // on every scroll frame) doesn't push a new value to every masonry cell and
  // defeat its memoization — only an actual selection/disabled change should.
  const selectionContext = useMemo(
    () => ({ selected, toggle, disabled }),
    [selected, toggle, disabled]
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
    <div className="flex h-full w-full flex-col bg-background">
      {/* Sticky action header — the brief + commit controls stay in reach while
          the gallery scrolls. */}
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
        <ImagesIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            Pick references{query ? ` for “${query}”` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {selected.size > 0
              ? `${selected.size} selected`
              : "Select the references that fit the brief."}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => submit({ picked: [], skipped: true })}
        >
          Skip
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || selected.size === 0}
          onClick={() =>
            submit({ picked: items.filter((p) => selected.has(p.id)) })
          }
        >
          Use {selected.size > 0 ? selected.size : ""} reference
          {selected.size === 1 ? "" : "s"}
        </Button>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        {error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-sm text-muted-foreground">
            <p>The library search failed.</p>
          </div>
        )}

        {!error && seeded && items.length === 0 && (
          <p className="py-20 text-center text-sm text-muted-foreground">
            No matching references. Skip, or ask for a different look.
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
    </div>
  );
}

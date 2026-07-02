"use client";

/**
 * The home's infinite reference gallery — the second way in (alongside typing).
 * Scrolls the curated Grida Library best-first (by score); each card's Add button
 * drops the pin into the composer's picked-references tray (multi-select).
 *
 * Same engine as the agent's `design_search` picker: **`masonic`**'s lower-level
 * `useMasonry`. But here the gallery is NOT its own scroll box — it shares the
 * home's single page scroll (the whole page scrolls as one; no nested scroll).
 * The desktop shell locks `<body>` to `h-svh overflow-hidden`, so the home owns
 * one `overflow-y-auto` container and passes it in as `scrollContainerRef`; the
 * gallery feeds masonic that container's `scrollTop` MINUS the gallery's own
 * offset within it (the composer sits above), so virtualization lines up with the
 * page scroll. Page 0 is seeded client-side (an empty grid renders
 * nothing, so the loader can't pull it); the loader pages from there. Library
 * pins stay URLs — nothing is downloaded; the picked url rides straight into the
 * seeded board.
 *
 * Picking is a **toggle into the composer** (multi-select) via each card's Add
 * button, revealed on hover: it adds the pin to the home's picked-references tray
 * (Added → click to remove), so the user can gather several references before
 * starting one board from all of them. The card body itself is intentionally
 * NOT the add target — clicking it will later open a details / similar-images
 * view (planned), so only the Add button mutates the tray today. The pick handler
 * + selected-set ride a context so masonic's memoized cells stay stable.
 */

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  useInfiniteLoader,
  useMasonry,
  usePositioner,
  useResizeObserver,
  type LoadMoreItemsCallback,
} from "masonic";
import { CheckIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";
import type { AgentDesignSearch } from "@grida/agent/tools/design-search";
import {
  DESIGN_SEARCH_PAGE,
  resolveDesignBrowsePage,
} from "@/scaffolds/desktop/shared/design-search";

type Pin = AgentDesignSearch.DesignSearchResult;

/** Stop paging past this many thumbnails — the home gallery is a starting point,
 *  not the full library browser, and unbounded DOM would bloat the page. */
const MAX_ITEMS = 300;

/** Pick handler + selected-set passed to masonic-rendered cells via context
 *  (masonic memoizes cells, so a per-render closure would defeat it). */
const PickContext = createContext<{
  onPick: (pin: Pin) => void;
  selectedIds: Set<string>;
  disabled: boolean;
}>({ onPick: () => {}, selectedIds: new Set(), disabled: false });

/** One masonry cell — masonic passes `{ data, width }`; we size to the pin's
 *  aspect ratio (no per-item measurement). The card body is a plain container
 *  (its click is reserved for a future details view); only the hover-revealed
 *  Add button toggles the pick. A selected cell gets a primary ring, and its Add
 *  button stays visible as "Added" so multi-select is legible. */
function ReferenceCard({ data: pin, width }: { data: Pin; width: number }) {
  const { onPick, selectedIds, disabled } = useContext(PickContext);
  const selected = selectedIds.has(pin.id);
  const aspect = pin.width && pin.height ? pin.width / pin.height : 1;
  const height = width / aspect;
  return (
    <div
      title={pin.title}
      style={{ width, height }}
      className={cn(
        "group relative block overflow-hidden rounded-lg border-2 transition",
        selected
          ? "border-primary ring-2 ring-primary/40"
          : "border-transparent"
      )}
    >
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
      {/* Add / Added toggle — revealed on hover; stays put once added so a second
          click removes it. The ONLY add target (card click is reserved for a
          planned details / similar-images view). */}
      <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={() => onPick(pin)}
        title={selected ? "Remove from composer" : "Add to composer"}
        className={cn(
          "absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium shadow transition disabled:opacity-50",
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-background/90 text-foreground opacity-0 hover:bg-background group-hover:opacity-100 focus-visible:opacity-100"
        )}
      >
        {selected ? (
          <>
            <CheckIcon className="size-3.5" />
            Added
          </>
        ) : (
          <>
            <PlusIcon className="size-3.5" />
            Add
          </>
        )}
      </button>
    </div>
  );
}

/** `memo`-wrapped: the home page re-renders on every composer keystroke/resize
 *  (`heroHeight`, `docked`, picker state…), and all props here are already
 *  referentially stable — so the up-to-300-cell masonry only re-renders on a
 *  real pick/selection change. */
export const ReferenceGallery = memo(function ReferenceGallery({
  onPick,
  selectedIds,
  disabled = false,
  scrollContainerRef,
}: {
  onPick: (pin: Pin) => void;
  /** Ids currently in the composer's picked-references tray — selected cells
   *  render a check badge so multi-select reads at a glance. */
  selectedIds: Set<string>;
  disabled?: boolean;
  /** The home's single page-scroll container — the gallery virtualizes against
   *  it (offset by the content above) instead of owning its own scroll. */
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
  const [items, setItems] = useState<Pin[]>([]);
  const [count, setCount] = useState<number | undefined>(undefined);
  const [seeded, setSeeded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const loadingRef = useRef(false);

  // Append a page, de-duped by id (score order is stable, but guard anyway).
  const appendPage = useCallback((page: Pin[]) => {
    setItems((cur) => {
      const seen = new Set(cur.map((p) => p.id));
      return [...cur, ...page.filter((p) => !seen.has(p.id))];
    });
  }, []);

  // Seed page 0 (masonic's loader can't pull it from an empty grid).
  useEffect(() => {
    let live = true;
    loadingRef.current = true;
    void resolveDesignBrowsePage([0, DESIGN_SEARCH_PAGE - 1])
      .then(({ items: page, count: total }) => {
        if (!live) return;
        setCount(total);
        appendPage(page);
      })
      .catch(() => {
        if (live) setError(true);
      })
      .finally(() => {
        if (live) {
          setSeeded(true);
          loadingRef.current = false;
        }
      });
    return () => {
      live = false;
    };
  }, [appendPage]);

  const maybeLoadMore = useInfiniteLoader<Pin, LoadMoreItemsCallback<Pin>>(
    async (startIndex, stopIndex) => {
      if (loadingRef.current || items.length >= MAX_ITEMS) return;
      loadingRef.current = true;
      setLoadingMore(true);
      try {
        const { items: page, count: total } = await resolveDesignBrowsePage([
          startIndex,
          stopIndex - 1,
        ]);
        setCount(total);
        appendPage(page);
      } catch {
        /* a transient page error just stops paging; the grid stays */
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

  // ── share the page's scroll: feed masonic the container's scrollTop minus
  //    this grid's offset within it (the composer sits above) ──
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [offsetTop, setOffsetTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollStop = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Distance from the top of the container's scrollable content to this grid —
  // scroll-invariant, so it also self-corrects if the content above reflows.
  const measureOffset = useCallback(() => {
    const container = scrollContainerRef.current;
    const wrap = wrapRef.current;
    if (!container || !wrap) return;
    const cRect = container.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();
    setOffsetTop(wRect.top - cRect.top + container.scrollTop);
    setWidth(wrap.clientWidth);
    setViewportH(container.clientHeight);
  }, [scrollContainerRef]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const wrap = wrapRef.current;
    if (!container || !wrap) return;
    measureOffset();
    // Scroll only moves the viewport: update scrollTop + the isScrolling flag.
    // offset/width/viewportH are scroll-invariant, so they're re-measured ONLY on
    // reflow (the ResizeObserver below) — not per scroll frame, which would force
    // two extra getBoundingClientRect reflows on every tick.
    const onScroll = () => {
      setScrollTop(container.scrollTop);
      setIsScrolling(true);
      if (scrollStop.current) clearTimeout(scrollStop.current);
      scrollStop.current = setTimeout(() => setIsScrolling(false), 120);
    };
    const ro = new ResizeObserver(measureOffset);
    ro.observe(container);
    ro.observe(wrap);
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      container.removeEventListener("scroll", onScroll);
    };
  }, [scrollContainerRef, measureOffset]);

  const positioner = usePositioner({
    width: Math.max(0, width),
    columnWidth: 180,
    columnGutter: 12,
    rowGutter: 12,
    maxColumnCount: 6,
  });
  const resizeObserver = useResizeObserver(positioner);

  // Stable context identity so a scroll tick doesn't push a new value to every
  // masonry cell and defeat memoization — only a real pick/selection/disabled
  // change should.
  const pickContext = useMemo(
    () => ({ onPick, selectedIds, disabled }),
    [onPick, selectedIds, disabled]
  );

  const grid = useMasonry<Pin>({
    positioner,
    resizeObserver,
    items,
    height: viewportH,
    scrollTop: Math.max(0, scrollTop - offsetTop),
    isScrolling,
    overscanBy: 2,
    itemKey: (data) => data.id,
    render: ReferenceCard,
    onRender: maybeLoadMore,
  });

  return (
    <div ref={wrapRef}>
      {error && items.length === 0 && (
        <p className="py-10 text-center text-xs text-muted-foreground">
          Couldn’t load references.
        </p>
      )}

      {!seeded && items.length === 0 && !error && (
        <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          Loading references…
        </div>
      )}

      <PickContext.Provider value={pickContext}>{grid}</PickContext.Provider>

      {loadingMore && (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          Loading more…
        </div>
      )}
    </div>
  );
});

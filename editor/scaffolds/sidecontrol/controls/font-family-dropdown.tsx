import React, { createContext } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@app/ui/components/command";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui-editor/native-select";
import { CheckIcon } from "@radix-ui/react-icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@app/ui/lib/utils";
import type { GoogleWebFontListItem } from "@grida/fonts/google";
import * as google from "@grida/fonts/google";

// ---------------------------------------------------------------------------
// Editor-agnostic font-family picker internals.
//
// This module holds the *core* of the font picker — the virtualized,
// searchable list (`FontFamilyDropdown`), its preview/item presentational
// helpers, and the font-list context — with ZERO editor binding. It does not
// import `@/grida-canvas-react` (or any editor), so it can be reused by any
// host: the canvas inspector's `FontFamilyControl` wraps it with the canvas
// editor's async preview lifecycle; the SVG editor demo wraps it with a plain
// `set_property` commit. Promoting it here keeps both hosts on ONE dropdown
// rather than a full-featured one and a lesser copy.
// ---------------------------------------------------------------------------

const FontFamilyListContext = createContext<GoogleWebFontListItem[]>([]);

export function FontFamilyListProvider({
  children,
  fonts,
}: React.PropsWithChildren<{ fonts: GoogleWebFontListItem[] }>) {
  return (
    <FontFamilyListContext.Provider value={fonts}>
      {children}
    </FontFamilyListContext.Provider>
  );
}

export function useFontFamilyList() {
  return React.useContext(FontFamilyListContext);
}

// ---------------------------------------------------------------------------
// Shared presentational helpers
// ---------------------------------------------------------------------------

function GoogleFontsPreview({
  fontFamily,
  className,
}: {
  fontFamily: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-font-family={fontFamily}
      src={google.svglink(google.familyid(fontFamily))}
      alt={fontFamily}
      className={cn("dark:invert", className)}
    />
  );
}

function FontFamilyItem({
  fontFamily,
  selected,
}: {
  fontFamily: string;
  selected: boolean;
}) {
  return (
    <>
      <CheckIcon
        className={cn("size-4 min-w-4", selected ? "opacity-100" : "opacity-0")}
      />
      <GoogleFontsPreview fontFamily={fontFamily} className="h-5" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Font list filtering
// ---------------------------------------------------------------------------

type FontCategory =
  | "all-fonts"
  | "popular"
  | "with-axes"
  | "non-variable"
  | "used-in-document";

function useFilteredFontFamilies(
  fonts: GoogleWebFontListItem[],
  usedFonts: string[],
  popularFonts: string[],
  category: FontCategory,
  query: string | undefined
) {
  const availableFontSet = React.useMemo(
    () => new Set(fonts.map((f) => f.family)),
    [fonts]
  );

  return React.useMemo(() => {
    let result: string[];

    switch (category) {
      case "popular":
        result = popularFonts.filter((name) => availableFontSet.has(name));
        break;
      case "with-axes":
        result = fonts
          .filter((f) => f.axes && f.axes.length > 0)
          .map((f) => f.family);
        break;
      case "non-variable":
        result = fonts
          .filter((f) => !f.axes || f.axes.length === 0)
          .map((f) => f.family);
        break;
      case "used-in-document":
        result = fonts
          .filter((f) => usedFonts.includes(f.family))
          .map((f) => f.family);
        break;
      case "all-fonts":
      default:
        result = fonts.map((f) => f.family);
    }

    if (!query) return result;
    const q = query.toLowerCase();
    return result.filter((f) => f.toLowerCase().includes(q));
  }, [fonts, usedFonts, category, popularFonts, availableFontSet, query]);
}

// ---------------------------------------------------------------------------
// FontFamilyDropdown — the inner virtualized list with search
// ---------------------------------------------------------------------------

/**
 * Purpose-built virtualized font picker dropdown.
 *
 * Owns the search input, category filter, and virtualised command list.
 * Reports highlight changes (hover/keyboard) via `onHighlighted` and
 * selection via `onSelect`.
 *
 * The scroll-to-selected behaviour runs only on initial mount so it does
 * not fight with subsequent keyboard/mouse scrolling.
 */
export function FontFamilyDropdown({
  fonts,
  usedFonts,
  popularFonts,
  selectedFontFamily,
  committedFontFamily,
  onHighlighted,
  onSelect,
  listId,
}: {
  fonts: GoogleWebFontListItem[];
  usedFonts: string[];
  popularFonts: string[];
  /** Current (live) font family — used for the check indicator when no preview is active */
  selectedFontFamily: string;
  // `committedFontFamily` + `onHighlighted` are the hover-preview contract:
  // the Canvas wrapper (`FontFamilyControl`) drives a live preview as the
  // highlight moves and shows the check against the committed value. A
  // commit-on-pick host with no preview (e.g. the SVG demo) passes
  // `committedFontFamily={null}` and omits `onHighlighted` — both are inert.
  /** Committed font family — the value at the time the popover opened. Used for the check indicator during preview. */
  committedFontFamily: string | null;
  onHighlighted?: (fontFamily: string | null) => void;
  onSelect?: (fontFamily: string) => void;
  listId?: string;
}) {
  const [searchValue, setSearchValue] = React.useState(selectedFontFamily);
  const [query, setQuery] = React.useState<string | undefined>(undefined);
  const [category, setCategory] = React.useState<FontCategory>("all-fonts");

  // Track whether the user has started typing — controls search vs display mode.
  const isTypingRef = React.useRef(false);

  const filteredFontFamilies = useFilteredFontFamilies(
    fonts,
    usedFonts,
    popularFonts,
    category,
    query
  );

  // Category-label counts in one memoized pass — the catalog is ~1900 items,
  // so the prior inline `fonts.filter(...).length` ×3 in JSX (plus an O(n²)
  // `usedFonts.includes` per font) re-scanned the list on every render
  // (every keystroke while the popover is open). One loop, a `Set` for
  // membership, recomputed only when `fonts` / `usedFonts` change.
  const categoryCounts = React.useMemo(() => {
    const used = new Set(usedFonts);
    let variable = 0;
    let nonVariable = 0;
    let inFile = 0;
    for (const f of fonts) {
      if (f.axes && f.axes.length > 0) variable++;
      else nonVariable++;
      if (used.has(f.family)) inFile++;
    }
    return { total: fonts.length, variable, nonVariable, inFile };
  }, [fonts, usedFonts]);

  const parentRef = React.useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns functions that React Compiler cannot memoize safely.
  const virtualizer = useVirtualizer({
    count: filteredFontFamilies.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Scroll to the selected font once on initial mount only.
  const didInitialScroll = React.useRef(false);
  React.useLayoutEffect(() => {
    if (didInitialScroll.current) return;
    const selectedIndex = filteredFontFamilies.findIndex(
      (f) => f === selectedFontFamily
    );
    if (selectedIndex !== -1) {
      virtualizer.scrollToIndex(selectedIndex, { align: "center" });
      didInitialScroll.current = true;
    }
  }, [selectedFontFamily, filteredFontFamilies, virtualizer]);

  // --- Highlight tracking via DOM observation (cmdk uses data-selected) ---
  // We track the highlighted value ourselves so that:
  //  1. We can debounce / gate it (don't fire on initial mount).
  //  2. We avoid useAutoFocusSelect entirely.

  const hasInteractedRef = React.useRef(false);
  const lastReportedRef = React.useRef<string | null>(null);

  const syncHighlighted = React.useCallback(() => {
    // Skip until the user has actually interacted (pointer move or key press)
    if (!hasInteractedRef.current) return;

    requestAnimationFrame(() => {
      const active =
        parentRef.current?.querySelector<HTMLElement>(`[data-selected=true]`);
      const value = active?.getAttribute("data-value") ?? null;
      if (value !== lastReportedRef.current) {
        lastReportedRef.current = value;
        onHighlighted?.(value);
      }
    });
  }, [onHighlighted]);

  const handleInteraction = React.useCallback(() => {
    hasInteractedRef.current = true;
    syncHighlighted();
  }, [syncHighlighted]);

  // --- Search input handling ---
  const handleSearch = React.useCallback((value: string) => {
    setSearchValue(value);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
    }
    setQuery(value);
  }, []);

  // Auto-focus + select-all the input on mount so the user can immediately
  // type to search while seeing the current font name as the default text.
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const el =
        inputRef.current ??
        (document.querySelector(
          '[data-slot="command-input"]'
        ) as HTMLInputElement | null);
      if (el) {
        el.focus();
        el.select();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // The font to display a check next to. During preview the committed
  // value is shown; otherwise the live selected value.
  const checkedFamily = committedFontFamily ?? selectedFontFamily;

  return (
    <Command
      shouldFilter={false}
      onKeyDown={handleInteraction}
      onPointerMove={handleInteraction}
    >
      <CommandInput
        value={searchValue}
        onValueChange={handleSearch}
        placeholder="Font"
      />
      <div className="border-b p-1">
        <div className="w-full [&>div]:w-full">
          <NativeSelect
            size="xs"
            value={category}
            onChange={(e) => setCategory(e.target.value as FontCategory)}
            className="w-full"
          >
            <NativeSelectOption value="all-fonts">
              All fonts ({categoryCounts.total})
            </NativeSelectOption>
            <NativeSelectOption value="popular">Popular</NativeSelectOption>
            <NativeSelectOption value="with-axes">
              Variable fonts ({categoryCounts.variable})
            </NativeSelectOption>
            <NativeSelectOption value="non-variable">
              Non variable fonts ({categoryCounts.nonVariable})
            </NativeSelectOption>
            <NativeSelectOption value="used-in-document">
              In this file ({categoryCounts.inFile})
            </NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
      {query && filteredFontFamilies.length > 0 && (
        <div className="px-2 py-1 text-xs text-muted-foreground border-b">
          {filteredFontFamilies.length} font
          {filteredFontFamilies.length !== 1 ? "s" : ""} found
        </div>
      )}
      <CommandEmpty>No font found.</CommandEmpty>
      <CommandGroup
        ref={parentRef}
        style={{
          height: 400,
          width: "100%",
          overflow: "auto",
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          <CommandList id={listId}>
            {virtualItems.map((virtualItem) => {
              const fontFamily = filteredFontFamilies[virtualItem.index];
              return (
                <CommandItem
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  title={fontFamily}
                  key={fontFamily}
                  value={fontFamily}
                  onSelect={onSelect}
                >
                  <FontFamilyItem
                    fontFamily={fontFamily}
                    selected={checkedFamily === fontFamily}
                  />
                </CommandItem>
              );
            })}
          </CommandList>
        </div>
      </CommandGroup>
    </Command>
  );
}

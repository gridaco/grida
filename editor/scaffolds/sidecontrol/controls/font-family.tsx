import React, { createContext } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui-editor/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WorkbenchUI } from "@/components/workbench";
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useGridaFontsSearch } from "@/hooks/use-grida-fonts-search";
import { cn } from "@/components/lib/utils";
import grida from "@grida/schema";
import { type GoogleWebFontListItem } from "@grida/fonts/google";
import * as google from "@grida/fonts/google";
import {
  useCurrentEditor,
  useEditorState as useCanvasEditorState,
} from "@/grida-canvas-react";
import type { TMixed } from "./utils/types";

// ---------------------------------------------------------------------------
// Context — font list provider (unchanged)
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

function useFontFamilyList() {
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
function FontFamilyDropdown({
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
              All fonts ({fonts.length})
            </NativeSelectOption>
            <NativeSelectOption value="popular">Popular</NativeSelectOption>
            <NativeSelectOption value="with-axes">
              Variable fonts (
              {fonts.filter((f) => f.axes && f.axes.length > 0).length})
            </NativeSelectOption>
            <NativeSelectOption value="non-variable">
              Non variable fonts (
              {fonts.filter((f) => !f.axes || f.axes.length === 0).length})
            </NativeSelectOption>
            <NativeSelectOption value="used-in-document">
              In this file (
              {fonts.filter((f) => usedFonts.includes(f.family)).length})
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

// ---------------------------------------------------------------------------
// FontFamilyControl — the public, purpose-built control
// ---------------------------------------------------------------------------

/**
 * Purpose-built font-family picker with async preview support.
 *
 * Unlike other property controls that use the generic `PropertyEnumV2` +
 * `usePropertyPreview` combo, font-family requires special treatment:
 *
 * 1. **Async apply** — loading a font involves network fetches; the preview
 *    snapshot must only be captured after the font is loaded.
 * 2. **Virtualised list** — 1600+ Google Fonts need virtualisation.
 * 3. **No eager preview** — opening the picker must NOT trigger a preview.
 *    Preview only starts on the first actual hover/keyboard highlight.
 * 4. **Stable scroll** — the initial scroll-to-selected must not conflict
 *    with subsequent user scrolling.
 *
 * The component owns the full preview lifecycle internally so consumers only
 * need to provide the target `selection` (node ids).
 */
export function FontFamilyControl({
  id,
  value,
  selection,
}: {
  id?: string;
  value?: TMixed<string>;
  /** Node IDs to apply the font-family change to */
  selection: string[];
}) {
  const editor = useCurrentEditor();
  const list = useFontFamilyList();
  const usedFonts = useCanvasEditorState(editor, (state) =>
    state.fontfaces.map((f) => f.family)
  );
  const { fonts: popularFontsData } = useGridaFontsSearch({
    sort: "popular",
    limit: 100,
  });
  const popularFonts = React.useMemo(
    () => popularFontsData.map((f) => f.family),
    [popularFontsData]
  );

  const mixed = value === grida.mixed;
  const displayValue = mixed ? "" : ((value as string) ?? "");
  const [open, setOpen] = React.useState(false);
  const listId = id ? `${id}-list` : "font-family-combobox-list";

  // --- Preview lifecycle state ---
  // Preview is lazy: we don't call previewStart on open, only on the first
  // seek so that merely opening the picker has zero side effects.
  const previewActiveRef = React.useRef(false);
  const committedRef = React.useRef<string | null>(null);
  const [committedValue, setCommittedValue] = React.useState<string | null>(
    null
  );
  const seekGenRef = React.useRef(0);

  const ensurePreviewStarted = React.useCallback(() => {
    if (previewActiveRef.current) return;
    previewActiveRef.current = true;
    committedRef.current = displayValue;
    setCommittedValue(displayValue);
    editor.doc.previewStart("font-family");
  }, [editor, displayValue]);

  const handleHighlighted = React.useCallback(
    (fontFamily: string | null) => {
      const gen = ++seekGenRef.current;
      if (fontFamily == null) {
        // Unhovered — revert to committed if preview is active
        if (!previewActiveRef.current || committedRef.current == null) return;
        const revertTo = committedRef.current;
        void Promise.all(
          selection.map((id) =>
            editor.changeTextNodeFontFamilySync(id, revertTo)
          )
        ).then(() => {
          if (gen === seekGenRef.current && previewActiveRef.current) {
            editor.doc.previewSet();
          }
        });
        return;
      }

      // First real seek — lazily start the preview session
      ensurePreviewStarted();

      void Promise.all(
        selection.map((id) =>
          editor.changeTextNodeFontFamilySync(id, fontFamily)
        )
      ).then(() => {
        if (gen === seekGenRef.current && previewActiveRef.current) {
          editor.doc.previewSet();
        }
      });
    },
    [editor, selection, ensurePreviewStarted]
  );

  const handleSelect = React.useCallback(
    (fontFamily: string) => {
      const gen = ++seekGenRef.current;

      // If no preview was active yet (user clicked directly without hovering),
      // start a preview so the commit produces a clean undo entry.
      ensurePreviewStarted();

      void Promise.all(
        selection.map((id) =>
          editor.changeTextNodeFontFamilySync(id, fontFamily)
        )
      ).then(() => {
        if (gen === seekGenRef.current) {
          editor.doc.previewCommit();
        }
      });

      // Reset preview state
      previewActiveRef.current = false;
      committedRef.current = null;
      setCommittedValue(null);
      seekGenRef.current++;
      setOpen(false);
    },
    [editor, selection, ensurePreviewStarted]
  );

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        // Closing without selection — discard if a preview was active
        if (previewActiveRef.current) {
          seekGenRef.current++;
          editor.doc.previewDiscard();
          previewActiveRef.current = false;
          committedRef.current = null;
          setCommittedValue(null);
        }
      }
    },
    [editor]
  );

  return (
    <Popover modal={false} open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          className={cn(
            "flex w-full justify-between items-center overflow-hidden",
            WorkbenchUI.inputVariants({ size: "xs" })
          )}
        >
          <span className="line-clamp-1 text-left">
            {mixed ? "mixed" : value || "Font"}
          </span>
          <CaretSortIcon className="ml-2 size-4 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        side="right"
        align="start"
        collisionPadding={8}
      >
        <FontFamilyDropdown
          fonts={list}
          usedFonts={usedFonts}
          popularFonts={popularFonts}
          selectedFontFamily={displayValue}
          committedFontFamily={committedValue}
          onHighlighted={handleHighlighted}
          onSelect={handleSelect}
          listId={listId}
        />
      </PopoverContent>
    </Popover>
  );
}

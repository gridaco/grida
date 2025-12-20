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
import { useValueSeekedSelector } from "@/hooks/use-value-seeked-selector";
import { useAutoFocusSelect } from "@/hooks/use-auto-focus-select";
import { useGridaFontsSearch } from "@/hooks/use-grida-fonts-search";
import { cn } from "@/components/lib/utils";
import { TMixed } from "./utils/types";
import grida from "@grida/schema";
import { type GoogleWebFontListItem } from "@grida/fonts/google";
import * as google from "@grida/fonts/google";
import {
  useCurrentEditor,
  useEditorState as useCanvasEditorState,
} from "@/grida-canvas-react";

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

function FontFamilyCommand({
  height,
  fonts,
  usedFonts,
  popularFonts,
  placeholder,
  selectedFontFamily,
  onSelectFontFamily,
  onValueSeeked,
}: {
  height: string | number;
  fonts: GoogleWebFontListItem[];
  usedFonts: string[];
  popularFonts?: string[];
  placeholder: string;
  selectedFontFamily: string;
  onSelectFontFamily?: (fontFamily: string) => void;
  onValueSeeked?: (fontFamily: string | null) => void;
}) {
  const {
    value: displayValue,
    query,
    handleInputChange,
    handleFocus,
    handleBlur,
    handleKeyDown,
  } = useAutoFocusSelect({
    initialValue: selectedFontFamily,
    autoFocus: true,
    onQueryChange: (query) => {
      // This will be handled by the CommandInput's onValueChange
    },
  });

  const [category, setCategory] = React.useState<
    "all-fonts" | "popular" | "with-axes" | "non-variable" | "used-in-document"
  >("all-fonts");

  const availableFontSet = React.useMemo(
    () => new Set(fonts.map((f) => f.family)),
    [fonts]
  );

  const filteredFontFamilies = React.useMemo(() => {
    let result: string[];

    switch (category) {
      case "popular":
        result = (popularFonts || []).filter((name) =>
          availableFontSet.has(name)
        );
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

  const parentRef = React.useRef<HTMLDivElement>(null);
  const { sync } = useValueSeekedSelector(parentRef, onValueSeeked, "selected");

  const virtualizer = useVirtualizer({
    count: filteredFontFamilies.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  React.useLayoutEffect(() => {
    const selectedIndex = filteredFontFamilies.findIndex(
      (fontFamily) => fontFamily === selectedFontFamily
    );
    if (selectedIndex !== -1) {
      virtualizer.scrollToIndex(selectedIndex, { align: "center" });
    }
  }, [selectedFontFamily, filteredFontFamilies, virtualizer]);

  const handleSearch = (value: string) => {
    handleInputChange(value);
  };

  return (
    <Command shouldFilter={false} onKeyDown={sync} onPointerMove={sync}>
      <CommandInput
        value={displayValue}
        onValueChange={handleSearch}
        placeholder={placeholder}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      <div className="border-b p-1">
        <div className="w-full [&>div]:w-full">
          <NativeSelect
            size="xs"
            value={category}
            onChange={(e) => setCategory(e.target.value as any)}
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
          height: height,
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
          <CommandList>
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
                  onSelect={onSelectFontFamily}
                >
                  <FontFamilyItem
                    fontFamily={fontFamily}
                    selected={selectedFontFamily === fontFamily}
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

export function FontFamilyControl({
  value,
  onValueChange,
  onValueSeeked,
}: {
  value?: TMixed<string>;
  onValueChange?: (value: string) => void;
  onValueSeeked?: (value: string | null) => void;
}) {
  const list = useFontFamilyList();
  const editor = useCurrentEditor();
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
  const [open, setOpen] = React.useState<boolean>(false);

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
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
        <FontFamilyCommand
          height="400px"
          fonts={list}
          usedFonts={usedFonts}
          popularFonts={popularFonts}
          placeholder="Font"
          selectedFontFamily={mixed ? "" : value || ""}
          onValueSeeked={onValueSeeked}
          onSelectFontFamily={(currentValue) => {
            onValueChange?.(currentValue === value ? "" : currentValue);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  placeholder,
  selectedFontFamily,
  onSelectFontFamily,
  onValueSeeked,
}: {
  height: string | number;
  fonts: GoogleWebFontListItem[];
  usedFonts: string[];
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
    "all-fonts" | "with-axes" | "non-variable" | "used-in-document"
  >("all-fonts");

  const categoryFilteredFontFamilies = React.useMemo(() => {
    switch (category) {
      case "with-axes":
        return fonts
          .filter((f) => f.axes && f.axes.length > 0)
          .map((f) => f.family);
      case "non-variable":
        return fonts
          .filter((f) => !f.axes || f.axes.length === 0)
          .map((f) => f.family);
      case "used-in-document":
        return fonts
          .filter((f) => usedFonts.includes(f.family))
          .map((f) => f.family);
      case "all-fonts":
      default:
        return fonts.map((f) => f.family);
    }
  }, [fonts, usedFonts, category]);

  const filteredFontFamilies = React.useMemo(() => {
    const searchQuery = query?.toLowerCase() || "";
    return searchQuery
      ? categoryFilteredFontFamilies.filter((fontFamily) =>
          fontFamily.toLowerCase().includes(searchQuery)
        )
      : categoryFilteredFontFamilies;
  }, [categoryFilteredFontFamilies, query]);

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
        <Select value={category} onValueChange={setCategory as any}>
          <SelectTrigger
            className={cn(
              WorkbenchUI.selectVariants({ variant: "trigger", size: "sm" }),
              "w-full"
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-fonts">All fonts</SelectItem>
            <SelectItem value="with-axes">Variable fonts</SelectItem>
            <SelectItem value="non-variable">Non variable fonts</SelectItem>
            <SelectItem value="used-in-document">In this file</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
  const mixed = value === grida.mixed;
  const [open, setOpen] = React.useState<boolean>(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent className="p-0" side="right" align="start">
        <FontFamilyCommand
          height="400px"
          fonts={list}
          usedFonts={usedFonts}
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

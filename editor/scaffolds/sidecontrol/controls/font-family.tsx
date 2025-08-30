import {
  ItemRendererProps,
  VirtualizedCombobox,
} from "@/components/ui/virtualized-combobox";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { CheckIcon } from "@radix-ui/react-icons";
import React, { createContext } from "react";
import { TMixed } from "./utils/types";
import grida from "@grida/schema";
import { type GoogleWebFontListItem } from "@grida/fonts/google";
import * as google from "@grida/fonts/google";

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

function Item({ option, selected }: ItemRendererProps) {
  return (
    <>
      <CheckIcon
        className={cn("size-4 min-w-4", selected ? "opacity-100" : "opacity-0")}
      />
      <GoogleFontsPreview fontFamily={option.value} className="h-5" />
    </>
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

  const mixed = value === grida.mixed;

  return (
    <VirtualizedCombobox
      value={mixed ? "" : value}
      placeholder={mixed ? "mixed" : "Font"}
      onValueChange={onValueChange}
      onValueSeeked={onValueSeeked}
      renderer={Item}
      options={list.map((i) => i.family)}
      side="right"
      align="start"
      className={cn(
        "overflow-hidden",
        WorkbenchUI.inputVariants({ size: "xs" })
      )}
    />
  );
}

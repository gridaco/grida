import { GoogleFontsPreview } from "@/grida-canvas/components/google-fonts";
import { fonts } from "@/grida-canvas/k/fonts.min";
import {
  ItemRendererProps,
  VirtualizedCombobox,
} from "@/components/ui/virtualized-combobox";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/utils";
import { CheckIcon } from "@radix-ui/react-icons";
import React, { createContext } from "react";

interface FontFamilyInfo {
  family: string;
  provider: "fonts.google.com";
}

const FontFamilyListContext = createContext<FontFamilyInfo[]>(fonts);

export function FontFamilyListProvider({
  children,
  fonts,
}: React.PropsWithChildren<{ fonts: FontFamilyInfo[] }>) {
  return (
    <FontFamilyListContext.Provider value={fonts}>
      {children}
    </FontFamilyListContext.Provider>
  );
}

function useFontFamilyList() {
  return React.useContext(FontFamilyListContext);
}

function Item({ option, selected }: ItemRendererProps) {
  return (
    <>
      <CheckIcon
        className={cn(
          "mr-2 h-4 w-4 min-w-4",
          selected ? "opacity-100" : "opacity-0"
        )}
      />
      <GoogleFontsPreview fontFamily={option.value} className="h-3" />
    </>
  );
}

export function FontFamilyControl({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const list = useFontFamilyList();

  return (
    <VirtualizedCombobox
      value={value}
      onValueChange={onValueChange}
      renderer={Item}
      options={list.map((i) => i.family)}
      width={320}
      side="right"
      align="start"
      className={cn(
        "overflow-hidden",
        WorkbenchUI.inputVariants({ size: "sm" })
      )}
    />
  );
}

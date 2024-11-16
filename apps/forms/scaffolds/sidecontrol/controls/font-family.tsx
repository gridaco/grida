import { GoogleFontsPreview } from "@/builder/components/google-fonts";
import { fonts } from "@/builder/k/fonts.min";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkbenchUI } from "@/components/workbench";
import React, { createContext, useEffect, useState } from "react";

interface FontFamilyInfo {
  name: string;
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

export function FontFamilyControl({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const list = useFontFamilyList();

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={WorkbenchUI.inputVariants({ size: "sm" })}>
        <SelectValue
          placeholder="Select"
          className="overflow-hidden text-ellipsis"
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="inherit">Default</SelectItem>
        {list.map((font) => (
          <SelectItem key={font.name} value={font.name}>
            <GoogleFontsPreview fontFamily={font.name}>
              {font.name}
            </GoogleFontsPreview>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

import { fonts } from "@/builder/k/fonts.min";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
        <SelectValue className="overflow-hidden text-ellipsis" />
      </SelectTrigger>
      <SelectContent>
        {list.map((font) => (
          <SelectItem key={font.name} value={font.name}>
            <GoogleFontView fontFamily={font.name}>{font.name}</GoogleFontView>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function GoogleFontView({
  fontFamily,
  fontWeight,
  children = <>Ag</>,
}: React.PropsWithChildren<{
  fontFamily: React.CSSProperties["fontFamily"];
  fontWeight?: React.CSSProperties["fontWeight"];
}>) {
  const [fontLoaded, setFontLoaded] = useState(false);

  useEffect(() => {
    // Load the font dynamically using the Google Fonts API
    const link = document.createElement("link");
    const href = `https://fonts.googleapis.com/css2?family=${fontFamily!.replace(
      " ",
      "+"
    )}:wght@400&display=swap`;
    // console.log(href);
    link.href = href;
    link.rel = "stylesheet";
    document.head.appendChild(link);

    link.onload = () => {
      setFontLoaded(true);
    };

    return () => {
      document.head.removeChild(link);
    };
  }, [fontFamily]);

  return (
    <span
      style={{
        fontFamily,
        fontWeight,
      }}
    >
      {children}
    </span>
  );
}

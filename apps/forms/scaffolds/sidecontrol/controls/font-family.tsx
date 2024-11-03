import { WorkbenchUI } from "@/components/workbench";
import React, { createContext } from "react";

const FontFamilyListContext = createContext<string[]>([]);

export function FontFamilyListProvider({
  children,
  fonts,
}: React.PropsWithChildren<{ fonts: string[] }>) {
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
    <div className={WorkbenchUI.inputVariants({ size: "sm" })}>{value}</div>
  );
}

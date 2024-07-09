"use client";

import palettes from "@/theme/palettes";
import useVariablesCSS from "../playground/use-variables-css";
import { stringfyThemeVariables } from "@/theme/palettes/utils";
import { FormStyleSheetV1Schema } from "@/types";

export function PaletteProvider({
  palette,
  children,
}: React.PropsWithChildren<{
  palette?: FormStyleSheetV1Schema["palette"];
}>) {
  useVariablesCSS(
    palette ? stringfyThemeVariables(palettes[palette] as any) : undefined
  );

  return <>{children}</>;
}

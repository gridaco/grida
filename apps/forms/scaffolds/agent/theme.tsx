"use client";

import React from "react";
import palettes from "@/theme/palettes";
import useVariablesCSS from "../playground/use-variables-css";
import { stringfyThemeVariables } from "@/theme/palettes/utils";
import { FormStyleSheetV1Schema } from "@/types";
import { useEditorState } from "../editor";
import { fonts } from "@/theme/font-family";
import type { NextFont } from "next/dist/compiled/@next/font";

export function AgentThemeProvider({ children }: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();

  const font = state.theme.fontFamily
    ? fonts[state.theme.fontFamily]
    : fonts.inter;

  // 1. font
  // 2. palette
  // 3. custom css

  return <FontFamilyProvider font={font}>{children}</FontFamilyProvider>;
  //
}

export function FontFamilyProvider({
  font,
  children,
}: React.PropsWithChildren<{ font: NextFont }>) {
  return <div className={font.className}>{children}</div>;
}

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

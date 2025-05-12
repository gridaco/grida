"use client";

import React, { useEffect } from "react";
import palettes from "@/theme/palettes";
import useVariablesCSS from "../playground/use-variables-css";
import { stringfyThemeVariables } from "@/theme/palettes/utils";
import { FormPageBackground } from "../e/form/background";
import { cn } from "@/components/lib/utils";
import { useTheme } from "next-themes";
import { CustomCSSProvider } from "@/scaffolds/css/css-provider";
import type { NextFont } from "next/dist/compiled/@next/font/dist/types";
import type {
  Appearance,
  FontFamily,
  TemplatePageBackgroundSchema,
} from "@/types";
import { fonts } from "@/theme/font-family";

export function AgentThemeProvider({
  appearance,
  palette,
  font,
  customcss,
  children,
  background,
}: React.PropsWithChildren<{
  palette?: keyof typeof palettes;
  customcss?: string;
  font?: NextFont | FontFamily;
  appearance?: Appearance;
  background?: TemplatePageBackgroundSchema;
}>) {
  return (
    <div id="agent-theme-provider" className="relative w-full h-full">
      <PaletteProvider appearance={appearance} palette={palette} />
      <CustomCSSProvider css={customcss}>
        <FontFamilyProvider font={font}>{children}</FontFamilyProvider>
      </CustomCSSProvider>
      <BackgroundProvider background={background} />
    </div>
  );
}

function BackgroundProvider({
  background,
}: {
  background?: TemplatePageBackgroundSchema;
}) {
  return (
    <>
      {background && (
        <FormPageBackground {...(background as TemplatePageBackgroundSchema)} />
      )}
    </>
  );
}

function FontFamilyProvider({
  font,
  children,
}: React.PropsWithChildren<{ font?: NextFont | FontFamily }>) {
  const _font: NextFont | undefined =
    typeof font === "string" ? fonts[font] : font;

  return (
    <div className={cn("w-full h-full", _font?.className ?? "")}>
      {children}
    </div>
  );
}

function PaletteProvider({
  appearance = "system",
  palette,
  children,
}: React.PropsWithChildren<{
  appearance?: Appearance;
  palette?: keyof typeof palettes;
}>) {
  const { setTheme: setAppearance } = useTheme();

  useEffect(() => {
    if (appearance) {
      setAppearance(appearance);
    }
  }, [appearance]);

  useVariablesCSS(
    palette ? stringfyThemeVariables(palettes[palette] as any) : undefined
  );

  return <>{children}</>;
}

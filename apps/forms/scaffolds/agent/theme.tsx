"use client";

import React from "react";
import palettes from "@/theme/palettes";
import useVariablesCSS from "../playground/use-variables-css";
import { stringfyThemeVariables } from "@/theme/palettes/utils";
import { FormPageBackground } from "../e/form/background";
import { useEditorState } from "../editor";
import { fonts } from "@/theme/font-family";
import type { NextFont } from "@next/font/dist/types";
import type { FormPageBackgroundSchema, FormStyleSheetV1Schema } from "@/types";
import { cn } from "@/utils";
import Head from "next/head";

export function AgentThemeProvider({ children }: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();

  const font = state.theme.fontFamily
    ? fonts[state.theme.fontFamily]
    : fonts.inter;

  const customcss = state.theme.customCSS;

  return (
    <div id="agent-theme-provider" className="relative">
      <CustomCSSProvider css={customcss}>
        <FontFamilyProvider font={font}>{children}</FontFamilyProvider>
      </CustomCSSProvider>
      <BackgroundProvider background={state.theme.background} />
    </div>
  );
  //
}

export function BackgroundProvider({
  background,
}: {
  background?: FormPageBackgroundSchema;
}) {
  return (
    <>
      {background && (
        <FormPageBackground {...(background as FormPageBackgroundSchema)} />
      )}
    </>
  );
}

export function CustomCSSProvider({
  css,
  children,
}: React.PropsWithChildren<{ css?: string }>) {
  const iscustomized = !!css;
  return (
    <>
      {iscustomized && (
        <style
          key="customcss"
          id="customcss"
          dangerouslySetInnerHTML={{ __html: css }}
        />
      )}
      <div data-custom-css={iscustomized}>{children}</div>
    </>
  );
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

export function SectionStyle({
  className,
  children,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  const [state] = useEditorState();
  const sectioncss = state.theme.section;

  return <section className={cn(sectioncss, className)}>{children}</section>;
}

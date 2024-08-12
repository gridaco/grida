"use client";

import React, { useEffect, useMemo } from "react";
import palettes from "@/theme/palettes";
import useVariablesCSS from "../playground/use-variables-css";
import { stringfyThemeVariables } from "@/theme/palettes/utils";
import { FormPageBackground } from "../e/form/background";
import { useEditorState } from "../editor";
import { fonts } from "@/theme/font-family";
import type { NextFont } from "@next/font/dist/types";
import type { FormPageBackgroundSchema } from "@/types";
import { cn } from "@/utils";
import { CustomCSS } from "@/theme/customcss";
import { useTheme } from "next-themes";

export function AgentThemeProvider({ children }: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();

  const font = state.theme.fontFamily
    ? fonts[state.theme.fontFamily]
    : fonts.inter;

  const customcss = state.theme.customCSS;

  return (
    <div id="agent-theme-provider" className="relative">
      <PaletteProvider />
      <CustomCSSProvider css={customcss}>
        <FontFamilyProvider font={font}>{children}</FontFamilyProvider>
      </CustomCSSProvider>
      <BackgroundProvider background={state.theme.background} />
    </div>
  );
  //
}

function BackgroundProvider({
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

function CustomCSSProvider({
  css,
  children,
}: React.PropsWithChildren<{ css?: string }>) {
  const compiledcss = useMemo(
    () => (css ? CustomCSS.vanilla(css) : undefined),
    [css]
  );

  const iscustomized = !!compiledcss;

  const props = {
    [CustomCSS.DATA_CUSTOM_CSS_KEY]: iscustomized,
  };

  return (
    <>
      {iscustomized && (
        <style
          key="customcss"
          id="customcss"
          dangerouslySetInnerHTML={{ __html: compiledcss }}
        />
      )}
      <div {...props}>{children}</div>
    </>
  );
}

function FontFamilyProvider({
  font,
  children,
}: React.PropsWithChildren<{ font: NextFont }>) {
  return <div className={font.className}>{children}</div>;
}

function PaletteProvider({ children }: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();

  const { appearance, palette } = state.theme;
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

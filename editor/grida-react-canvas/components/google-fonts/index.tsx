"use client";
import React, { useEffect, useRef } from "react";
import { cn } from "@/components/lib/utils";
import * as Fonts from "@/grida-fonts";

const GoogleFontsManagerProviderContext = React.createContext<{
  fonts: Fonts.google.GoogleFontsFontInfo[];
}>({ fonts: [] });

export function GoogleFontsManager({
  fonts,
  children,
  stylesheets,
}: React.PropsWithChildren<{
  fonts: Fonts.google.GoogleFontsFontInfo[];
  stylesheets?: boolean;
}>) {
  return (
    <GoogleFontsManagerProviderContext.Provider value={{ fonts: fonts }}>
      {stylesheets && <GoogleFontsStylesheets />}
      {children}
    </GoogleFontsManagerProviderContext.Provider>
  );
}

export function GoogleFontsStylesheets() {
  const { fonts } = React.useContext(GoogleFontsManagerProviderContext);

  // Keep track of injected fonts to avoid re-injecting
  const injectedFonts = useRef<Set<string>>(new Set());

  useEffect(() => {
    fonts.forEach((font) => {
      const fontId = `gfm-${Fonts.google.fontFamilyToId(font.family)}`;

      // Only inject if not already in the document or in the injectedFonts Set
      if (
        !document.getElementById(fontId) &&
        !injectedFonts.current.has(fontId)
      ) {
        injectGoogleFontsLink(font.family);
        injectedFonts.current.add(fontId); // Track this font as injected
      }
    });

    // We won't clean up to avoid unnecessary reflows and blinking
  }, [fonts]); // Only run effect when fonts array actually changes

  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      injectedFonts.current.forEach((fontId) => {
        const link = document.getElementById(fontId);
        if (link) link.remove();
      });
      injectedFonts.current.clear();
    };
  }, []); // Empty dependency array means this cleanup runs only on unmount

  return null;
}

function injectGoogleFontsLink(fontFamily: string): HTMLLinkElement {
  const id = `gfm-${Fonts.google.fontFamilyToId(fontFamily)}`;
  const existing = document.getElementById(id);
  if (existing) return existing as HTMLLinkElement;

  // Load the font dynamically using the Google Fonts API
  const link = document.createElement("link");
  link.id = id;
  link.setAttribute("data-gfm", "true");
  link.setAttribute("data-font-family", fontFamily);
  link.href = Fonts.google.csslink({ fontFamily });
  link.rel = "stylesheet";
  document.head.appendChild(link);

  return link;
}

export function GoogleFontsPreview({
  fontFamily,
  className,
}: {
  fontFamily: string;
  className?: string;
}) {
  const id = fontFamily.toLowerCase().replace(/\s+/g, "-");

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-font-family={fontFamily}
      src={Fonts.google.svglink(id)}
      alt={fontFamily}
      className={cn("dark:invert", className)}
    />
  );
}

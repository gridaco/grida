"use client";
import React, { useEffect, useRef } from "react";
import * as google from "@grida/fonts/google";
import { FontFaceManager } from "@grida/fonts";

const GoogleFontsManagerProviderContext = React.createContext<{
  fonts: { family: string }[];
}>({ fonts: [] });

export function GoogleFontsManager({
  fonts,
  children,
  stylesheets,
}: React.PropsWithChildren<{
  fonts: { family: string }[];
  stylesheets?: boolean;
}>) {
  return (
    <GoogleFontsManagerProviderContext.Provider value={{ fonts: fonts }}>
      {stylesheets && <GoogleFontsLoader />}
      {children}
    </GoogleFontsManagerProviderContext.Provider>
  );
}

export function GoogleFontsStylesheets() {
  // Keep this for backward compatibility, but it now uses the new loader
  return <GoogleFontsLoader />;
}

function GoogleFontsLoader() {
  const { fonts } = React.useContext(GoogleFontsManagerProviderContext);
  const managerRef = useRef<FontFaceManager | null>(null);
  const loadedFonts = useRef<Set<string>>(new Set());
  const googleFontsCache = useRef<Map<string, google.GoogleWebFontListItem>>(
    new Map()
  );

  // Initialize the font manager
  useEffect(() => {
    if (!managerRef.current) {
      managerRef.current = new FontFaceManager();
    }
  }, []);

  // Load fonts using the unified font manager
  useEffect(() => {
    const loadFonts = async () => {
      if (!managerRef.current) return;

      const manager = managerRef.current;
      const fontsToLoad: { family: string }[] = [];

      // Find fonts that haven't been loaded yet
      fonts.forEach((font) => {
        if (!loadedFonts.current.has(font.family)) {
          fontsToLoad.push(font);
        }
      });

      if (fontsToLoad.length === 0) return;

      try {
        // Fetch Google Fonts list if we don't have it cached
        if (googleFontsCache.current.size === 0) {
          const googleFontsList = await google.fetchWebfontList();
          googleFontsList.items.forEach((font) => {
            googleFontsCache.current.set(font.family, font);
          });
        }

        // Load each font that needs to be loaded
        for (const font of fontsToLoad) {
          const googleFont = googleFontsCache.current.get(font.family);

          if (googleFont) {
            await manager.loadGoogleFont(googleFont);
            loadedFonts.current.add(font.family);
          }
        }
      } catch (error) {
        console.error("Failed to load Google Fonts:", error);
      }
    };

    loadFonts();
  }, [fonts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // The font manager will handle cleanup automatically
      managerRef.current = null;
      loadedFonts.current.clear();
      googleFontsCache.current.clear();
    };
  }, []);

  return null;
}

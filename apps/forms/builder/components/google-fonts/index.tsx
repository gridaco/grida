"use client";
import React, { useEffect, useState } from "react";
import { fonts as defaultFonts, GoogleFontsFontInfo } from "./data.min";

function csslink({ fontFamily }: { fontFamily: string }) {
  return `https://fonts.googleapis.com/css2?family=${fontFamily!.replace(
    " ",
    "+"
  )}:wght@400&display=swap`;
}

// const GoogleFontsProviderContext = React.createContext<{
//   fonts: GoogleFontsFontInfo[];
// }>({ fonts: defaultFonts });

// export function GoogleFontsProvider({
//   initialFonts,
//   children,
// }: React.PropsWithChildren<{
//   initialFonts?: GoogleFontsFontInfo[];
// }>) {
//   return (
//     <GoogleFontsProviderContext.Provider
//       value={{ fonts: initialFonts ?? defaultFonts }}
//     >
//       {children}
//     </GoogleFontsProviderContext.Provider>
//   );
// }

// export function useGoogleFontsHeadInjection() {
//   const { fonts } = React.useContext(GoogleFontsProviderContext);
// }

function injectGoogleFontsLink(fontFamily: string) {
  // Load the font dynamically using the Google Fonts API
  const link = document.createElement("link");
  link.href = csslink({ fontFamily });
  link.rel = "stylesheet";
  document.head.appendChild(link);

  return link;
}

export function GoogleFontsPreview({
  fontFamily,
  fontWeight,
  className,
  children,
}: React.PropsWithChildren<{
  fontFamily: React.CSSProperties["fontFamily"];
  fontWeight?: React.CSSProperties["fontWeight"];
  className?: string;
}>) {
  const [fontLoaded, setFontLoaded] = useState(false);

  useEffect(() => {
    const link = injectGoogleFontsLink(fontFamily!);

    link.onload = () => {
      setFontLoaded(true);
    };

    return () => {
      document.head.removeChild(link);
    };
  }, [fontFamily]);

  return (
    <span
      data-font-family={fontFamily}
      className={className}
      style={{
        fontFamily,
        fontWeight,
      }}
    >
      {children || fontFamily}
    </span>
  );
}

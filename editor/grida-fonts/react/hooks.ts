import { useState, useEffect } from "react";
import { fetchGoogleFontsV2 } from "../fonts.google";

export function useGoogleFontsList() {
  const [fonts, setFonts] = useState<any[]>([]);
  useEffect(() => {
    fetchGoogleFontsV2().then(setFonts);
  }, []);

  return fonts;
}

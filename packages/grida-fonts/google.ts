/**
 * converts google font family to id
 *
 * @example
 * - fontFamilyToId("Roboto") // "roboto"
 * - fontFamilyToId("Open Sans") // "open-sans"
 *
 * @param fontFamily
 * @returns
 */
export function fontFamilyToId(fontFamily: string) {
  return fontFamily.toLowerCase().replace(/\s+/g, "-");
}

/**
 * @see https://developers.google.com/fonts/docs/getting_started
 * @returns
 */
export function csslink({ fontFamily }: { fontFamily: string }) {
  const formattedFamily = fontFamily!.replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${formattedFamily}:wght@100..900&display=swap`;
}

export function svglink(id: string) {
  return `https://s3.us-west-1.amazonaws.com/google.fonts/${id}.svg`;
}

export type GoogleWebFontListItem = {
  category: string;
  family: string;
  variants: string[];
  files: {
    [key: string]: string;
  };
  subsets: string[];
  version: string;
  lastModified: string;
  menu: string;
};

export type GoogleWebFontList = {
  kind: "webfonts#webfontList";
  items: GoogleWebFontListItem[];
};

export async function fetchGoogleFontsV2() {
  return fetch("https://fonts.grida.co/webfonts.json").then(
    (r) => r.json() as Promise<GoogleWebFontList>
  );
}

export interface GoogleFontsFontInfo {
  family: string;
}

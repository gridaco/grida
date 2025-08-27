/**
 * converts google font family to id
 *
 * @example
 * - fontFamilyToId("Roboto") // "roboto"
 * - fontFamilyToId("Open Sans") // "opensans"
 *
 * @param fontFamily
 * @returns
 */
export function fontFamilyToId(fontFamily: string) {
  return fontFamily.toLowerCase().replace(/\s+/g, "");
}

/**
 * @see https://developers.google.com/fonts/docs/getting_started
 * @returns
 */
export function csslink({ fontFamily }: { fontFamily: string }) {
  const formattedFamily = fontFamily!.replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${formattedFamily}`;
}

export function svglink(id: string) {
  return `https://fonts.grida.co/svg/${id}.svg`;
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

const WEBFONTS_URL = "https://fonts.grida.co/webfonts.json";
const WEBFONTS_URL_VF = "https://fonts.grida.co/webfonts-vf.json";

export async function fetchWebfontList(vf?: boolean) {
  return fetch(vf ? WEBFONTS_URL_VF : WEBFONTS_URL).then(
    (r) => r.json() as Promise<GoogleWebFontList>
  );
}

export interface GoogleFontsFontInfo {
  family: string;
}

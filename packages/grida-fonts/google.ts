/**
 * Converts font family to id
 *
 * @example
 * - familyid("Roboto") // "roboto"
 * - familyid("Open Sans") // "opensans"
 *
 * @param fontFamily
 * @returns
 */
export function familyid(fontFamily: string) {
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

export interface FontAxis {
  tag: string;
  start: number;
  end: number;
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
  /**
   * axes are only available if the list was fetched with vf=true
   */
  axes?: FontAxis[];
};

export type GoogleWebFontList = {
  kind: "webfonts#webfontList";
  items: GoogleWebFontListItem[];
};

const WEBFONTS_URL = "https://fonts.grida.co/webfonts.json";
const WEBFONTS_URL_VF = "https://fonts.grida.co/webfonts-vf.json";

export async function fetchWebfontList(vf: boolean = true) {
  return fetch(vf ? WEBFONTS_URL_VF : WEBFONTS_URL).then(
    (r) => r.json() as Promise<GoogleWebFontList>
  );
}

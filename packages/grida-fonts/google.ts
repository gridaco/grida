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
  return `https://fonts.googleapis.com/css2?family=${formattedFamily}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
}

export function svglink(id: string) {
  return `https://s3.us-west-1.amazonaws.com/google.fonts/${id}.svg`;
}

export type GoogleFontsV2Response = {
  [key: string]: {
    family: string;
    weights: number[];
    styles: string[];
  };
};

export async function fetchGoogleFontsV2() {
  return fetch(
    "https://s3.us-west-1.amazonaws.com/google.fonts/google-fonts-v2.min.json"
  )
    .then((r) => r.json() as Promise<GoogleFontsV2Response>)
    .then((d) => {
      return Object.values(d);
    });
}

export interface GoogleFontsFontInfo {
  family: string;
}

export const min_test_fonts: GoogleFontsFontInfo[] = [
  {
    family: "Inter",
  },
  {
    family: "Lora",
  },
  {
    family: "Inconsolata",
  },
  {
    family: "Roboto",
  },
  {
    family: "Geologica",
  },
  {
    family: "Instrument Sans",
  },
  {
    family: "Caprasimo",
  },
  {
    family: "Sansita One",
  },
  {
    family: "Krona One",
  },
  {
    family: "Pretendard",
  },
  {
    family: "Nanum Myeongjo",
  },
];

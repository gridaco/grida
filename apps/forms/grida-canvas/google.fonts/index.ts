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
  return `https://fonts.googleapis.com/css2?family=${fontFamily!.replace(
    " ",
    "+"
  )}&display=swap`;
}

export function svglink(id: string) {
  return `https://s3.us-west-1.amazonaws.com/google.fonts/${id}.svg`;
}

export * from "./hooks";

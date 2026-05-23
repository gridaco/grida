/** Encode an SVG document as a `data:` URI suitable for `<img src>`. */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

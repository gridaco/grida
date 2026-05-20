/**
 * SVG → `data:` URL encoding for CSS `cursor:` values.
 *
 * Uses base64 (`btoa`) for two reasons:
 * - Cross-browser support is universal; URL-encoded SVG has historically had
 *   parser inconsistencies on `#` and `<`.
 * - It's what the main editor's `cursor-data.ts` uses, so cursor visuals
 *   compare byte-identical when we A/B during the eventual migration.
 *
 * Browser-only — `btoa` is part of the WHATWG HTML spec, available on
 * Worker / Window. The package's `platform: "neutral"` tsdown config means
 * we don't pull a Node polyfill; consumers using SSR must avoid evaluating
 * the renderer on the server (the Surface itself is client-side).
 */

/** Encode an SVG string as `data:image/svg+xml;base64,...`. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

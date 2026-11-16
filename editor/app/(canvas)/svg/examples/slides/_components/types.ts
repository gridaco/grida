/**
 * One slide as the deck UI renders it. Structurally the storage layer's
 * `SvgDocSummary`, so the web demo's store feeds it directly, while hosts
 * that keep slides elsewhere (Desktop's deck shell) build it without
 * reaching into the demo's storage.
 */
export type SlidePage = {
  id: string;
  name: string;
  thumbnailDataUri: string;
};

export { BLANK_SLIDE_SVG as EMPTY_SLIDE_SVG } from "./templates";

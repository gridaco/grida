import { nanoid } from "nanoid";
import { BLANK_SLIDE_SVG, aspectRatioFromSvg, svgToDataUri } from "./templates";

export type SlidePage = {
  id: string;
  name: string;
  svg: string;
  /** Precomputed for the thumbnail list — kept in sync via `withSvg()`. */
  thumbnailDataUri: string;
  aspectRatio: string;
};

export { BLANK_SLIDE_SVG as EMPTY_SLIDE_SVG };

export function createPage(name: string, svg: string): SlidePage {
  return {
    id: nanoid(),
    name,
    svg,
    thumbnailDataUri: svgToDataUri(svg),
    aspectRatio: aspectRatioFromSvg(svg),
  };
}

export function withSvg(page: SlidePage, svg: string): SlidePage {
  if (page.svg === svg) return page;
  return {
    ...page,
    svg,
    thumbnailDataUri: svgToDataUri(svg),
    aspectRatio: aspectRatioFromSvg(svg),
  };
}

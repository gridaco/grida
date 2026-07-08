import type { SlidesTemplatePage } from "@/lib/slides-templates";
import { svgToDataUri } from "../../../_storage/thumbnails";

export { svgToDataUri };

export const LIGHT_SLIDES_TEMPLATE_NAME = "light-slides.canvas";

export type SlideTemplate = {
  id: string;
  name: string;
  svg: string;
  /** Precomputed `data:` URI for `<img src>` thumbnails. */
  thumbnailDataUri: string;
};

export function slideTemplateFromPage(page: SlidesTemplatePage): SlideTemplate {
  return {
    id: page.id,
    name: page.name,
    svg: page.text,
    thumbnailDataUri: svgToDataUri(page.text),
  };
}

export const BLANK_SLIDE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <title>Blank slide</title>
  <rect width="1920" height="1080" fill="#FAFAFA"/>
</svg>`;

export const TITLE_SLIDE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <title>Light slides - Slide Deck Title</title>
  <rect width="1920" height="1080" fill="#FAFAFA"/>
  <text x="160" y="200" font-family="'Helvetica Neue', sans-serif" font-size="15" font-weight="700" fill="rgba(10,10,10,0.55)" letter-spacing="3">INSIGHTS - 2026</text>
  <text font-family="'Helvetica Neue', sans-serif" font-size="110" font-weight="800" fill="#0A0A0A" letter-spacing="-3">
    <tspan x="160" y="380">Slide Deck Title</tspan>
  </text>
  <text x="160" y="500" font-family="'Helvetica Neue', sans-serif" font-size="26" font-weight="400" fill="rgba(10,10,10,0.55)">This is just the beginning of something big.</text>
  <text x="160" y="980" font-family="'Helvetica Neue', sans-serif" font-size="15" font-weight="400" fill="rgba(10,10,10,0.35)" letter-spacing="1">May 2026</text>
</svg>`;

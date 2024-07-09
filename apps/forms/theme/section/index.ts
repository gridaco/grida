import {
  section_style_basic,
  section_style_glass_morphism,
  section_style_backdrop_invert,
} from "./css";

export const sections = [
  {
    name: "Basic",
    css: section_style_basic,
  },
  {
    name: "Glass Morphism",
    css: section_style_glass_morphism,
  },
  {
    name: "Backdrop Invert",
    css: section_style_backdrop_invert,
  },
] as const;

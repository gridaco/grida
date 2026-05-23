/**
 * SVG tag → human-friendly label + icon map.
 *
 * Pure presentation. Lives in the page (consumer) — the package's
 * `editor.display_label(id, { tagLabel })` accepts a resolver into this
 * map, so the structural rule (id suffix, text-content carve-out) stays
 * in the package while the visible English term lives here.
 *
 * Tags not in the map fall back to the raw tag name (`"foreignObject"`)
 * and the generic `Shapes` icon — that way an unknown SVG element still
 * renders without crashing the panel.
 */

import {
  ALargeSmallIcon,
  BoxIcon,
  CircleDotIcon,
  CircleIcon,
  CodeIcon,
  ComponentIcon,
  CopyIcon,
  CropIcon,
  EyeOffIcon,
  FilterIcon,
  FolderIcon,
  Grid3x3Icon,
  HashIcon,
  HeadingIcon,
  ImageIcon,
  InfoIcon,
  LibraryIcon,
  LinkIcon,
  MinusIcon,
  PaletteIcon,
  PentagonIcon,
  ScissorsIcon,
  ShapesIcon,
  SplineIcon,
  SquareDashedIcon,
  SquareIcon,
  TextIcon,
  TriangleIcon,
  TypeIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TagInfo = {
  label: string;
  Icon: LucideIcon;
};

/**
 * Tag → label/icon table. Add entries as the editor learns new tags.
 * Keep labels in English (Title Case); the page is currently single-locale.
 */
const TAGS: Record<string, TagInfo> = {
  // Document root
  svg: { label: "SVG", Icon: SquareDashedIcon },

  // Containers
  g: { label: "Group", Icon: FolderIcon },
  symbol: { label: "Symbol", Icon: ComponentIcon },
  use: { label: "Use", Icon: CopyIcon },
  a: { label: "Link", Icon: LinkIcon },
  defs: { label: "Definitions", Icon: LibraryIcon },

  // Shapes
  rect: { label: "Rectangle", Icon: SquareIcon },
  circle: { label: "Circle", Icon: CircleIcon },
  ellipse: { label: "Ellipse", Icon: CircleIcon },
  line: { label: "Line", Icon: MinusIcon },
  polyline: { label: "Polyline", Icon: SplineIcon },
  polygon: { label: "Polygon", Icon: PentagonIcon },
  path: { label: "Path", Icon: SplineIcon },

  // Text
  text: { label: "Text", Icon: TypeIcon },
  tspan: { label: "Text Span", Icon: ALargeSmallIcon },
  textPath: { label: "Text Path", Icon: TextIcon },

  // Media
  image: { label: "Image", Icon: ImageIcon },

  // Paint / fill resources
  linearGradient: { label: "Linear Gradient", Icon: PaletteIcon },
  radialGradient: { label: "Radial Gradient", Icon: CircleDotIcon },
  stop: { label: "Gradient Stop", Icon: HashIcon },
  pattern: { label: "Pattern", Icon: Grid3x3Icon },

  // Clipping / masking / filtering
  clipPath: { label: "Clip Path", Icon: CropIcon },
  mask: { label: "Mask", Icon: EyeOffIcon },
  filter: { label: "Filter", Icon: FilterIcon },
  marker: { label: "Marker", Icon: TriangleIcon },

  // Metadata / inert
  style: { label: "Style", Icon: PaletteIcon },
  title: { label: "Title", Icon: HeadingIcon },
  desc: { label: "Description", Icon: InfoIcon },
  metadata: { label: "Metadata", Icon: InfoIcon },
  script: { label: "Script", Icon: CodeIcon },

  // Catch-all foreign content
  foreignObject: { label: "Foreign Object", Icon: BoxIcon },
  switch: { label: "Switch", Icon: ScissorsIcon },
};

const FALLBACK: TagInfo = { label: "", Icon: ShapesIcon };

/** Get the friendly label for a tag, falling back to the raw tag. */
export function tagLabel(tag: string): string {
  return TAGS[tag]?.label ?? tag;
}

/** Get both label + icon for a tag, with a generic fallback. */
export function tagInfo(tag: string): TagInfo {
  const t = TAGS[tag];
  if (t) return t;
  return { label: tag, Icon: FALLBACK.Icon };
}

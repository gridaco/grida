/** Friendly names shared by the SVG hierarchy and selection badge. */
const LABELS: Readonly<Record<string, string>> = {
  svg: "SVG",
  g: "Group",
  symbol: "Symbol",
  use: "Use",
  a: "Link",
  defs: "Definitions",
  rect: "Rectangle",
  circle: "Circle",
  ellipse: "Ellipse",
  line: "Line",
  polyline: "Polyline",
  polygon: "Polygon",
  path: "Path",
  text: "Text",
  tspan: "Text Span",
  textPath: "Text Path",
  image: "Image",
  linearGradient: "Linear Gradient",
  radialGradient: "Radial Gradient",
  stop: "Gradient Stop",
  pattern: "Pattern",
  clipPath: "Clip Path",
  mask: "Mask",
  filter: "Filter",
  marker: "Marker",
  style: "Style",
  title: "Title",
  desc: "Description",
  metadata: "Metadata",
  script: "Script",
  foreignObject: "Foreign Object",
  switch: "Switch",
};

export function svgTagLabel(tag: string): string {
  return Object.hasOwn(LABELS, tag) ? LABELS[tag] : tag;
}

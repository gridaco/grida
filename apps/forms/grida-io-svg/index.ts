import { grida } from "@/grida";
import { parse, type INode } from "svgson";
import parseStyle, { type Declaration } from "inline-style-parser";
import { SVGPathData } from "svg-pathdata";
import { vn } from "@/grida/vn";
// @ts-ignore
import * as svgo from "svgo/dist/svgo.browser.js";
import type { Config, Output } from "svgo";
import { cmath } from "@grida/cmath";

/**
 * @see https://github.com/bahamas10/css-color-names/blob/master/css-color-names.json
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/named-color
 */
const namedcolors = {
  aliceblue: "#f0f8ff",
  antiquewhite: "#faebd7",
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  black: "#000000",
  blanchedalmond: "#ffebcd",
  blue: "#0000ff",
  blueviolet: "#8a2be2",
  brown: "#a52a2a",
  burlywood: "#deb887",
  cadetblue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerblue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  cyan: "#00ffff",
  darkblue: "#00008b",
  darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9",
  darkgreen: "#006400",
  darkgrey: "#a9a9a9",
  darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f",
  darkorange: "#ff8c00",
  darkorchid: "#9932cc",
  darkred: "#8b0000",
  darksalmon: "#e9967a",
  darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f",
  darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1",
  darkviolet: "#9400d3",
  deeppink: "#ff1493",
  deepskyblue: "#00bfff",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  floralwhite: "#fffaf0",
  forestgreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff",
  goldenrod: "#daa520",
  gold: "#ffd700",
  gray: "#808080",
  green: "#008000",
  greenyellow: "#adff2f",
  grey: "#808080",
  honeydew: "#f0fff0",
  hotpink: "#ff69b4",
  indianred: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavenderblush: "#fff0f5",
  lavender: "#e6e6fa",
  lawngreen: "#7cfc00",
  lemonchiffon: "#fffacd",
  lightblue: "#add8e6",
  lightcoral: "#f08080",
  lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2",
  lightgray: "#d3d3d3",
  lightgreen: "#90ee90",
  lightgrey: "#d3d3d3",
  lightpink: "#ffb6c1",
  lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  lightsteelblue: "#b0c4de",
  lightyellow: "#ffffe0",
  lime: "#00ff00",
  limegreen: "#32cd32",
  linen: "#faf0e6",
  magenta: "#ff00ff",
  maroon: "#800000",
  mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd",
  mediumorchid: "#ba55d3",
  mediumpurple: "#9370db",
  mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  navy: "#000080",
  oldlace: "#fdf5e6",
  olive: "#808000",
  olivedrab: "#6b8e23",
  orange: "#ffa500",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  purple: "#800080",
  rebeccapurple: "#663399",
  red: "#ff0000",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategray: "#708090",
  slategrey: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whitesmoke: "#f5f5f5",
  yellow: "#ffff00",
  yellowgreen: "#9acd32",
};

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute
 */
type SVGAttributes = {
  // [A]
  "accent-height": unknown;
  accumulate: unknown;
  additive: unknown;
  "alignment-baseline": unknown;
  alphabetic: unknown;
  amplitude: unknown;
  "arabic-form": unknown;
  ascent: unknown;
  attributeName: unknown;
  attributeType: unknown;
  azimuth: unknown;
  // [B]
  baseFrequency: unknown;
  "baseline-shift": unknown;
  baseProfile: unknown;
  bbox: unknown;
  begin: unknown;
  bias: unknown;
  by: unknown;
  // [C]
  calcMode: unknown;
  "cap-height": unknown;
  class: unknown;
  clip: unknown;
  clipPathUnits: unknown;
  "clip-path": unknown;
  "clip-rule": unknown;
  color: unknown;
  "color-interpolation": unknown;
  "color-interpolation-filters": unknown;
  "color-rendering": unknown;
  crossorigin: unknown;
  cursor: unknown;
  cx: unknown;
  cy: unknown;
  // [D]
  d: string;
  // data-*:
  decelerate: unknown;
  decoding: unknown;
  descent: unknown;
  diffuseConstant: unknown;
  direction: unknown;
  display: unknown;
  divisor: unknown;
  "dominant-baseline": unknown;
  dur: unknown;
  dx: unknown;
  dy: unknown;
  // [E]
  edgeMode: unknown;
  elevation: unknown;
  end: unknown;
  exponent: unknown;
  // [F]
  fill: unknown;
  "fill-opacity": unknown;
  "fill-rule": unknown;
  filter: unknown;
  filterUnits: unknown;
  "flood-color": unknown;
  "flood-opacity": unknown;
  "font-family": unknown;
  "font-size": unknown;
  "font-size-adjust": unknown;
  "font-stretch": unknown;
  "font-style": unknown;
  "font-variant": unknown;
  "font-weight": unknown;
  format: unknown;
  from: unknown;
  fr: unknown;
  fx: unknown;
  fy: unknown;
  // [G]
  g1: unknown;
  g2: unknown;
  "glyph-name": unknown;
  "glyph-orientation-horizontal": unknown;
  "glyph-orientation-vertical": unknown;
  glyphRef: unknown;
  gradientTransform: unknown;
  gradientUnits: unknown;
  // [H]
  hanging: unknown;
  height: string;
  href: unknown;
  hreflang: unknown;
  "horiz-adv-x": unknown;
  "horiz-origin-x": unknown;
  "horiz-origin-y": unknown;
  // [I]
  id: unknown;
  ideographic: unknown;
  "image-rendering": unknown;
  in: unknown;
  in2: unknown;
  intercept: unknown;
  // [K]
  k: unknown;
  k1: unknown;
  k2: unknown;
  k3: unknown;
  k4: unknown;
  kernelMatrix: unknown;
  kernelUnitLength: unknown;
  keyPoints: unknown;
  keySplines: unknown;
  keyTimes: unknown;
  // [L]
  lang: unknown;
  lengthAdjust: unknown;
  "letter-spacing": unknown;
  "lighting-color": unknown;
  limitingConeAngle: unknown;
  local: unknown;
  // [M]
  "marker-end": unknown;
  "marker-mid": unknown;
  "marker-start": unknown;
  markerHeight: unknown;
  markerUnits: unknown;
  markerWidth: unknown;
  mask: unknown;
  maskContentUnits: unknown;
  maskUnits: unknown;
  mathematical: unknown;
  max: unknown;
  media: unknown;
  method: unknown;
  min: unknown;
  mode: unknown;
  // [N]
  name: unknown;
  numOctaves: unknown;
  // [O]
  offset: unknown;
  opacity: unknown;
  operator: unknown;
  order: unknown;
  orient: unknown;
  orientation: unknown;
  origin: unknown;
  overflow: unknown;
  "overline-position": unknown;
  "overline-thickness": unknown;
  // [P]
  "panose-1": unknown;
  "paint-order": unknown;
  path: unknown;
  pathLength: unknown;
  patternContentUnits: unknown;
  patternTransform: unknown;
  patternUnits: unknown;
  ping: unknown;
  "pointer-events": unknown;
  points: unknown;
  pointsAtX: unknown;
  pointsAtY: unknown;
  pointsAtZ: unknown;
  preserveAlpha: unknown;
  preserveAspectRatio: unknown;
  primitiveUnits: unknown;
  // [R]
  r: unknown;
  radius: unknown;
  referrerPolicy: unknown;
  refX: unknown;
  refY: unknown;
  rel: unknown;
  "rendering-intent": unknown;
  repeatCount: unknown;
  repeatDur: unknown;
  requiredExtensions: unknown;
  requiredFeatures: unknown;
  restart: unknown;
  result: unknown;
  rotate: unknown;
  rx: unknown;
  ry: unknown;
  // [S]
  scale: unknown;
  seed: unknown;
  "shape-rendering": unknown;
  side: unknown;
  slope: unknown;
  spacing: unknown;
  specularConstant: unknown;
  specularExponent: unknown;
  speed: unknown;
  spreadMethod: unknown;
  startOffset: unknown;
  stdDeviation: unknown;
  stemh: unknown;
  stemv: unknown;
  stitchTiles: unknown;
  "stop-color": unknown;
  "stop-opacity": unknown;
  "strikethrough-position": unknown;
  "strikethrough-thickness": unknown;
  string: unknown;
  stroke: unknown;
  "stroke-dasharray": unknown;
  "stroke-dashoffset": unknown;
  "stroke-linecap": unknown;
  "stroke-linejoin": unknown;
  "stroke-miterlimit": unknown;
  "stroke-opacity": unknown;
  "stroke-width": unknown;
  style: unknown;
  surfaceScale: unknown;
  systemLanguage: unknown;
  // [T]
  tabindex: unknown;
  tableValues: unknown;
  target: unknown;
  targetX: unknown;
  targetY: unknown;
  "text-anchor": unknown;
  "text-decoration": unknown;
  "text-rendering": unknown;
  textLength: unknown;
  to: unknown;
  transform: unknown;
  "transform-origin": unknown;
  type: unknown;
  // [U]
  u1: unknown;
  u2: unknown;
  "underline-position": unknown;
  "underline-thickness": unknown;
  unicode: unknown;
  "unicode-bidi": unknown;
  "unicode-range": unknown;
  "units-per-em": unknown;
  // [V]
  "v-alphabetic": unknown;
  "v-hanging": unknown;
  "v-ideographic": unknown;
  "v-mathematical": unknown;
  values: unknown;
  "vector-effect": unknown;
  version: unknown;
  "vert-adv-y": unknown;
  "vert-origin-x": unknown;
  "vert-origin-y": unknown;
  viewBox: string;
  visibility: unknown;
  // [W]
  width: string;
  widths: unknown;
  "word-spacing": unknown;
  "writing-mode": unknown;
  // [X]
  x: unknown;
  "x-height": unknown;
  x1: unknown;
  x2: unknown;
  xChannelSelector: unknown;
  "xlink:actuate": unknown;
  "xlink:arcrole": unknown;
  "xlink:hrefDeprecated": unknown;
  "xlink:role": unknown;
  "xlink:show": unknown;
  "xlink:title": unknown;
  "xlink:type": unknown;
  "xml:lang": unknown;
  "xml:space": unknown;
  // [Y]
  y: unknown;
  y1: unknown;
  y2: unknown;
  yChannelSelector: unknown;
  // [Z]
  z: unknown;
  zoomAndPan: unknown;
};

type SVGFactoryContext = {
  currentColor: grida.program.cg.RGBA8888;
};

export namespace iosvg {
  export namespace path {
    export function d(d: string): vn.VectorNetwork {
      const parsedPath = new SVGPathData(d).toAbs(); // Convert to absolute commands
      const vertices: vn.VectorNetworkVertex[] = [];
      const segments: vn.VectorNetworkSegment[] = [];

      let lastPoint: [number, number] | null = null;
      const commands = parsedPath.commands;
      // console.log("d", d, commands);

      for (const command of commands) {
        const { type } = command;

        switch (type) {
          // M x y
          case SVGPathData.MOVE_TO: {
            const { x, y } = command;
            lastPoint = [x, y];
            vertices.push({ p: [x, y] });
            break;
          }

          // L x y
          case SVGPathData.LINE_TO: {
            const { x, y } = command;
            if (lastPoint) {
              const currentIndex = vertices.length;
              vertices.push({ p: [x, y] });

              segments.push({
                a: currentIndex - 1,
                b: currentIndex,
                ta: [0, 0],
                tb: [0, 0],
              });
            }
            lastPoint = [x, y];
            break;
          }

          case SVGPathData.HORIZ_LINE_TO: {
            const { x } = command;
            if (lastPoint) {
              const currentIndex = vertices.length;
              vertices.push({ p: [x, lastPoint[1]] }); // Keep y-coordinate the same as the last point

              segments.push({
                a: currentIndex - 1,
                b: currentIndex,
                ta: [0, 0], // No tangents for straight lines
                tb: [0, 0],
              });
            }
            lastPoint = [x, lastPoint ? lastPoint[1] : 0]; // Update lastPoint to the new position
            break;
          }

          case SVGPathData.VERT_LINE_TO: {
            const { y } = command;
            if (lastPoint) {
              const currentIndex = vertices.length;
              vertices.push({ p: [lastPoint[0], y] }); // Keep x-coordinate the same as the last point

              segments.push({
                a: currentIndex - 1,
                b: currentIndex,
                ta: [0, 0], // No tangents for straight lines
                tb: [0, 0],
              });
            }
            lastPoint = [lastPoint ? lastPoint[0] : 0, y]; // Update lastPoint to the new position
            break;
          }

          // C x1 y1, x2 y2, x y
          case SVGPathData.CURVE_TO: {
            const { x, y } = command;
            if (lastPoint) {
              const currentIndex = vertices.length;
              vertices.push({ p: [x, y] });

              segments.push({
                a: currentIndex - 1,
                b: currentIndex,
                ta: [command.x1 - lastPoint[0], command.y1 - lastPoint[1]],
                tb: [command.x2 - x, command.y2 - y],
              });
            }
            lastPoint = [x, y];
            break;
          }

          case SVGPathData.SMOOTH_CURVE_TO: {
            //
          }
          case SVGPathData.QUAD_TO: {
            //
          }
          case SVGPathData.SMOOTH_QUAD_TO: {
            //
          }
          case SVGPathData.ARC: {
            //
          }

          // Z
          case SVGPathData.CLOSE_PATH: {
            if (vertices.length > 1) {
              segments.push({
                a: vertices.length - 1,
                b: 0,
                ta: [0, 0],
                tb: [0, 0],
              });
            }
            break;
          }

          default:
            throw new Error(`Unsupported path command type: ${type}`);
        }
      }

      return { vertices, segments };
    }
  }

  export namespace map {
    export function opacity(
      opacity: string | null | undefined
    ): number | undefined {
      if (opacity === undefined || opacity === null) {
        return undefined;
      }

      const parsed = parseFloat(opacity);
      if (isNaN(parsed)) {
        return undefined;
      }

      return parsed;
    }

    export function paint(
      paint: string | null | undefined,
      context: SVGFactoryContext
    ): grida.program.cg.Paint | undefined {
      switch (paint) {
        case undefined:
        case null:
        case "none":
          return undefined;
        case "currentColor":
          return { type: "solid", color: context.currentColor };
        default:
          const namedcolor = (
            namedcolors as Record<string, string | undefined>
          )[paint];
          if (namedcolor) {
            return {
              type: "solid",
              color: grida.program.cg.hex_to_rgba8888(namedcolor),
            };
          }

          if (paint.startsWith("#")) {
            return {
              type: "solid",
              color: grida.program.cg.hex_to_rgba8888(paint),
            };
          }
      }

      return undefined;
    }
  }

  export namespace v0 {
    function mapnode(
      node: INode,
      context: SVGFactoryContext
    ): grida.program.nodes.NodePrototype[] | null {
      const { name, attributes: _attributes, children } = node;
      const attributes = _attributes as Partial<SVGAttributes>;

      switch (name) {
        // [svg] => container
        case "svg": {
          const { width, height, viewBox } = attributes;

          const viewbox = viewBox?.split(" ").map(parseFloat);
          const [vx, vy, vw, vh] = viewbox ?? [0, 0, 0, 0];

          return [
            {
              type: "container",
              position: "absolute",
              left: 0,
              top: 0,
              width: width ? parseFloat(width as string) : vw,
              height: height ? parseFloat(height as string) : vh,
              children: children
                .map((child) => mapnode(child, context))
                .flat()
                .filter(Boolean) as grida.program.nodes.NodePrototype[],
            } satisfies grida.program.nodes.NodePrototype,
          ];
        }

        // [g] => ...
        case "g": {
          return children
            .map((child) => mapnode(child, context))
            .flat()
            .filter(Boolean) as grida.program.nodes.NodePrototype[];
          break;
        }

        // [path] => path with vector network
        case "path": {
          const { style, fill: _fill, stroke, opacity, d } = attributes;
          const r = style ? parseStyle(style as string) : [];
          const fillstyle: Declaration | undefined = r.find(
            (d) => d.type === "declaration" && d.property === "fill"
          ) as Declaration | undefined;
          fillstyle?.value;

          const fill = _fill ?? fillstyle?.value;

          const vectorNetwork = iosvg.path.d(d!);
          const bbox = vn.getBBox(vectorNetwork);
          return [
            {
              type: "path",
              vectorNetwork: vectorNetwork,
              opacity: map.opacity(opacity as string),
              fill: map.paint(fill as string, context),
              stroke: map.paint(stroke as string, context),
              width: bbox.width,
              height: bbox.height,
            } satisfies grida.program.nodes.NodePrototype,
          ];
        }

        // [polyline, polygon] => path with vector network
        case "polyline":
        case "polygon": {
          const { style, fill, stroke, opacity, points } = attributes;
          break;
        }

        // [rect] => rectangle
        case "rect":
          break;

        // [circle, ellipse] => path via optimize
        case "circle":
        case "ellipse": {
          throw new Error(
            "circle and ellipse are not supported - make sure to run optimize first"
          );

          break;
        }

        // [line] => line
        case "line": {
          const { style, fill, stroke, opacity, x1, y1, x2, y2 } = attributes;
          break;
        }

        // [image] => image
        case "image":
          break;

        // [text, tspan] => text
        case "text":
        case "tspan":

        //
        case "defs":
        //
        case "filter":
        //
        case "feBlend":
        case "feColorMatrix":
        case "feComponentTransfer":
        case "feComposite":
        case "feConvolveMatrix":
        case "feDiffuseLighting":
        case "feDisplacementMap":
        case "feDistantLight":
        case "feDropShadow":
        case "feFlood":
        case "feFuncA":
        case "feFuncB":
        case "feFuncG":
        case "feFuncR":
        case "feGaussianBlur":
        case "feImage":
        case "feMerge":
        case "feMergeNode":
        case "feMorphology":
        case "feOffset":
        case "fePointLight":
        case "feSpecularLighting":
        case "feSpotLight":
        case "feTile":
        case "feTurbulence":
        //
        case "linearGradient":
        case "radialGradient":
        case "pattern":
        case "stop":
        case "symbol":
        case "use":
        case "image":
        case "clipPath":
        case "mask":
        // ignored, non supported
        case "desc":
        case "animate":
        case "animateMotion":
        case "animateTransform":
        case "foreignObject":
        case "script":
        // non-rendering
        case "title":
        default:
          return null;
      }

      return null;
    }

    export function optimize(svgstr: string): Output {
      // Optimize the SVG string
      const config: Config = {
        js2svg: {
          indent: 2,
          pretty: true,
        },
        plugins: [
          {
            name: "preset-default",
            params: {
              overrides: {
                removeViewBox: false, // Keep viewBox for scalability
                removeComments: {
                  preservePatterns: false,
                },
                convertShapeToPath: {
                  convertArcs: true,
                },
                convertColors: {
                  shorthex: false,
                  names2hex: true,
                },
              },
            },
          },
          "convertStyleToAttrs",
        ],
      };
      const result = svgo.optimize(svgstr, config);
      return result;
    }

    export async function convert(
      svgstr: string,
      context: SVGFactoryContext = {
        currentColor: { r: 0, g: 0, b: 0, a: 1 },
      }
    ): Promise<grida.program.nodes.NodePrototype | null> {
      const node = await parse(svgstr);

      console.log("node", node);

      return mapnode(node, context)?.[0] ?? null;
    }
  }
}

/**
 * @fileoverview
 * @see https://github.com/colorjs/color-parse/blob/master/index.js
 * @license MIT
 */

import names from "./color-name";

/**
 * Base hues
 * http://dev.w3.org/csswg/css-color/#typedef-named-hue
 */
//FIXME: use external hue detector
const baseHues: Record<string, number> = {
  red: 0,
  orange: 60,
  yellow: 120,
  green: 180,
  blue: 240,
  purple: 300,
} as const;

type Space =
  | "rgb"
  | "hsl"
  | "hwb"
  | "cmyk"
  | "lab"
  | "lch"
  | "oklab"
  | "oklch"
  | string;

export interface ParseResult {
  space: Space | undefined;
  values: number[];
  alpha: number;
}

/**
 * Parse color from the string passed
 *
 * @param cstr - Color string to parse (can be string or number for hex colors)
 * @returns A space indicator `space`, an array `values` and `alpha`
 */
function parse(cstr: string | number): ParseResult {
  let m: RegExpExecArray | null;
  let parts: number[] = [];
  let alpha = 1;
  let space: Space | undefined;

  //numeric case
  if (typeof cstr === "number") {
    return {
      space: "rgb",
      values: [cstr >>> 16, (cstr & 0x00ff00) >>> 8, cstr & 0x0000ff],
      alpha: 1,
    };
  }

  const cstrLower = String(cstr).toLowerCase();

  //keyword
  if (names[cstrLower]) {
    parts = names[cstrLower].slice();
    space = "rgb";
  }

  //reserved words
  else if (cstrLower === "transparent") {
    alpha = 0;
    space = "rgb";
    parts = [0, 0, 0];
  }

  //hex
  else if (cstrLower[0] === "#") {
    const base = cstrLower.slice(1);
    const size = base.length;
    const isShort = size <= 4;
    alpha = 1;

    if (isShort) {
      parts = [
        parseInt(base[0] + base[0], 16),
        parseInt(base[1] + base[1], 16),
        parseInt(base[2] + base[2], 16),
      ];
      if (size === 4) {
        alpha = parseInt(base[3] + base[3], 16) / 255;
      }
    } else {
      parts = [
        parseInt(base[0] + base[1], 16),
        parseInt(base[2] + base[3], 16),
        parseInt(base[4] + base[5], 16),
      ];
      if (size === 8) {
        alpha = parseInt(base[6] + base[7], 16) / 255;
      }
    }

    if (isNaN(parts[0])) parts[0] = 0;
    if (isNaN(parts[1])) parts[1] = 0;
    if (isNaN(parts[2])) parts[2] = 0;

    space = "rgb";
  }

  // color space
  else if (
    (m =
      /^((?:rgba?|hs[lvb]a?|hwba?|cmyk?|xy[zy]|gray|lab|lchu?v?|[ly]uv|lms|oklch|oklab|color))\s*\(([^\)]*)\)/.exec(
        cstrLower
      ))
  ) {
    const name = m[1];
    space = name.replace(/a$/, "") as Space;
    const dims = space === "cmyk" ? 4 : space === "gray" ? 1 : 3;
    const partsStr = m[2].trim().split(/\s*[,\/]\s*|\s+/);

    // color(srgb-linear x x x) -> srgb-linear(x x x)
    if (space === "color") {
      // Match original behavior: if shift() returns undefined, space becomes undefined
      space = partsStr.shift() as Space | undefined;
    }

    parts = partsStr.map((x: string, i: number): number => {
      //<percentage>
      if (x[x.length - 1] === "%") {
        const percentValue = parseFloat(x) / 100;
        // alpha -> 0..1
        if (i === 3) return percentValue;
        // rgb -> 0..255
        if (space === "rgb") return percentValue * 255;
        // hsl, hwb H -> 0..100
        if (space?.[0] === "h") return percentValue * 100;
        // lch, lab L -> 0..100
        if (space?.[0] === "l" && !i) return percentValue * 100;
        // lab A B -> -125..125
        if (space === "lab") return percentValue * 125;
        // lch C -> 0..150, H -> 0..360
        if (space === "lch")
          return i < 2 ? percentValue * 150 : percentValue * 360;
        // oklch/oklab L -> 0..1
        if (space?.[0] === "o" && !i) return percentValue;
        // oklab A B -> -0.4..0.4
        if (space === "oklab") return percentValue * 0.4;
        // oklch C -> 0..0.4, H -> 0..360
        if (space === "oklch")
          return i < 2 ? percentValue * 0.4 : percentValue * 360;
        // color(xxx) -> 0..1
        return percentValue;
      }

      //hue
      if (
        space &&
        (space[i] === "h" || (i === 2 && space[space.length - 1] === "h"))
      ) {
        //<base-hue>
        if (baseHues[x] !== undefined) return baseHues[x];
        //<deg>
        if (x.endsWith("deg")) return parseFloat(x);
        //<turn>
        if (x.endsWith("turn")) return parseFloat(x) * 360;
        if (x.endsWith("grad")) return (parseFloat(x) * 360) / 400;
        if (x.endsWith("rad")) return (parseFloat(x) * 180) / Math.PI;
      }
      if (x === "none") return 0;
      return parseFloat(x);
    });

    alpha = parts.length > dims ? (parts.pop() ?? 1) : 1;
  }

  //named channels case
  else if (/[0-9](?:\s|\/|,)/.test(cstrLower)) {
    const matches = cstrLower.match(/([0-9]+)/g);
    if (matches) {
      parts = matches.map((value: string): number => {
        return parseFloat(value);
      });
    }

    const spaceMatch = cstrLower.match(/([a-z])/gi);
    space = (spaceMatch?.join("")?.toLowerCase() || "rgb") as Space;
  }

  return {
    space,
    values: parts,
    alpha,
  };
}

export default parse;

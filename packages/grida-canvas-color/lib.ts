import colorparse from "./color-parse";
import colorname from "./color-name";

export namespace color {
  export function parse(cstr: string | number) {
    return colorparse(cstr);
  }
  export const names: typeof colorname = colorname;

  /**
   * Clamps a value between 0.0 and 1.0.
   */
  function clamp01(v: number): number {
    return v <= 0 ? 0 : v >= 1 ? 1 : v;
  }

  /**
   * Clamps a value between 0 and 100.
   */
  function clamp100(v: number): number {
    return v <= 0 ? 0 : v >= 100 ? 100 : v;
  }

  /**
   * Clamps a value between 0 and 255 and rounds it to the nearest integer.
   */
  function clamp255(v: number): number {
    return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
  }

  /**
   * Wraps a hue (degrees) into the [0, 360) range.
   */
  function wrapHue(h: number): number {
    return ((h % 360) + 360) % 360;
  }

  /**
   * hsl -> rgb per CSS Color 4 §7 (the spec's own sample algorithm,
   * which is what browsers implement).
   *
   * @param h - Hue in degrees (any finite value; wrapped mod 360).
   * @param s - Saturation in percent (clamped to [0, 100]).
   * @param l - Lightness in percent (clamped to [0, 100]).
   * @returns [r, g, b] in the 0-255 range (unrounded).
   */
  function hslToRGB255(
    h: number,
    s: number,
    l: number
  ): [number, number, number] {
    const hue = wrapHue(h);
    const sat = clamp100(s) / 100;
    const light = clamp100(l) / 100;
    const f = (n: number): number => {
      const k = (n + hue / 30) % 12;
      const a = sat * Math.min(light, 1 - light);
      return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }

  /**
   * hwb -> rgb per CSS Color 4 §8.
   *
   * @param h - Hue in degrees (any finite value; wrapped mod 360).
   * @param w - Whiteness in percent (clamped to [0, 100]).
   * @param b - Blackness in percent (clamped to [0, 100]).
   * @returns [r, g, b] in the 0-255 range (unrounded).
   */
  function hwbToRGB255(
    h: number,
    w: number,
    b: number
  ): [number, number, number] {
    const white = clamp100(w) / 100;
    const black = clamp100(b) / 100;
    if (white + black >= 1) {
      const gray = (white / (white + black)) * 255;
      return [gray, gray, gray];
    }
    const rgb = hslToRGB255(h, 100, 50);
    return [
      (rgb[0] / 255) * (1 - white - black) * 255 + white * 255,
      (rgb[1] / 255) * (1 - white - black) * 255 + white * 255,
      (rgb[2] / 255) * (1 - white - black) * 255 + white * 255,
    ];
  }

  /**
   * Resolves a CSS `<color>` string (or `0xRRGGBB` number) to its canonical
   * sRGB form as a branded {@link colorformats.RGB888A32F} — without a DOM
   * or canvas. Sits on top of {@link parse}; parse behavior is the source
   * of truth for what each syntax means.
   *
   * **Resolvable** (returns a value):
   * - named colors (`"red"`, `"REBECCAPURPLE"`) and `"transparent"`
   *   (resolves to `{ r: 0, g: 0, b: 0, a: 0 }` per CSS)
   * - 3/4/6/8-digit hex (`"#f00"`, `"#ff000080"`)
   * - `rgb()` / `rgba()` (number or percentage channels, comma or slash syntax)
   * - `hsl()` / `hsla()` — converted per CSS Color 4 §7
   * - `hwb()` — converted per CSS Color 4 §8
   * - numbers, read as `0xRRGGBB`
   *
   * **Not resolvable** (returns `null`, never a guess):
   * - `currentColor` and other context-dependent keywords
   * - `lab()` / `lch()` / `oklab()` / `oklch()` / `color()` — gamut mapping
   *   is out of scope
   * - `cmyk` / `gray` / other non-CSS spaces {@link parse} understands
   * - malformed or unparseable input
   *
   * Edge semantics (matching browser behavior):
   * - input is trimmed and case-insensitive
   * - hue wraps mod 360 (negative hues allowed)
   * - saturation / lightness / whiteness / blackness clamp to [0, 100]
   * - rgb channels clamp to [0, 255] and round to integers
   * - alpha clamps to [0, 1]
   * - never throws; invalid input resolves to `null`
   *
   * @param cstr - CSS color string, or a number read as `0xRRGGBB`.
   * @returns The resolved color, or `null` when resolution requires a
   * rendering context or the space is out of scope.
   *
   * @example
   * ```typescript
   * resolve("hsl(217 91% 60%)"); // { r: 60, g: 131, b: 246, a: 1 }
   * resolve("rgba(255, 0, 0, 0.5)"); // { r: 255, g: 0, b: 0, a: 0.5 }
   * resolve("transparent"); // { r: 0, g: 0, b: 0, a: 0 }
   * resolve("currentColor"); // null
   * resolve("oklch(0.7 0.1 200)"); // null
   * ```
   */
  export function resolve(
    cstr: string | number
  ): colorformats.RGB888A32F | null {
    const { space, values, alpha } = colorparse(
      typeof cstr === "string" ? cstr.trim() : cstr
    );

    if (!space) return null;
    if (values.length !== 3) return null;
    if (!values.every(Number.isFinite)) return null;
    if (!Number.isFinite(alpha)) return null;

    let rgb: [number, number, number];
    switch (space) {
      case "rgb":
        rgb = [values[0], values[1], values[2]];
        break;
      case "hsl":
        rgb = hslToRGB255(values[0], values[1], values[2]);
        break;
      case "hwb":
        rgb = hwbToRGB255(values[0], values[1], values[2]);
        break;
      default:
        return null;
    }

    return colorformats.newRGB888A32F(
      clamp255(rgb[0]),
      clamp255(rgb[1]),
      clamp255(rgb[2]),
      clamp01(alpha)
    );
  }

  /**
   * Resolves a CSS `<color>` string (or `0xRRGGBB` number) to a lowercase
   * hex string. Sugar over {@link resolve} — same resolvable set, same
   * sentinel.
   *
   * Returns `#rrggbb` when the resolved alpha is exactly 1, `#rrggbbaa`
   * otherwise (alpha quantized to 8 bits).
   *
   * @param cstr - CSS color string, or a number read as `0xRRGGBB`.
   * @returns `"#rrggbb"` | `"#rrggbbaa"`, or `null` when not resolvable.
   *
   * @example
   * ```typescript
   * resolveHEX("hsl(217 91% 60%)"); // "#3c83f6"
   * resolveHEX("red"); // "#ff0000"
   * resolveHEX("rgba(255, 0, 0, 0.5)"); // "#ff000080"
   * resolveHEX("definitely-not-a-color"); // null
   * ```
   */
  export function resolveHEX(cstr: string | number): string | null {
    const c = resolve(cstr);
    if (c === null) return null;
    const hex8 = colorformats.RGB888A32F.intoHEX(c);
    return c.a === 1 ? hex8.slice(0, 7) : hex8;
  }

  export namespace colorformats {
    /**
     * Clamps a value between 0.0 and 1.0.
     *
     * @param t - The value to clamp.
     * @returns The clamped value.
     */
    function f32(t: number): number {
      return t <= 0 ? 0 : t >= 1 ? 1 : t;
    }

    /**
     * Clamps a value between 0 and 255.
     *
     * @param value - The value to clamp.
     * @returns The clamped value.
     */
    function u8(value: number): number {
      return value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value);
    }

    function u8ToF32(value: number): number {
      return value / 255;
    }

    export type ColorComponentFormat = "u8" | "f32";

    export type RGB_UNKNOWN = {
      r: number;
      g: number;
      b: number;
    };

    /**
     * the RGBA structure itself. the rgb value may differ as it could both represent 0-1 or 0-255 by the context.
     */
    export type RGBA_UNKNOWN = {
      r: number;
      g: number;
      b: number;
      a: number;
    };

    declare const RGBA32F_BRAND: unique symbol;
    declare const RGBA8888_BRAND: unique symbol;
    declare const RGB888A32F_BRAND: unique symbol;

    export type RGBA32F = {
      /**
       * 0.0-1.0
       */
      r: number;
      /**
       * 0.0-1.0
       */
      g: number;
      /**
       * 0.0-1.0
       */
      b: number;
      /**
       * 0.0-1.0
       */
      a: number;
    } & {
      [RGBA32F_BRAND]: true;
    };

    export type RGBA8888 = {
      /**
       * 0-255
       */
      r: number;
      /**
       * 0-255
       */
      g: number;
      /**
       * 0-255
       */
      b: number;
      /**
       * 0-255
       */
      a: number;
    } & {
      [RGBA8888_BRAND]: true;
    };

    export type RGB888A32F = {
      /**
       * 0-255
       */
      r: number;
      /**
       * 0-255
       */
      g: number;
      /**
       * 0-255
       */
      b: number;
      /**
       * 0.0-1.0
       */
      a: number;
    } & {
      [RGB888A32F_BRAND]: true;
    };

    export function newRGBA32F(
      r: number,
      g: number,
      b: number,
      a: number
    ): RGBA32F {
      return { r, g, b, a } as RGBA32F;
    }

    export function newRGBA8888(
      r: number,
      g: number,
      b: number,
      a: number
    ): RGBA8888 {
      return { r, g, b, a } as RGBA8888;
    }

    export function newRGB888A32F(
      r: number,
      g: number,
      b: number,
      a: number
    ): RGB888A32F {
      return { r, g, b, a } as RGB888A32F;
    }

    export function intoCSSRGB(
      color: RGB_UNKNOWN,
      unit: ColorComponentFormat
    ): string {
      const [r, g, b] = intoU8Chunk(color, unit);
      return `rgb(${r}, ${g}, ${b})`;
    }

    /**
     * @param color - The input color to convert.
     * @param format - The input format to convert from.
     * @returns The output color as a tuple of [r, g, b] or [r, g, b, a]. (always in u8 range)
     */
    export function intoU8Chunk(
      color: RGB_UNKNOWN | RGBA_UNKNOWN,
      format: ColorComponentFormat
    ): [number, number, number] | [number, number, number, number] {
      const hasalpha = "a" in color;
      switch (format) {
        case "u8":
          return hasalpha
            ? [color.r, color.g, color.b, color.a]
            : [color.r, color.g, color.b];
        case "f32":
          return hasalpha
            ? [color.r * 255, color.g * 255, color.b * 255, color.a * 255]
            : [color.r * 255, color.g * 255, color.b * 255];
      }
    }

    export function fromHEXIntoU8Chunk(
      hex: string
    ): [number, number, number] | [number, number, number, number] {
      const normalizedHex = hex.replace("#", "");
      let r, g, b, a;

      if (normalizedHex.length === 3) {
        r = parseInt(normalizedHex[0] + normalizedHex[0], 16);
        g = parseInt(normalizedHex[1] + normalizedHex[1], 16);
        b = parseInt(normalizedHex[2] + normalizedHex[2], 16);
        return [r, g, b];
      } else if (normalizedHex.length === 6) {
        r = parseInt(normalizedHex.substring(0, 2), 16);
        g = parseInt(normalizedHex.substring(2, 4), 16);
        b = parseInt(normalizedHex.substring(4, 6), 16);
        return [r, g, b];
      } else if (normalizedHex.length === 8) {
        r = parseInt(normalizedHex.substring(0, 2), 16);
        g = parseInt(normalizedHex.substring(2, 4), 16);
        b = parseInt(normalizedHex.substring(4, 6), 16);
        a = parseInt(normalizedHex.substring(6, 8), 16);
        return [r, g, b, a];
      } else {
        throw new Error(
          "Invalid hex format. Expected #RGB, #RRGGBB or #RRGGBBAA."
        );
      }
    }

    export namespace RGBA32F {
      export const TRANSPARENT: RGBA32F = { r: 0, g: 0, b: 0, a: 0 } as RGBA32F;
      export const BLACK: RGBA32F = { r: 0, g: 0, b: 0, a: 1 } as RGBA32F;
      export const WHITE: RGBA32F = { r: 1, g: 1, b: 1, a: 1 } as RGBA32F;
      export const GRAY: RGBA32F = { r: 0.5, g: 0.5, b: 0.5, a: 1 } as RGBA32F;

      /**
       * #F5F5F5
       */
      export const WHITESMOKE: RGBA32F = {
        r: u8ToF32(245),
        g: u8ToF32(245),
        b: u8ToF32(245),
        a: 1,
      } as RGBA32F;

      export function intoHEX(color: RGBA32F): string {
        return RGBA8888.intoHEX(intoRGBA8888(color));
      }

      /**
       * Converts a HEX color string to an RGB888A32F object.
       *
       * Supports both short (`#RGB`) and long (`#RRGGBB`) HEX formats.
       *
       * @param hex - The HEX color string to convert. Must start with `#` and be 3 or 6 characters long after the `#`.
       * @returns An object containing `r`, `g`, `b`, and `a` properties.
       *
       * @throws {Error} If the input HEX string is invalid.
       *
       * @example
       * ```typescript
       * fromHEX("#F80"); // { r: 255, g: 136, b: 0, a: 1 }
       * fromHEX("#FF8800"); // { r: 255, g: 136, b: 0, a: 1 }
       * ```
       */
      export function fromHEX(hex: string): RGBA32F {
        const [r, g, b, a] = fromHEXIntoU8Chunk(hex);

        if (a === undefined) {
          return {
            r: u8ToF32(r),
            g: u8ToF32(g),
            b: u8ToF32(b),
            a: 1,
          } as RGBA32F;
        } else {
          return {
            r: u8ToF32(r),
            g: u8ToF32(g),
            b: u8ToF32(b),
            a: u8ToF32(a),
          } as RGBA32F;
        }
      }

      export function intoCSSRGBA(color: RGBA32F): string {
        return RGB888A32F.intoCSSRGBA(intoRGB888F32A(color));
      }

      export function intoRGBA8888(color: RGBA32F): RGBA8888 {
        return {
          r: u8(color.r * 255),
          g: u8(color.g * 255),
          b: u8(color.b * 255),
          a: u8(color.a * 255),
        } as RGBA8888;
      }

      export function intoRGB888F32A(color: RGBA32F): RGB888A32F {
        return {
          r: u8(color.r * 255),
          g: u8(color.g * 255),
          b: u8(color.b * 255),
          a: color.a,
        } as RGB888A32F;
      }

      export function multiplyA32(color: RGBA32F, alpha: number = 1): RGBA32F {
        return {
          r: color.r,
          g: color.g,
          b: color.b,
          a: color.a * alpha,
        } as RGBA32F;
      }
    }

    export namespace RGBA8888 {
      export const BLACK: RGBA8888 = { r: 0, g: 0, b: 0, a: 255 } as RGBA8888;
      export const WHITE: RGBA8888 = {
        r: 255,
        g: 255,
        b: 255,
        a: 255,
      } as RGBA8888;

      export function intoHEX(color: RGBA8888): string {
        const r = color.r.toString(16).padStart(2, "0");
        const g = color.g.toString(16).padStart(2, "0");
        const b = color.b.toString(16).padStart(2, "0");
        const a = color.a.toString(16).padStart(2, "0");
        return `#${r}${g}${b}${a}`;
      }

      export function intoRGB888F32A(color: RGBA8888): RGB888A32F {
        return {
          r: color.r,
          g: color.g,
          b: color.b,
          a: color.a / 255,
        } as RGB888A32F;
      }
    }

    export namespace RGB888A32F {
      export const TRANSPARENT: RGB888A32F = {
        r: 0,
        g: 0,
        b: 0,
        a: 0,
      } as RGB888A32F;
      export const BLACK: RGB888A32F = { r: 0, g: 0, b: 0, a: 1 } as RGB888A32F;
      export const WHITE: RGB888A32F = {
        r: 255,
        g: 255,
        b: 255,
        a: 1,
      } as RGB888A32F;
      export const GRAY: RGB888A32F = {
        r: 128,
        g: 128,
        b: 128,
        a: 1,
      } as RGB888A32F;

      export function intoHEX(color: RGB888A32F): string {
        return RGBA8888.intoHEX(intoRGBA8888(color));
      }

      /**
       * Converts a HEX color string to an RGB888A32F object.
       *
       * Supports both short (`#RGB`) and long (`#RRGGBB`) HEX formats.
       *
       * @param hex - The HEX color string to convert. Must start with `#` and be 3 or 6 characters long after the `#`.
       * @returns An object containing `r`, `g`, `b`, and `a` properties.
       *
       * @throws {Error} If the input HEX string is invalid.
       *
       * @example
       * ```typescript
       * fromHEX("#F80"); // { r: 255, g: 136, b: 0, a: 1 }
       * fromHEX("#FF8800"); // { r: 255, g: 136, b: 0, a: 1 }
       * ```
       */
      export function fromHEX(hex: string): RGB888A32F {
        const [r, g, b, a] = fromHEXIntoU8Chunk(hex);

        if (a === undefined) {
          return { r, g, b, a: 1 } as RGB888A32F;
        } else {
          return { r, g, b, a: a / 255 } as RGB888A32F;
        }
      }

      export function intoCSSRGBA(color: RGB888A32F): string {
        return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
      }

      export function intoRGBA8888(color: RGB888A32F): RGBA8888 {
        return {
          r: color.r,
          g: color.g,
          b: color.b,
          a: u8(color.a * 255),
        } as RGBA8888;
      }

      export function intoRGBA32F(color: RGB888A32F): RGBA32F {
        return {
          r: f32(color.r / 255),
          g: f32(color.g / 255),
          b: f32(color.b / 255),
          a: f32(color.a),
        } as RGBA32F;
      }

      export function multiplyA32(
        color: RGB888A32F,
        alpha: number = 1
      ): RGB888A32F {
        return {
          r: color.r,
          g: color.g,
          b: color.b,
          a: color.a * alpha,
        } as RGB888A32F;
      }
    }
  }
}

export namespace colorformats {
  /**
   * Clamps a value between 0 and 1.
   *
   * @param t - The value to clamp.
   * @returns The clamped value.
   */
  function clamp01(t: number): number {
    return t <= 0 ? 0 : t >= 1 ? 1 : t;
  }

  /**
   * Clamps a value between 0 and 255.
   *
   * @param value - The value to clamp.
   * @returns The clamped value.
   */
  function clamp255(value: number): number {
    return value <= 0 ? 0 : value >= 255 ? 255 : value;
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

  /**
   * @deprecated
   * use {@link RGBA32F} instead
   */
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
    if (unit === "u8") {
      return `rgb(${color.r}, ${color.g}, ${color.b})`;
    } else if (unit === "f32") {
      return `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
    }
    throw new Error(`Invalid unit: ${unit}`);
  }

  export namespace RGBA32F {
    export const TRANSPARENT: RGBA32F = { r: 0, g: 0, b: 0, a: 0 } as RGBA32F;
    export const BLACK: RGBA32F = { r: 0, g: 0, b: 0, a: 1 } as RGBA32F;
    export const WHITE: RGBA32F = { r: 1, g: 1, b: 1, a: 1 } as RGBA32F;

    /**
     * #F5F5F5
     */
    export const WHITESMOKE: RGBA32F = {
      r: 245 / 255,
      g: 245 / 255,
      b: 245 / 255,
      a: 1,
    } as RGBA32F;

    export function intoHEX(color: RGBA32F): string {
      return RGBA8888.intoHEX(intoRGBA8888(color));
    }

    export function intoCSSRGBA(color: RGBA32F): string {
      return RGB888A32F.intoCSSRGBA(intoRGB888F32A(color));
    }

    export function intoRGBA8888(color: RGBA32F): RGBA8888 {
      return {
        r: clamp255(color.r * 255),
        g: clamp255(color.g * 255),
        b: clamp255(color.b * 255),
        a: clamp255(color.a * 255),
      } as RGBA8888;
    }

    /**
     * @deprecated
     */
    export function intoRGB888F32A(color: RGBA32F): RGB888A32F {
      return {
        r: clamp255(color.r * 255),
        g: clamp255(color.g * 255),
        b: clamp255(color.b * 255),
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

  /**
   * @deprecated
   * use {@link RGBA32F} instead
   */
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
      const normalizedHex = hex.replace("#", "");
      let r,
        g,
        b,
        a = 255;

      if (normalizedHex.length === 3) {
        r = parseInt(normalizedHex[0] + normalizedHex[0], 16);
        g = parseInt(normalizedHex[1] + normalizedHex[1], 16);
        b = parseInt(normalizedHex[2] + normalizedHex[2], 16);
      } else if (normalizedHex.length === 6 || normalizedHex.length === 8) {
        r = parseInt(normalizedHex.substring(0, 2), 16);
        g = parseInt(normalizedHex.substring(2, 4), 16);
        b = parseInt(normalizedHex.substring(4, 6), 16);
        if (normalizedHex.length === 8) {
          a = parseInt(normalizedHex.substring(6, 8), 16);
        }
      } else {
        throw new Error(
          "Invalid hex format. Expected #RGB, #RRGGBB or #RRGGBBAA."
        );
      }

      return { r, g, b, a: a / 255 } as RGB888A32F;
    }

    export function intoCSSRGBA(color: RGB888A32F): string {
      return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    }

    export function intoRGBA8888(color: RGB888A32F): RGBA8888 {
      return {
        r: color.r,
        g: color.g,
        b: color.b,
        a: color.a * 255,
      } as RGBA8888;
    }

    export function intoRGBA32F(color: RGB888A32F): RGBA32F {
      return {
        r: clamp01(color.r / 255),
        g: clamp01(color.g / 255),
        b: clamp01(color.b / 255),
        a: clamp01(color.a),
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

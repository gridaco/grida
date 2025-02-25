import { cmath } from "@grida/cmath";
import type { grida } from "./index";
export namespace css {
  /**
   * @see https://github.com/bahamas10/css-color-names/blob/master/css-color-names.json
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/named-color
   */
  export const namedcolors = {
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

  export function toRGBAString(rgba: grida.program.cg.RGBA8888): string {
    return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
  }

  /**
   *
   * @param color
   * @returns hex color string without the leading `#`
   * @example `rgba_to_hex({ r: 255, g: 255, b: 255, a: 1 })` returns `"ffffff"`
   *
   */
  export function rgbaToHex(color: grida.program.cg.RGBA8888): string {
    const a = Math.round(color.a * 255);

    return `${color.r.toString(16).padStart(2, "0")}${color.g.toString(16).padStart(2, "0")}${color.b.toString(16).padStart(2, "0")}${a.toString(16).padStart(2, "0")}`;
  }

  /**
   *
   * {@link grida.program.cg.TextAlignVertical} to CSS `align-content` mapping
   *
   * - `top`:`start`
   * - `center`:`center`
   * - `bottom`:`end`
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/align-content
   */
  const text_align_vertical_to_css_align_content: Record<
    grida.program.cg.TextAlignVertical,
    React.CSSProperties["alignContent"]
  > = {
    top: "start",
    center: "center",
    bottom: "end",
  };

  export function toReactCSSProperties(
    styles: Partial<
      grida.program.nodes.i.IStylable<grida.program.css.ExplicitlySupportedCSSProperties>
    > &
      Partial<grida.program.nodes.i.IOpacity> &
      Partial<grida.program.nodes.i.IRotation> &
      Partial<grida.program.nodes.i.IZIndex> &
      Partial<grida.program.nodes.i.IPositioning> &
      Partial<grida.program.nodes.i.ICSSDimension> &
      Partial<grida.program.nodes.i.IFill<grida.program.cg.Paint>> &
      Partial<grida.program.nodes.i.IBoxShadow> &
      Partial<grida.program.nodes.i.ICSSBorder> &
      Partial<grida.program.nodes.i.IMouseCursor> &
      Partial<grida.program.nodes.i.IRectangleCorner> &
      Partial<grida.program.nodes.i.IBoxFit> &
      Partial<grida.program.nodes.i.IComputedTextNodeStyle> &
      Partial<grida.program.nodes.i.IPadding> &
      Partial<grida.program.nodes.i.IBoxShadow> &
      Partial<grida.program.nodes.i.IFlexContainer>,
    config: {
      hasTextStyle: boolean;
      fill: "color" | "background" | "fill" | "none";
    }
  ): React.CSSProperties {
    const {
      position,
      top,
      left,
      bottom,
      right,
      width,
      height,
      zIndex,
      opacity,
      rotation,
      fill,
      fit,
      cornerRadius,
      //
      border,
      //
      padding,
      //
      boxShadow,
      //
      layout,
      direction,
      mainAxisAlignment,
      crossAxisAlignment,
      mainAxisGap,
      crossAxisGap,
      //
      cursor,
      //
      style,
    } = styles;

    let result: React.CSSProperties = {
      //
      ...style,
      //
      position: position,
      // FIXME: support both auto - max-content
      // for texts, when auto, it will automatically break the line (to prevent this, we can use max-content) BUT, when max-content it will not respect the right: xxx (which in this case, it should break line)
      // width: width === "auto" ? "max-content" : toDimension(width),
      // height: height === "auto" ? "max-content" : toDimension(height),
      width: width ? toDimension(width) : undefined,
      height: height ? toDimension(height) : undefined,
      top: top,
      left: left,
      right: right,
      bottom: bottom,
      zIndex: zIndex,
      opacity: opacity,
      objectFit: fit,
      rotate: rotation ? `${rotation}deg` : undefined,
      //
      borderRadius: cornerRadius
        ? cornerRadiusToBorderRadiusCSS(cornerRadius)
        : undefined,
      //
      padding: padding ? paddingToPaddingCSS(padding) : undefined,
      //
      boxShadow: boxShadow ? boxShadowToCSS(boxShadow) : undefined,
      //
      cursor: cursor,
      ...(border ? toReactCSSBorder(border) : {}),
    } satisfies React.CSSProperties;

    if (layout === "flex") {
      result["display"] = "flex";
      result["flexDirection"] = axisToFlexDirection(direction!);
      result["justifyContent"] = mainAxisAlignment;
      result["alignItems"] = crossAxisAlignment;
      result["gap"] =
        direction === "horizontal"
          ? `${mainAxisGap}px ${crossAxisGap}px`
          : `${crossAxisGap}px ${mainAxisGap}px`;
    }

    switch (config.fill) {
      case "color":
        result["color"] = fill ? toFillString(fill) : undefined;
        break;
      case "background":
        result["background"] = fill ? toFillString(fill) : undefined;
        break;
      case "fill":
        result["fill"] = fill ? toFillString(fill) : undefined;
        break;
      case "none":
        break;
    }

    if (config.hasTextStyle) {
      const { textAlign, textAlignVertical } =
        styles as Partial<grida.program.nodes.i.ITextNodeStyle>;
      const {
        textDecoration,
        fontFamily,
        fontSize,
        fontWeight,
        letterSpacing,
        lineHeight,
      } = styles as grida.program.nodes.i.ITextStyle;

      result = {
        ...result,
        ...toReactTextStyle({
          // text node style - can be undefined (need a better way to handle this - not pass it at all)
          textAlign: textAlign ?? "left",
          textAlignVertical: textAlignVertical ?? "top",
          // text span style
          textDecoration,
          fontFamily,
          fontSize,
          fontWeight,
          letterSpacing,
          lineHeight,
          fill: fill!,
        }),
      };
    }

    return result;
  }

  export function toDimension(
    value: grida.program.css.LengthPercentage | "auto"
  ): string {
    if (!value) return "";
    if (value === "auto") return "auto";
    if (typeof value === "number") {
      return `${value}px`;
    } else {
      switch (value.type) {
        case "length": {
          return `${value.value}${value.unit}`;
        }
        case "percentage": {
          return `${value.value}%`;
        }
      }
    }
  }

  export function toReactCSSBorder(
    border: grida.program.css.Border
  ): Pick<React.CSSProperties, "borderStyle" | "borderColor" | "borderWidth"> {
    return {
      borderStyle: border.borderStyle,
      borderColor: toRGBAString(border.borderColor),
      borderWidth:
        typeof border.borderWidth === "number"
          ? border.borderWidth
          : `${border.borderWidth.top}px ${border.borderWidth.right}px ${border.borderWidth.bottom}px ${border.borderWidth.left}px`,
    };
  }

  export function toReactTextStyle(
    style: grida.program.nodes.i.IComputedTextNodeStyle
  ): Pick<
    React.CSSProperties,
    | "textAlign"
    | "alignContent"
    | "textDecoration"
    | "fontFamily"
    | "fontSize"
    | "fontWeight"
    | "letterSpacing"
    | "lineHeight"
    | "color"
  > {
    const {
      textAlign,
      textAlignVertical,
      textDecoration,
      fontFamily,
      fontSize,
      fontWeight,
      letterSpacing,
      lineHeight,
      fill,
    } = style;

    return {
      textAlign: textAlign,
      alignContent: textAlignVertical
        ? text_align_vertical_to_css_align_content[textAlignVertical]
        : undefined,
      textDecoration: textDecoration,
      fontFamily: fontFamily,
      lineHeight: lineHeight ?? "normal",
      letterSpacing: letterSpacing,
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: fill ? toFillString(fill) : undefined,
    };
  }

  function boxShadowToCSS(boxShadow: grida.program.cg.BoxShadow): string {
    const { color, offset = [0, 0], blur = 0, spread = 0 } = boxShadow;

    return `${offset[0]}px ${offset[1]}px ${blur}px ${spread}px ${toRGBAString(color)}`;
  }

  export function toFillString(paint: grida.program.cg.Paint): string {
    switch (paint.type) {
      case "solid":
        return toRGBAString(paint.color);
      case "linear_gradient":
        return toLinearGradientString(paint);
      case "radial_gradient":
        return toRadialGradientString(paint);
    }
  }

  export function cornerRadiusToBorderRadiusCSS(
    cr: grida.program.nodes.i.IRectangleCorner["cornerRadius"]
  ): string {
    if (!cr) return "0";
    if (typeof cr === "number") {
      return `${cr}px`;
    } else {
      return `${cr[0]}px ${cr[1]}px ${cr[2]}px ${cr[3]}px`;
    }
  }

  export function paddingToPaddingCSS(
    padding: grida.program.nodes.i.IPadding["padding"]
  ): string {
    if (!padding) return "0";
    if (typeof padding === "number") {
      return `${padding}px`;
    } else {
      return `${padding.paddingTop}px ${padding.paddingRight}px ${padding.paddingBottom}px ${padding.paddingLeft}px`;
    }
  }

  export function axisToFlexDirection(
    axis: grida.program.cg.Axis
  ): "row" | "column" {
    switch (axis) {
      case "horizontal":
        return "row";
      case "vertical":
        return "column";
    }
  }

  /**
   *
   * @example
   * `linear-gradient(to right, red, blue)`
   *
   * @param paint
   * @returns
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/linear-gradient
   */
  export function toLinearGradientString(
    paint: Omit<grida.program.cg.LinearGradientPaint, "id">
  ): string {
    const { stops, transform } = paint;

    // the css linear-gradient does not support custom matrix transformation
    const deg = cmath.transform.angle(transform ?? cmath.transform.identity);

    const gradientStops = stops
      .map((stop) => {
        return `${toRGBAString(stop.color)} ${stop.offset * 100}%`;
      })
      .join(", ");

    return `linear-gradient(${deg}deg, ${gradientStops})`;
  }

  /**
   *
   * @example
   * `radial-gradient(circle, red, blue)`
   *
   * @param paint
   * @returns
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/radial-gradient
   */
  export function toRadialGradientString(
    paint: Omit<grida.program.cg.RadialGradientPaint, "id">
  ): string {
    const { stops } = paint;

    const gradientStops = stops
      .map((stop) => {
        return `${toRGBAString(stop.color)} ${stop.offset * 100}%`;
      })
      .join(", ");

    return `radial-gradient(${gradientStops})`;
  }
}

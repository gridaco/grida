import cmath from "@grida/cmath";
import type grida from "@grida/schema";
import type cg from "@grida/cg";
import type csstype from "csstype";
import kolor from "@grida/color";

export namespace css {
  /**
   * @see https://github.com/bahamas10/css-color-names/blob/master/css-color-names.json
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/named-color
   */
  export const namedcolors = kolor.names;

  export function toRGBAString(rgba: cg.RGB888A32F): string {
    return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
  }

  /**
   *
   * {@link cg.TextAlignVertical} to CSS `align-content` mapping
   *
   * - `top`:`start`
   * - `center`:`center`
   * - `bottom`:`end`
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/align-content
   */
  const text_align_vertical_to_css_align_content: Record<
    cg.TextAlignVertical,
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
      Partial<grida.program.nodes.i.IBlend> &
      Partial<grida.program.nodes.i.IRotation> &
      Partial<grida.program.nodes.i.IZIndex> &
      Partial<grida.program.nodes.i.IPositioning> &
      Partial<grida.program.nodes.i.ICSSDimension> &
      Partial<grida.program.nodes.i.IFill<cg.Paint>> &
      Partial<grida.program.nodes.i.ICSSBorder> &
      Partial<grida.program.nodes.i.IMouseCursor> &
      Partial<grida.program.nodes.i.ICornerRadius> &
      Partial<grida.program.nodes.i.IRectangularCornerRadius> &
      Partial<grida.program.nodes.i.IBoxFit> &
      Partial<grida.program.nodes.i.IComputedTextNodeStyle> &
      Partial<grida.program.nodes.i.IPadding> &
      Partial<grida.program.nodes.i.IEffects> &
      Partial<grida.program.nodes.i.IFlexContainer> &
      Partial<{ maxLines?: number | null }>,
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
      blendMode,
      rotation,
      fill,
      fit,
      cornerRadius,
      cornerRadiusTopLeft,
      cornerRadiusTopRight,
      cornerRadiusBottomLeft,
      cornerRadiusBottomRight,
      //
      border,
      //
      padding,
      //
      feShadows,
      //
      layout,
      direction,
      mainAxisAlignment,
      crossAxisAlignment,
      mainAxisGap,
      crossAxisGap,
      //
      maxLines,
      //
      cursor,
      //
      style,
    } = styles;

    // box-shadow - fallbacks from feDropShadow, first item.
    const _fb_first_boxShadow = feShadows?.[0];

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
      mixBlendMode: blendMode ? toMixBlendMode(blendMode) : undefined,
      objectFit: fit,
      rotate: rotation ? `${rotation}deg` : undefined,
      //
      borderRadius: cornerRadiusToBorderRadiusCSS({
        cornerRadius,
        cornerRadiusTopLeft,
        cornerRadiusTopRight,
        cornerRadiusBottomLeft,
        cornerRadiusBottomRight,
      }),
      //
      padding: padding ? paddingToPaddingCSS(padding) : undefined,
      //
      boxShadow: _fb_first_boxShadow
        ? boxShadowToCSS(
            {
              blur: _fb_first_boxShadow.blur,
              color: _fb_first_boxShadow.color,
              offset: [_fb_first_boxShadow.dx, _fb_first_boxShadow.dy],
              spread: _fb_first_boxShadow.spread,
            },
            _fb_first_boxShadow.inset
          )
        : undefined,
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
        textDecorationLine,
        textDecorationStyle,
        textDecorationThickness,
        textDecorationColor,
        textDecorationSkipInk,
        fontFamily,
        fontSize,
        fontWeight,
        fontKerning,
        fontWidth,
        letterSpacing,
        lineHeight,
        fontFeatures,
        fontVariations,
        fontOpticalSizing,
        textTransform,
      } = styles as grida.program.nodes.i.ITextStyle;

      result = {
        ...result,
        ...toReactTextStyle({
          // text node style - can be undefined (need a better way to handle this - not pass it at all)
          textAlign: textAlign ?? "left",
          textAlignVertical: textAlignVertical ?? "top",
          // text span style
          textDecorationLine,
          textDecorationStyle,
          textDecorationThickness,
          textDecorationColor,
          textDecorationSkipInk,
          fontFamily,
          fontSize,
          fontWeight,
          fontKerning,
          fontWidth,
          letterSpacing,
          lineHeight,
          fontFeatures,
          fontVariations,
          fontOpticalSizing,
          textTransform,
          fill: fill!,
        }),
      };
    }

    if (config.hasTextStyle && maxLines && maxLines > 0) {
      result.display = "-webkit-box";
      (result as any).WebkitLineClamp = maxLines;
      (result as any).WebkitBoxOrient = "vertical";
      result.overflow = "hidden";
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
    | "textDecorationLine"
    | "textDecorationStyle"
    | "textDecorationThickness"
    | "textDecorationColor"
    | "textDecorationSkipInk"
    | "fontFamily"
    | "fontSize"
    | "fontWeight"
    | "fontKerning"
    | "letterSpacing"
    | "wordSpacing"
    | "lineHeight"
    | "fontOpticalSizing"
    | "fontFeatureSettings"
    | "fontVariationSettings"
    | "textTransform"
    | "color"
  > {
    const {
      textAlign,
      textAlignVertical,
      textDecorationLine,
      textDecorationStyle,
      textDecorationThickness,
      textDecorationColor,
      textDecorationSkipInk,
      fontFamily,
      fontSize,
      fontWeight,
      fontKerning,
      fontWidth,
      letterSpacing,
      wordSpacing,
      lineHeight,
      fontFeatures,
      fontVariations,
      fontOpticalSizing,
      textTransform,
      fill,
    } = style;

    let ffs = fontFeatures ? { ...fontFeatures } : undefined;
    if (typeof fontKerning === "boolean") {
      ffs = { ...(ffs ?? {}), kern: fontKerning };
    }

    let fvs = fontVariations ? { ...fontVariations } : undefined;
    if (typeof fontWeight === "number" && fvs) {
      delete (fvs as any).wght;
    }
    if (typeof fontWidth === "number") {
      fvs = { ...(fvs ?? {}), wdth: fontWidth };
    }
    if (typeof fontOpticalSizing === "number") {
      fvs = { ...(fvs ?? {}), opsz: fontOpticalSizing };
    }

    return {
      textAlign: textAlign,
      alignContent: textAlignVertical
        ? text_align_vertical_to_css_align_content[textAlignVertical]
        : undefined,
      textDecorationLine: textDecorationLine,
      textDecorationStyle: textDecorationStyle ?? undefined,
      textDecorationThickness:
        typeof textDecorationThickness === "number"
          ? textDecorationThickness
          : textDecorationThickness === "auto"
            ? "auto"
            : undefined,
      textDecorationColor: textDecorationColor
        ? toRGBAString(textDecorationColor)
        : undefined,
      textDecorationSkipInk:
        typeof textDecorationSkipInk === "boolean"
          ? textDecorationSkipInk
            ? "auto"
            : "none"
          : undefined,
      fontFamily: fontFamily,
      lineHeight:
        typeof lineHeight === "number" ? `${lineHeight * 100}%` : "normal",
      letterSpacing:
        typeof letterSpacing === "number" ? `${letterSpacing}em` : undefined,
      wordSpacing:
        typeof wordSpacing === "number" ? `${wordSpacing}em` : undefined,
      fontSize: fontSize,
      fontWeight: fontWeight,
      fontKerning: fontKerning ? "normal" : "none",
      fontOpticalSizing:
        typeof fontOpticalSizing === "number" ? "none" : fontOpticalSizing,
      fontFeatureSettings: ffs ? toFontFeatureSettings(ffs) : undefined,
      fontVariationSettings: fvs ? toFontVariationSettings(fvs) : undefined,
      textTransform: textTransform,
      color: fill ? toFillString(fill) : undefined,
    };
  }

  function toFontFeatureSettings(
    features: Partial<Record<cg.OpenTypeFeature, boolean>>
  ): string {
    return Object.entries(features)
      .map(([feature, enabled]) => `"${feature}" ${enabled ? "on" : "off"}`)
      .join(", ");
  }

  function toFontVariationSettings(variations: Record<string, number>): string {
    return Object.entries(variations)
      .map(([axis, value]) => `"${axis}" ${value}`)
      .join(", ");
  }

  function boxShadowToCSS(boxShadow: cg.BoxShadow, inset?: boolean): string {
    const { color, offset = [0, 0], blur = 0, spread = 0 } = boxShadow;

    return `${inset ? "inset " : ""}${offset[0]}px ${offset[1]}px ${blur}px ${spread}px ${toRGBAString(color)}`;
  }

  function toMixBlendMode(
    blendMode: cg.LayerBlendMode
  ): csstype.DataType.BlendMode {
    if (blendMode === "pass-through") return "normal";
    return blendMode;
  }

  export function toFillString(paint: cg.Paint): string {
    switch (paint.type) {
      case "solid":
        return toRGBAString(paint.color);
      case "linear_gradient":
        return toLinearGradientString(paint);
      case "radial_gradient":
        return toRadialGradientString(paint);
      case "sweep_gradient":
        return toConicGradientString(paint);
      case "diamond_gradient":
      default:
        return "";
    }
  }

  export function cornerRadiusToBorderRadiusCSS(
    cr: Partial<
      grida.program.nodes.i.IRectangularCornerRadius &
        grida.program.nodes.i.ICornerRadius
    >
  ): string | undefined {
    if (!cr) return undefined;
    return `${cr.cornerRadiusTopLeft ?? cr.cornerRadius ?? 0}px ${cr.cornerRadiusTopRight ?? cr.cornerRadius ?? 0}px ${cr.cornerRadiusBottomRight ?? cr.cornerRadius ?? 0}px ${cr.cornerRadiusBottomLeft ?? cr.cornerRadius ?? 0}px`;
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

  export function axisToFlexDirection(axis: cg.Axis): "row" | "column" {
    switch (axis) {
      case "horizontal":
        return "row";
      case "vertical":
        return "column";
    }
  }

  export function toGradientString(paint: cg.GradientPaint): string {
    switch (paint.type) {
      case "linear_gradient":
        return toLinearGradientString(paint);
      case "radial_gradient":
        return toRadialGradientString(paint);
      case "sweep_gradient":
        return toConicGradientString(paint);
      default:
        return "";
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
    paint: cg.LinearGradientPaint
  ): string {
    const { stops, transform } = paint;

    // the css linear-gradient does not support custom matrix transformation
    // in css, the default is top-center-to-bottom-center (which cg default is center-left-to-center-right)
    // so we need to add 90 degrees to the angle to make it match the css default
    const deg =
      cmath.transform.angle(transform ?? cmath.transform.identity) + 90;

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
    paint: cg.RadialGradientPaint
  ): string {
    const { stops } = paint;

    const tx = paint.transform?.[0][2] ?? 0.5;
    const ty = paint.transform?.[1][2] ?? 0.5;

    const gradientStops = stops
      .map((stop) => {
        return `${toRGBAString(stop.color)} ${stop.offset * 100}%`;
      })
      .join(", ");

    return `radial-gradient(at ${tx * 100}% ${ty * 100}%, ${gradientStops})`;
  }

  /**
   *
   * @example
   * `conic-gradient(from 0deg at 50% 50%, red, blue)`
   *
   * @param paint
   * @returns
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/conic-gradient
   */
  export function toConicGradientString(paint: cg.SweepGradientPaint): string {
    const { stops, transform } = paint;

    // Extract origin offset from transform matrix (similar to radial gradient)
    const tx = paint.transform?.[0][2] ?? 0.5;
    const ty = paint.transform?.[1][2] ?? 0.5;

    // Calculate starting angle from transform matrix
    // For conic gradients, we need to extract the rotation angle from the transform
    // The angle represents where the gradient starts (0deg = top, 90deg = right, etc.)
    let startAngle = 0;
    if (transform) {
      // Extract the rotation angle from the transform matrix
      // This is similar to how linear gradients handle angle calculation
      startAngle = cmath.transform.angle(transform);

      // CSS conic gradients start from the top (0deg) by default
      // We need to adjust the angle to match the expected behavior
      // Add 90 degrees to align with CSS conic gradient default orientation
      startAngle += 90;

      // Normalize angle to 0-360 range
      startAngle = ((startAngle % 360) + 360) % 360;
    }

    const gradientStops = stops
      .map((stop) => {
        return `${toRGBAString(stop.color)} ${stop.offset * 100}%`;
      })
      .join(", ");

    // If origin is at center (0.5, 0.5), we can omit the "at" clause for better compatibility
    if (Math.abs(tx - 0.5) < 0.01 && Math.abs(ty - 0.5) < 0.01) {
      return `conic-gradient(from ${startAngle}deg, ${gradientStops})`;
    }

    return `conic-gradient(from ${startAngle}deg at ${tx * 100}% ${ty * 100}%, ${gradientStops})`;
  }
}

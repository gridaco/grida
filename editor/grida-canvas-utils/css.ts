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

  export function toRGBAString(rgba: kolor.colorformats.RGBA32F): string {
    // Format directly from RGBA32F (0.0-1.0) to CSS rgba() format
    const r = Math.round(rgba.r * 255);
    const g = Math.round(rgba.g * 255);
    const b = Math.round(rgba.b * 255);
    return `rgba(${r}, ${g}, ${b}, ${rgba.a})`;
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
      z_index,
      opacity,
      blend_mode,
      rotation,
      fill,
      fit,
      corner_radius,
      corner_radius_top_left,
      corner_radius_top_right,
      corner_radius_bottom_left,
      corner_radius_bottom_right,
      //
      border,
      //
      padding,
      //
      fe_shadows,
      //
      layout,
      direction,
      main_axis_alignment,
      cross_axis_alignment,
      main_axis_gap,
      cross_axis_gap,
      //
      maxLines,
      //
      cursor,
      //
      style,
    } = styles;

    // box-shadow - fallbacks from feDropShadow, first item.
    const _fb_first_boxShadow = fe_shadows?.[0];

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
      zIndex: z_index,
      opacity: opacity,
      mixBlendMode: blend_mode ? toMixBlendMode(blend_mode) : undefined,
      objectFit: fit,
      rotate: rotation ? `${rotation}deg` : undefined,
      //
      borderRadius: cornerRadiusToBorderRadiusCSS({
        corner_radius,
        corner_radius_top_left,
        corner_radius_top_right,
        corner_radius_bottom_left,
        corner_radius_bottom_right,
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
      result["justifyContent"] = main_axis_alignment;
      result["alignItems"] = cross_axis_alignment;
      result["gap"] =
        direction === "horizontal"
          ? `${main_axis_gap}px ${cross_axis_gap}px`
          : `${cross_axis_gap}px ${main_axis_gap}px`;
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
      const { text_align, text_align_vertical } =
        styles as Partial<grida.program.nodes.i.ITextNodeStyle>;
      const {
        text_decoration_line,
        text_decoration_style,
        text_decoration_thickness,
        text_decoration_color,
        text_decoration_skip_ink,
        font_family,
        font_size,
        font_weight,
        font_kerning,
        font_width,
        letter_spacing,
        line_height,
        font_features,
        font_variations,
        font_optical_sizing,
        text_transform,
      } = styles as grida.program.nodes.i.ITextStyle;

      result = {
        ...result,
        ...toReactTextStyle({
          // text node style - can be undefined (need a better way to handle this - not pass it at all)
          text_align: text_align ?? "left",
          text_align_vertical: text_align_vertical ?? "top",
          // text span style
          text_decoration_line,
          text_decoration_style,
          text_decoration_thickness,
          text_decoration_color,
          text_decoration_skip_ink,
          font_family,
          font_size,
          font_weight,
          font_kerning,
          font_width,
          letter_spacing,
          line_height,
          font_features,
          font_variations,
          font_optical_sizing,
          text_transform,
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
      borderStyle: border.border_style,
      borderColor: toRGBAString(border.border_color),
      borderWidth:
        typeof border.border_width === "number"
          ? border.border_width
          : `${border.border_width.top}px ${border.border_width.right}px ${border.border_width.bottom}px ${border.border_width.left}px`,
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
      text_align,
      text_align_vertical,
      text_decoration_line,
      text_decoration_style,
      text_decoration_thickness,
      text_decoration_color,
      text_decoration_skip_ink,
      font_family,
      font_size,
      font_weight,
      font_kerning,
      font_width,
      letter_spacing,
      word_spacing,
      line_height,
      font_features,
      font_variations,
      font_optical_sizing,
      text_transform,
      fill,
    } = style;

    let ffs = font_features ? { ...font_features } : undefined;
    if (typeof font_kerning === "boolean") {
      ffs = { ...(ffs ?? {}), kern: font_kerning };
    }

    let fvs = font_variations ? { ...font_variations } : undefined;
    if (typeof font_weight === "number" && fvs) {
      delete (fvs as any).wght;
    }
    if (typeof font_width === "number") {
      fvs = { ...(fvs ?? {}), wdth: font_width };
    }
    if (typeof font_optical_sizing === "number") {
      fvs = { ...(fvs ?? {}), opsz: font_optical_sizing };
    }

    return {
      textAlign: text_align,
      alignContent: text_align_vertical
        ? text_align_vertical_to_css_align_content[text_align_vertical]
        : undefined,
      textDecorationLine: text_decoration_line,
      textDecorationStyle: text_decoration_style ?? undefined,
      textDecorationThickness:
        typeof text_decoration_thickness === "number"
          ? text_decoration_thickness
          : text_decoration_thickness === "auto"
            ? "auto"
            : undefined,
      textDecorationColor: text_decoration_color
        ? toRGBAString(text_decoration_color)
        : undefined,
      textDecorationSkipInk:
        typeof text_decoration_skip_ink === "boolean"
          ? text_decoration_skip_ink
            ? "auto"
            : "none"
          : undefined,
      fontFamily: font_family,
      lineHeight:
        typeof line_height === "number" ? `${line_height * 100}%` : "normal",
      letterSpacing:
        typeof letter_spacing === "number" ? `${letter_spacing}em` : undefined,
      wordSpacing:
        typeof word_spacing === "number" ? `${word_spacing}em` : undefined,
      fontSize: font_size,
      fontWeight: font_weight,
      fontKerning: font_kerning ? "normal" : "none",
      fontOpticalSizing:
        typeof font_optical_sizing === "number" ? "none" : font_optical_sizing,
      fontFeatureSettings: ffs ? toFontFeatureSettings(ffs) : undefined,
      fontVariationSettings: fvs ? toFontVariationSettings(fvs) : undefined,
      textTransform: text_transform,
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
    return `${cr.corner_radius_top_left ?? cr.corner_radius ?? 0}px ${cr.corner_radius_top_right ?? cr.corner_radius ?? 0}px ${cr.corner_radius_bottom_right ?? cr.corner_radius ?? 0}px ${cr.corner_radius_bottom_left ?? cr.corner_radius ?? 0}px`;
  }

  export function paddingToPaddingCSS(
    padding: grida.program.nodes.i.IPadding["padding"]
  ): string {
    if (!padding) return "0";
    if (typeof padding === "number") {
      return `${padding}px`;
    } else {
      return `${padding.padding_top}px ${padding.padding_right}px ${padding.padding_bottom}px ${padding.padding_left}px`;
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

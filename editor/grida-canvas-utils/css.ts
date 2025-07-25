import cmath from "@grida/cmath";
import type grida from "@grida/schema";
import type cg from "@grida/cg";
import colors from "color-name";

export namespace css {
  /**
   * @see https://github.com/bahamas10/css-color-names/blob/master/css-color-names.json
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/named-color
   */
  export const namedcolors = colors;

  export function toRGBAString(rgba: cg.RGBA8888): string {
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
      Partial<grida.program.nodes.i.IOpacity> &
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

  function boxShadowToCSS(boxShadow: cg.BoxShadow, inset?: boolean): string {
    const { color, offset = [0, 0], blur = 0, spread = 0 } = boxShadow;

    return `${inset ? "inset " : ""}${offset[0]}px ${offset[1]}px ${blur}px ${spread}px ${toRGBAString(color)}`;
  }

  export function toFillString(paint: cg.Paint): string {
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
    paint: Omit<cg.LinearGradientPaint, "id">
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
    paint: Omit<cg.RadialGradientPaint, "id">
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

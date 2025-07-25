/**
 * Core Graphics
 */
export namespace cg {
  export type Vector2 = [number, number];

  /**
   * A 2D Affine Transformation Matrix.
   *
   * This matrix is used to perform linear transformations (e.g., scaling, rotation, shearing)
   * and translations in a two-dimensional coordinate space. It is a compact representation
   * of a transformation that maps points, lines, or shapes from one space to another while
   * preserving straight lines and parallelism.
   *
   * ### Matrix Structure:
   * The affine transform matrix is a 2x3 matrix, represented as:
   *
   * ```
   * [
   *   [a, b, tx],
   *   [c, d, ty]
   * ]
   * ```
   *
   * ### Components:
   * - **a, d**: Scaling factors along the x-axis and y-axis, respectively.
   *   - `a`: Horizontal scale (x-axis stretch/shrink factor).
   *   - `d`: Vertical scale (y-axis stretch/shrink factor).
   * - **b, c**: Shearing (skewing) factors.
   *   - `b`: Horizontal skewing (how much the y-axis tilts along the x-axis).
   *   - `c`: Vertical skewing (how much the x-axis tilts along the y-axis).
   * - **tx, ty**: Translation offsets.
   *   - `tx`: Horizontal translation (movement along the x-axis).
   *   - `ty`: Vertical translation (movement along the y-axis).
   *
   * ### Transformations:
   * Affine transforms combine multiple transformations into a single operation. Examples include:
   * - **Translation**: Moving a shape by tx and ty.
   * - **Scaling**: Resizing along x and y axes.
   * - **Rotation**: Rotating around the origin by combining scaling and skewing.
   * - **Shearing**: Slanting a shape along one or both axes.
   *
   * ### Applying the Transformation:
   * To transform a 2D point `[x, y]`, append a constant `1` to form `[x, y, 1]`,
   * then multiply by the matrix:
   *
   * ```
   * [x', y', 1] = [
   *   [a, b, tx],
   *   [c, d, ty]
   * ] * [x, y, 1]
   *
   * Result:
   * x' = a * x + b * y + tx
   * y' = c * x + d * y + ty
   * ```
   *
   * The transformed point `[x', y']` represents the new coordinates.
   *
   * ### Notes:
   * - This matrix supports 2D transformations only.
   * - It assumes homogeneous coordinates for points (i.e., the constant `1` in `[x, y, 1]`).
   * - For transformations in 3D space, a 4x4 matrix must be used instead.
   */
  export type AffineTransform = [
    [number, number, number],
    [number, number, number],
  ];

  /**
   * the RGBA structure itself. the rgb value may differ as it could both represent 0-1 or 0-255 by the context.
   */
  export type TRGBA = {
    r: number;
    g: number;
    b: number;
    a: number;
  };

  /**
   * Floating-Point RGBA (Normalized RGBA)
   * Used in computer graphics pipelines, shading, and rendering.
   */
  export type RGBAf = {
    /**
     * Red channel value, between 0 and 1.
     */
    r: number;
    /**
     * Green channel value, between 0 and 1.
     */
    g: number;
    /**
     * Blue channel value, between 0 and 1.
     */
    b: number;
    /**
     * Alpha channel value, between 0 and 1.
     */
    a: number;
  };

  /**
   * 8-bit Integer RGBA (Standard RGBA)
   * Used in web and raster graphics, including CSS and images.
   */
  export type RGBA8888 = {
    /**
     * Red channel value, between 0 and 255.
     */
    r: number;
    /**
     * Green channel value, between 0 and 255.
     */
    g: number;
    /**
     * Blue channel value, between 0 and 255.
     */
    b: number;
    /**
     * Alpha channel value, between 0 and 1.
     */
    a: number;
  };

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/blend-mode
   */
  export type BlendMode =
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "darken"
    | "lighten"
    | "color-dodge"
    | "color-burn"
    | "hard-light"
    | "soft-light"
    | "difference"
    | "exclusion"
    | "hue"
    | "saturation"
    | "color"
    | "luminosity";

  /**
   * Defines a single path
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Element/path
   */
  export type Path = {
    /**
     * This attribute defines the shape of the path.
     */
    d: string;

    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/fill-rule
     */
    fillRule: FillRule;
  };

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/fill-rule
   * @see https://www.figma.com/plugin-docs/api/properties/VectorPath-windingrule/
   */
  export type FillRule = "nonzero" | "evenodd";

  /**
   *
   * Supported fit modes
   *
   * Only `contain` and `cover`, `none` are supported in the current version.
   *
   * - `none` may have unexpected results by the environment
   *
   * @see https://api.flutter.dev/flutter/painting/BoxFit.html
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit
   */
  export type BoxFit = "contain" | "cover" | "none";

  /**
   * Supported stoke cap modes
   *
   * - `butt`
   * - `round`
   * - `square`
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-linecap
   * @see https://api.flutter.dev/flutter/dart-ui/StrokeCap.html
   */
  export type StrokeCap = "butt" | "round" | "square";

  /**
   * @see https://www.figma.com/plugin-docs/api/properties/nodes-strokealign/
   * @see https://api.flutter.dev/flutter/painting/BorderSide/strokeAlign.html
   */
  export type StrokeAlign = "center" | "inside" | "outside";

  /**
   *
   * Supported text decoration modes
   *
   * Only `underline` and `none` are supported in the current version.
   *
   * @see https://api.flutter.dev/flutter/dart-ui/TextDecoration-class.html
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration
   */
  export type TextDecoration = "none" | "underline";

  /**
   * Supported text align modes
   *
   * Does not support `start` and `end` as they are not supported in the current version.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/text-align
   * @see https://api.flutter.dev/flutter/dart-ui/TextAlign.html
   */
  export type TextAlign = "left" | "right" | "center" | "justify";

  /**
   * Vertical text align modes
   *
   * - [Env:css] in css, uses `align-content`
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/align-content
   * @see https://konvajs.org/api/Konva.Text.html#verticalAlign
   */
  export type TextAlignVertical = "top" | "center" | "bottom";

  /**
   * Supported font weights in numeric values
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight
   * @see https://api.flutter.dev/flutter/dart-ui/FontWeight-class.html
   * @see https://learn.microsoft.com/en-us/typography/opentype/spec/os2#usweightclass
   */
  export type NFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

  /**
   * @see https://api.flutter.dev/flutter/painting/Axis.html
   */
  export type Axis = "horizontal" | "vertical";

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content
   * @see https://developer.mozilla.org/en-US/docs/Glossary/Main_Axis
   * @see https://api.flutter.dev/flutter/rendering/MainAxisAlignment.html
   */
  export type MainAxisAlignment =
    | "start"
    | "end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly"
    | "stretch";

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/align-items
   * @see https://developer.mozilla.org/en-US/docs/Glossary/Cross_Axis
   * @see https://api.flutter.dev/flutter/rendering/CrossAxisAlignment.html
   */
  export type CrossAxisAlignment = "start" | "end" | "center" | "stretch";

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/cursor
   * @see https://api.flutter.dev/flutter/services/SystemMouseCursors-class.html
   */
  export type SystemMouseCursor =
    | "alias"
    | "all-scroll"
    | "auto"
    | "cell"
    | "col-resize"
    | "context-menu"
    | "copy"
    | "crosshair"
    | "default"
    | "e-resize"
    | "ew-resize"
    | "grab"
    | "grabbing"
    | "help"
    | "move"
    | "n-resize"
    | "ne-resize"
    | "nesw-resize"
    | "no-drop"
    | "none"
    | "not-allowed"
    | "ns-resize"
    | "nw-resize"
    | "nwse-resize"
    | "pointer"
    | "progress"
    | "row-resize"
    | "s-resize"
    | "se-resize"
    | "sw-resize"
    | "text"
    | "vertical-text"
    | "w-resize"
    | "wait"
    | "zoom-in"
    | "zoom-out";

  export type Paint = SolidPaint | LinearGradientPaint | RadialGradientPaint;

  export namespace paints {
    export const transparent: Paint = {
      type: "solid",
      color: { r: 0, g: 0, b: 0, a: 0 },
    };

    export const black: Paint = {
      type: "solid",
      color: { r: 0, g: 0, b: 0, a: 1 },
    };

    export const white: Paint = {
      type: "solid",
      color: { r: 255, g: 255, b: 255, a: 1 },
    };
  }

  export type AnyPaint = Omit<
    Partial<SolidPaint> &
      Partial<LinearGradientPaint> &
      Partial<RadialGradientPaint>,
    "type"
  > & { type: Paint["type"] };

  export type PaintWithoutID =
    | SolidPaint
    | Omit<LinearGradientPaint, "id">
    | Omit<RadialGradientPaint, "id">;

  export type SolidPaint = {
    type: "solid";
    color: cg.RGBA8888;
  };

  export type LinearGradientPaint = {
    type: "linear_gradient";
    id: string;
    transform: AffineTransform;
    stops: Array<GradientStop>;
  };

  export type RadialGradientPaint = {
    type: "radial_gradient";
    id: string;
    transform: AffineTransform;
    stops: Array<GradientStop>;
  };

  export type GradientStop = {
    /**
     * 0-1
     * 0 - start (0%)
     * 1 - end (100%)
     */
    offset: number;
    color: cg.RGBA8888;
  };
  //
  //

  /**
   * Box shadow definition compatible with both CSS and advanced blur configurations.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow
   * @see https://api.flutter.dev/flutter/painting/BoxShadow-class.html
   */
  export type BoxShadow = {
    /**
     * The color of the shadow.
     * Defaults to the current color if not provided.
     */
    color: RGBA8888;

    /**
     * The horizontal and vertical offset of the shadow.
     * Example: `[x: number, y: number]` or for no shadow offset.
     *
     * @default [0, 0]
     */
    offset: Vector2;

    /**
     * The blur radius of the shadow.
     * - Specifies the amount of blur applied to the shadow.
     * - Must be >= 0.
     *
     * @default 0
     */
    blur: number;

    /**
     * The spread radius of the shadow.
     * - Positive values expand the shadow.
     * - Negative values shrink the shadow.
     * - Defaults to 0.
     *
     * @default 0
     */
    spread: number;
  };

  /**
   *
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDropShadow
   */
  export interface IFeShadow {
    /**
     * offset-x
     */
    dx: number;

    /**
     * offset-y
     */
    dy: number;

    /**
     * blur radius
     *
     * a.k.a. stdDeviation in SVG <feDropShadow>
     */
    blur: number;

    spread: number;

    color: RGBA8888;
    //
  }

  export interface IFeGaussianBlur {
    /**
     * blur radius
     *
     * a.k.a. stdDeviation in SVG <feGaussianBlur>
     */
    radius: number;
  }

  export type FeGaussianBlur = IFeGaussianBlur & {
    type: "blur";
  };

  export interface IFeProgressiveBlur {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    radius: number;
    radius2: number;
  }

  export type FeProgressiveBlur = IFeProgressiveBlur & {
    type: "progressive-blur";
  };

  export type FilterEffect = FeShadow | FeLayerBlur | FeBackdropBlur;

  export type FeShadow = IFeShadow & {
    type: "shadow";
    inset?: boolean;
  };

  export type FeBlur = FeGaussianBlur | FeProgressiveBlur;

  export type FeLayerBlur = {
    type: "filter-blur";
    blur: FeBlur;
  };

  export type FeBackdropBlur = {
    type: "backdrop-filter-blur";
    blur: FeBlur;
  };

  /**
   *
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDropShadow
   */
  export type SVGFeDropShadow = {
    type: "drop_shadow";

    /**
     * offset-x
     */
    dx: number;

    /**
     * offset-y
     */
    dy: number;

    /**
     * blur radius
     *
     * a.k.a. stdDeviation in SVG <feDropShadow>
     */
    blur: number;
    //
  };

  export type SVGFeGaussianBlur = {
    type: "blur";

    /**
     * blur radius
     *
     * a.k.a. stdDeviation in SVG <feGaussianBlur>
     */
    radius: number;
  };

  /**
   *
   * [top-left | top-right | bottom-right | bottom-left]
   */
  export type CornerRadius4 = [number, number, number, number];

  /**
   * all | <[top-left | top-right | bottom-right | bottom-left]>
   */
  export type CornerRadius = number | CornerRadius4;

  export function cornerRadius4Identical(value: CornerRadius4): boolean {
    if (typeof value === "number") return true;
    return (
      value[0] === value[1] && value[1] === value[2] && value[2] === value[3]
    );
  }
}

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
   * only applicable to layers, not paints.
   * if this is used for non supported, it will fallback to "normal".
   */
  export type LayerBlendMode = "pass-through" | BlendMode;

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
   * @see https://skia.org/docs/dev/present/pathops/
   * @see https://www.figma.com/plugin-docs/api/BooleanOperationNode/
   */
  export type BooleanOperation =
    | "difference"
    | "intersection"
    | "union"
    | "xor";

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
  export type BoxFit = "contain" | "cover" | "fill" | "none";

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
  export type TextDecorationLine =
    | "none"
    | "underline"
    | "overline"
    | "line-through";

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration-style
   */
  export type TextDecorationStyle =
    | "solid"
    | "double"
    | "dotted"
    | "dashed"
    | "wavy";

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration-color
   */
  export type TextDecorationColor = "currentcolor" | cg.RGBA8888;
  export type TextDecorationColorValue = cg.RGBA8888;

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration-skip-ink
   */
  export type TextDecorationSkipInk = "auto" | "none";
  export type TextDecorationSkipInkFlag = boolean;

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration-thickness
   *
   * auto or thickness in percentage
   */
  export type TextDecorationThicknessPercentage = "auto" | number;

  /**
   * Text transform modes
   *
   * - `none`
   * - `uppercase`
   * - `lowercase`
   * - `capitalize`
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/text-transform
   */
  export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";

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
   * Open type feature tags
   *
   * @see https://learn.microsoft.com/en-us/typography/opentype/spec/featurelist
   * @see https://learn.microsoft.com/en-us/typography/opentype/spec/featuretags
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_fonts/OpenType_fonts_guide
   */
  export type OpenTypeFeature =
    | "aalt"
    | "abrv"
    | "abvm"
    | "abvs"
    | "afrc"
    | "akhn"
    | "blwf"
    | "blwm"
    | "blws"
    | "c2pc"
    | "calt"
    | "case"
    | "ccmp"
    | "cfar"
    | "cjct"
    | "clig"
    | "cpct"
    | "cpsp"
    | "cswh"
    | "curs"
    | "cv01"
    | "cv02"
    | "cv03"
    | "cv04"
    | "cv05"
    | "cv06"
    | "cv07"
    | "cv08"
    | "cv09"
    | "cv10"
    | "cv11"
    | "cv12"
    | "cv13"
    | "cv14"
    | "cv15"
    | "cv16"
    | "cv17"
    | "cv18"
    | "cv19"
    | "cv20"
    | "cv21"
    | "cv22"
    | "cv23"
    | "cv24"
    | "cv25"
    | "cv26"
    | "cv27"
    | "cv28"
    | "cv29"
    | "cv30"
    | "cv31"
    | "cv32"
    | "cv33"
    | "cv34"
    | "cv35"
    | "cv36"
    | "cv37"
    | "cv38"
    | "cv39"
    | "cv40"
    | "cv41"
    | "cv42"
    | "cv43"
    | "cv44"
    | "cv45"
    | "cv46"
    | "cv47"
    | "cv48"
    | "cv49"
    | "cv50"
    | "cv51"
    | "cv52"
    | "cv53"
    | "cv54"
    | "cv55"
    | "cv56"
    | "cv57"
    | "cv58"
    | "cv59"
    | "cv60"
    | "cv61"
    | "cv62"
    | "cv63"
    | "cv64"
    | "cv65"
    | "cv66"
    | "cv67"
    | "cv68"
    | "cv69"
    | "cv70"
    | "cv71"
    | "cv72"
    | "cv73"
    | "cv74"
    | "cv75"
    | "cv76"
    | "cv77"
    | "cv78"
    | "cv79"
    | "cv80"
    | "cv81"
    | "cv82"
    | "cv83"
    | "cv84"
    | "cv85"
    | "cv86"
    | "cv87"
    | "cv88"
    | "cv89"
    | "cv90"
    | "cv91"
    | "cv92"
    | "cv93"
    | "cv94"
    | "cv95"
    | "cv96"
    | "cv97"
    | "cv98"
    | "cv99"
    | "dist"
    | "dlig"
    | "dnom"
    | "dtls"
    | "expt"
    | "falt"
    | "fin2"
    | "fin3"
    | "fina"
    | "flac"
    | "fwid"
    | "half"
    | "haln"
    | "halt"
    | "hist"
    | "hkna"
    | "hlig"
    | "hngl"
    | "hojo"
    | "hwid"
    | "init"
    | "isol"
    | "ital"
    | "jp04"
    | "jp78"
    | "jp83"
    | "jp90"
    | "just"
    | "kern"
    | "lfbd"
    | "liga"
    | "ljmo"
    | "locl"
    | "ltra"
    | "ltrm"
    | "mark"
    | "med2"
    | "medi"
    | "mgrk"
    | "mkmk"
    | "nalt"
    | "nlck"
    | "nukt"
    | "numr"
    | "opbd"
    | "ordn"
    | "ornm"
    | "palt"
    | "pcap"
    | "pkna"
    | "pref"
    | "pres"
    | "pstf"
    | "psts"
    | "pwid"
    | "qwid"
    | "rand"
    | "rclt"
    | "rkrf"
    | "rlig"
    | "rphf"
    | "rtbd"
    | "rtla"
    | "rtlm"
    | "ruby"
    | "rvrn"
    | "salt"
    | "sinf"
    | "size"
    | "smpl"
    | "ss01"
    | "ss02"
    | "ss03"
    | "ss04"
    | "ss05"
    | "ss06"
    | "ss07"
    | "ss08"
    | "ss09"
    | "ss10"
    | "ss11"
    | "ss12"
    | "ss13"
    | "ss14"
    | "ss15"
    | "ss16"
    | "ss17"
    | "ss18"
    | "ss19"
    | "ss20"
    | "ssty"
    | "stch"
    | "swsh"
    | "titl"
    | "tjmo"
    | "tnam"
    | "trad"
    | "twid"
    | "unic"
    | "valt"
    | "vatu"
    | "vert"
    | "vhal"
    | "vjmo"
    | "vkna"
    | "vkrn"
    | "vpal"
    | "vrt2"
    | "vrtr"
    | "zero";

  /**
   * Supported font weights in numeric values
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight
   * @see https://api.flutter.dev/flutter/dart-ui/FontWeight-class.html
   * @see https://learn.microsoft.com/en-us/typography/opentype/spec/os2#usweightclass
   */
  export type NFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

  /**
   * css font-style values
   */
  export type CSSFontStyle = "normal" | "italic" | "oblique";

  /**
   * Optical sizing modes
   *
   * - `"auto"` links optical size to `fontSize`
   * - `"none"` disables optical sizing
   * - `number` sets a fixed optical size value
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-optical-sizing
   */
  export type OpticalSizing = "auto" | "none" | number;

  /**
   * Font kerning modes
   *
   * - `"normal"` enables kerning
   * - `"none"` disables kerning
   *
   * @remark we don't support `auto`. use `normal` instead.
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-kerning
   * @default `auto`
   */
  export type FontKerning = "normal" | "none";

  /**
   * Font kerning flag
   *
   * @see {@link FontKerning}
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-kerning
   * @default `true`
   */
  export type FontKerningFlag = boolean;

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

  export type Paint =
    | SolidPaint
    | LinearGradientPaint
    | RadialGradientPaint
    | SweepGradientPaint
    | DiamondGradientPaint
    | ImagePaint;

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
      Partial<RadialGradientPaint> &
      Partial<SweepGradientPaint> &
      Partial<DiamondGradientPaint> &
      Partial<ImagePaint>,
    "type"
  > & { type: Paint["type"] };

  export type SolidPaint = {
    type: "solid";
    color: cg.RGBA8888;
    blendMode?: cg.BlendMode;
  };

  export type GradientPaint =
    | LinearGradientPaint
    | RadialGradientPaint
    | SweepGradientPaint
    | DiamondGradientPaint;

  export function isSolidPaint(paint?: cg.Paint): paint is cg.SolidPaint {
    return paint?.type === "solid";
  }

  export function isImagePaint(paint?: cg.Paint): paint is cg.ImagePaint {
    return paint?.type === "image";
  }

  export function isGradientPaint(paint?: cg.Paint): paint is cg.GradientPaint {
    return (
      paint?.type === "linear_gradient" ||
      paint?.type === "radial_gradient" ||
      paint?.type === "sweep_gradient" ||
      paint?.type === "diamond_gradient"
    );
  }

  export type LinearGradientPaint = {
    type: "linear_gradient";
    transform: AffineTransform;
    stops: Array<GradientStop>;

    /**
     * @default "normal" {@link cg.def.BLENDMODE}
     */
    blendMode: cg.BlendMode;

    /**
     * @default 1
     */
    opacity: number;
  };

  export type RadialGradientPaint = {
    type: "radial_gradient";
    transform: AffineTransform;
    stops: Array<GradientStop>;

    /**
     * @default "normal" {@link cg.def.BLENDMODE}
     */
    blendMode: cg.BlendMode;

    /**
     * @default 1
     */
    opacity: number;
  };

  export type SweepGradientPaint = {
    type: "sweep_gradient";
    transform: AffineTransform;
    stops: Array<GradientStop>;

    /**
     * @default "normal" {@link cg.def.BLENDMODE}
     */
    blendMode: cg.BlendMode;

    /**
     * @default 1
     */
    opacity: number;
  };

  export type DiamondGradientPaint = {
    type: "diamond_gradient";
    transform: AffineTransform;
    stops: Array<GradientStop>;

    /**
     * @default "normal" {@link cg.def.BLENDMODE}
     */
    blendMode: cg.BlendMode;

    /**
     * @default 1
     */
    opacity: number;
  };

  export type ImagePaint = {
    type: "image";
    src: string;
    fit: BoxFit;
    transform: AffineTransform;
    filters: ImageFilters;

    /**
     * @default "normal" {@link cg.def.BLENDMODE}
     */
    blendMode: cg.BlendMode;

    /**
     * @default 1
     */
    opacity: number;
  };

  export interface ImageFilters {
    /**
     * Exposure adjustment (-1.0 to 1.0, default: 0.0)
     * Controls the overall brightness of the image.
     * - -1.0 = very dark
     * - 0.0 = original (no change)
     * - 1.0 = very bright
     */
    exposure: number;
    /**
     * Contrast adjustment (-0.3 to 0.3, default: 0.0)
     * Controls the difference between light and dark areas.
     * - -0.3 = low contrast (UI cap)
     * - 0.0 = original contrast
     * - 0.3 = high contrast (UI cap)
     */
    contrast: number;
    /**
     * Saturation adjustment (-1.0 to 1.0, default: 0.0)
     * Controls the intensity of colors.
     * - -1.0 = grayscale (no color)
     * - 0.0 = original saturation
     * - 1.0 = highly oversaturated
     */
    saturation: number;
    /**
     * Temperature adjustment (-1.0 to 1.0, default: 0.0)
     * Controls the warm/cool color balance.
     * - -1.0 = very cool (blue tint)
     * - 0.0 = neutral (no change)
     * - 1.0 = very warm (orange tint)
     */
    temperature: number;
    /**
     * Tint adjustment (-1.0 to 1.0, default: 0.0)
     * Controls the green/magenta color balance.
     * - -1.0 = strong magenta tint
     * - 0.0 = neutral (no change)
     * - 1.0 = strong green tint
     */
    tint: number;
    /**
     * Highlights adjustment (-1.0 to 1.0, default: 0.0)
     * Controls the brightness of highlight areas.
     * - -1.0 = darken highlights
     * - 0.0 = no change
     * - 1.0 = brighten highlights
     */
    highlights: number;
    /**
     * Shadows adjustment (-1.0 to 1.0, default: 0.0)
     * Controls the brightness of shadow areas.
     * - -1.0 = darken shadows
     * - 0.0 = no change
     * - 1.0 = brighten shadows
     */
    shadows: number;
  }

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

  export type VariableWidthStop = {
    /**
     * u(t)
     * 0-1
     * 0 - start (0%)
     * 1 - end (100%)
     */
    u: number;
    /**
     * r px
     */
    r: number;
  };
  export type VariableWidthProfile = {
    stops: VariableWidthStop[];
  };

  /**
   * strict, solid default values.
   * not all types have default values.
   *
   * only struct, widely aknowledged, de-facto standard defaults will be set.
   *
   * this is aligned in cg crate's default values.
   */
  export namespace def {
    export const LAYER_BLENDMODE: cg.LayerBlendMode = "pass-through";
    export const BLENDMODE: cg.BlendMode = "normal";

    export const IMAGE_FILTERS: cg.ImageFilters = {
      exposure: 0.0,
      contrast: 0.0,
      saturation: 0.0,
      temperature: 0.0,
      tint: 0.0,
      highlights: 0.0,
      shadows: 0.0,
    };
  }
}

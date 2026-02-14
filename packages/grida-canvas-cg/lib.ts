import kolor from "@grida/color";

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
  export type RGBA_UNKNOWN = {
    r: number;
    g: number;
    b: number;
    a: number;
  };

  /**
   * Standard f32 RGBA (Normalized RGBA)
   * Used in computer graphics pipelines, shading, and rendering.
   */
  export type RGBA32F = kolor.colorformats.RGBA32F;

  /**
   * 8-bit Integer RGB, f32 alpha (CSS' rgba format)
   */
  export type RGB888A32F = kolor.colorformats.RGB888A32F;

  export type LayerMaskType = "geometry" | ImageMaskType;
  export type ImageMaskType = "alpha" | "luminance";

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
    fill_rule: FillRule;
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
   * Built-in marker presets placed at stroke endpoints or vector vertices.
   *
   * Unlike {@link StrokeCap} (which maps to native backend caps like Skia PaintCap),
   * StrokeMarkerPreset represents explicit marker geometry drawn on top of the
   * stroke path. When a preset is present at an endpoint, the renderer
   * uses Butt cap at that endpoint and draws the marker geometry instead.
   *
   * @see docs/wg/feat-2d/curve-decoration.md
   */
  export type StrokeMarkerPreset =
    | "none"
    | "right_triangle_open"
    | "equilateral_triangle"
    | "circle"
    | "square"
    | "diamond"
    | "vertical_bar";

  /**
   * Supported stroke join modes
   *
   * - `miter`
   * - `round`
   * - `bevel`
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-linejoin
   * @see https://api.flutter.dev/flutter/dart-ui/StrokeJoin.html
   */
  export type StrokeJoin = "miter" | "round" | "bevel";

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
  export type TextDecorationColor = "currentcolor" | cg.RGBA32F;
  export type TextDecorationColorValue = cg.RGBA32F;

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

  /**
   * A line segment in 2D space defined by two points.
   *
   * This type provides a generic structure for representing a line segment.
   * The coordinate system and scale of the values depend on the usage context:
   * - May represent **normalized coordinates** (e.g., 0.0 to 1.0 or -1.0 to 1.0)
   * - May represent **relative coordinates** within a parent container
   * - May represent **absolute pixel values**
   *
   * Always refer to the specific API documentation to understand which coordinate
   * system is being used.
   */
  export type Line2D = {
    /**
     * X coordinate of the line's start point
     */
    x1: number;
    /**
     * Y coordinate of the line's start point
     */
    y1: number;
    /**
     * X coordinate of the line's end point
     */
    x2: number;
    /**
     * Y coordinate of the line's end point
     */
    y2: number;
  };

  /**
   * A point within a rectangle using a normalized coordinate system.
   *
   * `Alignment(0.0, 0.0)` represents the center of the rectangle. The distance from -1.0 to +1.0
   * is the distance from one side of the rectangle to the other side of the rectangle. Therefore,
   * 2.0 units horizontally (or vertically) is equivalent to the width (or height) of the rectangle.
   *
   * ### Coordinate System:
   * - `Alignment(-1.0, -1.0)` represents the top left of the rectangle.
   * - `Alignment(1.0, 1.0)` represents the bottom right of the rectangle.
   * - `Alignment(0.0, 0.0)` represents the center of the rectangle.
   *
   * ### Examples:
   * - `Alignment(0.0, 3.0)` represents a point that is horizontally centered with respect to
   *   the rectangle and vertically below the bottom of the rectangle by the height of the rectangle.
   * - `Alignment(0.0, -0.5)` represents a point that is horizontally centered with respect to
   *   the rectangle and vertically half way between the top edge and the center.
   *
   * ### Mapping to Pixel Coordinates:
   * `Alignment(x, y)` in a rectangle with height `h` and width `w` describes the point
   * `(x * w/2 + w/2, y * h/2 + h/2)` in the coordinate system of the rectangle.
   *
   * @see https://api.flutter.dev/flutter/painting/Alignment-class.html
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/percentage
   */
  export type Alignment = {
    /**
     * Horizontal alignment value.
     * - `-1.0` = left edge
     * - `0.0` = horizontal center
     * - `1.0` = right edge
     */
    x: number;
    /**
     * Vertical alignment value.
     * - `-1.0` = top edge
     * - `0.0` = vertical center
     * - `1.0` = bottom edge
     */
    y: number;
  };

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
      color: kolor.colorformats.RGBA32F.TRANSPARENT,
      active: true,
    };

    export const black: Paint = {
      type: "solid",
      color: kolor.colorformats.RGBA32F.BLACK,
      active: true,
    };

    export const white: Paint = {
      type: "solid",
      color: kolor.colorformats.RGBA32F.WHITE,
      active: true,
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
    color: cg.RGBA32F;
    blend_mode?: cg.BlendMode;
    active: boolean;
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
    blend_mode: cg.BlendMode;

    /**
     * @default 1
     */
    opacity: number;
    active: boolean;
  };

  export type RadialGradientPaint = {
    type: "radial_gradient";
    transform: AffineTransform;
    stops: Array<GradientStop>;

    /**
     * @default "normal" {@link cg.def.BLENDMODE}
     */
    blend_mode: cg.BlendMode;

    /**
     * @default 1
     */
    opacity: number;
    active: boolean;
  };

  export type SweepGradientPaint = {
    type: "sweep_gradient";
    transform: AffineTransform;
    stops: Array<GradientStop>;

    /**
     * @default "normal" {@link cg.def.BLENDMODE}
     */
    blend_mode: cg.BlendMode;

    /**
     * @default 1
     */
    opacity: number;
    active: boolean;
  };

  export type DiamondGradientPaint = {
    type: "diamond_gradient";
    transform: AffineTransform;
    stops: Array<GradientStop>;

    /**
     * @default "normal" {@link cg.def.BLENDMODE}
     */
    blend_mode: cg.BlendMode;

    /**
     * @default 1
     */
    opacity: number;
    active: boolean;
  };

  export type ImagePaint = {
    type: "image";
    src: string;
    /**
     * box fit or custom transform
     */
    fit: "contain" | "cover" | "fill" | "none" | "transform" | "tile";
    /**
     * transform will only take effect if fit is "transform"
     *
     * @default identity
     */
    transform?: AffineTransform;
    /**
     * Number of clockwise quarter turns to apply to the decoded image before layout math.
     * The value is normalized modulo 4 (`0` = 0°, `1` = 90° CW, `2` = 180°, `3` = 270° CW).
     * This discrete rotation keeps pixels on the integer grid without resampling.
     *
     * @default 0
     */
    quarter_turns?: number;

    /**
     * when mode is "tile", scale the image to the given value.
     *
     * @default 1
     */
    scale?: number;

    filters: ImageFilters;

    /**
     * @default "normal" {@link cg.def.BLENDMODE}
     */
    blend_mode: cg.BlendMode;

    /**
     * @default 1
     */
    opacity: number;
    active: boolean;
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
    color: cg.RGBA32F;
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
    color: RGBA32F;

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

    color: RGBA32F;

    /**
     * Whether this effect is active
     * @default true
     */
    active?: boolean;
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

  /**
   * Progressive blur effect that interpolates blur radius along a line.
   *
   * Extends {@link Line2D} using **normalized coordinates** (-1.0 to 1.0).
   * The blur gradually transitions from `radius` at the start point to `radius2` at the end point.
   *
   * ### Coordinate System:
   * - `x1`, `y1`: Start point in normalized coordinates
   * - `x2`, `y2`: End point in normalized coordinates
   * - The coordinate system follows the same convention as {@link Alignment}:
   *   - `-1.0` to `1.0` spans the full width/height
   *   - `(0.0, 0.0)` is the center
   */
  export interface IFeProgressiveBlur extends Line2D {
    /**
     * Blur radius at the start point (x1, y1) in pixels
     */
    radius: number;
    /**
     * Blur radius at the end point (x2, y2) in pixels
     */
    radius2: number;
  }

  export type FeProgressiveBlur = IFeProgressiveBlur & {
    type: "progressive-blur";
  };

  export type FilterEffect =
    | FeShadow
    | FeLayerBlur
    | FeBackdropBlur
    | FeLiquidGlass
    | FeNoise;

  export type FeShadow = IFeShadow & {
    type: "shadow";
    inset?: boolean;
  };

  export type FeBlur = FeGaussianBlur | FeProgressiveBlur;

  export type FeLayerBlur = {
    type: "filter-blur";
    blur: FeBlur;
    /**
     * Whether this effect is active
     * @default true
     */
    active?: boolean;
  };

  export type FeBackdropBlur = {
    type: "backdrop-filter-blur";
    blur: FeBlur;
    /**
     * Whether this effect is active
     * @default true
     */
    active?: boolean;
  };

  /**
   * Liquid Glass Effect
   *
   * A visual effect that creates a realistic glass appearance with light refraction,
   * highlights, and chromatic aberration.
   */
  export type FeLiquidGlass = {
    type: "glass";
    /**
     * The intensity of specular highlights.
     * Must be between 0 and 1. Higher values create brighter highlights.
     *
     * Adjust the angle and intensity of the light illuminating your glass containers
     * to change where the highlight appears on the container's edge.
     *
     * @default 0.9
     */
    light_intensity: number;

    /**
     * The angle of the specular light in degrees.
     * Controls the direction of highlights on the glass surface.
     *
     * @default 45.0
     */
    light_angle: number;

    /**
     * Refraction strength [0.0-1.0]
     * 0.0 = no refraction, 0.5 = typical glass, 1.0 = maximum refraction
     * Internally mapped to IOR range [1.0-2.0]
     *
     * Control the way light bends along the edge of your glass container.
     * The higher the refraction value, the more your glass containers will
     * distort the elements around them.
     *
     * @default 0.8
     */
    refraction: number;

    /**
     * Glass thickness/depth for 3D surface effect in pixels [1.0+]
     * Controls the curvature height of the glass surface
     * Higher values create more pronounced lens curvature and stronger refraction
     * Typical values: 20-100 pixels
     *
     * @default 20.0
     */
    depth: number;

    /**
     * Chromatic aberration strength [0.0-1.0]
     * Controls color separation at edges (rainbow effect)
     * Higher values create more rainbow-like distortion at edges.
     *
     * @default 0.5
     */
    dispersion: number;

    /**
     * Blur radius for frosted glass effect [0.0+] in pixels
     * Applied via Skia's native blur before refraction shader
     *
     * @default 4.0
     */
    radius: number;

    /**
     * Whether this effect is active
     * @default true
     */
    active?: boolean;
  };

  /**
   * Procedural Noise Effect
   *
   * Generates Perlin noise patterns with configurable grain size, density, and coloring.
   * Supports three coloring modes: single-color (mono), dual-color (duo), and multi-color (multi).
   *
   * Uses fractal Perlin noise for natural-looking texture with configurable detail through octaves.
   *
   * @example
   * ```typescript
   * // Black film grain overlay
   * const grain: FeNoise = {
   *   type: "noise",
   *   mode: "mono",
   *   noise_size: 0.3,
   *   density: 0.8,
   *   num_octaves: 6,
   *   seed: 42,
   *   color: { r: 0, g: 0, b: 0, a: 0.15 }
   * };
   *
   * // Red noise pattern on white background
   * const duo: FeNoise = {
   *   type: "noise",
   *   mode: "duo",
   *   noise_size: 2.0,
   *   density: 0.5,
   *   num_octaves: 3,
   *   seed: 8539,
   *   color1: { r: 255, g: 0, b: 0, a: 1 },
   *   color2: { r: 255, g: 255, b: 255, a: 0.25 }
   * };
   *
   * // Colorful noise with full opacity
   * const multi: FeNoise = {
   *   type: "noise",
   *   mode: "multi",
   *   noise_size: 1.5,
   *   density: 0.7,
   *   num_octaves: 4,
   *   seed: 1234,
   *   opacity: 1.0
   * };
   * ```
   */
  export type FeNoise = {
    type: "noise";
    /**
     * Noise coloring mode
     * - `"mono"`: Single-color noise pattern
     * - `"duo"`: Dual-color with background and pattern colors
     * - `"multi"`: Multi-color noise (uses noise RGB directly)
     */
    mode: "mono" | "duo" | "multi";
    /**
     * Controls noise grain size (smaller = finer grains)
     * Range: 0.001+
     * Typical values: 0.3 for fine grain, 2.0 for coarse grain
     * UI limit: 100
     *
     * @default 0.5
     */
    noise_size: number;
    /**
     * Controls pattern visibility (0 = sparse, 1 = dense)
     * Range: 0.0 - 1.0
     *
     * @default 0.5
     */
    density: number;
    /**
     * Number of fractal octaves for detail level
     * Range: 1+
     * More octaves = finer detail but more computation
     * UI limit: 8
     *
     * @default 3
     */
    num_octaves?: number;
    /**
     * Random seed for reproducibility
     * Different seeds produce different noise patterns
     *
     * @default 0
     */
    seed?: number;
    /**
     * Blend mode for compositing noise with fill
     *
     * @default "normal" {@link cg.def.BLENDMODE}
     */
    blend_mode?: cg.BlendMode;
    /**
     * Color of noise pixels (mono mode only)
     * Includes alpha for opacity control
     */
    color?: RGBA32F;
    /**
     * Pattern color (duo mode only)
     * Applied where noise is visible
     */
    color1?: RGBA32F;
    /**
     * Background color (duo mode only)
     * Base layer behind the noise pattern
     */
    color2?: RGBA32F;
    /**
     * Overall opacity (multi mode only)
     * Range: 0.0 - 1.0
     *
     * @default 1.0
     */
    opacity?: number;

    /**
     * Whether this effect is active
     * @default true
     */
    active?: boolean;
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

    export const ALIGNMENT = {
      CENTER: { x: 0.0, y: 0.0 },
      TOP_LEFT: { x: -1.0, y: -1.0 },
      TOP_CENTER: { x: 0.0, y: -1.0 },
      TOP_RIGHT: { x: 1.0, y: -1.0 },
      CENTER_LEFT: { x: -1.0, y: 0.0 },
      CENTER_RIGHT: { x: 1.0, y: 0.0 },
      BOTTOM_LEFT: { x: -1.0, y: 1.0 },
      BOTTOM_CENTER: { x: 0.0, y: 1.0 },
      BOTTOM_RIGHT: { x: 1.0, y: 1.0 },
    } satisfies Record<string, cg.Alignment>;
  }
}

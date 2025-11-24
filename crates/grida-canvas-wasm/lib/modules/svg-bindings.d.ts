export namespace svgtypes {
  // ====================================================================================================
  // #region: Core Type Definitions
  // ====================================================================================================

  /**
   * rust/serde Option<T> equivalant
   */
  type TOption<T> = T | null;
  type RGBA8888 = [r: number, g: number, b: number, a: number];
  type Transform2D = [[number, number, number], [number, number, number]];
  type StrokeCap = "butt" | "round" | "square";
  type StrokeJoin = "miter" | "round" | "bevel";
  type FillRule = "nonzero" | "evenodd";
  type BlendMode =
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

  export enum SVGTextAnchor {
    start = "start",
    middle = "middle",
    end = "end",
  }

  export enum SVGSpreadMethod {
    pad = "pad",
    reflect = "reflect",
    repeat = "repeat",
  }

  export interface SVGSolidPaint {
    kind: "solid";
    color: RGBA8888;
  }

  export interface SVGGradientStop {
    color: RGBA8888;
    offset: number;
    // opacity: number;
  }

  export interface SVGLinearGradientPaint {
    kind: "linear-gradient";
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    transform: Transform2D;
    stops: Array<SVGGradientStop>;
    spread_method: SVGSpreadMethod;
  }

  export interface SVGRadialGradientPaint {
    kind: "radial-gradient";
    id: string;
    cx: number;
    cy: number;
    r: number;
    fx: number;
    fy: number;
    transform: Transform2D;
    stops: Array<SVGGradientStop>;
    spread_method: SVGSpreadMethod;
  }

  export type SVGPaint =
    | SVGSolidPaint
    | SVGLinearGradientPaint
    | SVGRadialGradientPaint;

  export interface SVGFillAttributes {
    paint: SVGPaint;
    fill_opacity: number;
    fill_rule: FillRule;
  }

  export interface SVGStrokeAttributes {
    paint: SVGPaint;
    stroke_width: TOption<number>;
    stroke_linecap: StrokeCap;
    stroke_linejoin: StrokeJoin;
    stroke_miterlimit: number;
    stroke_dasharray: TOption<Array<number>>;
    stroke_opacity: number;
  }

  export namespace ir {
    export interface IRSVGInitialContainerNode {
      width: number;
      height: number;
      children: Array<IRSVGChildNode>;
    }

    export type IRSVGChildNode =
      | IRSVGGroupNode
      | IRSVGPathNode
      | IRSVGTextNode
      | IRSVGImageNode;

    export interface IRSVGGroupNode {
      kind: "group";
      transform: Transform2D;
      opacity: number;
      blend_mode: BlendMode;
      children: Array<IRSVGChildNode>;
    }

    export interface IRSVGPathNode {
      kind: "path";
      transform: Transform2D;
      fill: TOption<SVGFillAttributes>;
      stroke: TOption<SVGStrokeAttributes>;
      d: string;
    }

    export interface IRSVGTextNode {
      kind: "text";
      transform: Transform2D;
      text_content: string;
      fill: TOption<SVGFillAttributes>;
      stroke: TOption<SVGStrokeAttributes>;
      spans: Array<IRSVGTextSpanNode>;
    }

    export interface IRSVGTextSpanNode {
      transform: Transform2D;
      text: string;
      fill: TOption<SVGFillAttributes>;
      stroke: TOption<SVGStrokeAttributes>;
      font_size: TOption<number>;
      anchor: SVGTextAnchor;
    }

    export interface IRSVGImageNode {
      kind: "image";
    }
  }
}

export namespace svg {
  export type SVGOptimizeResponse = CAPIMethodResult<{
    /** Optimized SVG string with CSS styles resolved and inlined */
    svg_optimized: string;
  }>;

  export type SVGPackResponse = CAPIMethodResult<{
    svg: svgtypes.ir.IRSVGInitialContainerNode;
  }>;

  // ====================================================================================================
  // #region: WASM Function Declarations
  // ====================================================================================================

  export interface SVGModule {
    // ====================================================================================================
    // #region: High-Level SVG APIs
    // ====================================================================================================

    /**
     * Optimizes and resolves an SVG, producing a flat, self-contained SVG output.
     * Resolves CSS styles from `<style>` tags and inlines them as element attributes.
     *
     * @param svg - Pointer to input SVG string (null-terminated C string)
     * @returns Pointer to JSON string containing {@link svgtypes.SvgOptimizeResponse}
     */
    _grida_svg_optimize(svg: CPtr): CPtr;

    _grida_svg_pack(sgv: CPtr): CPtr;
  }
}

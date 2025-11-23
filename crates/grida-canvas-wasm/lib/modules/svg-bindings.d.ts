export namespace svg {
  export namespace types {
    // ====================================================================================================
    // #region: Core Type Definitions
    // ====================================================================================================

    /** SVG optimization result */
    export interface SvgOptimizeResult {
      /** Optimized SVG string with CSS styles resolved and inlined */
      svg_optimized: string;
    }

    /** Error response for failed operations */
    export interface SvgError {
      success: false;
      error: {
        message: string;
      };
    }

    export type SvgOptimizeResponse =
      | {
          success: true;
          data: SvgOptimizeResult;
        }
      | SvgError;
  }

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
     * @returns Pointer to JSON string containing {@link types.SvgOptimizeResponse}
     */
    _grida_svg_optimize(svg: number): number;
  }
}

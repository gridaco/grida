export namespace svg {
  export type SVGOptimizeResponse = CAPIMethodResult<{
    /** Optimized SVG string with CSS styles resolved and inlined */
    svg_optimized: string;
  }>;

  export interface SVGModule {
    /**
     * Optimizes and resolves an SVG, producing a flat, self-contained SVG output.
     * Resolves CSS styles from `<style>` tags and inlines them as element attributes.
     *
     * @param svg - Pointer to input SVG string (null-terminated C string)
     * @returns Pointer to JSON string containing SVGOptimizeResponse
     */
    _grida_svg_optimize(svg: CPtr): CPtr;

    /**
     * Parse SVG and return `.grida` FlatBuffers bytes.
     *
     * Returns a pointer to a length-prefixed buffer (u32 LE length + FBS
     * bytes), or null on error.
     *
     * @param svg - Pointer to input SVG string (null-terminated C string)
     * @returns Pointer to length-prefixed FBS buffer, or 0 (null) on error
     */
    _grida_svg_to_document(svg: CPtr): CPtr;
  }
}

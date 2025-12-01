// ====================================================================================================
// #region: High-Level JavaScript Wrapper Functions
// ====================================================================================================

import type { svg, svgtypes } from "./svg-bindings";

export class SVGAPI {
  private module: createGridaCanvas.GridaCanvasWasmBindings;

  constructor(module: any) {
    this.module = module;
  }

  /**
   * Allocates memory for a string and returns pointer and length.
   * @param txt - String to allocate
   * @returns [pointer, length] tuple
   */
  private _alloc_string(txt: string): [number, number] {
    const len = this.module.lengthBytesUTF8(txt) + 1;
    const ptr = this.module._allocate(len);
    this.module.stringToUTF8(txt, ptr, len);
    return [ptr, len];
  }

  /**
   * Frees memory allocated for a string.
   * @param ptr - Pointer to free
   * @param len - Length of allocated memory
   */
  private _free_string(ptr: number, len: number) {
    this.module._deallocate(ptr, len);
  }

  /**
   * Converts a WASM-allocated string to JavaScript string and frees the WASM memory.
   * @param ptr - Pointer to WASM string
   * @returns JavaScript string
   */
  private _string_from_wasm(ptr: number): string {
    const str = this.module.UTF8ToString(ptr);
    const len = this.module.lengthBytesUTF8(str) + 1;
    this._free_string(ptr, len);
    return str;
  }

  /**
   * Optimizes and resolves an SVG with JavaScript-friendly interface.
   * Resolves CSS styles from `<style>` tags and inlines them as element attributes.
   *
   * @param svg - Input SVG string
   * @returns Promise resolving to SvgOptimizeResponse
   */
  optimize(svg: string): svg.SVGOptimizeResponse {
    let svgPtr: number | null = null;
    let svgLen: number | null = null;
    try {
      // Allocate SVG string
      [svgPtr, svgLen] = this._alloc_string(svg);

      // Call WASM function
      const resultPtr = this.module._grida_svg_optimize(svgPtr);

      // Get result
      const resultJson = this._string_from_wasm(resultPtr);
      const result = JSON.parse(resultJson) as svg.SVGOptimizeResponse;

      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    } finally {
      // Always clean up allocated memory
      if (svgPtr !== null && svgLen !== null) {
        this._free_string(svgPtr, svgLen);
      }
    }
  }

  pack(svg: string): svg.SVGPackResponse {
    let svgPtr: number | null = null;
    let svgLen: number | null = null;
    try {
      [svgPtr, svgLen] = this._alloc_string(svg);
      const resultPtr = this.module._grida_svg_pack(svgPtr);
      const resultJson = this._string_from_wasm(resultPtr);
      return JSON.parse(resultJson);
    } finally {
      // Always clean up allocated memory
      if (svgPtr !== null && svgLen !== null) {
        this._free_string(svgPtr, svgLen);
      }
    }
  }
}

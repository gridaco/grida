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

  /**
   * Parse SVG and return `.grida` FlatBuffers bytes.
   *
   * This replaces the two-step pipeline (pack → JS convert) with a
   * single Rust call that produces the FBS binary directly.
   *
   * @returns Uint8Array of FBS bytes, or null on error
   */
  toDocument(svg: string): Uint8Array | null {
    let svgPtr: number | null = null;
    let svgLen: number | null = null;
    try {
      [svgPtr, svgLen] = this._alloc_string(svg);
      const resultPtr = this.module._grida_svg_to_document(svgPtr);
      if (resultPtr === 0) return null;

      // Read length-prefixed buffer: first 4 bytes = u32 LE length
      const heap = new Uint8Array(
        (this.module as any).HEAPU8.buffer as ArrayBuffer
      );
      const len =
        heap[resultPtr] |
        (heap[resultPtr + 1] << 8) |
        (heap[resultPtr + 2] << 16) |
        (heap[resultPtr + 3] << 24);
      // Copy the FBS bytes out of WASM memory
      const bytes = new Uint8Array(len);
      bytes.set(heap.subarray(resultPtr + 4, resultPtr + 4 + len));

      // Free the WASM allocation (4 bytes length prefix + payload)
      this.module._deallocate(resultPtr, 4 + len);

      return bytes;
    } catch (error) {
      return null;
    } finally {
      if (svgPtr !== null && svgLen !== null) {
        this._free_string(svgPtr, svgLen);
      }
    }
  }
}

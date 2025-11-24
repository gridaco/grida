// ====================================================================================================
// #region: High-Level JavaScript Wrapper Functions
// ====================================================================================================

import type { markdown } from "./markdown-bindings";

export class MarkdownAPI {
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
   * Converts markdown text to HTML with JavaScript-friendly interface.
   * Parses markdown content and converts it to HTML using the pulldown-cmark library.
   *
   * @param markdown - Input markdown string
   * @returns MarkdownToHtmlResponse containing the converted HTML or error information
   */
  toHtml(markdown: string): markdown.MarkdownToHtmlResponse {
    let markdownPtr: number | null = null;
    let markdownLen: number | null = null;
    try {
      // Allocate markdown string
      [markdownPtr, markdownLen] = this._alloc_string(markdown);

      // Call WASM function
      const resultPtr = this.module._grida_markdown_to_html(markdownPtr);

      // Get result
      const resultJson = this._string_from_wasm(resultPtr);
      const result = JSON.parse(resultJson) as markdown.MarkdownToHtmlResponse;

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
      if (markdownPtr !== null && markdownLen !== null) {
        this._free_string(markdownPtr, markdownLen);
      }
    }
  }
}


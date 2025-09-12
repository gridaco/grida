// ====================================================================================================
// #region: High-Level JavaScript Wrapper Functions
// ====================================================================================================

import type { fonts } from "./fonts-bindings";

export class FontsAPI {
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
   * Allocates memory for binary data and returns pointer.
   * @param data - Binary data to allocate
   * @returns [pointer, length] tuple
   */
  private _alloc_data(data: ArrayBuffer | Uint8Array): [number, number] {
    const uint8Data = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const len = uint8Data.length;
    const ptr = this.module._allocate(len);
    this.module.HEAPU8.set(uint8Data, ptr);
    return [ptr, len];
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
   * Analyzes a font family with JavaScript-friendly interface.
   * This is the main API for working with multiple font files under the same family.
   *
   * @param fontFaces - Array of font face objects
   * @param familyName - Family name (optional)
   * @returns Promise resolving to FontAnalysisResult or FontError
   */
  async analyzeFamily(
    fontFaces: Array<{
      faceId: string;
      data: ArrayBuffer | Uint8Array;
      userFontStyleItalic?: boolean;
    }>,
    familyName?: string
  ): Promise<fonts.types.FontFamilyAnalysisResponse> {
    try {
      const fontCount = fontFaces.length;

      // Allocate family name
      const familyNamePtr = familyName ? this._alloc_string(familyName)[0] : 0;

      // Allocate arrays for face data
      const faceIdsPtr = this.module._allocate(fontCount * 4); // Array of pointers
      const fontDataPtrsPtr = this.module._allocate(fontCount * 4); // Array of pointers
      const fontDataSizesPtr = this.module._allocate(fontCount * 4); // Array of sizes
      const userItalicFlagsPtr = this.module._allocate(fontCount * 4); // Array of flags

      const faceIdPtrs: number[] = [];
      const fontDataPtrs: number[] = [];
      const fontDataSizes: number[] = [];
      const userItalicFlags: number[] = [];

      // Allocate memory for each font face
      for (let i = 0; i < fontCount; i++) {
        const face = fontFaces[i];

        // Allocate face ID string
        const [faceIdPtr, faceIdLen] = this._alloc_string(face.faceId);
        faceIdPtrs.push(faceIdPtr);

        // Allocate font data
        const [fontDataPtr, fontDataSize] = this._alloc_data(face.data);
        fontDataPtrs.push(fontDataPtr);
        fontDataSizes.push(fontDataSize);

        // Set user italic flag (-1 = null, 0 = false, 1 = true)
        const italicFlag =
          face.userFontStyleItalic === undefined
            ? -1
            : face.userFontStyleItalic
              ? 1
              : 0;
        userItalicFlags.push(italicFlag);
      }

      // Write arrays to WASM memory
      for (let i = 0; i < fontCount; i++) {
        this.module.HEAPU32[faceIdsPtr / 4 + i] = faceIdPtrs[i];
        this.module.HEAPU32[fontDataPtrsPtr / 4 + i] = fontDataPtrs[i];
        this.module.HEAPU32[fontDataSizesPtr / 4 + i] = fontDataSizes[i];
        this.module.HEAP32[userItalicFlagsPtr / 4 + i] = userItalicFlags[i];
      }

      // Call WASM function
      const resultPtr = this.module._grida_fonts_analyze_family(
        familyNamePtr,
        fontCount,
        faceIdsPtr,
        fontDataPtrsPtr,
        fontDataSizesPtr,
        userItalicFlagsPtr
      );

      // Get result
      const resultJson = this._string_from_wasm(resultPtr);
      const result = JSON.parse(resultJson) as
        | fonts.types.FontFamilyAnalysisResponse
        | fonts.types.FontError;

      // Clean up memory
      if (familyNamePtr !== 0) {
        this._free_string(
          familyNamePtr,
          this.module.lengthBytesUTF8(familyName || "") + 1
        );
      }

      this.module._deallocate(faceIdsPtr, fontCount * 4);
      this.module._deallocate(fontDataPtrsPtr, fontCount * 4);
      this.module._deallocate(fontDataSizesPtr, fontCount * 4);
      this.module._deallocate(userItalicFlagsPtr, fontCount * 4);

      // Free individual allocations
      for (let i = 0; i < fontCount; i++) {
        this._free_string(
          faceIdPtrs[i],
          this.module.lengthBytesUTF8(fontFaces[i].faceId) + 1
        );
        this.module._deallocate(fontDataPtrs[i], fontDataSizes[i]);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      } satisfies fonts.types.FontError;
    }
  }

  /**
   * Parses a single font file with JavaScript-friendly interface.
   * This is exposed for fast, single font analysis.
   *
   * @param fontData - Font data as ArrayBuffer or Uint8Array
   * @param faceId - Unique identifier for this font face
   * @param userFontStyleItalic - User-declared italic style (optional)
   * @returns Promise resolving to FaceRecord
   */
  async parseFont(
    fontData: ArrayBuffer | Uint8Array,
    faceId: string,
    userFontStyleItalic?: boolean
  ): Promise<fonts.types.FaceRecord> {
    try {
      // Allocate font data
      const [fontDataPtr, fontDataSize] = this._alloc_data(fontData);

      // Allocate face ID string
      const [faceIdPtr, faceIdLen] = this._alloc_string(faceId);

      // Allocate user italic flag string
      const userItalicPtr =
        userFontStyleItalic !== undefined
          ? this._alloc_string(userFontStyleItalic.toString())[0]
          : 0;

      // Call WASM function
      const resultPtr = this.module._grida_fonts_parse_font(
        fontDataPtr,
        fontDataSize,
        faceIdPtr,
        userItalicPtr
      );

      // Get result
      const resultJson = this._string_from_wasm(resultPtr);
      const result = JSON.parse(resultJson) as fonts.types.FaceRecord;

      // Clean up memory
      this.module._deallocate(fontDataPtr, fontDataSize);
      this._free_string(faceIdPtr, faceIdLen);
      if (userItalicPtr !== 0) {
        this._free_string(userItalicPtr, 6); // "true" or "false" + null terminator
      }

      return result;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Gets the version of the font parsing library.
   * This is a ping function to verify the WASM module is working.
   *
   * @returns Version string
   */
  getVersion(): string {
    try {
      const versionPtr = this.module._grida_fonts_version();
      return this._string_from_wasm(versionPtr);
    } catch (error) {
      return "unknown";
    }
  }
}

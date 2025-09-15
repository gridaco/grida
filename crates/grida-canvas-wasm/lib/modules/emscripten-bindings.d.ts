// #region
// ====================================================================================================
// EMSCRIPTEN EXPOSED METHODS
// ====================================================================================================

declare namespace emscripten {
  export interface emscripten_EXPORTED_RUNTIME_METHODS {
    GL: {
      registerContext(
        context: WebGLRenderingContext,
        options: { majorVersion: number }
      ): number;
      makeContextCurrent(handle: number): void;
    };

    HEAP8: Int8Array;
    HEAP16: Int16Array;
    HEAP32: Int32Array;
    HEAPF32: Float32Array;
    HEAPF64: Float64Array;
    HEAPU8: Uint8Array;
    HEAPU16: Uint16Array;
    HEAPU32: Uint32Array;

    UTF8ToString(ptr: number, maxBytesToRead?: number): string;
    stringToUTF8(str: string, outPtr: number, maxBytesToWrite: number): void;
    lengthBytesUTF8(str: string): number;
  }
}

// #endregion

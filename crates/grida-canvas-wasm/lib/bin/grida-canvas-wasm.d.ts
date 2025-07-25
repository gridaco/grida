///
/// see
/// - https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/emscripten/index.d.ts
///

export = createGridaCanvas;
export as namespace createGridaCanvas;

declare function createGridaCanvas(moduleArg?: {
  locateFile?: (path: string, scriptDirectory: string) => string;
}): Promise<createGridaCanvas.GridaCanvasWasmBindings>;

type Ptr = number;

declare namespace createGridaCanvas {
  interface GridaCanvasWasmBindings {
    // #region
    // ====================================================================================================
    // EMSCRIPTEN EXPOSED METHODS
    // ====================================================================================================
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

    ___wbindgen_malloc(a0: number, a1: number): number;
    ___wbindgen_free(a0: number, a1: number, a2: number): void;
    ___wbindgen_realloc(a0: number, a1: number, a2: number, a3: number): number;

    // #endregion

    // core memory wrapper
    _allocate(len: number): number;
    _deallocate(ptr: number, len: number): void;

    // ====================================================================================================
    // INITIALIZATION
    // ====================================================================================================
    _init(
      width: number,
      height: number,
      cfg_font_fallback: boolean
    ): GridaCanvasWebGlApplicationPtr;

    // ====================================================================================================
    // APPLICATION METHODS
    // ====================================================================================================
    _tick(state: GridaCanvasWebGlApplicationPtr, time: number): void;
    _resize_surface(
      state: GridaCanvasWebGlApplicationPtr,
      width: number,
      height: number
    ): void;
    _redraw(state: GridaCanvasWebGlApplicationPtr): void;
    _load_scene_json(
      state: GridaCanvasWebGlApplicationPtr,
      ptr: number,
      len: number
    ): void;
    _load_dummy_scene(state: GridaCanvasWebGlApplicationPtr): void;
    _load_benchmark_scene(
      state: GridaCanvasWebGlApplicationPtr,
      cols: number,
      rows: number
    ): void;
    _pointer_move(
      state: GridaCanvasWebGlApplicationPtr,
      x: number,
      y: number
    ): void;
    _set_main_camera_transform(
      state: GridaCanvasWebGlApplicationPtr,
      a: number,
      c: number,
      e: number,
      b: number,
      d: number,
      f: number
    ): void;
    _get_node_id_from_point(
      state: GridaCanvasWebGlApplicationPtr,
      x: number,
      y: number
    ): Ptr;
    _get_node_ids_from_point(
      state: GridaCanvasWebGlApplicationPtr,
      x: number,
      y: number
    ): Ptr;
    _get_node_ids_from_envelope(
      state: GridaCanvasWebGlApplicationPtr,
      x: number,
      y: number,
      w: number,
      h: number
    ): Ptr;
    _get_node_absolute_bounding_box(
      state: GridaCanvasWebGlApplicationPtr,
      ptr: number,
      len: number
    ): Ptr;

    _export_node_as(
      state: GridaCanvasWebGlApplicationPtr,
      id_ptr: number,
      id_len: number,
      fmt_ptr: number,
      fmt_len: number
    ): Ptr;

    _command(
      state: GridaCanvasWebGlApplicationPtr,
      id: number,
      a: number,
      b: number
    ): void;

    _set_debug(state: GridaCanvasWebGlApplicationPtr, debug: boolean): void;
    _toggle_debug(state: GridaCanvasWebGlApplicationPtr): void;
    _set_verbose(state: GridaCanvasWebGlApplicationPtr, verbose: boolean): void;
    _devtools_rendering_set_show_tiles(
      state: GridaCanvasWebGlApplicationPtr,
      show: boolean
    ): void;
    _devtools_rendering_set_show_fps_meter(
      state: GridaCanvasWebGlApplicationPtr,
      show: boolean
    ): void;
    _devtools_rendering_set_show_stats(
      state: GridaCanvasWebGlApplicationPtr,
      show: boolean
    ): void;
    _devtools_rendering_set_show_hit_testing(
      state: GridaCanvasWebGlApplicationPtr,
      show: boolean
    ): void;
    _devtools_rendering_set_show_ruler(
      state: GridaCanvasWebGlApplicationPtr,
      show: boolean
    ): void;
  }
}

type GridaCanvasWebGlApplicationPtr = number;

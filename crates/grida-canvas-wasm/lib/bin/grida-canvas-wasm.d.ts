export = createGridaCanvas;
export as namespace createGridaCanvas;

declare function createGridaCanvas(moduleArg?: {
  locateFile?: (path: string, scriptDirectory: string) => string;
}): Promise<createGridaCanvas.GridaCanvasWasmBindings>;

declare namespace createGridaCanvas {
  interface GridaCanvasWasmBindings {
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
    stringToUTF8(str: string, outPtr: number, maxBytesToWrite: number): void;
    lengthBytesUTF8(str: string): number;
    ___wbindgen_malloc(a0: number, a1: number): number;
    ___wbindgen_free(a0: number, a1: number, a2: number): void;
    ___wbindgen_realloc(a0: number, a1: number, a2: number, a3: number): number;

    // core memory wrapper
    _allocate(len: number): number;
    _deallocate(ptr: number, len: number): void;

    // ====================================================================================================
    // INITIALIZATION
    // ====================================================================================================
    _init(width: number, height: number): GridaCanvasWebGlApplicationPtr;

    // ====================================================================================================
    // APPLICATION METHODS
    // ====================================================================================================
    _tick(state: GridaCanvasWebGlApplicationPtr): void;
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
    _command(
      state: GridaCanvasWebGlApplicationPtr,
      id: number,
      a: number,
      b: number
    ): void;
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

declare function createGridaCanvas(moduleArg?: {
  locateFile?: (path: string, scriptDirectory: string) => string;
}): Promise<GridaCanvasWasmBindings>;
type GridaCanvasWebGlApplicationPtr = number;

declare interface GridaCanvasWasmBindings {
  // ====================================================================================================
  // EMSCRIPTEN EXPOSED METHODS
  // ====================================================================================================
  GL: {
    registerContext(
      context: WebGLRenderingContext,
      options: { majorVersion: number }
    ): void;
    makeContextCurrent(handle: number): void;
  };
  stringToUTF8(ptr: number, len: number): string;
  lengthBytesUTF8(str: string): number;
  ___wbindgen_malloc(a0, a1);
  ___wbindgen_free(a0, a1, a2);
  ___wbindgen_realloc(a0, a1, a2, a3);

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

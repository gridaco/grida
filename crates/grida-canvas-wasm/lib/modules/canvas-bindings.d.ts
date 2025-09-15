declare namespace canvas {
  type Ptr = number;
  type GridaCanvasWebGlApplicationPtr = number;

  export interface CanvasModule {
    // core memory wrapper
    _allocate(len: number): number;
    _deallocate(ptr: number, len: number): void;

    // ====================================================================================================
    // INITIALIZATION
    // ====================================================================================================
    _init(
      width: number,
      height: number,
      use_embedded_fonts: boolean
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
    _add_font(
      state: GridaCanvasWebGlApplicationPtr,
      family_ptr: number,
      family_len: number,
      data_ptr: number,
      data_len: number
    ): void;
    _add_image(
      state: GridaCanvasWebGlApplicationPtr,
      data_ptr: number,
      data_len: number
    ): Ptr;
    _get_image_bytes(
      state: GridaCanvasWebGlApplicationPtr,
      ref_ptr: number,
      ref_len: number
    ): Ptr;
    _get_image_size(
      state: GridaCanvasWebGlApplicationPtr,
      ref_ptr: number,
      ref_len: number
    ): Ptr;
    _has_missing_fonts(state: GridaCanvasWebGlApplicationPtr): boolean;
    _list_missing_fonts(state: GridaCanvasWebGlApplicationPtr): Ptr;
    _list_available_fonts(state: GridaCanvasWebGlApplicationPtr): Ptr;
    _set_default_fallback_fonts(
      state: GridaCanvasWebGlApplicationPtr,
      ptr: number,
      len: number
    ): void;
    _get_default_fallback_fonts(state: GridaCanvasWebGlApplicationPtr): Ptr;
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

    _to_vector_network(
      state: GridaCanvasWebGlApplicationPtr,
      id_ptr: number,
      id_len: number
    ): Ptr;

    _command(
      state: GridaCanvasWebGlApplicationPtr,
      id: number,
      a: number,
      b: number
    ): void;

    _highlight_strokes(
      state: GridaCanvasWebGlApplicationPtr,
      ptr: number,
      len: number
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

    _runtime_renderer_set_cache_tile(
      state: GridaCanvasWebGlApplicationPtr,
      enabled: boolean
    ): void;
  }
}

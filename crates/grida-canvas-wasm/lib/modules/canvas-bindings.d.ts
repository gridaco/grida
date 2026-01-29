declare namespace canvas {
  type Ptr = number;
  type GridaCanvasApplicationPtr = number;

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
    ): GridaCanvasApplicationPtr;

    _init_with_backend(
      backend_id: number,
      width: number,
      height: number,
      use_embedded_fonts: boolean
    ): GridaCanvasApplicationPtr;

    // ====================================================================================================
    // APPLICATION METHODS
    // ====================================================================================================
    _tick(state: GridaCanvasApplicationPtr, time: number): void;
    _destroy(state: GridaCanvasApplicationPtr): void;
    _resize_surface(
      state: GridaCanvasApplicationPtr,
      width: number,
      height: number
    ): void;
    _redraw(state: GridaCanvasApplicationPtr): void;
    _load_scene_json(
      state: GridaCanvasApplicationPtr,
      ptr: number,
      len: number
    ): void;
    _apply_scene_transactions(
      state: GridaCanvasApplicationPtr,
      ptr: number,
      len: number
    ): Ptr;
    _load_dummy_scene(state: GridaCanvasApplicationPtr): void;
    _load_benchmark_scene(
      state: GridaCanvasApplicationPtr,
      cols: number,
      rows: number
    ): void;
    _pointer_move(state: GridaCanvasApplicationPtr, x: number, y: number): void;
    _add_font(
      state: GridaCanvasApplicationPtr,
      family_ptr: number,
      family_len: number,
      data_ptr: number,
      data_len: number
    ): void;
    _add_image(
      state: GridaCanvasApplicationPtr,
      data_ptr: number,
      data_len: number
    ): Ptr;
    _get_image_bytes(
      state: GridaCanvasApplicationPtr,
      ref_ptr: number,
      ref_len: number
    ): Ptr;
    _get_image_size(
      state: GridaCanvasApplicationPtr,
      ref_ptr: number,
      ref_len: number
    ): Ptr;
    _has_missing_fonts(state: GridaCanvasApplicationPtr): boolean;
    _list_missing_fonts(state: GridaCanvasApplicationPtr): Ptr;
    _list_available_fonts(state: GridaCanvasApplicationPtr): Ptr;
    _set_default_fallback_fonts(
      state: GridaCanvasApplicationPtr,
      ptr: number,
      len: number
    ): void;
    _get_default_fallback_fonts(state: GridaCanvasApplicationPtr): Ptr;
    _set_main_camera_transform(
      state: GridaCanvasApplicationPtr,
      a: number,
      c: number,
      e: number,
      b: number,
      d: number,
      f: number
    ): void;
    _get_node_id_from_point(
      state: GridaCanvasApplicationPtr,
      x: number,
      y: number
    ): Ptr;
    _get_node_ids_from_point(
      state: GridaCanvasApplicationPtr,
      x: number,
      y: number
    ): Ptr;
    _get_node_ids_from_envelope(
      state: GridaCanvasApplicationPtr,
      x: number,
      y: number,
      w: number,
      h: number
    ): Ptr;
    _get_node_absolute_bounding_box(
      state: GridaCanvasApplicationPtr,
      ptr: number,
      len: number
    ): Ptr;

    _export_node_as(
      state: GridaCanvasApplicationPtr,
      id_ptr: number,
      id_len: number,
      fmt_ptr: number,
      fmt_len: number
    ): Ptr;

    _to_vector_network(
      state: GridaCanvasApplicationPtr,
      id_ptr: number,
      id_len: number
    ): Ptr;

    _command(
      state: GridaCanvasApplicationPtr,
      id: number,
      a: number,
      b: number
    ): void;

    _highlight_strokes(
      state: GridaCanvasApplicationPtr,
      ptr: number,
      len: number
    ): void;

    _set_debug(state: GridaCanvasApplicationPtr, debug: boolean): void;
    _toggle_debug(state: GridaCanvasApplicationPtr): void;
    _set_verbose(state: GridaCanvasApplicationPtr, verbose: boolean): void;
    _devtools_rendering_set_show_tiles(
      state: GridaCanvasApplicationPtr,
      show: boolean
    ): void;
    _devtools_rendering_set_show_fps_meter(
      state: GridaCanvasApplicationPtr,
      show: boolean
    ): void;
    _devtools_rendering_set_show_stats(
      state: GridaCanvasApplicationPtr,
      show: boolean
    ): void;
    _devtools_rendering_set_show_hit_testing(
      state: GridaCanvasApplicationPtr,
      show: boolean
    ): void;
    _devtools_rendering_set_show_ruler(
      state: GridaCanvasApplicationPtr,
      show: boolean
    ): void;

    _runtime_renderer_set_cache_tile(
      state: GridaCanvasApplicationPtr,
      enabled: boolean
    ): void;

    _runtime_renderer_set_pixel_preview_scale(
      state: GridaCanvasApplicationPtr,
      scale: number
    ): void;

    _runtime_renderer_set_pixel_preview_stable(
      state: GridaCanvasApplicationPtr,
      stable: boolean
    ): void;

    _runtime_renderer_set_render_policy_flags(
      state: GridaCanvasApplicationPtr,
      flags: number
    ): void;

    _runtime_renderer_set_outline_mode(
      state: GridaCanvasApplicationPtr,
      enable: boolean
    ): void;
  }
}

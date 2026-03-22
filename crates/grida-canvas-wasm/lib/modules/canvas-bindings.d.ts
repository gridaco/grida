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
    _load_scene_grida1(
      state: GridaCanvasApplicationPtr,
      ptr: number,
      len: number
    ): void;
    _load_scene_grida(
      state: GridaCanvasApplicationPtr,
      ptr: number,
      len: number
    ): void;
    _switch_scene(
      state: GridaCanvasApplicationPtr,
      ptr: number,
      len: number
    ): void;
    _drain_missing_images(
      state: GridaCanvasApplicationPtr
    ): Ptr;
    _resolve_image(
      state: GridaCanvasApplicationPtr,
      rid_ptr: number,
      rid_len: number,
      bytes_ptr: number,
      bytes_len: number
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
    _add_image_with_rid(
      state: GridaCanvasApplicationPtr,
      data_ptr: number,
      data_len: number,
      rid_ptr: number,
      rid_len: number
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

    _runtime_renderer_set_layer_compositing(
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

    // ====================================================================================================
    // TEXT EDITING
    // ====================================================================================================
    _text_edit_enter(
      state: GridaCanvasApplicationPtr,
      node_id_ptr: number,
      node_id_len: number
    ): boolean;
    _text_edit_exit(
      state: GridaCanvasApplicationPtr,
      commit: boolean
    ): Ptr;
    _text_edit_is_active(state: GridaCanvasApplicationPtr): boolean;
    _text_edit_get_text(state: GridaCanvasApplicationPtr): Ptr;
    _text_edit_undo(state: GridaCanvasApplicationPtr): boolean;
    _text_edit_redo(state: GridaCanvasApplicationPtr): boolean;
    _text_edit_command(
      state: GridaCanvasApplicationPtr,
      json_ptr: number,
      json_len: number
    ): void;
    _text_edit_pointer_down(
      state: GridaCanvasApplicationPtr,
      x: number,
      y: number,
      shift: boolean,
      click_count: number
    ): void;
    _text_edit_pointer_move(
      state: GridaCanvasApplicationPtr,
      x: number,
      y: number
    ): void;
    _text_edit_pointer_up(state: GridaCanvasApplicationPtr): void;
    _text_edit_ime_set_preedit(
      state: GridaCanvasApplicationPtr,
      text_ptr: number,
      text_len: number
    ): void;
    _text_edit_ime_commit(
      state: GridaCanvasApplicationPtr,
      text_ptr: number,
      text_len: number
    ): void;
    _text_edit_ime_cancel(state: GridaCanvasApplicationPtr): void;
    _text_edit_get_selected_text(state: GridaCanvasApplicationPtr): Ptr;
    _text_edit_get_selected_html(state: GridaCanvasApplicationPtr): Ptr;
    _text_edit_paste_text(
      state: GridaCanvasApplicationPtr,
      text_ptr: number,
      text_len: number
    ): void;
    _text_edit_paste_html(
      state: GridaCanvasApplicationPtr,
      html_ptr: number,
      html_len: number
    ): void;
    _text_edit_get_caret_rect(state: GridaCanvasApplicationPtr): Ptr;
    _text_edit_get_selection_rects(state: GridaCanvasApplicationPtr): Ptr;
    _text_edit_toggle_bold(state: GridaCanvasApplicationPtr): void;
    _text_edit_toggle_italic(state: GridaCanvasApplicationPtr): void;
    _text_edit_toggle_underline(state: GridaCanvasApplicationPtr): void;
    _text_edit_toggle_strikethrough(state: GridaCanvasApplicationPtr): void;
    _text_edit_set_font_size(
      state: GridaCanvasApplicationPtr,
      size: number
    ): void;
    _text_edit_set_font_family(
      state: GridaCanvasApplicationPtr,
      family_ptr: number,
      family_len: number
    ): void;
    _text_edit_set_color(
      state: GridaCanvasApplicationPtr,
      r: number,
      g: number,
      b: number,
      a: number
    ): void;
    _text_edit_tick(state: GridaCanvasApplicationPtr): boolean;
  }
}

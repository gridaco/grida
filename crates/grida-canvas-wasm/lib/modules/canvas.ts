import type { types } from "../";
import { FontsAPI } from "./fonts";
import { MarkdownAPI } from "./markdown";
import { SVGAPI } from "./svg";
import { memory } from "./memory";
import { ffi } from "./ffi";

const ApplicationCommandID = {
  ZoomIn: 1,
  ZoomOut: 2,
  ZoomDelta: 3,
  Pan: 4,
} as const;

export interface CreateImageResourceResult {
  hash: string;
  url: string;
  width: number;
  height: number;
  type: string;
}

export interface AddImageWithIdResult {
  width: number;
  height: number;
  type: string;
}

export interface TransactionApplyReport {
  success: boolean;
  applied: number;
  total: number;
  error?: string;
}

export class Scene {
  private appptr: number;
  private module: createGridaCanvas.GridaCanvasWasmBindings;

  public readonly fontskit: FontsAPI;
  public readonly markdownkit: MarkdownAPI;
  public readonly svgkit: SVGAPI;

  constructor(module: createGridaCanvas.GridaCanvasWasmBindings, ptr: number) {
    this.module = module;
    this.appptr = ptr;
    this.fontskit = new FontsAPI(module);
    this.markdownkit = new MarkdownAPI(module);
    this.svgkit = new SVGAPI(module);
  }

  private _assertAlive() {
    if (this.appptr === 0) {
      throw new Error("Scene is disposed");
    }
  }

  /**
   * Release the underlying WASM application instance.
   *
   * After calling this, the `Scene` instance must not be used again.
   */
  dispose() {
    if (this.appptr === 0) return;
    this.module._destroy(this.appptr);
    this.appptr = 0;
  }

  /**
   * Allocates memory for a string and returns pointer and length.
   * @param txt - String to allocate
   * @returns [pointer, length] tuple
   */
  _alloc_string(txt: string): [number, number] {
    this._assertAlive();
    return ffi.allocString(this.module, txt);
  }

  /**
   * Frees memory allocated for a string.
   * @param ptr - Pointer to free
   * @param len - Length of allocated memory
   */
  _free_string(ptr: number, len: number) {
    this._assertAlive();
    ffi.free(this.module, ptr, len);
  }

  /**
   * Load a scene from a JSON string.
   * @param data - The JSON string to load.
   */
  loadScene(data: string) {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(data);
    this.module._load_scene_json(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  applyTransactions(batch: unknown[][]): TransactionApplyReport[] | null {
    this._assertAlive();
    const json = JSON.stringify(batch);
    const [ptr, len] = this._alloc_string(json);
    const outptr = this.module._apply_scene_transactions(
      this.appptr,
      ptr,
      len - 1
    );
    this._free_string(ptr, len);
    if (outptr === 0) {
      return null;
    }
    const str = ffi.readLenPrefixedString(this.module, outptr);
    return JSON.parse(str) as TransactionApplyReport[];
  }

  /**
   * @deprecated - test use only
   */
  loadDummyScene() {
    this._assertAlive();
    this.module._load_dummy_scene(this.appptr);
  }

  /**
   * @deprecated - test use only
   */
  loadBenchmarkScene(cols: number, rows: number) {
    this._assertAlive();
    this.module._load_benchmark_scene(this.appptr, cols, rows);
  }

  /**
   * Register a font with the renderer.
   *
   * The wasm module cannot fetch font files directly from the network, so the
   * host environment must fetch the font bytes and pass them here.
   *
   * Multiple calls with the same `family` and different font files are
   * supported (e.g. Regular, Bold, Italic per family).
   *
   * @param family - Font family name for lookup (overrides the font file's built-in name).
   * @param data - Raw font file bytes (e.g. TTF/OTF).
   */
  addFont(family: string, data: Uint8Array) {
    this._assertAlive();
    const [fptr, flen] = this._alloc_string(family);
    const [ptr, len] = ffi.allocBytes(this.module, data);
    this.module._add_font(this.appptr, fptr, flen - 1, ptr, len);
    this._free_string(fptr, flen);
    ffi.free(this.module, ptr, len);
  }

  addImage(data: Uint8Array): CreateImageResourceResult | false {
    this._assertAlive();
    const [ptr, len] = ffi.allocBytes(this.module, data);
    const out = this.module._add_image(this.appptr, ptr, len);
    ffi.free(this.module, ptr, len);
    if (out === 0) return false;
    const txt = ffi.readLenPrefixedString(this.module, out);
    try {
      return JSON.parse(txt) as CreateImageResourceResult;
    } catch {
      return false;
    }
  }

  addImageWithId(data: Uint8Array, rid: string): AddImageWithIdResult | false {
    this._assertAlive();
    const [dataPtr, dataLen] = ffi.allocBytes(this.module, data);
    const [ridPtr, ridLen] = this._alloc_string(rid);
    const out = this.module._add_image_with_rid(
      this.appptr,
      dataPtr,
      dataLen,
      ridPtr,
      ridLen - 1
    );
    ffi.free(this.module, dataPtr, dataLen);
    this._free_string(ridPtr, ridLen);
    if (out === 0) return false;
    const txt = ffi.readLenPrefixedString(this.module, out);
    try {
      return JSON.parse(txt) as AddImageWithIdResult;
    } catch {
      return false;
    }
  }

  getImageBytes(ref: string): Uint8Array | null {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(ref);
    const outptr = this.module._get_image_bytes(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
    if (outptr === 0) return null;
    return ffi.readLenPrefixedBytes(this.module, outptr);
  }

  getImageSize(ref: string): { width: number; height: number } | null {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(ref);
    const outptr = this.module._get_image_size(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
    if (outptr === 0) return null;
    const view = this.module.HEAPU32.slice(outptr >> 2, (outptr >> 2) + 2);
    this.module._deallocate(outptr, 4 * 2);
    return { width: view[0], height: view[1] };
  }

  hasMissingFonts(): boolean {
    this._assertAlive();
    return this.module._has_missing_fonts(this.appptr);
  }

  listMissingFonts(): types.FontKey[] {
    this._assertAlive();
    const ptr = this.module._list_missing_fonts(this.appptr);
    if (ptr === 0) return [];
    const str = ffi.readLenPrefixedString(this.module, ptr);
    return JSON.parse(str);
  }

  listAvailableFonts(): types.FontKey[] {
    this._assertAlive();
    const ptr = this.module._list_available_fonts(this.appptr);
    if (ptr === 0) return [];
    const str = ffi.readLenPrefixedString(this.module, ptr);
    return JSON.parse(str);
  }

  setFallbackFonts(fonts: string[]) {
    this._assertAlive();
    const json = JSON.stringify(fonts);
    const [ptr, len] = this._alloc_string(json);
    this.module._set_default_fallback_fonts(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  getFallbackFonts(): string[] {
    this._assertAlive();
    const ptr = this.module._get_default_fallback_fonts(this.appptr);
    if (ptr === 0) return [];
    const str = ffi.readLenPrefixedString(this.module, ptr);
    return JSON.parse(str);
  }

  /**
   * Tick the application clock.
   * bind this to requestAnimationFrame loop or similar
   * @param time - The time in milliseconds. use performance.now()
   * @default - performance.now()
   */
  tick(time?: number) {
    this._assertAlive();
    this.module._tick(this.appptr, time ?? performance.now());
  }

  /**
   * Resize the surface.
   * @param width - The width of the surface.
   * @param height - The height of the surface.
   */
  resize(width: number, height: number) {
    this._assertAlive();
    this.module._resize_surface(this.appptr, width, height);
  }

  redraw() {
    this._assertAlive();
    this.module._redraw(this.appptr);
  }

  setMainCameraTransform(transform: types.Transform2D) {
    this._assertAlive();
    this.module._set_main_camera_transform(
      this.appptr,
      transform[0][0], // a
      transform[0][1], // c
      transform[0][2], // e
      transform[1][0], // b
      transform[1][1], // d
      transform[1][2] // f
    );
  }

  getNodeIdFromPoint(x: number, y: number): string | null {
    this._assertAlive();
    const ptr = this.module._get_node_id_from_point(this.appptr, x, y);
    if (ptr === 0) {
      return null;
    }
    return ffi.readLenPrefixedString(this.module, ptr);
  }

  getNodeIdsFromPoint(x: number, y: number): string[] {
    this._assertAlive();
    const ptr = this.module._get_node_ids_from_point(this.appptr, x, y);
    if (ptr === 0) {
      return [];
    }
    const str = ffi.readLenPrefixedString(this.module, ptr);
    return JSON.parse(str);
  }

  getNodeIdsFromEnvelope(envelope: types.Rect): string[] {
    this._assertAlive();
    const ptr = this.module._get_node_ids_from_envelope(
      this.appptr,
      envelope.x,
      envelope.y,
      envelope.width,
      envelope.height
    );
    if (ptr === 0) {
      return [];
    }
    const str = ffi.readLenPrefixedString(this.module, ptr);
    return JSON.parse(str);
  }

  getNodeAbsoluteBoundingBox(id: string): types.Rect | null {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(id);
    const outptr = this.module._get_node_absolute_bounding_box(
      this.appptr,
      ptr,
      len - 1
    );
    this._free_string(ptr, len);

    if (outptr === 0) {
      return null;
    }

    const rect = this.module.HEAPF32.slice(outptr >> 2, (outptr >> 2) + 4); // Float32Array [x, y, w, h]
    this.module._deallocate(outptr, 4 * 4);

    return memory.rect_from_vec4(rect);
  }

  /**
   * Convert a node into a vector network representation.
   * Supports primitive shapes and text nodes.
   *
   * Returns a flatten result containing the vector network and an optional
   * corner radius. When `corner_radius` is present, it means the vector
   * network has straight segments and corner radius should be applied as
   * a rendering effect. When absent, curves are baked into the geometry.
   */
  toVectorNetwork(id: string): types.FlattenResult | null {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(id);
    const outptr = this.module._to_vector_network(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);

    if (outptr === 0) {
      return null;
    }

    const str = ffi.readLenPrefixedString(this.module, outptr);
    return JSON.parse(str);
  }

  exportNodeAs(
    id: string,
    format: types.ExportAs
  ): {
    data: Uint8Array;
  } {
    this._assertAlive();

    // Pre-flight: verify the node exists in the geometry cache.
    // This surfaces a clear error rather than a WASM abort when the caller
    // passes a node ID that has not been loaded into the scene, or when the
    // node's render bounds are degenerate (zero or sub-pixel dimensions).
    const bbox = this.getNodeAbsoluteBoundingBox(id);
    if (bbox === null) {
      throw new Error(
        `exportNodeAs: node "${id}" was not found in the scene. ` +
          `Ensure the scene has been loaded and the node ID is correct.`
      );
    }
    if (bbox.width <= 0 || bbox.height <= 0) {
      throw new Error(
        `exportNodeAs: node "${id}" has degenerate bounds ` +
          `(${bbox.width}×${bbox.height}). The node has no renderable area.`
      );
    }

    const [id_ptr, id_len] = this._alloc_string(id);
    const [fmt_ptr, fmt_len] = this._alloc_string(JSON.stringify(format));
    const outptr = this.module._export_node_as(
      this.appptr,
      id_ptr,
      id_len - 1,
      fmt_ptr,
      fmt_len - 1
    );
    this._free_string(id_ptr, id_len);
    this._free_string(fmt_ptr, fmt_len);

    if (outptr === 0) {
      throw new Error(`Failed to export node as ${format.format}`);
    }

    return {
      data: ffi.readLenPrefixedBytes(this.module, outptr),
    };
  }

  execCommand(command: "ZoomIn" | "ZoomOut") {
    this._assertAlive();
    this.module._command(this.appptr, ApplicationCommandID[command], 0, 0);
  }

  execCommandPan(tx: number, ty: number) {
    this._assertAlive();
    this.module._command(this.appptr, ApplicationCommandID.Pan, tx, ty);
  }

  execCommandZoomDelta(tz: number) {
    this._assertAlive();
    this.module._command(this.appptr, ApplicationCommandID.ZoomDelta, tz, 0);
  }

  pointermove(x: number, y: number) {
    this._assertAlive();
    this.module._pointer_move(this.appptr, x, y);
  }

  highlightStrokes(opts?: {
    nodes?: string[];
    style?: { strokeWidth?: number; stroke?: string };
  }) {
    this._assertAlive();
    const json = JSON.stringify({
      nodes: opts?.nodes ?? [],
      style: opts?.style,
    });
    const [ptr, len] = this._alloc_string(json);
    this.module._highlight_strokes(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  runtime_renderer_set_cache_tile(enable: boolean) {
    this._assertAlive();
    this.module._runtime_renderer_set_cache_tile(this.appptr, enable);
  }

  runtime_renderer_set_pixel_preview_scale(scale: number) {
    this._assertAlive();
    this.module._runtime_renderer_set_pixel_preview_scale(this.appptr, scale);
  }

  runtime_renderer_set_pixel_preview_stable(stable: boolean) {
    this._assertAlive();
    this.module._runtime_renderer_set_pixel_preview_stable(this.appptr, stable);
  }

  runtime_renderer_set_render_policy_flags(flags: number) {
    this._assertAlive();
    this.module._runtime_renderer_set_render_policy_flags(this.appptr, flags);
  }

  runtime_renderer_set_outline_mode(enable: boolean) {
    this._assertAlive();
    this.module._runtime_renderer_set_outline_mode(this.appptr, enable);
  }

  // ====================================================================================================
  // DEVTOOLS
  // ====================================================================================================

  setDebug(debug: boolean) {
    this._assertAlive();
    this.module._set_debug(this.appptr, debug);
  }

  toggleDebug() {
    this._assertAlive();
    this.module._toggle_debug(this.appptr);
  }

  setVerbose(verbose: boolean) {
    this._assertAlive();
    this.module._set_verbose(this.appptr, verbose);
  }

  /**
   * Set the visibility of the tiles.
   * @param show - The visibility of the tiles.
   */
  devtools_rendering_set_show_tiles(show: boolean) {
    this._assertAlive();
    this.module._devtools_rendering_set_show_tiles(this.appptr, show);
  }

  /**
   * Set the visibility of the FPS meter.
   * @param show - The visibility of the FPS meter.
   */
  devtools_rendering_set_show_fps_meter(show: boolean) {
    this._assertAlive();
    this.module._devtools_rendering_set_show_fps_meter(this.appptr, show);
  }

  /**
   * Set the visibility of the stats.
   * @param show - The visibility of the stats.
   */
  devtools_rendering_set_show_stats(show: boolean) {
    this._assertAlive();
    this.module._devtools_rendering_set_show_stats(this.appptr, show);
  }

  /**
   * Set the visibility of the hit testing.
   * @param show - The visibility of the hit testing.
   */
  devtools_rendering_set_show_hit_testing(show: boolean) {
    this._assertAlive();
    this.module._devtools_rendering_set_show_hit_testing(this.appptr, show);
  }

  /**
   * Set the visibility of the ruler.
   * @param show - The visibility of the ruler.
   */
  devtools_rendering_set_show_ruler(show: boolean) {
    this._assertAlive();
    this.module._devtools_rendering_set_show_ruler(this.appptr, show);
  }

  // ==========================================================================
  // Text editing
  // ==========================================================================

  /**
   * Enter text editing mode for a node.
   *
   * The engine reads all text properties (font, size, width, alignment)
   * directly from the scene node, so only the node ID is needed.
   */
  textEditEnter(nodeId: string): boolean {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(nodeId);
    const result = this.module._text_edit_enter(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
    return !!result;
  }

  /**
   * Exit text editing mode.
   * @param commit - If true, returns the final text. If false, cancels.
   * @returns The committed text, or null if cancelled / no session.
   */
  textEditExit(commit: boolean): string | null {
    this._assertAlive();
    const outptr = this.module._text_edit_exit(this.appptr, commit) as number;
    if (!outptr) return null;
    return ffi.readLenPrefixedString(this.module, outptr);
  }

  /** Check if a text editing session is active. */
  textEditIsActive(): boolean {
    this._assertAlive();
    return !!this.module._text_edit_is_active(this.appptr);
  }

  /**
   * Returns the current text of the active editing session, or null if
   * no session is active.
   */
  textEditGetText(): string | null {
    this._assertAlive();
    const outptr = this.module._text_edit_get_text(this.appptr) as number;
    if (!outptr) return null;
    return ffi.readLenPrefixedString(this.module, outptr);
  }

  /**
   * Undo within the text editing session.
   *
   * The session owns all undo during editing. Document-level undo is not
   * involved until the session exits.
   */
  textEditUndo(): boolean {
    this._assertAlive();
    return !!this.module._text_edit_undo(this.appptr);
  }

  /**
   * Redo within the text editing session.
   */
  textEditRedo(): boolean {
    this._assertAlive();
    return !!this.module._text_edit_redo(this.appptr);
  }

  /**
   * Dispatch an editing command.
   * @param cmd - The command object (JSON-serializable WasmEditCommand).
   */
  textEditCommand(cmd: TextEditCommand) {
    this._assertAlive();
    const json = JSON.stringify(cmd);
    const [ptr, len] = this._alloc_string(json);
    this.module._text_edit_command(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  /** Pointer down in layout-local coordinates. */
  textEditPointerDown(
    x: number,
    y: number,
    shift: boolean,
    clickCount: number
  ) {
    this._assertAlive();
    this.module._text_edit_pointer_down(this.appptr, x, y, shift, clickCount);
  }

  /** Pointer move in layout-local coordinates (during drag). */
  textEditPointerMove(x: number, y: number) {
    this._assertAlive();
    this.module._text_edit_pointer_move(this.appptr, x, y);
  }

  /** Pointer up. */
  textEditPointerUp() {
    this._assertAlive();
    this.module._text_edit_pointer_up(this.appptr);
  }

  /** Set IME preedit string. */
  textEditImeSetPreedit(text: string) {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(text);
    this.module._text_edit_ime_set_preedit(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  /** Commit IME composition. */
  textEditImeCommit(text: string) {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(text);
    this.module._text_edit_ime_commit(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  /** Cancel IME composition. */
  textEditImeCancel() {
    this._assertAlive();
    this.module._text_edit_ime_cancel(this.appptr);
  }

  /** Get selected text as plain text. */
  textEditGetSelectedText(): string | null {
    this._assertAlive();
    const outptr = this.module._text_edit_get_selected_text(
      this.appptr
    ) as number;
    if (!outptr) return null;
    return ffi.readLenPrefixedString(this.module, outptr);
  }

  /** Get selected text as HTML. */
  textEditGetSelectedHtml(): string | null {
    this._assertAlive();
    const outptr = this.module._text_edit_get_selected_html(
      this.appptr
    ) as number;
    if (!outptr) return null;
    return ffi.readLenPrefixedString(this.module, outptr);
  }

  /** Paste plain text. */
  textEditPasteText(text: string) {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(text);
    this.module._text_edit_paste_text(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  /** Paste HTML with formatting. */
  textEditPasteHtml(html: string) {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(html);
    this.module._text_edit_paste_html(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  /**
   * Get the caret rectangle in layout-local coordinates.
   * @returns {x, y, w, h} or null if no active session.
   */
  textEditGetCaretRect(): {
    x: number;
    y: number;
    w: number;
    h: number;
  } | null {
    this._assertAlive();
    const outptr = this.module._text_edit_get_caret_rect(this.appptr) as number;
    if (!outptr) return null;
    const bytes = ffi.readLenPrefixedBytes(this.module, outptr);
    if (bytes.length < 16) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      x: view.getFloat32(0, true),
      y: view.getFloat32(4, true),
      w: view.getFloat32(8, true),
      h: view.getFloat32(12, true),
    };
  }

  /**
   * Get selection rectangles in layout-local coordinates.
   * @returns Array of {x, y, w, h} or null if no selection.
   */
  textEditGetSelectionRects(): Array<{
    x: number;
    y: number;
    w: number;
    h: number;
  }> | null {
    this._assertAlive();
    const outptr = this.module._text_edit_get_selection_rects(
      this.appptr
    ) as number;
    if (!outptr) return null;
    const json = ffi.readLenPrefixedString(this.module, outptr);
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  // --- Style commands ---

  textEditToggleBold() {
    this._assertAlive();
    this.module._text_edit_toggle_bold(this.appptr);
  }

  textEditToggleItalic() {
    this._assertAlive();
    this.module._text_edit_toggle_italic(this.appptr);
  }

  textEditToggleUnderline() {
    this._assertAlive();
    this.module._text_edit_toggle_underline(this.appptr);
  }

  textEditToggleStrikethrough() {
    this._assertAlive();
    this.module._text_edit_toggle_strikethrough(this.appptr);
  }

  textEditSetFontSize(size: number) {
    this._assertAlive();
    this.module._text_edit_set_font_size(this.appptr, size);
  }

  textEditSetFontFamily(family: string) {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(family);
    this.module._text_edit_set_font_family(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  textEditSetColor(r: number, g: number, b: number, a: number) {
    this._assertAlive();
    this.module._text_edit_set_color(this.appptr, r, g, b, a);
  }

  /**
   * Tick the blink timer. Returns true if cursor visibility changed.
   */
  textEditTick(): boolean {
    this._assertAlive();
    return !!this.module._text_edit_tick(this.appptr);
  }
}

// ---------------------------------------------------------------------------
// Text editing command types (mirrors Rust WasmEditCommand)
// ---------------------------------------------------------------------------

export type TextEditCommand =
  | { type: "Insert"; text: string }
  | { type: "Backspace" }
  | { type: "BackspaceWord" }
  | { type: "BackspaceLine" }
  | { type: "Delete" }
  | { type: "DeleteWord" }
  | { type: "DeleteLine" }
  | { type: "DeleteByCut" }
  | { type: "MoveLeft"; extend: boolean }
  | { type: "MoveRight"; extend: boolean }
  | { type: "MoveUp"; extend: boolean }
  | { type: "MoveDown"; extend: boolean }
  | { type: "MoveHome"; extend: boolean }
  | { type: "MoveEnd"; extend: boolean }
  | { type: "MoveDocStart"; extend: boolean }
  | { type: "MoveDocEnd"; extend: boolean }
  | { type: "MovePageUp"; extend: boolean }
  | { type: "MovePageDown"; extend: boolean }
  | { type: "MoveWordLeft"; extend: boolean }
  | { type: "MoveWordRight"; extend: boolean }
  | { type: "SelectAll" }
  | { type: "Undo" }
  | { type: "Redo" };

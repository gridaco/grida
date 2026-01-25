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
   * @param family - CSS font-family name for the typeface.
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
   */
  toVectorNetwork(id: string): types.VectorNetwork | null {
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
}

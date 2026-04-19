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
  SelectAll: 5,
  DeselectAll: 6,
  SelectChildren: 7,
  SelectParent: 8,
  SelectNextSibling: 9,
  SelectPreviousSibling: 10,
  ZoomToFit: 13,
  ZoomToSelection: 14,
  ZoomTo100: 15,
} as const;

// Surface response bitmask (matches Rust pack_surface_response)
const RESPONSE_NEEDS_REDRAW = 1 << 0;
const RESPONSE_CURSOR_CHANGED = 1 << 1;
const RESPONSE_SELECTION_CHANGED = 1 << 2;
const RESPONSE_HOVER_CHANGED = 1 << 3;

export interface SurfaceResponse {
  needsRedraw: boolean;
  cursorChanged: boolean;
  selectionChanged: boolean;
  hoverChanged: boolean;
}

export type SurfaceCursorIcon =
  | "default"
  | "pointer"
  | "grab"
  | "grabbing"
  | "crosshair"
  | "move";

const CURSOR_MAP: Record<number, SurfaceCursorIcon> = {
  0: "default",
  1: "pointer",
  2: "grab",
  3: "grabbing",
  4: "crosshair",
  5: "move",
};

export interface SurfaceOverlayConfig {
  dpr?: number;
  text_baseline_decoration?: boolean;
  show_size_meter?: boolean;
  show_frame_titles?: boolean;
}

/** Encode modifier keys as a bitmask for the WASM C-ABI. */
export function encodeModifiers(event: {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): number {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    (event.shiftKey ? 1 : 0) |
    (event.altKey ? 2 : 0) |
    ((isMac ? event.metaKey : event.ctrlKey) ? 4 : 0)
  );
}

/** Map DOM MouseEvent.button to WASM pointer button id. */
export function encodeButton(button: number): number {
  // DOM: 0=primary, 2=secondary, 1=middle
  // WASM: 0=primary, 1=secondary, 2=middle
  if (button === 2) return 1;
  if (button === 1) return 2;
  return 0;
}

function unpackResponse(bits: number): SurfaceResponse {
  return {
    needsRedraw: (bits & RESPONSE_NEEDS_REDRAW) !== 0,
    cursorChanged: (bits & RESPONSE_CURSOR_CHANGED) !== 0,
    selectionChanged: (bits & RESPONSE_SELECTION_CHANGED) !== 0,
    hoverChanged: (bits & RESPONSE_HOVER_CHANGED) !== 0,
  };
}

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
   * Load a scene from `.grida` FlatBuffers binary bytes.
   * Zero-copy on the Rust side — much more memory-efficient than JSON for large documents.
   * @param data - The FlatBuffers binary data.
   */
  loadSceneGrida(data: Uint8Array) {
    this._assertAlive();
    const [ptr, len] = ffi.allocBytes(this.module, data);
    this.module._load_scene_grida(this.appptr, ptr, len);
    ffi.free(this.module, ptr, len);
  }

  /**
   * Switch to a previously loaded scene by its string ID.
   * Only works after `loadSceneGrida` has decoded a multi-scene document.
   * @param sceneId - The string ID of the scene to switch to.
   */
  switchScene(sceneId: string) {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(sceneId);
    this.module._switch_scene(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  /**
   * Return the IDs of all scenes decoded by the last `loadSceneGrida` call.
   */
  loadedSceneIds(): string[] {
    this._assertAlive();
    const outptr = this.module._loaded_scene_ids(this.appptr);
    if (outptr === 0) {
      return [];
    }
    const str = ffi.readLenPrefixedString(this.module, outptr);
    return JSON.parse(str) as string[];
  }

  /**
   * Returns image refs that were needed during the last render but not found.
   * Only returns refs not yet reported in a previous call.
   * Returns an empty array if no new missing images.
   */
  drainMissingImages(): string[] {
    this._assertAlive();
    const outptr = this.module._drain_missing_images(this.appptr);
    if (outptr === 0) {
      return [];
    }
    const str = ffi.readLenPrefixedString(this.module, outptr);
    return JSON.parse(str) as string[];
  }

  /**
   * Resolve a missing image by providing its raw bytes for a given resource ID.
   * The image is decoded, stored, and a redraw is queued.
   * @param rid - Resource ID (e.g. "res://images/abc123")
   * @param bytes - Raw image bytes (PNG, JPEG, WebP, etc.)
   */
  resolveImage(rid: string, bytes: Uint8Array) {
    this._assertAlive();
    const [ridPtr, ridLen] = this._alloc_string(rid);
    const [bytesPtr, bytesLen] = ffi.allocBytes(this.module, bytes);
    this.module._resolve_image(
      this.appptr,
      ridPtr,
      ridLen - 1,
      bytesPtr,
      bytesLen
    );
    this._free_string(ridPtr, ridLen);
    ffi.free(this.module, bytesPtr, bytesLen);
  }

  /**
   * Replace a single node's data in the active scene, keyed by the id
   * encoded in `bytes`.
   *
   * `bytes` must be a single-node `GridaFile` buffer (see
   * `io.GRID.encodeNode`). The node id must already exist in the active
   * scene; parent links and children are untouched.
   *
   * Returns `false` if the buffer is malformed or the id is unknown. How
   * to recover is up to the caller.
   */
  replaceNode(bytes: Uint8Array): boolean {
    this._assertAlive();
    const [ptr, len] = ffi.allocBytes(this.module, bytes);
    const ok = this.module._replace_node_grida(this.appptr, ptr, len);
    ffi.free(this.module, ptr, len);
    return ok;
  }

  /**
   * Remove a node and all its descendants from the active scene, keyed by
   * user id. Returns `false` if the id is unknown.
   */
  deleteNode(id: string): boolean {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(id);
    const ok = this.module._delete_node(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
    return ok;
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

  /**
   * Get the absolute bounding box of a node or the active scene.
   *
   * @param target - A node ID, or `"<scene>"` to get the union bounds of the
   *   active scene's root children (computed in a single WASM call).
   */
  getNodeAbsoluteBoundingBox(
    target: (string & {}) | "<scene>"
  ): types.Rect | null {
    const id = target;
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
   * Return the structural node ID ancestry path from the scene root to the
   * target node, inclusive.
   *
   * The returned array contains user-facing string IDs ordered as
   * `[root, ..., parent, id]`.
   *
   * Returns `null` if the node does not exist in the scene.
   */
  getNodeIdPath(id: string): string[] | null {
    this._assertAlive();
    const [ptr, len] = this._alloc_string(id);
    const outptr = this.module._get_node_id_path(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);

    if (outptr === 0) {
      return null;
    }

    const str = ffi.readLenPrefixedString(this.module, outptr);
    return JSON.parse(str);
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

  /**
   * Export multiple nodes as a single multi-page PDF document.
   *
   * Each node ID in `options.node_ids` becomes one page in the output PDF.
   * Returns the raw PDF bytes.
   */
  exportPdfDocument(options: types.ExportPdfDocumentOptions): {
    data: Uint8Array;
  } {
    this._assertAlive();
    const [json_ptr, json_len] = this._alloc_string(JSON.stringify(options));
    const outptr = this.module._export_pdf_document(
      this.appptr,
      json_ptr,
      json_len - 1
    );
    this._free_string(json_ptr, json_len);

    if (outptr === 0) {
      throw new Error("Failed to export PDF document");
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

  // ====================================================================================================
  // Surface interaction (hover, selection, marquee, cursor)
  // ====================================================================================================

  /**
   * Dispatch a pointer-move through the surface event system.
   * Handles hover state, cursor icon, and marquee drag.
   */
  surfacePointerMove(x: number, y: number): SurfaceResponse {
    this._assertAlive();
    return unpackResponse(this.module._surface_pointer_move(this.appptr, x, y));
  }

  /**
   * Dispatch a pointer-down through the surface event system.
   * Handles node selection, shift-toggle, and marquee start.
   * @param button - DOM MouseEvent.button (0=primary, 1=middle, 2=secondary)
   * @param modifiers - Bitmask from `encodeModifiers(event)`
   */
  surfacePointerDown(
    x: number,
    y: number,
    button: number,
    modifiers: number
  ): SurfaceResponse {
    this._assertAlive();
    return unpackResponse(
      this.module._surface_pointer_down(
        this.appptr,
        x,
        y,
        encodeButton(button),
        modifiers
      )
    );
  }

  /**
   * Dispatch a pointer-up through the surface event system.
   * Ends marquee gesture.
   * @param button - DOM MouseEvent.button (0=primary, 1=middle, 2=secondary)
   * @param modifiers - Bitmask from `encodeModifiers(event)`
   */
  surfacePointerUp(
    x: number,
    y: number,
    button: number,
    modifiers: number
  ): SurfaceResponse {
    this._assertAlive();
    return unpackResponse(
      this.module._surface_pointer_up(
        this.appptr,
        x,
        y,
        encodeButton(button),
        modifiers
      )
    );
  }

  /**
   * Get the current surface cursor icon.
   */
  getSurfaceCursor(): SurfaceCursorIcon {
    this._assertAlive();
    const id = this.module._surface_get_cursor(this.appptr);
    return CURSOR_MAP[id] ?? "default";
  }

  /**
   * Get the currently hovered node ID, or null.
   */
  getSurfaceHoveredNode(): string | null {
    this._assertAlive();
    const ptr = this.module._surface_get_hovered_node(this.appptr);
    if (ptr === 0) return null;
    const str = ffi.readLenPrefixedString(this.module, ptr);
    return JSON.parse(str);
  }

  /**
   * Get the currently selected node IDs.
   */
  getSurfaceSelectedNodes(): string[] {
    this._assertAlive();
    const ptr = this.module._surface_get_selected_nodes(this.appptr);
    if (ptr === 0) return [];
    const str = ffi.readLenPrefixedString(this.module, ptr);
    return JSON.parse(str);
  }

  /**
   * Restore selection state (e.g. from undo/redo history).
   */
  setSurfaceSelection(ids: string[]) {
    this._assertAlive();
    const json = JSON.stringify(ids);
    const [ptr, len] = this._alloc_string(json);
    this.module._surface_set_selection(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  /**
   * Collect and group active paints across a set of nodes.
   *
   * Returns groups of identical paints with the node IDs that share each paint.
   * Uses hash-based grouping (O(n)) instead of pairwise deep equality.
   *
   * Paint objects are converted from Rust's externally-tagged enum format to
   * the JS `cg.Paint` format (internally tagged with `type` field, RGBA32F colors).
   *
   * @param ids - Node IDs to query.
   * @param target - "fill" or "stroke"
   * @param options.recursive - Include descendant subtrees (default: true).
   * @param options.limit - Max distinct paint groups to return (0 = unlimited).
   */
  queryPaintGroups(
    ids: string[],
    target: "fill" | "stroke" = "fill",
    options?: { recursive?: boolean; limit?: number }
  ): Array<{ paint: Record<string, unknown>; node_ids: string[] }> {
    this._assertAlive();
    const recursive = options?.recursive ?? true;
    const limit = options?.limit ?? 0;
    const targetCode = target === "stroke" ? 1 : 0;

    const idsJson = JSON.stringify(ids);
    const [idsPtr, idsLen] = this._alloc_string(idsJson);
    const ptr = this.module._query_paint_groups(
      this.appptr,
      idsPtr,
      idsLen - 1,
      targetCode,
      recursive,
      limit
    );
    this._free_string(idsPtr, idsLen);

    if (ptr === 0) return [];
    const str = ffi.readLenPrefixedString(this.module, ptr);
    const raw = JSON.parse(str) as Array<{
      paint: Record<string, unknown>;
      node_ids: string[];
    }>;
    return raw.map((g) => ({
      paint: convertRustPaintToJS(g.paint),
      node_ids: g.node_ids,
    }));
  }

  /**
   * Configure surface overlay rendering (size meter, frame titles, etc.).
   */
  setSurfaceOverlayConfig(config: SurfaceOverlayConfig) {
    this._assertAlive();
    const json = JSON.stringify(config);
    const [ptr, len] = this._alloc_string(json);
    this.module._set_surface_overlay_config(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  /**
   * Select all nodes in the current scene.
   */
  selectAll() {
    this._assertAlive();
    this.module._command(this.appptr, ApplicationCommandID.SelectAll, 0, 0);
  }

  /**
   * Deselect all nodes.
   */
  deselectAll() {
    this._assertAlive();
    this.module._command(this.appptr, ApplicationCommandID.DeselectAll, 0, 0);
  }

  /**
   * Navigate selection to direct children of the current selection (Enter).
   */
  selectChildren() {
    this._assertAlive();
    this.module._command(
      this.appptr,
      ApplicationCommandID.SelectChildren,
      0,
      0
    );
  }

  /**
   * Navigate selection to parent of the current selection (Shift+Enter).
   */
  selectParent() {
    this._assertAlive();
    this.module._command(this.appptr, ApplicationCommandID.SelectParent, 0, 0);
  }

  /**
   * Navigate selection to next sibling, wrapping around (Tab).
   */
  selectNextSibling() {
    this._assertAlive();
    this.module._command(
      this.appptr,
      ApplicationCommandID.SelectNextSibling,
      0,
      0
    );
  }

  /**
   * Navigate selection to previous sibling, wrapping around (Shift+Tab).
   */
  selectPreviousSibling() {
    this._assertAlive();
    this.module._command(
      this.appptr,
      ApplicationCommandID.SelectPreviousSibling,
      0,
      0
    );
  }

  /**
   * Zoom the viewport to fit all content (Shift+1).
   */
  zoomToFit() {
    this._assertAlive();
    this.module._command(this.appptr, ApplicationCommandID.ZoomToFit, 0, 0);
  }

  /**
   * Zoom the viewport to fit the current selection (Shift+2).
   */
  zoomToSelection() {
    this._assertAlive();
    this.module._command(
      this.appptr,
      ApplicationCommandID.ZoomToSelection,
      0,
      0
    );
  }

  /**
   * Reset viewport zoom to 100% (Shift+0).
   */
  zoomTo100() {
    this._assertAlive();
    this.module._command(this.appptr, ApplicationCommandID.ZoomTo100, 0, 0);
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

  runtime_renderer_set_layer_compositing(enable: boolean) {
    this._assertAlive();
    this.module._runtime_renderer_set_layer_compositing(this.appptr, enable);
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

  /**
   * Skip layout computation during scene loading.
   *
   * When enabled, `load_scene` derives layout from schema positions/sizes
   * instead of running the Taffy flexbox engine. Set **before** loading a scene.
   *
   * Use this for documents with only absolute positioning (e.g. imported
   * Figma files without auto-layout) to eliminate the layout phase, which
   * is the dominant cost in `load_scene` for large documents.
   */
  runtime_renderer_set_skip_layout(skip: boolean) {
    this._assertAlive();
    this.module._runtime_renderer_set_skip_layout(this.appptr, skip);
  }

  /**
   * Bit flags for `runtime_renderer_set_isolation_mode`.
   *
   * - `OVERFLOW_DIM` (0x1): treat the isolation root's bounds as a
   *   viewport — subtree content that overflows is drawn at reduced
   *   opacity (`overflowOpacity`).
   */
  static readonly ISOLATION_MODE_OVERFLOW_DIM = 1 << 0;

  /**
   * Set or clear isolation mode.
   *
   * When `nodeId` is a string, only that node and its descendants are
   * drawn and hit-tested. Pass `null` to clear isolation.
   * Isolation is viewport-only — it does not mutate the document.
   *
   * @param nodeId  Node to isolate, or `null` to clear.
   * @param flags   Bitmask of `Scene.ISOLATION_MODE_*` constants. Default `0`.
   * @param overflowOpacity  Opacity for overflow-dimmed content (0–1).
   *                         Only used when `ISOLATION_MODE_OVERFLOW_DIM` is set.
   *                         Default `0.15`.
   */
  runtime_renderer_set_isolation_mode(
    nodeId: string | null,
    flags: number = 0,
    overflowOpacity: number = 0.15
  ) {
    this._assertAlive();
    if (nodeId === null) {
      this.module._runtime_renderer_set_isolation_mode(this.appptr, 0, 0, 0, 0);
      return;
    }
    const [ptr, len] = this._alloc_string(nodeId);
    this.module._runtime_renderer_set_isolation_mode(
      this.appptr,
      ptr,
      len - 1,
      flags,
      overflowOpacity
    );
    this._free_string(ptr, len);
  }

  /**
   * Stage decoration preset constants for
   * `runtime_renderer_set_isolation_stage_preset`.
   *
   * Maps to the Tailwind CSS `box-shadow` scale.
   */
  static readonly ISOLATION_STAGE_PRESET_NONE = 0;
  static readonly ISOLATION_STAGE_PRESET_SHADOW_2XS = 1;
  static readonly ISOLATION_STAGE_PRESET_SHADOW_XS = 2;
  static readonly ISOLATION_STAGE_PRESET_SHADOW_SM = 3;
  static readonly ISOLATION_STAGE_PRESET_SHADOW_MD = 4;
  static readonly ISOLATION_STAGE_PRESET_SHADOW_LG = 5;
  static readonly ISOLATION_STAGE_PRESET_SHADOW_XL = 6;
  static readonly ISOLATION_STAGE_PRESET_SHADOW_2XL = 7;

  /**
   * Set the isolation mode stage decoration preset.
   *
   * | value | preset      |
   * |-------|-------------|
   * |   0   | None        |
   * |   1   | shadow-2xs  |
   * |   2   | shadow-xs   |
   * |   3   | shadow-sm   |
   * |   4   | shadow-md   |
   * |   5   | shadow-lg   |
   * |   6   | shadow-xl   |
   * |   7   | shadow-2xl  |
   *
   * Only takes effect when isolation mode is active.
   */
  runtime_renderer_set_isolation_stage_preset(preset: number) {
    this._assertAlive();
    this.module._runtime_renderer_set_isolation_stage_preset(
      this.appptr,
      preset
    );
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

// ---------------------------------------------------------------------------
// Paint format conversion: Rust externally-tagged enum → JS cg.Paint
// ---------------------------------------------------------------------------

/** Map from Rust enum variant name to JS `type` string. */
const PAINT_TYPE_MAP: Record<string, string> = {
  Solid: "solid",
  LinearGradient: "linear_gradient",
  RadialGradient: "radial_gradient",
  SweepGradient: "sweep_gradient",
  DiamondGradient: "diamond_gradient",
  Image: "image",
};

/**
 * Convert a CGColor from Rust u8 array `[r, g, b, a]` to JS RGBA32F object.
 */
function convertColor(c: number[]): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  return { r: c[0] / 255, g: c[1] / 255, b: c[2] / 255, a: c[3] / 255 };
}

/**
 * Convert a GradientStop from Rust format to JS format.
 */
function convertStop(stop: { offset: number; color: number[] }): {
  offset: number;
  color: { r: number; g: number; b: number; a: number };
} {
  return { offset: stop.offset, color: convertColor(stop.color) };
}

/**
 * Convert a Paint from Rust's externally-tagged serde format to the JS
 * cg.Paint format (internally tagged with `type`, RGBA32F colors).
 *
 * Rust: `{ "Solid": { active: true, color: [255, 0, 0, 255], blend_mode: "normal" } }`
 * JS:   `{ type: "solid", active: true, color: { r: 1, g: 0, b: 0, a: 1 }, blend_mode: "normal" }`
 */
function convertRustPaintToJS(
  paint: Record<string, unknown>
): Record<string, unknown> {
  const variant = Object.keys(paint)[0];
  const data = paint[variant] as Record<string, unknown>;
  const type = PAINT_TYPE_MAP[variant] ?? variant.toLowerCase();

  const result: Record<string, unknown> = { type, ...data };

  // Convert colors from u8 arrays to RGBA32F objects
  if (data.color && Array.isArray(data.color)) {
    result.color = convertColor(data.color);
  }
  if (data.stops && Array.isArray(data.stops)) {
    result.stops = data.stops.map(convertStop);
  }

  return result;
}

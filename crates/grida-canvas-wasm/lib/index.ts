import createGridaCanvas from "./bin/grida-canvas-wasm";
import { version } from "../package.json";

export interface GridaCanvasModuleInitOptions {
  /**
   * This callback will be invoked when the loader needs to fetch a file (e.g.
   * the blob of WASM code). The correct url prefix should be applied.
   * @param file - the name of the file that is about to be loaded.
   *
   * @example
   * ```ts
   * locateFile: (file) => `https://unpkg.com/@grida/canvas-wasm@$latest/bin/${file}`,
   * locateFile: (file) => `custom-binary-path/${file}`,
   * ```
   */
  locateFile(file: string, version: string): string;
}

// ====================================================================================================
// TYPES
// ====================================================================================================

type Vector2 = [number, number];
type Transform2D = [[number, number, number], [number, number, number]];
type Rectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ExportConstraints = {
  type: "SCALE" | "WIDTH" | "HEIGHT";
  value: number;
};

type ExportAs = ExportAsImage | ExportAsPDF | ExportAsSVG;
type ExportAsPDF = { format: "PDF" };
type ExportAsSVG = { format: "SVG" };
type ExportAsImage = {
  format: "PNG" | "JPEG" | "WEBP" | "BMP";
  constraints: ExportConstraints;
};

export type FontKey = {
  family: string;
  // Future properties will allow precise font identification and partial fetching.
};

type VectorNetworkVertex = Vector2;
type VectorNetworkSegment = {
  a: number;
  b: number;
  ta: Vector2;
  tb: Vector2;
};
interface VectorNetwork {
  vertices: VectorNetworkVertex[];
  segments: VectorNetworkSegment[];
}

// ====================================================================================================

export default async function init(
  opts?: GridaCanvasModuleInitOptions
): Promise<ApplicationFactory> {
  const bindings = await createGridaCanvas({
    locateFile: opts?.locateFile
      ? (file, __scriptDirectory) => opts?.locateFile(file, version)
      : undefined,
  });

  return new ApplicationFactory(
    bindings as createGridaCanvas.GridaCanvasWasmBindings
  );
}

interface CreateWebGLCanvasSurfaceOptions {
  /**
   * when true, embedded fonts will be registered and used for text rendering.
   * @default true
   */
  use_embedded_fonts?: boolean;
}

class ApplicationFactory {
  private readonly module: createGridaCanvas.GridaCanvasWasmBindings;

  constructor(module: createGridaCanvas.GridaCanvasWasmBindings) {
    this.module = module;
  }

  createWebGLCanvasSurface(
    canvas: HTMLCanvasElement,
    options: CreateWebGLCanvasSurfaceOptions = { use_embedded_fonts: true }
  ) {
    const context = canvas.getContext("webgl2", {
      antialias: true,
      depth: true,
      stencil: true,
      alpha: true,
    });

    if (!context) {
      throw new Error("Failed to get WebGL2 context");
    }

    const handle = this.module.GL.registerContext(context, {
      majorVersion: 2,
    });
    this.module.GL.makeContextCurrent(handle);
    const ptr = this.module._init(
      canvas.width,
      canvas.height,
      options.use_embedded_fonts
    );
    const _ = new Grida2D(this.module, ptr);
    _.resize(canvas.width, canvas.height);

    return _;
  }

  createWebGLCanvasSurfaceById(htmlcanvasid: string) {
    const canvas = document.getElementById(htmlcanvasid) as HTMLCanvasElement;
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error(`Element with id ${htmlcanvasid} is not a <canvas>`);
    }

    return this.createWebGLCanvasSurface(canvas);
  }
}

const ApplicationCommandID = {
  ZoomIn: 1,
  ZoomOut: 2,
  ZoomDelta: 3,
  Pan: 4,
} as const;

namespace utils {
  export function rect_from_vec4(vec4: Float32Array): Rectangle {
    return {
      x: vec4[0],
      y: vec4[1],
      width: vec4[2],
      height: vec4[3],
    };
  }
}

export class Grida2D {
  private appptr: number;
  private module: createGridaCanvas.GridaCanvasWasmBindings;
  constructor(module: createGridaCanvas.GridaCanvasWasmBindings, ptr: number) {
    this.module = module;
    this.appptr = ptr;
  }

  _alloc_string(txt: string): [number, number] {
    const len = this.module.lengthBytesUTF8(txt) + 1;
    const ptr = this.module._allocate(len);
    this.module.stringToUTF8(txt, ptr, len);
    return [ptr, len];
  }

  _free_string(ptr: number, len: number) {
    this.module._deallocate(ptr, len);
  }

  /**
   * Load a scene from a JSON string.
   * @param data - The JSON string to load.
   */
  loadScene(data: string) {
    const [ptr, len] = this._alloc_string(data);
    this.module._load_scene_json(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  /**
   * @deprecated - test use only
   */
  loadDummyScene() {
    this.module._load_dummy_scene(this.appptr);
  }

  /**
   * @deprecated - test use only
   */
  loadBenchmarkScene(cols: number, rows: number) {
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
    const [fptr, flen] = this._alloc_string(family);
    const len = data.length;
    const ptr = this.module._allocate(len);
    this.module.HEAPU8.set(data, ptr);
    this.module._add_font(this.appptr, fptr, flen - 1, ptr, len);
    this.module._deallocate(fptr, flen);
    this.module._deallocate(ptr, len);
  }

  addImage(data: Uint8Array): string {
    const len = data.length;
    const ptr = this.module._allocate(len);
    this.module.HEAPU8.set(data, ptr);
    const out = this.module._add_image(this.appptr, ptr, len);
    this.module._deallocate(ptr, len);
    const hash = this.module.UTF8ToString(out);
    const hlen = this.module.lengthBytesUTF8(hash) + 1;
    this._free_string(out, hlen);
    return hash;
  }

  hasMissingFonts(): boolean {
    return this.module._has_missing_fonts(this.appptr);
  }

  listMissingFonts(): FontKey[] {
    const ptr = this.module._list_missing_fonts(this.appptr);
    if (ptr === 0) return [];
    const str = this.module.UTF8ToString(ptr);
    const len = this.module.lengthBytesUTF8(str) + 1;
    this._free_string(ptr, len);
    return JSON.parse(str);
  }

  listAvailableFonts(): FontKey[] {
    const ptr = this.module._list_available_fonts(this.appptr);
    if (ptr === 0) return [];
    const str = this.module.UTF8ToString(ptr);
    const len = this.module.lengthBytesUTF8(str) + 1;
    this._free_string(ptr, len);
    return JSON.parse(str);
  }

  setFallbackFonts(fonts: string[]) {
    const json = JSON.stringify(fonts);
    const [ptr, len] = this._alloc_string(json);
    this.module._set_default_fallback_fonts(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  getFallbackFonts(): string[] {
    const ptr = this.module._get_default_fallback_fonts(this.appptr);
    if (ptr === 0) return [];
    const str = this.module.UTF8ToString(ptr);
    const len = this.module.lengthBytesUTF8(str) + 1;
    this._free_string(ptr, len);
    return JSON.parse(str);
  }

  /**
   * Tick the application clock.
   * bind this to requestAnimationFrame loop or similar
   * @param time - The time in milliseconds. use performance.now()
   * @default - performance.now()
   */
  tick(time?: number) {
    this.module._tick(this.appptr, time ?? performance.now());
  }

  /**
   * Resize the surface.
   * @param width - The width of the surface.
   * @param height - The height of the surface.
   */
  resize(width: number, height: number) {
    this.module._resize_surface(this.appptr, width, height);
  }

  redraw() {
    this.module._redraw(this.appptr);
  }

  setMainCameraTransform(transform: Transform2D) {
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
    const ptr = this.module._get_node_id_from_point(this.appptr, x, y);
    if (ptr === 0) {
      return null;
    }
    const str = this.module.UTF8ToString(ptr);
    const len = this.module.lengthBytesUTF8(str) + 1;
    this._free_string(ptr, len);
    return str;
  }

  getNodeIdsFromPoint(x: number, y: number): string[] {
    const ptr = this.module._get_node_ids_from_point(this.appptr, x, y);
    if (ptr === 0) {
      return [];
    }
    const str = this.module.UTF8ToString(ptr);
    const len = this.module.lengthBytesUTF8(str) + 1;
    this._free_string(ptr, len);
    return JSON.parse(str);
  }

  getNodeIdsFromEnvelope(envelope: Rectangle): string[] {
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
    const str = this.module.UTF8ToString(ptr);
    const len = this.module.lengthBytesUTF8(str) + 1;
    this._free_string(ptr, len);
    return JSON.parse(str);
  }

  getNodeAbsoluteBoundingBox(id: string): Rectangle | null {
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

    return utils.rect_from_vec4(rect);
  }

  /**
   * @deprecated not fully implemented yet
   */
  toVectorNetwork(id: string): VectorNetwork | null {
    const [ptr, len] = this._alloc_string(id);
    const outptr = this.module._to_vector_network(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);

    if (outptr === 0) {
      return null;
    }

    const str = this.module.UTF8ToString(outptr);
    const outlen = this.module.lengthBytesUTF8(str) + 1;
    this._free_string(outptr, outlen);
    return JSON.parse(str);
  }

  exportNodeAs(
    id: string,
    format: ExportAs
  ): {
    data: Uint8Array;
  } {
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

    // Read the length from the first 4 bytes (little-endian u32)
    const lengthBytes = this.module.HEAPU8.slice(outptr, outptr + 4);
    const dataLength = new Uint32Array(
      lengthBytes.buffer,
      lengthBytes.byteOffset,
      1
    )[0];

    // Read the actual data starting after the length prefix
    const data = this.module.HEAPU8.slice(outptr + 4, outptr + 4 + dataLength);

    // Free the entire allocated block (length + data)
    this.module._deallocate(outptr, 4 + dataLength);

    return {
      data: new Uint8Array(data),
    };
  }

  execCommand(command: "ZoomIn" | "ZoomOut") {
    this.module._command(this.appptr, ApplicationCommandID[command], 0, 0);
  }

  execCommandPan(tx: number, ty: number) {
    this.module._command(this.appptr, ApplicationCommandID.Pan, tx, ty);
  }

  execCommandZoomDelta(tz: number) {
    this.module._command(this.appptr, ApplicationCommandID.ZoomDelta, tz, 0);
  }

  pointermove(x: number, y: number) {
    this.module._pointer_move(this.appptr, x, y);
  }

  highlightStrokes(opts?: {
    nodes?: string[];
    style?: { strokeWidth?: number; stroke?: string };
  }) {
    const json = JSON.stringify({
      nodes: opts?.nodes ?? [],
      style: opts?.style,
    });
    const [ptr, len] = this._alloc_string(json);
    this.module._highlight_strokes(this.appptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  runtime_renderer_set_cache_tile(enable: boolean) {
    this.module._runtime_renderer_set_cache_tile(this.appptr, enable);
  }

  // ====================================================================================================
  // DEVTOOLS
  // ====================================================================================================

  setDebug(debug: boolean) {
    this.module._set_debug(this.appptr, debug);
  }

  toggleDebug() {
    this.module._toggle_debug(this.appptr);
  }

  setVerbose(verbose: boolean) {
    this.module._set_verbose(this.appptr, verbose);
  }

  /**
   * Set the visibility of the tiles.
   * @param show - The visibility of the tiles.
   */
  devtools_rendering_set_show_tiles(show: boolean) {
    this.module._devtools_rendering_set_show_tiles(this.appptr, show);
  }

  /**
   * Set the visibility of the FPS meter.
   * @param show - The visibility of the FPS meter.
   */
  devtools_rendering_set_show_fps_meter(show: boolean) {
    this.module._devtools_rendering_set_show_fps_meter(this.appptr, show);
  }

  /**
   * Set the visibility of the stats.
   * @param show - The visibility of the stats.
   */
  devtools_rendering_set_show_stats(show: boolean) {
    this.module._devtools_rendering_set_show_stats(this.appptr, show);
  }

  /**
   * Set the visibility of the hit testing.
   * @param show - The visibility of the hit testing.
   */
  devtools_rendering_set_show_hit_testing(show: boolean) {
    this.module._devtools_rendering_set_show_hit_testing(this.appptr, show);
  }

  /**
   * Set the visibility of the ruler.
   * @param show - The visibility of the ruler.
   */
  devtools_rendering_set_show_ruler(show: boolean) {
    this.module._devtools_rendering_set_show_ruler(this.appptr, show);
  }
}

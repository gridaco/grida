import createGridaCanvas from "./grida-canvas-wasm";
import { version as _version } from "../package.json";
import {
  Scene,
  type CreateImageResourceResult,
  type AddImageWithIdResult,
  type TextEditCommand,
  type SurfaceResponse,
  type SurfaceCursorIcon,
  type SurfaceOverlayConfig,
  encodeModifiers,
  encodeButton,
} from "./modules/canvas";
export {
  type Scene,
  type CreateImageResourceResult,
  type AddImageWithIdResult,
  type TextEditCommand,
  type SurfaceResponse,
  type SurfaceCursorIcon,
  type SurfaceOverlayConfig,
  encodeModifiers,
  encodeButton,
};
export const version = _version;

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

export namespace types {
  export type Vector2 = [number, number];
  export type Transform2D = [
    [number, number, number],
    [number, number, number],
  ];

  export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  export type ExportConstraints = {
    /**
     * - none: as-is, no resizing, scaling
     * - scale: scale with factor
     * - scale-to-fit-width: scale to fit width (with same aspect ratio)
     * - scale-to-fit-height: scale to fit height (with same aspect ratio)
     */
    type: "none" | "scale" | "scale-to-fit-width" | "scale-to-fit-height";
    /**
     * - scale: scale factor
     * - scale-to-fit-width: width in pixels
     * - scale-to-fit-height: height in pixels
     */
    value: number;
  };

  export type ExportAs = ExportAsImage | ExportAsPDF | ExportAsSVG;
  export type ExportAsPDF = { format: "PDF" };
  export type ExportAsSVG = { format: "SVG" };

  /**
   * Options for exporting multiple nodes as a single multi-page PDF document.
   *
   * Each node ID becomes one page in the output PDF, rendered in order.
   */
  export type ExportPdfDocumentOptions = {
    /** Node IDs to export, one per page, in order. */
    node_ids: string[];
    /**
     * Uniform page size in points. When `null` or `undefined`, each page
     * is sized to the source node's render bounds.
     */
    page_size?: { width: number; height: number } | null;
  };
  export type ExportAsPNG = {
    format: "PNG";
    constraints: ExportConstraints;
  };
  export type ExportAsJPEG = {
    format: "JPEG";
    constraints: ExportConstraints;
    /**
     * Quality setting for JPEG compression (0-100). Higher values mean better quality but larger file size.
     * @default 100
     */
    quality?: number;
  };
  export type ExportAsWEBP = {
    format: "WEBP";
    constraints: ExportConstraints;
    /**
     * Quality setting for WEBP compression (0-100). Higher values mean better quality but larger file size.
     * Quality 100 is lossless. Lower values use lossy compression.
     * @default 75
     */
    quality?: number;
  };
  export type ExportAsBMP = {
    format: "BMP";
    constraints: ExportConstraints;
  };
  export type ExportAsImage =
    | ExportAsPNG
    | ExportAsJPEG
    | ExportAsWEBP
    | ExportAsBMP;

  export type FontKey = {
    family: string;
    // Future properties will allow precise font identification and partial fetching.
  };

  export type VectorNetworkVertex = Vector2;
  export type VectorNetworkSegment = {
    a: number;
    b: number;
    ta: Vector2;
    tb: Vector2;
  };
  export interface VectorNetwork {
    vertices: VectorNetworkVertex[];
    segments: VectorNetworkSegment[];
  }

  /**
   * Result of flattening a shape node to a vector network.
   *
   * When `corner_radius` is present, the vector network contains straight
   * segments and corner radius should be applied as a rendering effect.
   * When absent, corner geometry is baked into the vector network as curves.
   */
  export interface FlattenResult extends VectorNetwork {
    corner_radius?: number;
  }
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

/**
 * Renderer configuration flags.
 *
 * Matches the Rust `RuntimeRendererConfig` fields that are exposed via
 * the C ABI `config_flags` bitfield. Pass at init time; individual
 * fields remain mutable via `Scene.runtime_renderer_set_*()` setters.
 */
interface RendererConfig {
  /**
   * Skip the Taffy flexbox layout engine during scene loading.
   * Derives layout from schema positions/sizes instead.
   * @default false
   */
  skip_layout?: boolean;
}

/** Encode a `RendererConfig` into the C ABI `config_flags` bitfield. */
function encodeConfigFlags(config?: RendererConfig): number {
  let flags = 0;
  if (config?.skip_layout) flags |= 1 << 0;
  return flags;
}

interface CreateSurfaceOptions {
  /**
   * when true, embedded fonts will be registered and used for text rendering.
   * @default true
   */
  use_embedded_fonts?: boolean;
  /**
   * Initial renderer configuration applied at construction.
   * Fields can still be changed at runtime via `Scene.runtime_renderer_set_*()`.
   */
  config?: RendererConfig;
}

class ApplicationFactory {
  public readonly module: createGridaCanvas.GridaCanvasWasmBindings;

  constructor(module: createGridaCanvas.GridaCanvasWasmBindings) {
    this.module = module;
  }

  createWebGLCanvasSurface(
    canvas: HTMLCanvasElement,
    options: CreateSurfaceOptions = { use_embedded_fonts: true }
  ): Scene {
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
      options.use_embedded_fonts,
      encodeConfigFlags(options.config)
    );
    const _ = new Scene(this.module, ptr);
    _.resize(canvas.width, canvas.height);

    return _;
  }

  createWebGLCanvasSurfaceById(htmlcanvasid: string): Scene {
    const canvas = document.getElementById(htmlcanvasid) as HTMLCanvasElement;
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error(`Element with id ${htmlcanvasid} is not a <canvas>`);
    }

    return this.createWebGLCanvasSurface(canvas);
  }
}

export type { ApplicationFactory };

/**
 * Internal numeric backend ids for the WASM ABI (`_init_with_backend`).
 *
 * Keep in sync with Rust (`crates/grida-canvas-wasm/src/wasm_application.rs`).
 */
const BACKEND_ID = {
  WebGL: 0,
  Raster: 1,
} as const;

export type CreateCanvasOptions =
  | {
      backend?: "webgl";
      canvas: HTMLCanvasElement;
      locateFile?: GridaCanvasModuleInitOptions["locateFile"];
      useEmbeddedFonts?: boolean;
      /** Initial renderer configuration. */
      config?: RendererConfig;
    }
  | {
      backend: "raster";
      width: number;
      height: number;
      locateFile?: GridaCanvasModuleInitOptions["locateFile"];
      useEmbeddedFonts?: boolean;
      /** Initial renderer configuration. */
      config?: RendererConfig;
    };

export class Canvas {
  private readonly _backend: "webgl" | "raster";
  private readonly _scene: Scene;

  private constructor(backend: "webgl" | "raster", scene: Scene) {
    this._backend = backend;
    this._scene = scene;
  }

  get backend() {
    return this._backend;
  }

  loadSceneGrida(data: Uint8Array) {
    this._scene.loadSceneGrida(data);
  }

  /**
   * Activate a scene previously decoded by `loadSceneGrida`.
   * Required before `exportNodeAs` or other rendering ops when the document
   * contains multiple scenes or when no default is implicitly activated.
   */
  switchScene(sceneId: string) {
    this._scene.switchScene(sceneId);
  }

  /**
   * Return the IDs of all scenes decoded by the last `loadSceneGrida` call.
   */
  loadedSceneIds(): string[] {
    return this._scene.loadedSceneIds();
  }

  /**
   * Register a font with the renderer. Multiple calls with the same family
   * and different font files are supported (e.g. Regular, Bold, Italic per family).
   */
  addFont(family: string, bytes: Uint8Array) {
    this._scene.addFont(family, bytes);
  }

  /**
   * Set the default fallback font families. Order matters for script fallback (e.g. CJK).
   */
  setFallbackFonts(fonts: string[]) {
    this._scene.setFallbackFonts(fonts);
  }

  /**
   * Get the current default fallback font families.
   */
  getFallbackFonts(): string[] {
    return this._scene.getFallbackFonts();
  }

  /**
   * Register image bytes with content-addressed RID (e.g. mem://&lt;hash&gt;).
   * Use when you do not need a stable logical identifier.
   */
  addImage(data: Uint8Array): CreateImageResourceResult | false {
    return this._scene.addImage(data);
  }

  /**
   * Register image bytes with an explicit logical RID (e.g. res://images/logo.png).
   * Use when you need stable, document-mapped identifiers.
   */
  addImageWithId(data: Uint8Array, rid: string): AddImageWithIdResult | false {
    return this._scene.addImageWithId(data, rid);
  }

  exportNodeAs(id: string, format: types.ExportAs): { data: Uint8Array } {
    return this._scene.exportNodeAs(id, format);
  }

  /**
   * Release the underlying WASM application instance.
   *
   * After calling this, the `Canvas` (and its internal `Scene`) must not be used again.
   */
  dispose() {
    this._scene.dispose();
  }

  /**
   * Access the underlying WebGL `Scene` when `backend === "webgl"`.
   * Returns `null` for raster canvases.
   */
  asWebGL(): Scene | null {
    return this._backend === "webgl" ? this._scene : null;
  }

  /** @internal */
  static _fromWebGL(scene: Scene) {
    return new Canvas("webgl", scene);
  }

  /** @internal */
  static _fromRaster(scene: Scene) {
    return new Canvas("raster", scene);
  }
}

/**
 * Create a canvas instance backed by either:
 * - **WebGL**: interactive rendering in the browser
 * - **Raster**: headless CPU rendering (useful for Node export pipelines)
 */
export async function createCanvas(opts: CreateCanvasOptions): Promise<Canvas> {
  const bindings = await createGridaCanvas({
    locateFile: opts.locateFile
      ? (file, __scriptDirectory) => opts.locateFile!(file, version)
      : undefined,
  });

  const module = bindings as createGridaCanvas.GridaCanvasWasmBindings;
  const useEmbeddedFonts = opts.useEmbeddedFonts ?? true;
  const configFlags = encodeConfigFlags(opts.config);

  if (opts.backend === "raster") {
    const appptr = module._init_with_backend(
      BACKEND_ID.Raster,
      opts.width,
      opts.height,
      useEmbeddedFonts,
      configFlags
    );
    return Canvas._fromRaster(new Scene(module, appptr));
  }

  // Default: webgl
  const context = opts.canvas.getContext("webgl2", {
    antialias: true,
    depth: true,
    stencil: true,
    alpha: true,
  });
  if (!context) throw new Error("Failed to get WebGL2 context");
  const handle = module.GL.registerContext(context, { majorVersion: 2 });
  module.GL.makeContextCurrent(handle);
  const appptr = module._init_with_backend(
    BACKEND_ID.WebGL,
    opts.canvas.width,
    opts.canvas.height,
    useEmbeddedFonts,
    configFlags
  );
  const scene = new Scene(module, appptr);
  scene.resize(opts.canvas.width, opts.canvas.height);
  return Canvas._fromWebGL(scene);
}

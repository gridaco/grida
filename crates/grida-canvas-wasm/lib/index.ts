import createGridaCanvas from "./grida-canvas-wasm";
import { version as _version } from "../package.json";
import {
  Scene,
  type CreateImageResourceResult,
  type AddImageWithIdResult,
} from "./modules/canvas";
import { svgtypes } from "./modules/svg-bindings";
export {
  type Scene,
  type svgtypes,
  type CreateImageResourceResult,
  type AddImageWithIdResult,
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

interface CreateSurfaceOptions {
  /**
   * when true, embedded fonts will be registered and used for text rendering.
   * @default true
   */
  use_embedded_fonts?: boolean;
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
      options.use_embedded_fonts
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
    }
  | {
      backend: "raster";
      width: number;
      height: number;
      locateFile?: GridaCanvasModuleInitOptions["locateFile"];
      useEmbeddedFonts?: boolean;
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

  loadScene(json: string) {
    this._scene.loadScene(json);
  }

  addFont(family: string, bytes: Uint8Array) {
    this._scene.addFont(family, bytes);
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
  addImageWithId(
    data: Uint8Array,
    rid: string
  ): AddImageWithIdResult | false {
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

  if (opts.backend === "raster") {
    const appptr = module._init_with_backend(
      BACKEND_ID.Raster,
      opts.width,
      opts.height,
      useEmbeddedFonts
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
    useEmbeddedFonts
  );
  const scene = new Scene(module, appptr);
  scene.resize(opts.canvas.width, opts.canvas.height);
  return Canvas._fromWebGL(scene);
}

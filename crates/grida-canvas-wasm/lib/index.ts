import createGridaCanvas from "./bin/grida-canvas-wasm";
import { version } from "../package.json";
import { Grida2D } from "./modules/canvas";

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
  export type Rectangle = {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  export type ExportConstraints = {
    type: "SCALE" | "WIDTH" | "HEIGHT";
    value: number;
  };

  export type ExportAs = ExportAsImage | ExportAsPDF | ExportAsSVG;
  export type ExportAsPDF = { format: "PDF" };
  export type ExportAsSVG = { format: "SVG" };
  export type ExportAsImage = {
    format: "PNG" | "JPEG" | "WEBP" | "BMP";
    constraints: ExportConstraints;
  };

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

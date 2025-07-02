import createGridaCanvas from "./bin/grida-canvas-wasm";
import { GridaCanvasInitOptions } from "./api";

type Transform2D = [[number, number, number], [number, number, number]];

export default async function init(
  opts?: GridaCanvasInitOptions
): Promise<ApplicationFactory> {
  const bindings = await createGridaCanvas({ locateFile: opts?.locateFile });

  return new ApplicationFactory(
    bindings as createGridaCanvas.GridaCanvasWasmBindings
  );
}

class ApplicationFactory {
  private readonly module: createGridaCanvas.GridaCanvasWasmBindings;

  constructor(module: createGridaCanvas.GridaCanvasWasmBindings) {
    this.module = module;
  }

  createWebGLCanvasSurface(canvas: HTMLCanvasElement) {
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
    const ptr = this.module._init(canvas.width, canvas.height);
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

export class Grida2D {
  private ptr: number;
  private module: createGridaCanvas.GridaCanvasWasmBindings;
  constructor(module: createGridaCanvas.GridaCanvasWasmBindings, ptr: number) {
    this.module = module;
    this.ptr = ptr;
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
    this.module._load_scene_json(this.ptr, ptr, len - 1);
    this._free_string(ptr, len);
  }

  /**
   * @deprecated - test use only
   */
  loadDummyScene() {
    this.module._load_dummy_scene(this.ptr);
  }

  /**
   * @deprecated - test use only
   */
  loadBenchmarkScene(cols: number, rows: number) {
    this.module._load_benchmark_scene(this.ptr, cols, rows);
  }

  /**
   * Tick the application clock.
   * bind this to requestAnimationFrame loop or similar
   */
  tick() {
    this.module._tick(this.ptr);
  }

  /**
   * Resize the surface.
   * @param width - The width of the surface.
   * @param height - The height of the surface.
   */
  resize(width: number, height: number) {
    this.module._resize_surface(this.ptr, width, height);
  }

  redraw() {
    this.module._redraw(this.ptr);
  }

  setMainCameraTransform(transform: Transform2D) {
    this.module._set_main_camera_transform(
      this.ptr,
      transform[0][0], // a
      transform[0][1], // c
      transform[0][2], // e
      transform[1][0], // b
      transform[1][1], // d
      transform[1][2] // f
    );
  }

  execCommand(command: "ZoomIn" | "ZoomOut") {
    this.module._command(this.ptr, ApplicationCommandID[command], 0, 0);
  }

  execCommandPan(tx: number, ty: number) {
    this.module._command(this.ptr, ApplicationCommandID.Pan, tx, ty);
  }

  execCommandZoomDelta(tz: number) {
    this.module._command(this.ptr, ApplicationCommandID.ZoomDelta, tz, 0);
  }

  pointermove(x: number, y: number) {
    this.module._pointer_move(this.ptr, x, y);
  }

  // ====================================================================================================
  // DEVTOOLS
  // ====================================================================================================

  /**
   * Set the visibility of the tiles.
   * @param show - The visibility of the tiles.
   */
  devtools_rendering_set_show_tiles(show: boolean) {
    this.module._devtools_rendering_set_show_tiles(this.ptr, show);
  }

  /**
   * Set the visibility of the FPS meter.
   * @param show - The visibility of the FPS meter.
   */
  devtools_rendering_set_show_fps_meter(show: boolean) {
    this.module._devtools_rendering_set_show_fps_meter(this.ptr, show);
  }

  /**
   * Set the visibility of the stats.
   * @param show - The visibility of the stats.
   */
  devtools_rendering_set_show_stats(show: boolean) {
    this.module._devtools_rendering_set_show_stats(this.ptr, show);
  }

  /**
   * Set the visibility of the hit testing.
   * @param show - The visibility of the hit testing.
   */
  devtools_rendering_set_show_hit_testing(show: boolean) {
    this.module._devtools_rendering_set_show_hit_testing(this.ptr, show);
  }

  /**
   * Set the visibility of the ruler.
   * @param show - The visibility of the ruler.
   */
  devtools_rendering_set_show_ruler(show: boolean) {
    this.module._devtools_rendering_set_show_ruler(this.ptr, show);
  }
}

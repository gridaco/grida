import "./bin/grida-canvas-wasm";
import { GridaCanvasInitOptions } from "./api";

export default async function init(
  opts?: GridaCanvasInitOptions
): Promise<ApplicationFactory> {
  const bindings = await createGridaCanvas({ locateFile: opts?.locateFile });

  return new ApplicationFactory(bindings);
}

class ApplicationFactory {
  private readonly module: GridaCanvasWasmBindings;

  constructor(module: GridaCanvasWasmBindings) {
    this.module = module;
  }

  createSurface(width: number, height: number) {
    const ptr = this.module._init(width, height);
    return new Grida2D(this.module, ptr);
  }
}

const ApplicationCommandKey = {
  ZoomIn: 1,
  ZoomOut: 2,
  ZoomDelta: 3,
  Pan: 4,
} as const;

class Grida2D {
  private ptr: GridaCanvasWebGlApplicationPtr;
  private module: GridaCanvasWasmBindings;
  constructor(
    module: GridaCanvasWasmBindings,
    ptr: GridaCanvasWebGlApplicationPtr
  ) {
    this.module = module;
    this.ptr = ptr;
  }

  tick() {
    this.module._tick(this.ptr);
  }

  resize(width: number, height: number) {
    this.module._resize_surface(this.ptr, width, height);
  }

  redraw() {
    this.module._redraw(this.ptr);
  }

  execCommand(command: "ZoomIn" | "ZoomOut") {
    this.module._command(this.ptr, ApplicationCommandKey[command], 0, 0);
  }
}

import type { Transform2D, TransparencyGridOptions } from "./types";
import { TransparencyGrid_2D } from "./transparency-grid-2d";
import { TransparencyGrid_WGPU } from "./transparency-grid-wgpu";

/**
 * TransparencyGridCanvas is a wrapper that selects the best implementation
 * for rendering a transparency grid, using WebGPU if available, otherwise falling back to 2D Canvas.
 *
 * Usage:
 *   const grid = new TransparencyGridCanvas(canvas, options);
 *   grid.setSize(w, h);
 *   grid.updateTransform(transform);
 *   grid.draw();
 */
export class TransparencyGridCanvas {
  readonly backend: "2d" | "webgpu";
  private impl: TransparencyGrid_2D | TransparencyGrid_WGPU;

  constructor(
    canvas: HTMLCanvasElement,
    options: TransparencyGridOptions,
    backend?: "2d" | "webgpu"
  ) {
    switch (backend) {
      case "2d":
        this.impl = new TransparencyGrid_2D(canvas, options);
        this.backend = "2d";
        break;
      case "webgpu":
        this.impl = new TransparencyGrid_WGPU(canvas, options);
        this.backend = "webgpu";
        break;
      default:
        const supports_wgpu = !!(
          typeof navigator !== "undefined" && (navigator as any).gpu
        );
        this.backend = supports_wgpu ? "webgpu" : "2d";
        this.impl = supports_wgpu
          ? new TransparencyGrid_WGPU(canvas, options)
          : new TransparencyGrid_2D(canvas, options);
        break;
    }
  }

  setSize(width: number, height: number) {
    this.impl.setSize(width, height);
  }

  updateTransform(transform: Transform2D) {
    this.impl.updateTransform(transform);
  }

  draw() {
    return this.impl.draw();
  }
}

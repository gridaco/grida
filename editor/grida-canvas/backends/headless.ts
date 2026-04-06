/**
 * Headless backend providers for running the Editor in Node.js / Vitest
 * without any browser globals.
 */
import cmath from "@grida/cmath";
import type { editor } from "..";

/**
 * Viewport API that returns fixed dimensions.
 * No browser globals required.
 */
export class HeadlessViewportApi implements editor.api.IViewportApi {
  constructor(
    public width = 1920,
    public height = 1080
  ) {}

  get offset(): cmath.Vector2 {
    return [0, 0];
  }

  get rect() {
    return {
      left: 0,
      top: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height,
      x: 0,
      y: 0,
    };
  }

  get size() {
    return { width: this.width, height: this.height };
  }
}

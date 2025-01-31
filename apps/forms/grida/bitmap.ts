import type { cmath } from "@grida/cmath";
import type { grida } from ".";

/**
 * A helper class for manipulating bitmap data (Uint8ClampedArray).
 * - Use nearest-neighbor scaling for pixel-art style.
 * - All updates are done in memory.
 */
export class BitmapEditor {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  frame: number = 0; // frame counter

  constructor(
    width: number,
    height: number,
    data: Uint8ClampedArray,
    frame = 0
  ) {
    this.width = width;
    this.height = height;
    this.data = data;
    this.frame = frame;
  }

  pixel([x, y]: cmath.Vector2, paint: grida.program.cg.SolidPaint) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const idx = (y * this.width + x) * 4;
    const { r, g, b, a } = paint.color;
    const A = Math.round(a * 255);
    this.data[idx] = r;
    this.data[idx + 1] = g;
    this.data[idx + 2] = b;
    this.data[idx + 3] = A;
    this.frame++;
  }

  resize(newWidth: number, newHeight: number, shiftX = 0, shiftY = 0) {
    const newData = new Uint8ClampedArray(newWidth * newHeight * 4);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const oldIdx = (y * this.width + x) * 4;
        const ny = y + shiftY;
        const nx = x + shiftX;
        if (nx < 0 || ny < 0 || nx >= newWidth || ny >= newHeight) continue;
        const newIdx = (ny * newWidth + nx) * 4;
        newData[newIdx] = this.data[oldIdx];
        newData[newIdx + 1] = this.data[oldIdx + 1];
        newData[newIdx + 2] = this.data[oldIdx + 2];
        newData[newIdx + 3] = this.data[oldIdx + 3];
      }
    }
    this.width = newWidth;
    this.height = newHeight;
    this.data = newData;
    this.frame++;
  }

  scale(factor: number) {
    const scaledWidth = Math.max(1, Math.floor(this.width * factor));
    const scaledHeight = Math.max(1, Math.floor(this.height * factor));
    const newData = new Uint8ClampedArray(scaledWidth * scaledHeight * 4);
    for (let y = 0; y < scaledHeight; y++) {
      for (let x = 0; x < scaledWidth; x++) {
        const srcX = Math.floor(x / factor);
        const srcY = Math.floor(y / factor);
        const srcIdx = (srcY * this.width + srcX) * 4;
        const dstIdx = (y * scaledWidth + x) * 4;
        newData[dstIdx] = this.data[srcIdx];
        newData[dstIdx + 1] = this.data[srcIdx + 1];
        newData[dstIdx + 2] = this.data[srcIdx + 2];
        newData[dstIdx + 3] = this.data[srcIdx + 3];
      }
    }
    this.width = scaledWidth;
    this.height = scaledHeight;
    this.data = newData;
    this.frame++;
  }
}

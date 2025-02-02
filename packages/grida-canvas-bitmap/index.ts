import { cmath } from "@grida/cmath";

/**
 * A brush configuration for pixel-based painting operations.
 */
export type BitmapEditorBrush = {
  /**
   * Determines how the brush output is composited onto the canvas.
   * - `"source-over"`: Normal paint mode (paint on top).
   * - `"destination-out"`: Eraser mode (erase existing pixels).
   */
  blend: "source-over" | "destination-out";

  /**
   * The diameter of the brush in pixels.
   */
  size: number;
};

export class BitmapEditor {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  frame: number;
  color: cmath.Vector4;

  constructor(
    width: number,
    height: number,
    data: Uint8ClampedArray,
    frame = 0,
    color: cmath.Vector4 = [0, 0, 0, 255]
  ) {
    this.width = width;
    this.height = height;
    this.data = data;
    this.frame = frame;
    this.color = color;
  }

  /**
   * Applies a circular brush stroke at the specified position, using the given brush configuration.
   *
   * @param p - The center coordinate [x, y] where the brush is applied.
   * @param brush - The brush parameters (blend mode, size, etc.).
   *
   * Paints all pixels inside the brush circle:
   * - If `blend` is `"source-over"`, it applies the current color.
   * - If `blend` is `"destination-out"`, it erases by setting alpha = 0.
   */
  paint(p: cmath.Vector2, brush: BitmapEditorBrush) {
    const r = brush.size / 2;
    const fillPoints = cmath.raster.circle(p, r, {
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
    });

    for (const [x, y] of fillPoints) {
      const i = (y * this.width + x) * 4;
      if (brush.blend === "destination-out") {
        // erase
        this.data[i + 3] = 0;
      } else {
        // paint
        const [rr, gg, bb, aa] = this.color;
        this.data[i + 0] = rr;
        this.data[i + 1] = gg;
        this.data[i + 2] = bb;
        this.data[i + 3] = aa;
      }
    }

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

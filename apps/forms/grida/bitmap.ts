import type { cmath } from "@grida/cmath";

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
   * Paints using a brush config (blend mode + size).
   * For pixel-art, a large size can just fill a square or a circle region.
   */
  paint([cx, cy]: cmath.Vector2, brush: BitmapEditorBrush) {
    // Simple circle fill
    const radius = Math.floor(brush.size / 2);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        // Optional: check circular boundary (for a round brush)
        if (dx * dx + dy * dy > radius * radius) continue;

        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;

        const idx = (y * this.width + x) * 4;
        if (brush.blend === "destination-out") {
          // Eraser => set alpha=0
          this.data[idx + 3] = 0;
        } else {
          // Normal paint => overwrite
          const [r, g, b, a] = this.color;
          this.data[idx] = r;
          this.data[idx + 1] = g;
          this.data[idx + 2] = b;
          this.data[idx + 3] = a;
        }
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

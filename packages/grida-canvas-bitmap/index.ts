import { cmath } from "@grida/cmath";

// export interface CircleKernel {
//   type: "circle";
// }

// export interface RectangleKernel {
//   type: "rectangle";
// }

// export interface TextureKernel {
//   type: "texture";
// }

// export type StandardKernel = CircleKernel | RectangleKernel | TextureKernel;

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
   * The size of the brush in pixels.
   *
   * (width, height)
   */
  size: cmath.Vector2;

  // cx: number;

  // cy: number;

  /**
   * Hardness of the brush edge, from 0 (soft) to 1 (hard).
   */
  hardness: number;

  /**
   * The minimum distance (in %) between successive brush stamps.
   */
  spacing: number;

  texture?: cmath.raster.Bitmap;
};

export type BitmapEditorRuntimeBrush = BitmapEditorBrush & {
  /**
   * The opacity of the brush.
   *
   * 0 is fully transparent, 1 is fully opaque.
   */
  opacity: number;
  color: cmath.Vector4;
};

export class BitmapEditor {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  frame: number;

  private gesture: {
    position: cmath.Vector2 | null;
  } | null = null;

  private last_painted_pos: cmath.Vector2 | null = null;

  constructor(
    readonly id: string,
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
  /**
   * Blends a single pixel on the canvas using proper alpha compositing.
   *
   * For "source-over", it composites the source color (modulated by weight and opacity)
   * over the destination pixel using the standard alpha blend equation.
   *
   * For "destination-out" (eraser mode), instead of completely clearing the pixel,
   * it subtracts the eraser's effective opacity from the destination. This is done by
   * computing:
   *
   *   aSrc = weight * opacity
   *   outAlpha = dstAlpha * (1 - aSrc)
   *   outColor = dstColor * (1 - aSrc)
   *
   * This allows for partial erasing based on the eraser's opacity.
   *
   * @param i - The starting index in the canvas data array for the pixel (multiple of 4).
   * @param weight - The computed weight (0..1) for the brush stroke at this pixel.
   * @param blend - The blend mode, either "source-over" or "destination-out".
   * @param color - The brush color as a Vector4 ([r, g, b, a]).
   * @param opacity - The brush opacity, where 0 is fully transparent and 1 is fully opaque.
   */
  private blend_pixel(
    i: number,
    weight: number,
    blend: "source-over" | "destination-out",
    color: cmath.Vector4,
    opacity: number
  ) {
    if (blend === "destination-out") {
      // Eraser mode: perform partial erasing based on the effective eraser opacity.
      // Compute the effective eraser alpha (aSrc) from the brush weight and opacity.
      const aSrc = weight * opacity; // effective source alpha (0..1)

      // Get the destination pixel color and alpha.
      const dstR = this.data[i];
      const dstG = this.data[i + 1];
      const dstB = this.data[i + 2];
      const dstA = this.data[i + 3];
      const aDst = dstA / 255;

      // Compute the new alpha using the destination-out blend formula.
      const outA = aDst * (1 - aSrc);

      // Compute the new color channels by scaling the destination color.
      // This darkens the color proportionally to the amount erased.
      const outR = Math.round(dstR * (1 - aSrc));
      const outG = Math.round(dstG * (1 - aSrc));
      const outB = Math.round(dstB * (1 - aSrc));

      this.data[i] = outR;
      this.data[i + 1] = outG;
      this.data[i + 2] = outB;
      this.data[i + 3] = Math.round(outA * 255);
      return;
    } else if (blend === "source-over") {
      // Get the destination pixel color.
      const dstR = this.data[i];
      const dstG = this.data[i + 1];
      const dstB = this.data[i + 2];
      const dstA = this.data[i + 3];

      // The brush color modulated by weight and opacity.
      const [srcR, srcG, srcB, srcA] = color;
      const newSrcA = Math.round(srcA * weight * opacity);

      // Normalize alpha values to [0,1].
      const aSrc = newSrcA / 255;
      const aDst = dstA / 255;

      // Standard "source-over" alpha blending.
      const outA = aSrc + aDst * (1 - aSrc);
      if (outA > 0) {
        const outR = Math.round(
          (srcR * aSrc + dstR * aDst * (1 - aSrc)) / outA
        );
        const outG = Math.round(
          (srcG * aSrc + dstG * aDst * (1 - aSrc)) / outA
        );
        const outB = Math.round(
          (srcB * aSrc + dstB * aDst * (1 - aSrc)) / outA
        );
        const outAByte = Math.round(outA * 255);
        this.data[i] = outR;
        this.data[i + 1] = outG;
        this.data[i + 2] = outB;
        this.data[i + 3] = outAByte;
      } else {
        // If fully transparent, set pixel to transparent black.
        this.data[i] = 0;
        this.data[i + 1] = 0;
        this.data[i + 2] = 0;
        this.data[i + 3] = 0;
      }
    }
  }

  /**
   * Applies a brush stroke on the canvas at the given position.
   *
   * The brush is defined by its size, blend mode, hardness, and an optional texture.
   * If no texture is provided, an elliptical region is used (via cmath.raster.ellipse).
   * If a texture is provided, the brush stroke covers the full rectangular area defined
   * by the brush size (without being clipped to an ellipse) and the texture is scaled
   * to match this area.
   *
   * Additionally, the `spacing` property is used to ensure that successive brush stamps
   * are only applied if the pointer has moved sufficiently.
   *
   * @param p - The center coordinate [x, y] of the brush stroke.
   * @param brush - The brush parameters.
   */
  private paint(p: cmath.Vector2, brush: BitmapEditorRuntimeBrush) {
    const brushWidth = brush.size[0];
    const brushHeight = brush.size[1];
    const halfW = brushWidth / 2;
    const halfH = brushHeight / 2;

    // If a texture is provided, scale it to match the brush area.
    let processedTexture: cmath.raster.Bitmap | undefined;
    if (brush.texture) {
      const factorX = brushWidth / brush.texture.width;
      const factorY = brushHeight / brush.texture.height;
      processedTexture = cmath.raster.scale(brush.texture, [factorX, factorY]);
    }

    // Determine whether to use elliptical or rectangular fill:
    if (processedTexture) {
      // Use a rectangular region covering the full brush area.
      // Define the bounds of the brush area.
      const left = Math.floor(p[0] - halfW);
      const right = Math.floor(p[0] + halfW);
      const top = Math.floor(p[1] - halfH);
      const bottom = Math.floor(p[1] + halfH);

      // Iterate over each pixel in the rectangular brush area.
      for (let y = top; y < bottom; y++) {
        // Skip rows outside the canvas.
        if (y < 0 || y >= this.height) continue;
        for (let x = left; x < right; x++) {
          // Skip columns outside the canvas.
          if (x < 0 || x >= this.width) continue;

          // Compute normalized distance using the maximum ratio for a rectangle.
          const dx = x - p[0];
          const dy = y - p[1];
          const normDist = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);

          // Compute the base weight using a Gaussian falloff, unless the brush is fully hard.
          let baseWeight: number;
          if (brush.hardness < 1) {
            baseWeight = cmath.raster.gaussian(normDist, brush.hardness);
          } else {
            baseWeight = 1;
          }
          let weight = baseWeight;

          // Sample the processed texture to modulate the weight.
          // Compute relative coordinates within the brush area.
          const relX = x - (p[0] - halfW);
          const relY = y - (p[1] - halfH);
          const texX = Math.floor(relX);
          const texY = Math.floor(relY);
          if (
            texX >= 0 &&
            texX < processedTexture.width &&
            texY >= 0 &&
            texY < processedTexture.height
          ) {
            const texIdx = (texY * processedTexture.width + texX) * 4;
            const texAlpha = processedTexture.data[texIdx + 3];
            weight = baseWeight * (texAlpha / 255);
          }

          const idx = (y * this.width + x) * 4;
          this.blend_pixel(
            idx,
            weight,
            brush.blend,
            brush.color,
            brush.opacity
          );
        }
      }
    } else {
      // No texture provided: use elliptical fill.
      const fills = cmath.raster.ellipse(p, [halfW, halfH]);
      for (const [x, y] of fills) {
        const dx = x - p[0];
        const dy = y - p[1];
        const normDist = Math.sqrt((dx / halfW) ** 2 + (dy / halfH) ** 2);

        let baseWeight: number;
        if (brush.hardness < 1) {
          baseWeight = cmath.raster.gaussian(normDist, brush.hardness);
        } else {
          baseWeight = 1;
        }
        const weight = baseWeight;
        const idx = (y * this.width + x) * 4;
        this.blend_pixel(idx, weight, brush.blend, brush.color, brush.opacity);
      }
    }
    this.last_painted_pos = p;
    this.frame++;
  }

  public brush(p: cmath.Vector2, brush: BitmapEditorRuntimeBrush) {
    if (!this.gesture) return;

    const last_gesture_pos = this.gesture.position;
    this.gesture.position = p;

    const last_painted_pos = this.last_painted_pos;
    let paint_start_pos = last_painted_pos;

    // Enforce spacing: if a last point exists and the distance is less than spacing, skip painting.
    if (brush.spacing) {
      if (last_painted_pos) {
        const d = cmath.vector2.distance(last_painted_pos, p);
        if (d < brush.spacing) {
          return; // Ignore this paint step.
        } else {
          paint_start_pos = null;
        }
      }
    }

    if (!paint_start_pos) {
      this.paint(p, brush);
    } else {
      const pixels = cmath.raster.bresenham(paint_start_pos, p);
      for (const p of pixels) {
        this.paint(p, brush);
      }
    }
  }

  public close(): void {
    this.gesture = null;
  }

  public open(): void {
    if (!this.gesture) this.gesture = { position: null };
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

  /**
   * Retrieves all distinct colors present in the canvas.
   *
   * Iterates over the pixel data (this.data) and extracts unique RGBA values,
   * returning an array of colors. Each color is represented as a Vector4 ([r, g, b, a]).
   *
   * @returns An array of unique colors.
   *
   * @example
   * const uniqueColors = editor.getColors();
   * console.log(uniqueColors); // e.g., [ [0, 0, 0, 255], [255, 255, 255, 255], ... ]
   */
  public getColors(): cmath.Vector4[] {
    const colors: cmath.Vector4[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < this.data.length; i += 4) {
      const r = this.data[i];
      const g = this.data[i + 1];
      const b = this.data[i + 2];
      const a = this.data[i + 3];
      const key = `${r},${g},${b},${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        colors.push([r, g, b, a]);
      }
    }

    return colors;
  }
}

/**
 * Dynamically creates a spray texture.
 *
 * The texture is generated as an ImageData-like object (width, height, and a flat RGBA array)
 * with randomly placed opaque dots. The density parameter controls the probability (per pixel)
 * that a dot is drawn.
 *
 * @param width - The width of the texture in pixels.
 * @param height - The height of the texture in pixels.
 * @param density - A number between 0 and 1 indicating the probability of a pixel being a dot.
 *                  Default is 0.1 (10% chance).
 * @returns A Texture object containing the generated spray pattern.
 *
 * @example
 * const texture = createSprayTexture(128, 128, 0.15);
 * // Use `texture` as the spray brush texture.
 */
export function createSprayBrushTexture(
  width: number,
  height: number,
  density: number = 0.1
): cmath.raster.Bitmap {
  const data = new Uint8ClampedArray(width * height * 4);

  // For each pixel, decide randomly if it should be an opaque dot.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (Math.random() < density) {
        // Draw a black dot (fully opaque)
        data[idx] = 0; // R
        data[idx + 1] = 0; // G
        data[idx + 2] = 0; // B
        data[idx + 3] = 255; // A
      } else {
        // Transparent pixel
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }

  return { width, height, data };
}

/**
 * Dynamically creates a grain brush texture that is more center-intensive and uses
 * non-fully opaque (gradient) dots to produce a smoother, more natural texture.
 *
 * For each pixel, a pseudo-random noise value is computed using the deterministic
 * `cmath.raster.noise` function. In addition, the probability for a pixel to receive
 * a dot is modulated by its distance from the center of the texture. Pixels near the center
 * (where the normalized distance is 0) use the full base threshold, while pixels toward the edge
 * (normalized distance near 1) have an effective threshold near 0.
 *
 * Instead of using a binary threshold to decide between full opacity (255) and transparency,
 * this implementation computes a gradient alpha value based on how far below the effective threshold
 * the noise value falls. Specifically, if the noise value `n` is below the effective threshold,
 * the alpha is set to:
 *
 *   alpha = 255 * (1 - (n / effectiveThreshold))
 *
 * This produces a smoother variation in opacity, generating a more visually appealing grain pattern.
 *
 * @param width - The width of the texture in pixels.
 * @param height - The height of the texture in pixels.
 * @param threshold - A base number between 0 and 1 indicating the probability for a dot at the center.
 *                    Lower threshold values result in fewer dots. Default is 0.1.
 * @returns A Bitmap object containing the generated grain pattern.
 *
 * @example
 * const grainTexture = createGrainBrushTexture(128, 128, 0.15);
 * // Use `grainTexture` as the grain brush texture in your painting application.
 */
export function createGrainBrushTexture(
  width: number,
  height: number,
  threshold: number = 0.1
): cmath.raster.Bitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  const centerX = width / 2;
  const centerY = height / 2;
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Compute normalized distance from the texture center.
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normDist = dist / maxDistance;

      // Calculate effective threshold so that the brush is more densely dotted at the center.
      const effectiveThreshold = threshold * Math.pow(1 - normDist, 2);

      // Compute a deterministic noise value in the range [0, 1].
      const n = cmath.raster.noise(x, y);

      if (n < effectiveThreshold && effectiveThreshold > 0) {
        // Instead of drawing a fully opaque dot, compute a gradient alpha value.
        const intensity = 1 - n / effectiveThreshold;
        const alpha = Math.round(255 * intensity);
        data[idx] = 0; // Red
        data[idx + 1] = 0; // Green
        data[idx + 2] = 0; // Blue
        data[idx + 3] = alpha; // Alpha (gradient based on noise)
      } else {
        // Transparent pixel.
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }

  return { width, height, data };
}

export function createSquarePixelBrushTexture(
  size: number
): cmath.raster.Bitmap {
  const totalPixels = size * size;
  const data = new Uint8ClampedArray(totalPixels * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0; // R
    data[i + 1] = 0; // G
    data[i + 2] = 0; // B
    data[i + 3] = 255; // A (fully opaque)
  }
  return { width: size, height: size, data };
}

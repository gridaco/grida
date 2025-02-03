import { cmath } from "@grida/cmath";

/**
 * Represents an elliptical brush kernel.
 *
 * This kernel defines the brush's influence area as an ellipse.
 * A circle is treated as a special case of an ellipse, so using an ellipse for round brushes
 * offers better compatibility without significant overhead.
 */
export interface EllipseKernel {
  type: "ellipse";
}

/**
 * Represents a rectangular brush kernel.
 *
 * This kernel defines the brush's influence area as a rectangle.
 * It is typically used for brushes with a square or rectangular tip.
 */
export interface RectangleKernel {
  type: "rectangle";
}

/**
 * Represents a texture-based brush kernel.
 *
 * This kernel uses a bitmap texture to define the shape and alpha mask of the brush tip.
 * The provided texture (a Bitmap) determines the spatial influence of the brush.
 */
export interface TextureKernel {
  type: "texture";
  texture: cmath.raster.Bitmap;
}

/**
 * A union type that represents any brush kernel.
 *
 * A brush kernel defines the spatial influence of a brush tip.
 * It can be one of the following:
 * - An elliptical kernel (EllipseKernel) for round brushes.
 * - A rectangular kernel (RectangleKernel) for square or rectangular brushes.
 * - A texture-based kernel (TextureKernel) that uses a bitmap to shape the brush.
 */
export type Kernel = EllipseKernel | RectangleKernel | TextureKernel;

interface IBitmapEditorBrush {
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

  /**
   * An optional bitmap texture for the brush.
   *
   * When provided, this texture (a Bitmap) defines the appearance of the brush tip,
   * allowing for textured or spray brush effects. The texture is typically scaled to
   * match the brush’s dimensions when painting.
   */
  texture?: cmath.raster.Bitmap;

  /**
   * An optional kernel that defines the spatial influence of the brush tip.
   *
   * The kernel determines the shape of the area affected by the brush. It can be one of:
   * - **EllipseKernel**: An elliptical influence area, ideal for round brushes (with a circle as a special case).
   * - **RectangleKernel**: A rectangular influence area, suitable for square or rectangular brushes.
   * - **TextureKernel**: Uses a bitmap texture to define both the shape and alpha mask of the brush tip.
   *
   * In our model, the term "kernel" represents the underlying shape that governs how the brush applies its effect across pixels.
   */
  kernel?: Kernel;
}

export type BitmapEditorBrush = IBitmapEditorBrush;

export type BitmapEditorRuntimeBrush = BitmapEditorBrush & {
  /**
   * The opacity of the brush.
   *
   * 0 is fully transparent, 1 is fully opaque.
   */
  opacity: number;
  color: cmath.Vector4;
};

/**
 * [BitmapLayerEditor] is a class that provides a simple API for editing a bitmap layer.
 *
 * It manages the pixel painting, width, height resizing and the position translation of the layer as pixel out-paints.
 */
export class BitmapLayerEditor {
  private _rect: cmath.Rectangle;
  get rect() {
    return this._rect;
  }

  private _data: Uint8ClampedArray;
  get data() {
    return this._data;
  }

  get width() {
    return this._rect.width;
  }

  get height() {
    return this._rect.height;
  }

  /**
   * the current version of the data. (data checksum)
   */
  private _frame: number;
  get frame() {
    return this._frame;
  }

  private gesture: {
    position: cmath.Vector2 | null;
  } | null = null;

  private last_painted_pos: cmath.Vector2 | null = null;

  constructor(
    readonly id: string,
    rect: cmath.Rectangle,
    data: Uint8ClampedArray,
    frame = 0
  ) {
    this._rect = rect;
    this._data = data;
    this._frame = frame;
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
      const dstR = this._data[i];
      const dstG = this._data[i + 1];
      const dstB = this._data[i + 2];
      const dstA = this._data[i + 3];
      const aDst = dstA / 255;

      // Compute the new alpha using the destination-out blend formula.
      const outA = aDst * (1 - aSrc);

      // Compute the new color channels by scaling the destination color.
      // This darkens the color proportionally to the amount erased.
      const outR = Math.round(dstR * (1 - aSrc));
      const outG = Math.round(dstG * (1 - aSrc));
      const outB = Math.round(dstB * (1 - aSrc));

      this._data[i] = outR;
      this._data[i + 1] = outG;
      this._data[i + 2] = outB;
      this._data[i + 3] = Math.round(outA * 255);
      return;
    } else if (blend === "source-over") {
      // Get the destination pixel color.
      const dstR = this._data[i];
      const dstG = this._data[i + 1];
      const dstB = this._data[i + 2];
      const dstA = this._data[i + 3];

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
        this._data[i] = outR;
        this._data[i + 1] = outG;
        this._data[i + 2] = outB;
        this._data[i + 3] = outAByte;
      } else {
        // If fully transparent, set pixel to transparent black.
        this._data[i] = 0;
        this._data[i + 1] = 0;
        this._data[i + 2] = 0;
        this._data[i + 3] = 0;
      }
    }
  }

  /**
   * Applies a brush stamp on the canvas at the given position.
   *
   * The brush is defined by its size, blend mode, hardness, and optionally by a kernel or texture.
   * When a texture is provided, the brush stroke covers the full rectangular area defined
   * by the brush size and the texture is scaled to match this area.
   *
   * Additionally, if a TextureKernel is provided (via the `kernel` property with type "texture"),
   * its bitmap is used as a mask to modulate the stroke, effectively masking the main texture (or
   * a filled rectangle) with that kernel.
   *
   * When neither a main texture nor a texture kernel is provided, the brush’s shape is determined
   * by the kernel property (if provided) or defaults to an elliptical region.
   *
   * @param p - The center coordinate [x, y] of the brush stamp.
   * @param brush - The runtime brush parameters.
   */
  private paint(p: cmath.Vector2, brush: BitmapEditorRuntimeBrush): void {
    const brushWidth = brush.size[0];
    const brushHeight = brush.size[1];
    const halfW = brushWidth / 2;
    const halfH = brushHeight / 2;

    // Scale the main texture (if provided) to match the brush area.
    let processedTexture: cmath.raster.Bitmap | undefined;
    if (brush.texture) {
      const factorX = brushWidth / brush.texture.width;
      const factorY = brushHeight / brush.texture.height;
      processedTexture = cmath.raster.scale(brush.texture, [factorX, factorY]);
    }

    // If a texture kernel is provided, scale its texture to match the brush area.
    let kernelTextureMask: cmath.raster.Bitmap | undefined;
    if (brush.kernel && brush.kernel.type === "texture") {
      const kernelTex = brush.kernel.texture;
      const factorX = brushWidth / kernelTex.width;
      const factorY = brushHeight / kernelTex.height;
      kernelTextureMask = cmath.raster.scale(kernelTex, [factorX, factorY]);
    }

    // If either a main texture or a kernel texture mask is provided, use rectangular fill.
    if (processedTexture || kernelTextureMask) {
      const left = Math.floor(p[0] - halfW);
      const right = Math.floor(p[0] + halfW);
      const top = Math.floor(p[1] - halfH);
      const bottom = Math.floor(p[1] + halfH);

      for (let y = top; y < bottom; y++) {
        if (y < 0 || y >= this.height) continue;
        for (let x = left; x < right; x++) {
          if (x < 0 || x >= this.width) continue;

          // For rectangular fill, use the maximum ratio to compute normalized distance.
          const dx = x - p[0];
          const dy = y - p[1];
          const normDist = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);

          // Compute the base weight using a Gaussian falloff, unless the brush is fully hard.
          const baseWeight =
            brush.hardness < 1
              ? cmath.raster.gaussian(normDist, brush.hardness)
              : 1;
          let weight = baseWeight;

          // If a main texture is available, sample its alpha channel.
          if (processedTexture) {
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
              weight *= texAlpha / 255;
            }
          }

          // If a kernel texture mask is available, sample its alpha channel.
          if (kernelTextureMask) {
            const relX = x - (p[0] - halfW);
            const relY = y - (p[1] - halfH);
            const maskX = Math.floor(relX);
            const maskY = Math.floor(relY);
            if (
              maskX >= 0 &&
              maskX < kernelTextureMask.width &&
              maskY >= 0 &&
              maskY < kernelTextureMask.height
            ) {
              const maskIdx = (maskY * kernelTextureMask.width + maskX) * 4;
              const maskAlpha = kernelTextureMask.data[maskIdx + 3];
              weight *= maskAlpha / 255;
            }
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
      // No main texture or texture kernel provided: use the kernel shape if available, otherwise default to ellipse.
      let fills: [number, number][];
      if (brush.kernel) {
        switch (brush.kernel.type) {
          case "ellipse":
            fills = cmath.raster.ellipse(p, [halfW, halfH]);
            break;
          case "rectangle":
            const rect = {
              x: p[0] - halfW,
              y: p[1] - halfH,
              width: brushWidth,
              height: brushHeight,
            };
            fills = cmath.raster.rectangle(rect);
            break;
          // For any unrecognized kernel type, fallback to elliptical region.
          default:
            fills = cmath.raster.ellipse(p, [halfW, halfH]);
            break;
        }
      } else {
        // Default fallback: use an elliptical region.
        fills = cmath.raster.ellipse(p, [halfW, halfH]);
      }
      for (const [x, y] of fills) {
        const dx = x - p[0];
        const dy = y - p[1];
        const normDist = Math.sqrt((dx / halfW) ** 2 + (dy / halfH) ** 2);
        const baseWeight =
          brush.hardness < 1
            ? cmath.raster.gaussian(normDist, brush.hardness)
            : 1;
        const idx = (y * this.width + x) * 4;
        this.blend_pixel(
          idx,
          baseWeight,
          brush.blend,
          brush.color,
          brush.opacity
        );
      }
    }
    this.last_painted_pos = p;
    this._frame++;
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
        newData[newIdx] = this._data[oldIdx];
        newData[newIdx + 1] = this._data[oldIdx + 1];
        newData[newIdx + 2] = this._data[oldIdx + 2];
        newData[newIdx + 3] = this._data[oldIdx + 3];
      }
    }
    this.rect.width = newWidth;
    this.rect.height = newHeight;
    this._data = newData;
    this._frame++;
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
        newData[dstIdx] = this._data[srcIdx];
        newData[dstIdx + 1] = this._data[srcIdx + 1];
        newData[dstIdx + 2] = this._data[srcIdx + 2];
        newData[dstIdx + 3] = this._data[srcIdx + 3];
      }
    }
    this.rect.width = scaledWidth;
    this.rect.height = scaledHeight;
    this._data = newData;
    this._frame++;
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
   * const uniqueColors = editor.colors;
   * console.log(uniqueColors); // e.g., [ [0, 0, 0, 255], [255, 255, 255, 255], ... ]
   */
  public get colors(): cmath.Vector4[] {
    const colors: cmath.Vector4[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < this._data.length; i += 4) {
      const r = this._data[i];
      const g = this._data[i + 1];
      const b = this._data[i + 2];
      const a = this._data[i + 3];
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

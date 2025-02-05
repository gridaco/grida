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

/**
 * Determines how the brush output is composited onto the canvas.
 * - `"source-over"`: Normal paint mode (paint on top).
 * - `"destination-out"`: Eraser mode (erase existing pixels).
 */
type BlendMode = "source-over" | "destination-out";

interface IBitmapEditorBrush {
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

export type BitmapEditorBrush = IBitmapEditorBrush & {
  name: string;
};

export type BitmapEditorRuntimeBrush = IBitmapEditorBrush & {
  /**
   * The opacity of the brush.
   *
   * 0 is fully transparent, 1 is fully opaque.
   */
  opacity: number;
  color: cmath.Vector4;
};

/**
 * Represents the mode for handling overflow when painting on a layer.
 *
 * - `"clip"`: Any pixels that fall outside the current layer bounds are ignored (clipped).
 * - `"auto"`: The layer's bounding rectangle is automatically resized and repositioned
 *   to include all painted pixels, ensuring that no new paints are lost due to clipping.
 *
 * This type is used as a configuration option to control how the layer behaves when a paint
 * operation extends beyond its current boundaries.
 */
type OverflowMode = "clip" | "auto";

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

  get x() {
    return this._rect.x;
  }

  get y() {
    return this._rect.y;
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
  private paint(
    p: cmath.Vector2,
    brush: BitmapEditorRuntimeBrush,
    blend: BlendMode
  ): void {
    const brushWidth = brush.size[0];
    const brushHeight = brush.size[1];
    const halfW = brushWidth / 2;
    const halfH = brushHeight / 2;

    // Process texture(s) if provided.
    let processedTexture: cmath.raster.Bitmap | undefined;
    if (brush.texture) {
      const factorX = brushWidth / brush.texture.width;
      const factorY = brushHeight / brush.texture.height;
      processedTexture = cmath.raster.scale(brush.texture, [factorX, factorY]);
    }

    let kernelTextureMask: cmath.raster.Bitmap | undefined;
    if (brush.kernel && brush.kernel.type === "texture") {
      const kernelTex = brush.kernel.texture;
      const factorX = brushWidth / kernelTex.width;
      const factorY = brushHeight / kernelTex.height;
      kernelTextureMask = cmath.raster.scale(kernelTex, [factorX, factorY]);
    }

    if (processedTexture || kernelTextureMask) {
      const left = Math.floor(p[0] - halfW);
      const right = Math.floor(p[0] + halfW);
      const top = Math.floor(p[1] - halfH);
      const bottom = Math.floor(p[1] + halfH);

      for (let y = top; y < bottom; y++) {
        if (y < 0 || y >= this.height) continue;
        for (let x = left; x < right; x++) {
          if (x < 0 || x >= this.width) continue;

          const dx = x - p[0];
          const dy = y - p[1];
          const normDist = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
          let weight =
            brush.hardness < 1
              ? cmath.raster.gaussian(normDist, brush.hardness)
              : 1;

          const relX = x - left;
          const relY = y - top;

          if (processedTexture) {
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

          if (kernelTextureMask) {
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
          this.blend_pixel(idx, weight, blend, brush.color, brush.opacity);
        }
      }
    } else {
      // Determine the brush fill points.
      let fills: [number, number][];
      if (brush.kernel) {
        switch (brush.kernel.type) {
          case "ellipse":
            fills = cmath.raster.ellipse(p, [halfW, halfH]);
            break;
          case "rectangle":
            fills = cmath.raster.rectangle({
              x: p[0] - halfW,
              y: p[1] - halfH,
              width: brushWidth,
              height: brushHeight,
            });
            break;
          default:
            fills = cmath.raster.ellipse(p, [halfW, halfH]);
            break;
        }
      } else {
        fills = cmath.raster.ellipse(p, [halfW, halfH]);
      }

      for (const [x, y] of fills) {
        // Double-check that the point is within current viewbox.
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
        const dx = x - p[0];
        const dy = y - p[1];
        const normDist = Math.sqrt((dx / halfW) ** 2 + (dy / halfH) ** 2);
        const baseWeight =
          brush.hardness < 1
            ? cmath.raster.gaussian(normDist, brush.hardness)
            : 1;
        const idx = (y * this.width + x) * 4;
        this.blend_pixel(idx, baseWeight, blend, brush.color, brush.opacity);
      }
    }
    this.last_painted_pos = p;
    this._frame++;
  }

  /**
   * Updated brush method: pads the layer to include the next stamp's bounding box
   * before painting, ensuring overflow paints are accurately rendered.
   */
  public brush(
    p: cmath.Vector2, // p is now an absolute coordinate.
    brush: BitmapEditorRuntimeBrush,
    blend: BlendMode,
    overflow: "clip" | "auto"
  ): void {
    if (!this.gesture) return;
    // p is absolute.
    this.gesture.position = p;

    // Use p as absolute for expansion.
    if (overflow === "auto") {
      const bbox = stampbbox(p, brush); // bbox is in absolute coordinates.
      this.expand_to_fit(bbox);
    }

    // Convert p from absolute to layer-local coordinates:
    const localP: cmath.Vector2 = [p[0] - this._rect.x, p[1] - this._rect.y];

    // If there's no previously painted point, paint immediately.
    if (!this.last_painted_pos) {
      this.paint(localP, brush, blend);
      this.last_painted_pos = p; // Store the absolute point.
      return;
    }

    // Compute the Bresenham path in absolute coordinates.
    const points = cmath.raster.bresenham(
      cmath.vector2.quantize(this.last_painted_pos, 1),
      cmath.vector2.quantize(p, 1)
    );
    let lastPainted = this.last_painted_pos;

    // Calculate an effective brush size (using the larger of width or height)
    const effectiveBrushSize = Math.max(brush.size[0], brush.size[1]);
    // Compute the required center-to-center distance (spacing is now a percentage, e.g. 1.0 = 100%)
    const requiredDistance = brush.spacing * effectiveBrushSize;

    for (const pt of points) {
      // Only paint if the distance from the last painted point is at least the requiredDistance.
      if (
        brush.spacing &&
        cmath.vector2.distance(lastPainted, pt) < requiredDistance
      )
        continue;

      if (overflow === "auto") {
        const bbox = stampbbox(pt, brush);
        this.expand_to_fit(bbox);
      }
      // Convert each point from absolute to local coordinates.
      const localPt: cmath.Vector2 = [
        pt[0] - this._rect.x,
        pt[1] - this._rect.y,
      ];
      this.paint(localPt, brush, blend);
      lastPainted = pt;
    }

    // Store the absolute point for continuity.
    this.last_painted_pos = p;
  }

  /**
   * Pads the layer if the given bounding box is outside the current layer.
   */
  private expand_to_fit(bbox: cmath.Rectangle): void {
    if (!cmath.rect.contains(bbox, this._rect)) {
      const newRect = cmath.rect.union([this._rect, bbox]);
      this.expand(newRect);
    }
  }

  /**
   * Expands the layer to the new rectangle, preserving current pixel data.
   */
  private expand(newRect: cmath.Rectangle): void {
    const newWidth = newRect.width;
    const newHeight = newRect.height;
    const newData = new Uint8ClampedArray(newWidth * newHeight * 4);
    const offsetX = this._rect.x - newRect.x;
    const offsetY = this._rect.y - newRect.y;
    for (let y = 0; y < this._rect.height; y++) {
      for (let x = 0; x < this._rect.width; x++) {
        const oldIdx = (y * this._rect.width + x) * 4;
        const newX = x + offsetX;
        const newY = y + offsetY;
        const newIdx = (newY * newWidth + newX) * 4;
        newData[newIdx] = this._data[oldIdx];
        newData[newIdx + 1] = this._data[oldIdx + 1];
        newData[newIdx + 2] = this._data[oldIdx + 2];
        newData[newIdx + 3] = this._data[oldIdx + 3];
      }
    }
    this._rect = newRect;
    this._data = newData;
    this._frame++;
  }

  public close(): void {
    this.gesture = null;
    this.last_painted_pos = null;
  }

  public open(): void {
    if (!this.gesture) this.gesture = { position: null };
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
 * Computes the bounding box for a brush stamp at point `p`.
 */
function stampbbox(
  p: cmath.Vector2,
  brush: BitmapEditorRuntimeBrush
): cmath.Rectangle {
  const halfW = brush.size[0] / 2;
  const halfH = brush.size[1] / 2;
  return {
    x: Math.floor(p[0] - halfW),
    y: Math.floor(p[1] - halfH),
    width: brush.size[0],
    height: brush.size[1],
  };
}

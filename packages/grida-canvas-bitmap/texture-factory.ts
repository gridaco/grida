import { cmath } from "@grida/cmath";
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

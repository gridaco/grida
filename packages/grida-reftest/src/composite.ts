import type { BgColor } from "./types.js";

/**
 * Alpha-composite an RGBA pixel buffer over a solid background, producing an
 * opaque RGBA buffer (alpha set to 255 everywhere).
 *
 * Mirrors the Rust implementation in
 * `crates/grida-dev/src/reftest/compare.rs::composite_to_opaque`:
 *
 *   out_rgb = rgb * a + bg * (1 - a); out_a = 255
 *
 * where `a` is normalized to [0, 1]. The math uses the same half-away-from-zero
 * round + [0, 255] clamp as the Rust path.
 */
export function compositeRgbaOverBg(
  rgba: Uint8Array | Buffer,
  width: number,
  height: number,
  bg: BgColor
): Buffer {
  const out = Buffer.allocUnsafe(width * height * 4);
  const [bgR, bgG, bgB] = bg === "white" ? [255, 255, 255] : [0, 0, 0];

  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const a = rgba[i + 3]! / 255;
    const inv = 1 - a;

    // Matches Rust: round, then clamp to [0, 255].
    out[i] = clampU8(Math.round(r * a + bgR * inv));
    out[i + 1] = clampU8(Math.round(g * a + bgG * inv));
    out[i + 2] = clampU8(Math.round(b * a + bgB * inv));
    out[i + 3] = 255;
  }

  return out;
}

function clampU8(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

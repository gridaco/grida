// ---------------------------------------------------------------------------
// HUDPaint resolver — the bridge between the closed-taxonomy paint vocabulary
// (`HUDPaint`) and Canvas 2D's `fillStyle` / `strokeStyle`.
//
// - Solid resolves to a CSS color string.
// - Stripes builds an offscreen tile (cached) and resolves to a
//   `CanvasPattern` via `ctx.createPattern(tile, "repeat")`. The pattern's
//   `setTransform` counters the canvas's current CTM so the stripe spacing
//   stays in device pixels regardless of viewport zoom — chrome behavior,
//   not document behavior.
//
// Tile geometry (`computeStripesTileGeometry`) is split out as a pure
// function so the math is testable under a Node environment without
// `OffscreenCanvas` or `DOMMatrix`. The rasterizer (`buildStripesTile`) is
// the thin shell that paints the geometry into a real `OffscreenCanvas`.
//
// Anti-goal: this resolver does not own state machine logic, color theming
// resolution, or zoom-tracking. Hosts pass a fully-resolved `HUDPaint`
// (with concrete CSS color); HUD draws what was passed.
// ---------------------------------------------------------------------------

import type { HUDPaint, HUDPaintStripes } from "./types";

export const DEFAULT_STRIPES_ANGLE_DEG = 45;
export const DEFAULT_STRIPES_SPACING_PX = 8;
export const DEFAULT_STRIPES_THICKNESS_PX = 1.5;

const TILE_CACHE_MAX_ENTRIES = 32;

/**
 * Result of `resolvePaint`. The caller assigns `style` to
 * `ctx.fillStyle` / `ctx.strokeStyle` and uses `opacity` as `globalAlpha`
 * for the operation (caller is responsible for save/restore).
 */
export interface ResolvedPaint {
  style: string | CanvasPattern;
  opacity: number;
}

/**
 * Pure geometry for a stripes tile. Computes the cross-stripe period
 * (tile height) and the per-stripe parameters in device pixels.
 * Separated from the rasterizer so the math is testable in Node.
 *
 * The tile is `1 × size`: one horizontal stripe period, axis-aligned.
 * Rotation is applied at draw time via `CanvasPattern.setTransform`,
 * NOT baked into the rasterized tile — baking rotation would force the
 * tile's axis-aligned period to `spacing / sin(angle)`, irrational for
 * the canonical 45° case, and produce visible breaks within each
 * rendered stripe (the previous behavior).
 *
 * To keep stripes screen-aligned regardless of viewport zoom, the tile
 * is built in *device pixels* and the consumer composes a counter-CTM
 * with the rotation in `setTransform`.
 */
export function computeStripesTileGeometry(
  paint: HUDPaintStripes,
  dpr: number
): {
  /**
   * Tile height in device pixels — one cross-stripe period. The tile's
   * width is fixed at 1 (the stripe is constant along the stripe
   * direction; horizontal width doesn't carry information).
   */
  size: number;
  spacingPx: number;
  thicknessPx: number;
  angleRad: number;
} {
  // Guard non-positive / non-finite inputs. Fall back to the documented
  // defaults rather than silently producing an empty pattern, so a
  // misconfigured paint still renders something.
  const spacingRaw = paint.spacing ?? DEFAULT_STRIPES_SPACING_PX;
  const thicknessRaw = paint.thickness ?? DEFAULT_STRIPES_THICKNESS_PX;
  const spacing =
    Number.isFinite(spacingRaw) && spacingRaw > 0
      ? spacingRaw
      : DEFAULT_STRIPES_SPACING_PX;
  const thickness =
    Number.isFinite(thicknessRaw) && thicknessRaw > 0
      ? thicknessRaw
      : DEFAULT_STRIPES_THICKNESS_PX;
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const angleDeg = paint.angle ?? DEFAULT_STRIPES_ANGLE_DEG;

  const spacingPx = spacing * safeDpr;
  const thicknessPx = thickness * safeDpr;
  const angleRad = (angleDeg * Math.PI) / 180;

  // Tile height = one cross-stripe period in device pixels, rounded to
  // the nearest integer (OffscreenCanvas requires integer dimensions).
  // For typical configs (integer spacing, dpr ∈ {1, 2, 3}) `spacingPx`
  // is already integer.
  const size = Math.max(1, Math.round(spacingPx));

  return { size, spacingPx, thicknessPx, angleRad };
}

interface StripesTileCacheEntry {
  key: string;
  tile: OffscreenCanvas;
}

const tileCache: StripesTileCacheEntry[] = [];

function stripesTileCacheKey(paint: HUDPaintStripes, dpr: number): string {
  const angle = paint.angle ?? DEFAULT_STRIPES_ANGLE_DEG;
  const spacing = paint.spacing ?? DEFAULT_STRIPES_SPACING_PX;
  const thickness = paint.thickness ?? DEFAULT_STRIPES_THICKNESS_PX;
  return `${paint.color}|${angle}|${spacing}|${thickness}|${dpr}`;
}

/**
 * Get-or-build a cached stripes tile. Cache is module-level LRU keyed
 * by `(color, angle, spacing, thickness, dpr)` — opacity is NOT part of
 * the key because it's applied via `globalAlpha` at draw time, not baked
 * into the tile.
 *
 * @internal
 */
function getOrBuildStripesTile(
  paint: HUDPaintStripes,
  dpr: number
): OffscreenCanvas {
  const key = stripesTileCacheKey(paint, dpr);
  const hit = tileCache.findIndex((e) => e.key === key);
  if (hit >= 0) {
    // LRU: move to the end
    const [entry] = tileCache.splice(hit, 1);
    tileCache.push(entry);
    return entry.tile;
  }
  const tile = buildStripesTile(paint, dpr);
  tileCache.push({ key, tile });
  if (tileCache.length > TILE_CACHE_MAX_ENTRIES) {
    tileCache.shift();
  }
  return tile;
}

/**
 * Rasterize an unrotated, axis-aligned stripes tile (device pixels).
 * The tile is `1 × size` — one horizontal stripe band wrapping the
 * `y=0` / `y=size` seam, so it tiles cleanly under `repeat`.
 *
 * Rotation is applied at draw time via the pattern transform in
 * `resolvePaint`. Baking rotation here would force the axis-aligned
 * tile dimensions to align with the rotated stripe lattice — irrational
 * for the canonical 45° case — and produce visible breaks within each
 * rendered stripe.
 */
export function buildStripesTile(
  paint: HUDPaintStripes,
  dpr: number
): OffscreenCanvas {
  const { size, thicknessPx } = computeStripesTileGeometry(paint, dpr);
  const canvas = new OffscreenCanvas(1, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("OffscreenCanvas 2d context unavailable");
  }
  ctx.clearRect(0, 0, 1, size);
  ctx.fillStyle = paint.color;

  // One stripe band, centered on the y=0 / y=size seam. Split into a
  // "top half" (above the seam, drawn at y=0) and a "bottom half"
  // (drawn at y = size - half, just above the seam). After `repeat`
  // tiling, the two halves merge into a single band straddling each
  // tile boundary — no clip artifact, no doubling.
  const half = Math.min(thicknessPx / 2, size / 2);
  if (half > 0) {
    ctx.fillRect(0, 0, 1, half);
    if (size - half > half) {
      ctx.fillRect(0, size - half, 1, half);
    }
  }

  return canvas;
}

/**
 * Resolve an `HUDPaint` to a Canvas 2D paint value.
 *
 * Solid → CSS color string. Stripes → `CanvasPattern` (with the pattern
 * transform pre-applied to keep tiles aligned to device pixels).
 *
 * Throws on unknown `kind` — closed-taxonomy enforcement; HUD does not
 * silently passthrough unknown paint kinds.
 */
export function resolvePaint(
  ctx: CanvasRenderingContext2D,
  paint: HUDPaint,
  dpr: number
): ResolvedPaint {
  if (paint.kind === "solid") {
    return { style: paint.color, opacity: paint.opacity ?? 1 };
  }
  if (paint.kind === "stripes") {
    const tile = getOrBuildStripesTile(paint, dpr);
    const pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) {
      throw new Error("createPattern returned null");
    }
    // Pattern transform = rotate(-angle) · inverse(CTM).
    //
    //   - inverse(CTM) maps canvas-space sample positions back to device
    //     pixels, so the tile period stays in device pixels regardless of
    //     viewport zoom (counter-CTM, screen-aligned chrome).
    //   - rotate(-angle) then rotates the device-pixel sample point. The
    //     tile itself is axis-aligned horizontal stripes; rotating the
    //     sample point by -angle makes the displayed stripes appear at
    //     +angle in canvas space.
    //
    // Composing both into one DOMMatrixInit avoids any dependency on
    // browser-only `DOMMatrix.rotate` / `.multiply` (Node tests use a
    // plain-object inverse).
    //
    // Note: `createPattern` + `getTransform()` runs per call. For N
    // striped primitives sharing one paint, that's N pattern objects +
    // N CTM reads per draw. The tile itself is cached. When a consumer
    // stripes-fills many primitives in one draw, add a per-draw
    // `(tileKey, ctm) → CanvasPattern` scratchpad on `HUDCanvas`.
    // Premature today.
    const inv = ctx.getTransform().inverse();
    const angleRad =
      ((paint.angle ?? DEFAULT_STRIPES_ANGLE_DEG) * Math.PI) / 180;
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    const t: DOMMatrixInit = {
      a: c * inv.a + s * inv.b,
      b: -s * inv.a + c * inv.b,
      c: c * inv.c + s * inv.d,
      d: -s * inv.c + c * inv.d,
      e: c * inv.e + s * inv.f,
      f: -s * inv.e + c * inv.f,
    };
    pattern.setTransform(t);
    return { style: pattern, opacity: paint.opacity ?? 1 };
  }
  // Closed-taxonomy enforcement: no silent passthrough for unknown kinds.
  // The exhaustiveness check fires at compile time too.
  const _exhaustive: never = paint;
  void _exhaustive;
  throw new Error(`Unknown HUDPaint kind: ${(paint as { kind: string }).kind}`);
}

/**
 * Clear the stripes tile cache. Exposed for tests.
 *
 * @internal
 */
export function _clearStripesTileCache(): void {
  tileCache.length = 0;
}

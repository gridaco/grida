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
 * Pure geometry for a stripes tile. Computes the period (tile size) and
 * the per-stripe parameters in device pixels. Separated from the
 * rasterizer so the math is testable in Node.
 *
 * The tile is a square whose side equals one stripe period along the
 * pattern's principal axis; when tiled with `repeat` and rotated by
 * `angle`, it produces an infinite stripe field.
 *
 * To keep stripes screen-aligned regardless of viewport zoom, the tile
 * is built in *device pixels* and the consumer applies a counter-CTM
 * via `CanvasPattern.setTransform` at draw time.
 */
export function computeStripesTileGeometry(
  paint: HUDPaintStripes,
  dpr: number
): {
  size: number;
  spacingPx: number;
  thicknessPx: number;
  angleRad: number;
} {
  const spacing = paint.spacing ?? DEFAULT_STRIPES_SPACING_PX;
  const thickness = paint.thickness ?? DEFAULT_STRIPES_THICKNESS_PX;
  const angleDeg = paint.angle ?? DEFAULT_STRIPES_ANGLE_DEG;

  const spacingPx = spacing * dpr;
  const thicknessPx = thickness * dpr;
  const angleRad = (angleDeg * Math.PI) / 180;

  // The tile is a square sized to one stripe period, expanded enough that
  // rotation doesn't reveal seams. For a rotated stripe pattern the tile
  // must be a multiple of the period along the perpendicular-to-stripes
  // axis. A square of side = ceil(spacingPx) is sufficient for the
  // standard 45° / 8px / 1.5px config; we use that as the period.
  const size = Math.max(1, Math.ceil(spacingPx));

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
 * Rasterize a single-period stripes tile (device pixels) with the
 * angle baked into the bitmap. Consumers tile it axis-aligned via
 * `ctx.createPattern(tile, "repeat")` — no draw-time rotation needed,
 * which leaves `CanvasPattern.setTransform` free for the counter-CTM
 * that keeps stripes screen-aligned.
 */
export function buildStripesTile(
  paint: HUDPaintStripes,
  dpr: number
): OffscreenCanvas {
  const { size, spacingPx, thicknessPx, angleRad } = computeStripesTileGeometry(
    paint,
    dpr
  );
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("OffscreenCanvas 2d context unavailable");
  }
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = paint.color;

  // Draw stripes by walking perpendicular-to-stripe direction and
  // emitting filled rectangles of width = thicknessPx along the stripe.
  // For the canonical 45° / 8px / 1.5px case: one stripe per tile.
  // The tile is rotated about its center.
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(angleRad);
  // After rotation, draw a horizontal stripe band centered on the origin.
  // Draw across a length sufficient to cover the rotated square — its
  // diagonal is `size * sqrt(2)`. Use `2 * size` for safety.
  const drawLen = 2 * size;
  const half = thicknessPx / 2;
  // Center stripe
  ctx.fillRect(-drawLen / 2, -half, drawLen, thicknessPx);
  // Additional stripes at integer multiples of `spacingPx`, in case the
  // tile is sized to fit more than one period.
  for (let offset = spacingPx; offset < size; offset += spacingPx) {
    ctx.fillRect(-drawLen / 2, offset - half, drawLen, thicknessPx);
    ctx.fillRect(-drawLen / 2, -offset - half, drawLen, thicknessPx);
  }
  ctx.restore();

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
    // Counter the current CTM so the tile maps 1:1 to device pixels.
    // Without this the tile would scale with the viewport zoom.
    //
    // Note: `createPattern` + `getTransform().inverse()` runs per call.
    // For N striped primitives sharing one paint, that's N pattern
    // objects + N inverses per draw. The tile itself is cached. When a
    // consumer (vector-edit rehost) stripes-fills many primitives in
    // one draw, add a per-draw `(tileKey, ctm) → CanvasPattern`
    // scratchpad on `HUDCanvas`. Premature today — §0 demo emits 2.
    const m = ctx.getTransform();
    pattern.setTransform(m.inverse());
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

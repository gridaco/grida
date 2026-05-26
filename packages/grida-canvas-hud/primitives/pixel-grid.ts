// Inlined copy of @grida/pixel-grid's draw routine. Kept here so the
// published @grida/hud package has no workspace dependency on the private
// @grida/pixel-grid. ~50 lines; semantics must stay in sync — if you fix
// a bug here, mirror it in `packages/grida-canvas-pixelgrid/pixel-grid.ts`.

import type cmath from "@grida/cmath";

export const DEFAULT_PIXEL_GRID_COLOR = "rgba(150, 150, 150, 0.15)";
export const DEFAULT_PIXEL_GRID_STEPS: [number, number] = [1, 1];

export interface PixelGridConfig {
  enabled: boolean;
  /** Minimum `transform[0][0]` (uniform scale) at which the grid renders. */
  zoomThreshold: number;
  /**
   * Optional camera transform used to space the grid. Hosts that drive the
   * HUD canvas's own `setTransform` can omit this — the pixel grid falls
   * back to the canvas's chrome transform. Hosts that keep the HUD at
   * identity (applying the camera elsewhere — e.g. as a CSS transform on
   * an outer element) must supply this explicitly and update it on every
   * camera change via `setPixelGridTransform`.
   */
  transform?: cmath.Transform;
  color?: string;
  steps?: [number, number];
}

export interface DrawPixelGridParams {
  ctx: CanvasRenderingContext2D;
  transform: cmath.Transform;
  width: number;
  height: number;
  dpr: number;
  color?: string;
  steps?: [number, number];
}

export function drawPixelGrid(p: DrawPixelGridParams): void {
  const {
    ctx,
    transform,
    width,
    height,
    dpr,
    color = DEFAULT_PIXEL_GRID_COLOR,
    steps = DEFAULT_PIXEL_GRID_STEPS,
  } = p;

  ctx.save();

  const [[sx, , tx], [, sy, ty]] = transform;
  ctx.setTransform(sx * dpr, 0, 0, sy * dpr, tx * dpr, ty * dpr);

  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / Math.max(Math.abs(sx * dpr), Math.abs(sy * dpr));

  const minUserX = (0 - tx * dpr) / (sx * dpr);
  const maxUserX = (width * dpr - tx * dpr) / (sx * dpr);
  const minUserY = (0 - ty * dpr) / (sy * dpr);
  const maxUserY = (height * dpr - ty * dpr) / (sy * dpr);

  const [stepX, stepY] = steps;
  const startX = Math.floor(minUserX / stepX) * stepX - 2 * stepX;
  const endX = Math.ceil(maxUserX / stepX) * stepX + 2 * stepX;
  const startY = Math.floor(minUserY / stepY) * stepY - 2 * stepY;
  const endY = Math.ceil(maxUserY / stepY) * stepY + 2 * stepY;

  ctx.beginPath();
  for (let x = startX; x <= endX; x += stepX) {
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
  }
  for (let y = startY; y <= endY; y += stepY) {
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
  }
  ctx.stroke();

  ctx.restore();
}

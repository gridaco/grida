export interface PixelGridOptions {
  transform: [[number, number, number], [number, number, number]]; // [[sx, 0, tx],[0, sy, ty]]

  /**
   * @default "rgba(150, 150, 150, 0.15)"
   */
  color?: string;
  steps?: [number, number];
  unit?: "px";
}

type Transform = [[number, number, number], [number, number, number]];

export const DEFAULT_PIXEL_GRID_COLOR = "rgba(150, 150, 150, 0.15)";
export const DEFAULT_PIXEL_GRID_STEPS: [number, number] = [1, 1];

export interface DrawPixelGridParams {
  /** 2D context to paint into. Caller owns clearing & save/restore as needed. */
  ctx: CanvasRenderingContext2D;
  /** 2×3 transform — `[[sx, 0, tx], [0, sy, ty]]`. */
  transform: Transform;
  /** Viewport CSS width. */
  width: number;
  /** Viewport CSS height. */
  height: number;
  /** Device-pixel ratio of the backing store (assumed already applied to canvas.width/height). */
  dpr: number;
  /** Line color. Default `"rgba(150, 150, 150, 0.15)"`. */
  color?: string;
  /** Grid spacing in document units. Default `[1, 1]`. */
  steps?: [number, number];
}

/**
 * Paint a pixel grid into an existing 2D context. The function owns its own
 * `save`/`restore` and sets the transform itself (combining `dpr` with the
 * supplied `transform`). It does NOT clear the canvas — callers that share
 * the context with other painters are expected to clear before/after.
 */
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
  // Combine device-pixel ratio with user transform so (sx, sy) are
  // effectively multiplied by dpr — same for translation.
  ctx.setTransform(sx * dpr, 0, 0, sy * dpr, tx * dpr, ty * dpr);

  ctx.strokeStyle = color;
  // Lines should be 1 device pixel thick => divide by the absolute scale.
  ctx.lineWidth = 1 / Math.max(Math.abs(sx * dpr), Math.abs(sy * dpr));

  // Device-space bounding box is [0..(width*dpr), 0..(height*dpr)];
  // invert transform to find user-space bounding box.
  const minUserX = (0 - tx * dpr) / (sx * dpr);
  const maxUserX = (width * dpr - tx * dpr) / (sx * dpr);
  const minUserY = (0 - ty * dpr) / (sy * dpr);
  const maxUserY = (height * dpr - ty * dpr) / (sy * dpr);

  const [stepX, stepY] = steps;

  // Extra 2-step margins to avoid blinking in/out near edges.
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

export class PixelGridCanvas {
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private transform: Transform;
  private steps: [number, number];
  private color: string;
  private unit: "px";

  width = 0; // CSS width
  height = 0; // CSS height

  constructor(
    private canvas: HTMLCanvasElement,
    {
      transform,
      color = DEFAULT_PIXEL_GRID_COLOR,
      steps = DEFAULT_PIXEL_GRID_STEPS,
      unit = "px",
    }: PixelGridOptions
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.dpr = window.devicePixelRatio || 1;
    this.transform = transform;
    this.steps = steps;
    this.color = color;
    this.unit = unit;
  }

  setSize(w: number, h: number) {
    this.width = w;
    this.height = h;
    // Scale the actual backing store by dpr
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    // Do NOT scale the context yet; we'll combine it in draw() transform
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  updateTransform(transform: Transform) {
    this.transform = transform;
  }

  draw() {
    const ctx = this.ctx;
    // Clear entire backing store
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    drawPixelGrid({
      ctx,
      transform: this.transform,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      color: this.color,
      steps: this.steps,
    });
  }
}

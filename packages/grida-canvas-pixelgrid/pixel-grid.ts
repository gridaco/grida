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
      color = "rgba(150, 150, 150, 0.15)",
      steps = [1, 1],
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

    ctx.save();

    const [[sx, , tx], [, sy, ty]] = this.transform;
    // Combine device-pixel ratio with user transform
    // so (sx, sy) are effectively multiplied by dpr
    // and same for translation
    ctx.setTransform(
      sx * this.dpr,
      0,
      0,
      sy * this.dpr,
      tx * this.dpr,
      ty * this.dpr
    );

    ctx.strokeStyle = this.color;
    // Lines should be 1 device pixel thick => divide by the absolute scale factor
    ctx.lineWidth =
      1 / Math.max(Math.abs(sx * this.dpr), Math.abs(sy * this.dpr));

    // device-space bounding box is [0..(width*dpr), 0..(height*dpr)]
    // invert transform to find user-space bounding box
    const minUserX = (0 - tx * this.dpr) / (sx * this.dpr);
    const maxUserX = (this.width * this.dpr - tx * this.dpr) / (sx * this.dpr);
    const minUserY = (0 - ty * this.dpr) / (sy * this.dpr);
    const maxUserY = (this.height * this.dpr - ty * this.dpr) / (sy * this.dpr);

    const [stepX, stepY] = this.steps;

    // Add extra 2-step margins to avoid blinking in/out
    const startX = Math.floor(minUserX / stepX) * stepX - 2 * stepX;
    const endX = Math.ceil(maxUserX / stepX) * stepX + 2 * stepX;
    const startY = Math.floor(minUserY / stepY) * stepY - 2 * stepY;
    const endY = Math.ceil(maxUserY / stepY) * stepY + 2 * stepY;

    // Vertical lines
    for (let x = startX; x <= endX; x += stepX) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    // Horizontal lines
    for (let y = startY; y <= endY; y += stepY) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }

    ctx.restore();
  }
}

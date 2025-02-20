export interface TransparencyGridOptions {
  transform: [[number, number, number], [number, number, number]]; // [[sx, 0, tx],[0, sy, ty]]

  /**
   * @default "rgba(0, 0, 0, 0.25)"
   */
  color?: string;
}

type Transform = [[number, number, number], [number, number, number]];
function quantize(value: number): number {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / Math.pow(10, exponent);
  let niceFraction: number;
  if (fraction < 1.5) {
    niceFraction = 1;
  } else if (fraction < 3) {
    niceFraction = 2;
  } else if (fraction < 7) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

/**
 * The TransparencyGridCanvas class renders a checkered transparency grid on an HTML canvas.
 *
 * Visual Behaviour:
 * - Renders a chessboard-like pattern where filled cells alternate with empty cells.
 *   For example:
 *     1 0 1 0 1
 *     0 1 0 1 0
 *     1 0 1 0 1
 *
 * - The grid is used to indicate transparency in graphics editors.
 * - Each cell's visual size is maintained at roughly 20px regardless of zoom, achieved by
 *   quantizing the cell size based on the current scaling factors and device pixel ratio.
 * - A transformation matrix (scale and translation) is applied so that as the user pans or zooms,
 *   the grid adapts its position and cell size to remain visually consistent.
 * - The checkered pattern is produced by iterating over grid indices and filling cells
 *   where the sum of the indices is even.
 *
 * Usage:
 * - Instantiate with a canvas element and options containing a transformation matrix and an optional color.
 * - Use setSize to set the canvas dimensions.
 * - Update the transformation with updateTransform as needed.
 * - Call draw to render the grid.
 */
export class TransparencyGridCanvas {
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private transform: Transform;
  private color: string;
  width = 0;
  height = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    { transform, color = "rgba(150, 150, 150, 0.15)" }: TransparencyGridOptions
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.dpr = window.devicePixelRatio || 1;
    this.transform = transform;
    this.color = color;
  }

  setSize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  updateTransform(transform: Transform) {
    this.transform = transform;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();

    const [[sx, , tx], [, sy, ty]] = this.transform;
    ctx.setTransform(
      sx * this.dpr,
      0,
      0,
      sy * this.dpr,
      tx * this.dpr,
      ty * this.dpr
    );
    ctx.fillStyle = this.color;

    const targetVisualSize = 20;
    const stepX = quantize(targetVisualSize / (sx * this.dpr));
    const stepY = quantize(targetVisualSize / (sy * this.dpr));

    const minUserX = (0 - tx * this.dpr) / (sx * this.dpr);
    const maxUserX = (this.width * this.dpr - tx * this.dpr) / (sx * this.dpr);
    const minUserY = (0 - ty * this.dpr) / (sy * this.dpr);
    const maxUserY = (this.height * this.dpr - ty * this.dpr) / (sy * this.dpr);

    const ixStart = Math.floor(minUserX / stepX) - 2;
    const ixEnd = Math.ceil(maxUserX / stepX) + 2;
    const iyStart = Math.floor(minUserY / stepY) - 2;
    const iyEnd = Math.ceil(maxUserY / stepY) + 2;

    for (let i = ixStart; i <= ixEnd; i++) {
      for (let j = iyStart; j <= iyEnd; j++) {
        if ((i + j) % 2 === 0) {
          ctx.fillRect(i * stepX, j * stepY, stepX, stepY);
        }
      }
    }
    ctx.restore();
  }
}

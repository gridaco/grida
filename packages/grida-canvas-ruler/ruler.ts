type Axis = "x" | "y";
type Range = [a: number, b: number];

export interface RulerOptions {
  readonly axis: Axis;
  readonly steps?: number[];
  readonly fadeThreshold?: number;
  readonly scale: number;
  readonly translate: number;
  readonly labelOffset?: number;
  readonly font?: string;
  readonly ranges?: Range[];
  readonly backgroundColor?: string;
}

export class RulerCanvas implements RulerOptions {
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  readonly axis: Axis;
  readonly steps: number[];
  readonly fadeThreshold: number;
  readonly scale: number;
  readonly translate: number;
  readonly labelOffset: number;
  readonly font: string;
  readonly ranges: Range[];
  readonly backgroundColor: string;

  constructor(
    private canvas: HTMLCanvasElement,
    {
      axis,
      steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      fadeThreshold = 30,
      translate = 0,
      scale = 1,
      labelOffset = 1,
      font = "10px sans-serif",
      backgroundColor = "#fff",
    }: RulerOptions
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.dpr = window.devicePixelRatio || 1;
    this.axis = axis;
    this.steps = steps;
    this.fadeThreshold = fadeThreshold;
    this.scale = scale;
    this.translate = translate;
    this.labelOffset = labelOffset;
    this.font = font;
    this.ranges = [];
    this.backgroundColor = backgroundColor;
  }

  setSize(w: number, h: number) {
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    // Use a transform so we can draw in CSS pixels
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private getStepSize() {
    const minPxPerTick = 50;
    for (const s of this.steps) {
      if (s * this.scale >= minPxPerTick) return s;
    }
    return this.steps[this.steps.length - 1];
  }

  draw() {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.save();
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.restore();

    this.ctx.font = this.font;
    this.ctx.fillStyle = "#BABABA";
    this.ctx.strokeStyle = "#BABABA";
    this.ctx.lineWidth = 1;
    this.ctx.textAlign = "center";

    const step = this.getStepSize();
    const startUnit = -this.translate / this.scale;
    const endUnit = startUnit + w / this.scale;
    const firstTick = Math.floor(startUnit / step) * step;

    for (let t = firstTick; t < endUnit; t += step) {
      const xCanvas = t * this.scale + this.translate;
      if (xCanvas < 0 || xCanvas > w) continue;

      const distFromLeft = Math.abs(xCanvas);
      this.ctx.globalAlpha =
        distFromLeft < this.fadeThreshold
          ? distFromLeft / this.fadeThreshold
          : 1;

      this.ctx.beginPath();
      this.ctx.moveTo(xCanvas, h - this.labelOffset - 8);
      this.ctx.lineTo(xCanvas, h);
      this.ctx.stroke();
      this.ctx.fillText(String(t), xCanvas, h - this.labelOffset - 12);
    }
    this.ctx.globalAlpha = 1;
  }
}

export type Axis = "x" | "y";
export type Range = [a: number, b: number];

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
  readonly color?: string;
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
  readonly color: string;

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
      color = "#BABABA",
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
    this.color = color;
  }

  setSize(w: number, h: number) {
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
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
    this.ctx.fillStyle = this.color;
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = 1;

    const step = this.getStepSize();
    const dimension = this.axis === "x" ? w : h;
    const startUnit = -this.translate / this.scale;
    const endUnit = startUnit + dimension / this.scale;
    const firstTick = Math.floor(startUnit / step) * step;

    for (let t = firstTick; t < endUnit; t += step) {
      const pos = t * this.scale + this.translate;
      if (pos < 0 || pos > dimension) continue;

      const dist = Math.abs(pos);
      this.ctx.globalAlpha =
        dist < this.fadeThreshold ? dist / this.fadeThreshold : 1;

      this.ctx.textAlign = "center";
      if (this.axis === "x") {
        this.ctx.beginPath();
        this.ctx.moveTo(pos, h - this.labelOffset - 8);
        this.ctx.lineTo(pos, h);
        this.ctx.stroke();
        this.ctx.fillText(String(t), pos, h - this.labelOffset - 12);
      } else {
        this.ctx.beginPath();
        this.ctx.moveTo(0, pos);
        this.ctx.lineTo(this.labelOffset + 8, pos);
        this.ctx.stroke();

        // Rotate labels so they read horizontally
        this.ctx.save();
        this.ctx.translate(this.labelOffset + 12, pos);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.fillText(String(t), 0, 0);
        this.ctx.restore();
      }
    }
    this.ctx.globalAlpha = 1;
  }
}

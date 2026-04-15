"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import cmath from "@grida/cmath";
import vn from "@grida/vn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyIcon, RotateCcwIcon } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

type ShapeId =
  | "rect"
  | "circle"
  | "triangle"
  | "l-shape"
  | "arrow"
  | "star"
  | "svg-path";

/** Decomposed transform parameters — the canonical source of truth for sliders. */
interface TransformParams {
  translate: cmath.Vector2;
  rotation: number; // radians
  scale: cmath.Vector2;
  skewX: number; // radians
}

// ── Transform helpers ──────────────────────────────────────────────

function determinant(m: cmath.Transform): number {
  return m[0][0] * m[1][1] - m[0][1] * m[1][0];
}

/** Compose a transform from T · R · K · S */
function composeMatrix(p: TransformParams): cmath.Transform {
  const cosR = Math.cos(p.rotation),
    sinR = Math.sin(p.rotation);
  const tanK = Math.tan(p.skewX);
  // T · R · K · S expanded:
  //   a = sx * cosR - sy * tanK * sinR
  //   b = -sy * sinR + ... wait, let's just multiply properly
  const T: cmath.Transform = [
    [1, 0, p.translate[0]],
    [0, 1, p.translate[1]],
  ];
  const R: cmath.Transform = [
    [cosR, -sinR, 0],
    [sinR, cosR, 0],
  ];
  const K: cmath.Transform = [
    [1, tanK, 0],
    [0, 1, 0],
  ];
  const S: cmath.Transform = [
    [p.scale[0], 0, 0],
    [0, p.scale[1], 0],
  ];
  return cmath.transform.multiply(
    T,
    cmath.transform.multiply(R, cmath.transform.multiply(K, S))
  );
}

/** Decompose a matrix into params. Used only for external matrix input. */
function decomposeMatrix(m: cmath.Transform): TransformParams {
  const tx = m[0][2],
    ty = m[1][2];
  const a = m[0][0],
    b = m[0][1],
    c = m[1][0],
    d = m[1][1];

  const det = a * d - b * c;
  let sx = Math.sqrt(a * a + c * c);
  let sy = Math.sqrt(b * b + d * d);
  if (det < 0) sx = -sx;

  const rotation = Math.atan2(c, a);

  const cos = Math.cos(-rotation),
    sin = Math.sin(-rotation);
  const rb = b * cos - d * sin;
  const skewX = Math.atan2(rb, sy);
  sy = sy * Math.cos(skewX);

  return {
    translate: [tx, ty],
    rotation,
    scale: [sx, sy],
    skewX,
  };
}

const DEFAULT_PARAMS: TransformParams = {
  translate: [0, 0],
  rotation: 0,
  scale: [1, 1],
  skewX: 0,
};

// ── Formatting ─────────────────────────────────────────────────────

function fmtNum(n: number, decimals = 4): string {
  if (Math.abs(n) < 1e-10) return "0";
  return n.toFixed(decimals).replace(/\.?0+$/, "") || "0";
}

function fmtDeg(rad: number): string {
  return fmtNum(cmath.rad2deg(rad), 1);
}

// ── Shape definitions ──────────────────────────────────────────────

function getShapePoints(shape: ShapeId, size: number): cmath.Vector2[] {
  const h = size / 2;
  switch (shape) {
    case "rect":
      return [
        [-h, -h],
        [h, -h],
        [h, h],
        [-h, h],
      ];
    case "triangle":
      return [
        [0, -h],
        [h, h],
        [-h, h],
      ];
    case "l-shape":
      return [
        [-h, -h],
        [0, -h],
        [0, 0],
        [h, 0],
        [h, h],
        [-h, h],
      ];
    case "arrow":
      return [
        [0, -h],
        [h, 0],
        [h * 0.35, 0],
        [h * 0.35, h],
        [-h * 0.35, h],
        [-h * 0.35, 0],
        [-h, 0],
      ];
    case "star": {
      const pts: cmath.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? h : h * 0.4;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      return pts;
    }
    default:
      return [
        [-h, -h],
        [h, -h],
        [h, h],
        [-h, h],
      ];
  }
}

// ── SVG path helpers ───────────────────────────────────────────────

const DEFAULT_SVG_PATH = "M 10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80";

function parseSvgPath(
  d: string,
  targetSize: number
):
  | { path2d: Path2D; error?: undefined }
  | { path2d?: undefined; error: string } {
  try {
    const network = vn.fromSVGPathData(d);
    if (!network.segments.length && !network.vertices.length)
      return { error: "Path produced no visible output" };

    const bbox = vn.getBBox(network);
    if (bbox.width === 0 && bbox.height === 0)
      return { error: "Path produced no visible output" };

    const center = cmath.rect.getCenter(bbox);
    const scale = targetSize / Math.max(bbox.width, bbox.height, 1);

    const editor = new vn.VectorNetworkEditor(network);
    editor.translate(cmath.vector2.invert(center));
    editor.scale([scale, scale]);

    const centeredD = vn.toSVGPathData(editor.value);
    if (!centeredD) return { error: "Path produced no visible output" };

    return { path2d: new Path2D(centeredD) };
  } catch {
    return { error: "Invalid SVG path syntax" };
  }
}

// ── Parse matrix from user text ────────────────────────────────────

function parseMatrixInput(text: string): cmath.Transform | null {
  const cleaned = text
    .replace(/[[\](){}]/g, " ")
    .replace(/;/g, ",")
    .replace(/\n/g, ",");
  const nums = cleaned
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);

  if (nums.some(isNaN)) return null;
  if (nums.length === 6)
    return [
      [nums[0], nums[1], nums[2]],
      [nums[3], nums[4], nums[5]],
    ];
  if (nums.length === 9)
    return [
      [nums[0], nums[1], nums[2]],
      [nums[3], nums[4], nums[5]],
    ];
  if (nums.length === 4)
    return [
      [nums[0], nums[1], 0],
      [nums[2], nums[3], 0],
    ];
  return null;
}

// ── Canvas Renderer (class) ────────────────────────────────────────

const GRID_STEP = 40;
const SHAPE_SIZE = 120;
const HANDLE_RADIUS = 7;
const BASIS_LEN = SHAPE_SIZE * 0.7;

interface RenderState {
  matrix: cmath.Transform;
  shapeId: ShapeId;
  shapePoints: cmath.Vector2[];
  svgPath: Path2D | null;
  showGrid: boolean;
  showOriginal: boolean;
  showBasis: boolean;
  isDark: boolean;
}

type DragTarget = "origin" | "x" | "y";
type DragCallback = (matrix: cmath.Transform) => void;

class AffineCanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: RenderState;
  private onMatrixChange: DragCallback;

  // drag state (no React involvement)
  private dragging: DragTarget | null = null;
  private dragStartPos: cmath.Vector2 = [0, 0];
  private dragStartMatrix: cmath.Transform = cmath.transform.identity;

  constructor(
    canvas: HTMLCanvasElement,
    initialState: RenderState,
    onMatrixChange: DragCallback
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.state = initialState;
    this.onMatrixChange = onMatrixChange;

    // bind events
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("mouseleave", this.onMouseUp);
    window.addEventListener("resize", this.draw);

    this.draw();
  }

  destroy() {
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("mouseleave", this.onMouseUp);
    window.removeEventListener("resize", this.draw);
  }

  update(state: Partial<RenderState>) {
    Object.assign(this.state, state);
    this.draw();
  }

  // ── Drawing ──

  draw = () => {
    const { canvas, ctx, state } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2,
      cy = h / 2;
    const { matrix, shapeId, shapePoints, svgPath, isDark } = state;

    if (state.showGrid) this.drawGrid(w, h, cx, cy, isDark);

    const isCircle = shapeId === "circle";
    const activeSvg = shapeId === "svg-path" ? svgPath : null;

    if (state.showOriginal) {
      this.drawShape(
        shapePoints,
        cmath.transform.identity,
        cx,
        cy,
        isCircle,
        isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
        isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)",
        1,
        1,
        activeSvg
      );
    }

    this.drawShape(
      shapePoints,
      matrix,
      cx,
      cy,
      isCircle,
      isDark ? "rgba(139,92,246,0.15)" : "rgba(124,58,237,0.1)",
      isDark ? "#a78bfa" : "#7c3aed",
      2,
      1,
      activeSvg
    );

    if (state.showBasis) this.drawBasis(matrix, cx, cy, isDark);
    this.drawHandles(matrix, cx, cy, isDark);
  };

  private drawGrid(
    w: number,
    h: number,
    cx: number,
    cy: number,
    isDark: boolean
  ) {
    const { ctx } = this;
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    for (let x = cx % GRID_STEP; x < w; x += GRID_STEP) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = cy % GRID_STEP; y < h; y += GRID_STEP) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();
  }

  private drawShape(
    pts: cmath.Vector2[],
    matrix: cmath.Transform,
    cx: number,
    cy: number,
    isCircle: boolean,
    fill: string,
    stroke: string,
    lineWidth: number,
    alpha: number,
    svgPath: Path2D | null
  ) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;

    if (svgPath) {
      const avgScale = Math.sqrt(Math.abs(determinant(matrix))) || 1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.transform(
        matrix[0][0],
        matrix[1][0],
        matrix[0][1],
        matrix[1][1],
        matrix[0][2],
        matrix[1][2]
      );
      ctx.fillStyle = fill;
      ctx.fill(svgPath);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth / avgScale;
      ctx.stroke(svgPath);
      ctx.restore();
    } else if (isCircle) {
      ctx.beginPath();
      const r = SHAPE_SIZE / 2;
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        const px =
          matrix[0][0] * Math.cos(t) * r +
          matrix[0][1] * Math.sin(t) * r +
          matrix[0][2];
        const py =
          matrix[1][0] * Math.cos(t) * r +
          matrix[1][1] * Math.sin(t) * r +
          matrix[1][2];
        if (i === 0) ctx.moveTo(cx + px, cy + py);
        else ctx.lineTo(cx + px, cy + py);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    } else {
      const xf = pts.map((p) => cmath.vector2.transform(p, matrix));
      ctx.beginPath();
      xf.forEach((p, i) => {
        if (i === 0) ctx.moveTo(cx + p[0], cy + p[1]);
        else ctx.lineTo(cx + p[0], cy + p[1]);
      });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawArrowhead(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    size: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      x - size * Math.cos(angle - 0.4),
      y - size * Math.sin(angle - 0.4)
    );
    ctx.lineTo(
      x - size * Math.cos(angle + 0.4),
      y - size * Math.sin(angle + 0.4)
    );
    ctx.closePath();
    ctx.fill();
  }

  private drawBasis(
    matrix: cmath.Transform,
    cx: number,
    cy: number,
    isDark: boolean
  ) {
    const { ctx } = this;
    const o = cmath.vector2.transform([0, 0], matrix);
    const xE = cmath.vector2.transform([BASIS_LEN, 0], matrix);
    const yE = cmath.vector2.transform([0, BASIS_LEN], matrix);

    // X axis (red)
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = isDark ? "#f87171" : "#dc2626";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + o[0], cy + o[1]);
    ctx.lineTo(cx + xE[0], cy + xE[1]);
    ctx.stroke();
    this.drawArrowhead(
      ctx,
      cx + xE[0],
      cy + xE[1],
      Math.atan2(xE[1] - o[1], xE[0] - o[0]),
      8
    );
    ctx.restore();

    // Y axis (blue)
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = isDark ? "#60a5fa" : "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + o[0], cy + o[1]);
    ctx.lineTo(cx + yE[0], cy + yE[1]);
    ctx.stroke();
    this.drawArrowhead(
      ctx,
      cx + yE[0],
      cy + yE[1],
      Math.atan2(yE[1] - o[1], yE[0] - o[0]),
      8
    );
    ctx.restore();

    // Origin dot
    ctx.save();
    ctx.fillStyle = isDark ? "#a3a3a3" : "#525252";
    ctx.beginPath();
    ctx.arc(cx + o[0], cy + o[1], 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawHandles(
    matrix: cmath.Transform,
    cx: number,
    cy: number,
    isDark: boolean
  ) {
    const { ctx } = this;
    const o = cmath.vector2.transform([0, 0], matrix);
    const xH = cmath.vector2.transform([BASIS_LEN, 0], matrix);
    const yH = cmath.vector2.transform([0, BASIS_LEN], matrix);

    const drawDot = (
      p: cmath.Vector2,
      fillC: string,
      strokeC: string,
      r: number
    ) => {
      ctx.save();
      ctx.fillStyle = fillC;
      ctx.strokeStyle = strokeC;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + p[0], cy + p[1], r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    drawDot(
      o,
      isDark ? "#e5e5e5" : "#404040",
      isDark ? "#404040" : "#e5e5e5",
      HANDLE_RADIUS
    );
    drawDot(
      xH,
      isDark ? "#f87171" : "#dc2626",
      isDark ? "#1f1f1f" : "#ffffff",
      6
    );
    drawDot(
      yH,
      isDark ? "#60a5fa" : "#2563eb",
      isDark ? "#1f1f1f" : "#ffffff",
      6
    );
  }

  // ── Hit-testing & drag ──

  private canvasPos(e: MouseEvent): cmath.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
  }

  private onMouseDown = (e: MouseEvent) => {
    const pos = this.canvasPos(e);
    const m = this.state.matrix;
    const o = cmath.vector2.transform([0, 0], m);
    const xH = cmath.vector2.transform([BASIS_LEN, 0], m);
    const yH = cmath.vector2.transform([0, BASIS_LEN], m);

    const threshold = 14;
    let target: DragTarget | null = null;
    if (cmath.vector2.distance(pos, o) < threshold) target = "origin";
    else if (cmath.vector2.distance(pos, xH) < threshold) target = "x";
    else if (cmath.vector2.distance(pos, yH) < threshold) target = "y";

    if (target) {
      this.dragging = target;
      this.dragStartPos = pos;
      this.dragStartMatrix = [[...m[0]], [...m[1]]];
      this.canvas.style.cursor = "grabbing";
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.dragging) return;
    const pos = this.canvasPos(e);
    const sm = this.dragStartMatrix;

    let newMatrix: cmath.Transform;
    if (this.dragging === "origin") {
      const dx = pos[0] - this.dragStartPos[0];
      const dy = pos[1] - this.dragStartPos[1];
      newMatrix = [
        [sm[0][0], sm[0][1], sm[0][2] + dx],
        [sm[1][0], sm[1][1], sm[1][2] + dy],
      ];
    } else {
      const o = cmath.vector2.transform([0, 0], sm);
      const dx = pos[0] - o[0];
      const dy = pos[1] - o[1];
      const s = BASIS_LEN;
      if (this.dragging === "x") {
        newMatrix = [
          [dx / s, sm[0][1], sm[0][2]],
          [dy / s, sm[1][1], sm[1][2]],
        ];
      } else {
        newMatrix = [
          [sm[0][0], dx / s, sm[0][2]],
          [sm[1][0], dy / s, sm[1][2]],
        ];
      }
    }

    this.state.matrix = newMatrix;
    this.draw();
    this.onMatrixChange(newMatrix);
  };

  private onMouseUp = () => {
    if (this.dragging) {
      this.dragging = null;
      this.canvas.style.cursor = "";
    }
  };

  get isDragging(): boolean {
    return this.dragging !== null;
  }
}

// ── Presets ─────────────────────────────────────────────────────────

type Preset = { name: string; params: TransformParams; description: string };

const PRESETS: Preset[] = [
  {
    name: "Identity",
    params: { ...DEFAULT_PARAMS },
    description: "No transformation",
  },
  {
    name: "Scale 2x",
    params: { ...DEFAULT_PARAMS, scale: [2, 2] },
    description: "Uniform scale by 2",
  },
  {
    name: "Rotate 45\u00B0",
    params: { ...DEFAULT_PARAMS, rotation: Math.PI / 4 },
    description: "Rotate 45 degrees CCW",
  },
  {
    name: "Shear X",
    params: { ...DEFAULT_PARAMS, skewX: Math.atan(0.5) },
    description: "Horizontal shear",
  },
  {
    name: "Flip X",
    params: { ...DEFAULT_PARAMS, scale: [-1, 1] },
    description: "Mirror horizontally",
  },
  {
    name: "Flip Y",
    params: { ...DEFAULT_PARAMS, scale: [1, -1] },
    description: "Mirror vertically",
  },
  {
    name: "Squeeze",
    params: { ...DEFAULT_PARAMS, scale: [1.5, 0.67] },
    description: "Stretch X, compress Y",
  },
  {
    name: "Rotate 90\u00B0",
    params: { ...DEFAULT_PARAMS, rotation: Math.PI / 2 },
    description: "Rotate 90 degrees CCW",
  },
];

// ── UI helpers ─────────────────────────────────────────────────────

function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const id = useId();
  const display = props.format
    ? props.format(props.value)
    : String(props.value);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <span id={id} className="text-xs text-muted-foreground">
          {props.label}
        </span>
        <span className="text-xs font-mono tabular-nums text-foreground">
          {display}
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        min={props.min}
        max={props.max}
        step={props.step}
        value={[props.value]}
        onValueChange={([v]) => props.onValueChange(v)}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 pt-3 pb-1">
      {children}
    </p>
  );
}

/** Read a flat 3x3 cell from a 2x3 Transform (implicit bottom row [0,0,1]) */
function flatCell(m: cmath.Transform, row: number, col: number): number {
  if (row < 2) return m[row][col];
  return col === 2 ? 1 : 0;
}

// ── Main component ─────────────────────────────────────────────────

export default function AffineTransformTool() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AffineCanvasRenderer | null>(null);

  // Source of truth: decomposed params
  const [params, setParams] = useState<TransformParams>({ ...DEFAULT_PARAMS });
  // Derived matrix
  const matrix = composeMatrix(params);
  const det = determinant(matrix);

  const [shape, setShape] = useState<ShapeId>("rect");
  const [showOriginal, setShowOriginal] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showBasis, setShowBasis] = useState(true);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [isDark, setIsDark] = useState(false);

  const displayPanelId = useId();
  const displayGridId = `${displayPanelId}-grid`;
  const displayOriginalId = `${displayPanelId}-original`;
  const displayBasisId = `${displayPanelId}-basis`;

  // SVG path state
  const [svgPathInput, setSvgPathInput] = useState(DEFAULT_SVG_PATH);
  const [svgPathError, setSvgPathError] = useState("");
  const [parsedSvgPath, setParsedSvgPath] = useState<Path2D | null>(null);

  useEffect(() => {
    if (shape !== "svg-path") {
      setParsedSvgPath(null);
      return;
    }
    if (!svgPathInput.trim()) {
      setParsedSvgPath(null);
      setSvgPathError("");
      return;
    }
    const result = parseSvgPath(svgPathInput, SHAPE_SIZE);
    if (result.path2d) {
      setParsedSvgPath(result.path2d);
      setSvgPathError("");
    } else {
      setParsedSvgPath(null);
      setSvgPathError(result.error);
    }
  }, [svgPathInput, shape]);

  // Detect dark mode
  useEffect(() => {
    const check = () =>
      setIsDark(
        document.documentElement.classList.contains("dark") ||
          window.matchMedia("(prefers-color-scheme: dark)").matches
      );
    check();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", check);
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      mq.removeEventListener("change", check);
      observer.disconnect();
    };
  }, []);

  // Callback when the canvas renderer drags a handle → decompose once into params
  const onCanvasDrag = (m: cmath.Transform) => {
    setParams(decomposeMatrix(m));
  };

  // Init / destroy renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const shapePoints = getShapePoints(shape, SHAPE_SIZE);
    const renderer = new AffineCanvasRenderer(
      canvas,
      {
        matrix,
        shapeId: shape,
        shapePoints,
        svgPath: parsedSvgPath,
        showGrid,
        showOriginal,
        showBasis,
        isDark,
      },
      onCanvasDrag
    );
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
    // Only recreate on canvas mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync state changes into the renderer
  useEffect(() => {
    rendererRef.current?.update({
      matrix,
      shapeId: shape,
      shapePoints: getShapePoints(shape, SHAPE_SIZE),
      svgPath: parsedSvgPath,
      showGrid,
      showOriginal,
      showBasis,
      isDark,
    });
  }, [matrix, shape, parsedSvgPath, showGrid, showOriginal, showBasis, isDark]);

  // ── Actions ──

  const handlePaste = (text: string) => {
    setPasteText(text);
    if (!text.trim()) {
      setPasteError("");
      return;
    }
    const parsed = parseMatrixInput(text);
    if (parsed) {
      setParams(decomposeMatrix(parsed));
      setPasteError("");
    } else setPasteError("Could not parse. Expected 4, 6, or 9 numbers.");
  };

  const copyMatrix = () => {
    const rows = [
      `[${fmtNum(matrix[0][0])}, ${fmtNum(matrix[0][1])}, ${fmtNum(matrix[0][2])}]`,
      `[${fmtNum(matrix[1][0])}, ${fmtNum(matrix[1][1])}, ${fmtNum(matrix[1][2])}]`,
      `[0, 0, 1]`,
    ];
    navigator.clipboard.writeText(`[${rows.join(",\n ")}]`);
  };

  const reset = () => {
    setParams({ ...DEFAULT_PARAMS });
    setPasteText("");
    setPasteError("");
  };

  const applyPreset = (p: Preset) => {
    setParams({ ...p.params });
    setPasteText("");
    setPasteError("");
  };

  // Direct param setters — no decompose round-trip
  const setTranslateX = (v: number) =>
    setParams((p) => ({ ...p, translate: [v, p.translate[1]] }));
  const setTranslateY = (v: number) =>
    setParams((p) => ({ ...p, translate: [p.translate[0], v] }));
  const setRotationDeg = (v: number) =>
    setParams((p) => ({ ...p, rotation: (v * Math.PI) / 180 }));
  const setScaleX = (v: number) =>
    setParams((p) => ({ ...p, scale: [v, p.scale[1]] }));
  const setScaleY = (v: number) =>
    setParams((p) => ({ ...p, scale: [p.scale[0], v] }));
  const setSkewXDeg = (v: number) =>
    setParams((p) => ({ ...p, skewX: (v * Math.PI) / 180 }));

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex-1 w-full h-full flex flex-col sm:flex-row gap-0 min-h-0">
        {/* ── Left: Controls ── */}
        <aside className="w-full sm:w-72 shrink-0 flex flex-col overflow-y-auto border-b sm:border-b-0 sm:border-r p-4 gap-1">
          <SectionLabel>Shape</SectionLabel>
          <Select value={shape} onValueChange={(v) => setShape(v as ShapeId)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rect">Rectangle</SelectItem>
              <SelectItem value="circle">Circle</SelectItem>
              <SelectItem value="triangle">Triangle</SelectItem>
              <SelectItem value="l-shape">L-Shape</SelectItem>
              <SelectItem value="arrow">Arrow</SelectItem>
              <SelectItem value="star">Star</SelectItem>
              <SelectItem value="svg-path">SVG Path</SelectItem>
            </SelectContent>
          </Select>

          {shape === "svg-path" && (
            <div className="mt-2 flex flex-col gap-1.5">
              <Textarea
                className="font-mono text-xs h-20 resize-none"
                placeholder="Paste SVG path d attribute..."
                value={svgPathInput}
                onChange={(e) => setSvgPathInput(e.target.value)}
              />
              {svgPathError && (
                <p className="text-[11px] text-red-500">{svgPathError}</p>
              )}
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Paste the <code className="bg-muted px-1 rounded">d</code>{" "}
                attribute from an SVG{" "}
                <code className="bg-muted px-1 rounded">&lt;path&gt;</code>{" "}
                element.
              </p>
            </div>
          )}

          <Separator className="my-2" />

          <SectionLabel>Presets</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <Tooltip key={p.name}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] px-2 justify-start"
                    onClick={() => applyPreset(p)}
                  >
                    {p.name}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {p.description}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          <Separator className="my-2" />

          <SectionLabel>Paste Matrix</SectionLabel>
          <Textarea
            className="font-mono text-xs h-16 resize-none"
            placeholder={"[a, b, tx,\n c, d, ty]\nor 3x3, 2x2, CSS matrix()"}
            value={pasteText}
            onChange={(e) => handlePaste(e.target.value)}
          />
          {pasteError && (
            <p className="text-[11px] text-red-500">{pasteError}</p>
          )}

          <Separator className="my-2" />

          <div className="flex items-center justify-between gap-2 pt-3 pb-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Parameters
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-[11px] gap-1"
              onClick={reset}
            >
              <RotateCcwIcon className="size-3" /> Reset
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            <SliderRow
              label="Translate X"
              value={params.translate[0]}
              min={-200}
              max={200}
              step={1}
              onValueChange={setTranslateX}
              format={(v) => `${fmtNum(v, 1)}px`}
            />
            <SliderRow
              label="Translate Y"
              value={params.translate[1]}
              min={-200}
              max={200}
              step={1}
              onValueChange={setTranslateY}
              format={(v) => `${fmtNum(v, 1)}px`}
            />
            <SliderRow
              label="Rotation"
              value={cmath.rad2deg(params.rotation)}
              min={-180}
              max={180}
              step={1}
              onValueChange={setRotationDeg}
              format={(v) => `${fmtNum(v, 1)}\u00B0`}
            />
            <SliderRow
              label="Scale X"
              value={params.scale[0]}
              min={-3}
              max={3}
              step={0.05}
              onValueChange={setScaleX}
              format={(v) => `${fmtNum(v, 2)}x`}
            />
            <SliderRow
              label="Scale Y"
              value={params.scale[1]}
              min={-3}
              max={3}
              step={0.05}
              onValueChange={setScaleY}
              format={(v) => `${fmtNum(v, 2)}x`}
            />
            <SliderRow
              label="Skew X"
              value={cmath.rad2deg(params.skewX)}
              min={-80}
              max={80}
              step={1}
              onValueChange={setSkewXDeg}
              format={(v) => `${fmtNum(v, 1)}\u00B0`}
            />
          </div>
        </aside>

        {/* ── Center: Canvas ── */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 relative min-h-[400px]">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
            />
            <div
              className="absolute top-3 right-3 z-10 flex flex-col gap-2 rounded-lg border bg-background/90 p-3 shadow-sm backdrop-blur-sm supports-backdrop-filter:bg-background/75"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                Display
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={displayGridId}
                    checked={showGrid}
                    onCheckedChange={(v) => setShowGrid(v === true)}
                  />
                  <Label
                    htmlFor={displayGridId}
                    className="cursor-pointer text-xs font-normal leading-none"
                  >
                    Grid
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={displayOriginalId}
                    checked={showOriginal}
                    onCheckedChange={(v) => setShowOriginal(v === true)}
                  />
                  <Label
                    htmlFor={displayOriginalId}
                    className="cursor-pointer text-xs font-normal leading-none"
                  >
                    Original
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={displayBasisId}
                    checked={showBasis}
                    onCheckedChange={(v) => setShowBasis(v === true)}
                  />
                  <Label
                    htmlFor={displayBasisId}
                    className="cursor-pointer text-xs font-normal leading-none"
                  >
                    Basis
                  </Label>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom: Matrix + Decomposition ── */}
          <div className="border-t p-4 flex flex-col sm:flex-row gap-4 sm:gap-8">
            <div className="shrink-0 w-[min(100%,15rem)]">
              <div className="flex items-center gap-0.5 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Matrix
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      onClick={copyMatrix}
                      aria-label="Copy matrix to clipboard"
                    >
                      <CopyIcon className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Copy matrix</TooltipContent>
                </Tooltip>
              </div>
              <div className="font-mono text-xs leading-snug bg-muted/50 rounded-lg p-3 w-full">
                <table
                  className="w-full border-separate table-fixed"
                  style={{ borderSpacing: "0 2px" }}
                >
                  <tbody>
                    {[0, 1, 2].map((row) => (
                      <tr key={row}>
                        <td className="w-3 pr-0.5 text-muted-foreground/50 select-none align-middle">
                          {row === 0
                            ? "\u250C"
                            : row === 2
                              ? "\u2514"
                              : "\u2502"}
                        </td>
                        {[0, 1, 2].map((col) => (
                          <td
                            key={col}
                            className="px-1.5 text-right tabular-nums align-middle"
                          >
                            <span
                              className={
                                row === 2
                                  ? "text-muted-foreground/40"
                                  : col === 2
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : ""
                              }
                            >
                              {fmtNum(flatCell(matrix, row, col))}
                            </span>
                          </td>
                        ))}
                        <td className="w-3 pl-0.5 text-muted-foreground/50 select-none align-middle">
                          {row === 0
                            ? "\u2510"
                            : row === 2
                              ? "\u2518"
                              : "\u2502"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">
                Decomposition
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Translate</span>
                  <span className="font-mono tabular-nums">
                    ({fmtNum(params.translate[0], 1)},{" "}
                    {fmtNum(params.translate[1], 1)})
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Rotation</span>
                  <span className="font-mono tabular-nums">
                    {fmtDeg(params.rotation)}&deg;
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Scale</span>
                  <span className="font-mono tabular-nums">
                    ({fmtNum(params.scale[0], 2)}, {fmtNum(params.scale[1], 2)})
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Skew X</span>
                  <span className="font-mono tabular-nums">
                    {fmtDeg(params.skewX)}&deg;
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Det</span>
                  <span
                    className={`font-mono tabular-nums ${det < 0 ? "text-amber-600 dark:text-amber-400" : ""}`}
                  >
                    {fmtNum(det, 3)}
                    {det < 0 && (
                      <span className="text-[10px] ml-1">(flipped)</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Area ratio</span>
                  <span className="font-mono tabular-nums">
                    {fmtNum(Math.abs(det), 3)}x
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {det < 0
                    ? "Negative determinant: the transform flips orientation (mirror). "
                    : ""}
                  {Math.abs(det) < 0.01
                    ? "Near-zero determinant: the transform is degenerate (collapses space). "
                    : ""}
                  {Math.abs(Math.abs(det) - 1) < 0.01 && Math.abs(det) > 0.01
                    ? "Area-preserving transform (|det| \u2248 1). "
                    : ""}
                  Drag the{" "}
                  <span className="text-neutral-500 font-medium">
                    origin handle
                  </span>{" "}
                  to translate,{" "}
                  <span className="text-red-500 dark:text-red-400 font-medium">
                    red handle
                  </span>{" "}
                  to change the X basis vector, and{" "}
                  <span className="text-blue-500 dark:text-blue-400 font-medium">
                    blue handle
                  </span>{" "}
                  to change the Y basis vector.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

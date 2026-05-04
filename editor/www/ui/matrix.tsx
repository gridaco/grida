"use client";

// Canvas-backed dot-matrix display.
//
// Drop-in replacement for the SVG `Matrix` (formerly at `components/ui/matrix`).
// The SVG version emitted one `<circle>` per cell with per-frame opacity/scale
// transitions — fine at small sizes, but the music page renders 50×24 and 120×24
// grids that pushed thousands of nodes through React + the SVG renderer every
// frame. The canvas version draws the same look in a single 2D context with one
// `requestAnimationFrame` loop, no React reconciliation per frame, and respects
// `devicePixelRatio` for crisp output.
//
// Public API (props, exported helpers/frames) is intentionally identical to the
// previous component so callers don't have to change.

import * as React from "react";
import { useEffect, useMemo, useRef } from "react";

import { cn } from "@/components/lib/utils/index";

export type Frame = number[][];
type MatrixMode = "default" | "vu";

interface MatrixProps extends React.HTMLAttributes<HTMLDivElement> {
  rows: number;
  cols: number;
  pattern?: Frame;
  frames?: Frame[];
  fps?: number;
  autoplay?: boolean;
  loop?: boolean;
  size?: number;
  gap?: number;
  palette?: {
    on: string;
    off: string;
  };
  brightness?: number;
  ariaLabel?: string;
  onFrame?: (index: number) => void;
  mode?: MatrixMode;
  levels?: number[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ensureFrameSize(frame: Frame, rows: number, cols: number): Frame {
  const result: Frame = [];
  for (let r = 0; r < rows; r++) {
    const row = frame[r] || [];
    result.push([]);
    for (let c = 0; c < cols; c++) {
      result[r][c] = row[c] ?? 0;
    }
  }
  return result;
}

function emptyFrame(rows: number, cols: number): Frame {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

function setPixel(frame: Frame, row: number, col: number, value: number): void {
  if (row >= 0 && row < frame.length && col >= 0 && col < frame[0].length) {
    frame[row][col] = value;
  }
}

// ---------- Built-in patterns / animations (parity with SVG version) ----------

export const digits: Frame[] = [
  [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  [
    [0, 0, 1, 0, 0],
    [0, 1, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 1, 1, 0],
  ],
  [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 0, 0],
    [1, 1, 1, 1, 1],
  ],
  [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 1, 1, 0],
    [0, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  [
    [0, 0, 0, 1, 0],
    [0, 0, 1, 1, 0],
    [0, 1, 0, 1, 0],
    [1, 0, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [0, 0, 0, 1, 0],
    [0, 0, 0, 1, 0],
  ],
  [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 0],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 1, 0, 0, 0],
  ],
  [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
];

export const chevronLeft: Frame = [
  [0, 0, 0, 1, 0],
  [0, 0, 1, 0, 0],
  [0, 1, 0, 0, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 0, 1, 0],
];

export const chevronRight: Frame = [
  [0, 1, 0, 0, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 0, 1, 0],
  [0, 0, 1, 0, 0],
  [0, 1, 0, 0, 0],
];

export const loader: Frame[] = (() => {
  const frames: Frame[] = [];
  const size = 7;
  const center = 3;
  const radius = 2.5;

  for (let frame = 0; frame < 12; frame++) {
    const f = emptyFrame(size, size);
    for (let i = 0; i < 8; i++) {
      const angle = (frame / 12) * Math.PI * 2 + (i / 8) * Math.PI * 2;
      const x = Math.round(center + Math.cos(angle) * radius);
      const y = Math.round(center + Math.sin(angle) * radius);
      const brightness = 1 - i / 10;
      setPixel(f, y, x, Math.max(0.2, brightness));
    }
    frames.push(f);
  }

  return frames;
})();

export const pulse: Frame[] = (() => {
  const frames: Frame[] = [];
  const size = 7;
  const center = 3;

  for (let frame = 0; frame < 16; frame++) {
    const f = emptyFrame(size, size);
    const phase = (frame / 16) * Math.PI * 2;
    const intensity = (Math.sin(phase) + 1) / 2;

    setPixel(f, center, center, 1);

    const radius = Math.floor((1 - intensity) * 3) + 1;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(dist - radius) < 0.7) {
          setPixel(f, center + dy, center + dx, intensity * 0.6);
        }
      }
    }

    frames.push(f);
  }

  return frames;
})();

export function vu(columns: number, levels: number[]): Frame {
  const rows = 7;
  const frame = emptyFrame(rows, columns);

  for (let col = 0; col < Math.min(columns, levels.length); col++) {
    const level = Math.max(0, Math.min(1, levels[col]));
    const height = Math.floor(level * rows);

    for (let row = 0; row < rows; row++) {
      const rowFromBottom = rows - 1 - row;
      if (rowFromBottom < height) {
        const brightness = row < rows * 0.3 ? 1 : row < rows * 0.6 ? 0.8 : 0.6;
        frame[row][col] = brightness;
      }
    }
  }

  return frame;
}

export const wave: Frame[] = (() => {
  const frames: Frame[] = [];
  const rows = 7;
  const cols = 7;

  for (let frame = 0; frame < 24; frame++) {
    const f = emptyFrame(rows, cols);
    const phase = (frame / 24) * Math.PI * 2;

    for (let col = 0; col < cols; col++) {
      const colPhase = (col / cols) * Math.PI * 2;
      const height = Math.sin(phase + colPhase) * 2.5 + 3.5;
      const row = Math.floor(height);

      if (row >= 0 && row < rows) {
        setPixel(f, row, col, 1);
        const frac = height - row;
        if (row > 0) setPixel(f, row - 1, col, 1 - frac);
        if (row < rows - 1) setPixel(f, row + 1, col, frac);
      }
    }

    frames.push(f);
  }

  return frames;
})();

export const snake: Frame[] = (() => {
  const frames: Frame[] = [];
  const rows = 7;
  const cols = 7;
  const path: Array<[number, number]> = [];

  let x = 0;
  let y = 0;
  let dx = 1;
  let dy = 0;

  const visited = new Set<string>();
  while (path.length < rows * cols) {
    path.push([y, x]);
    visited.add(`${y},${x}`);

    const nextX = x + dx;
    const nextY = y + dy;

    if (
      nextX >= 0 &&
      nextX < cols &&
      nextY >= 0 &&
      nextY < rows &&
      !visited.has(`${nextY},${nextX}`)
    ) {
      x = nextX;
      y = nextY;
    } else {
      const newDx = -dy;
      const newDy = dx;
      dx = newDx;
      dy = newDy;

      const nextX = x + dx;
      const nextY = y + dy;

      if (
        nextX >= 0 &&
        nextX < cols &&
        nextY >= 0 &&
        nextY < rows &&
        !visited.has(`${nextY},${nextX}`)
      ) {
        x = nextX;
        y = nextY;
      } else {
        break;
      }
    }
  }

  const snakeLength = 5;
  for (let frame = 0; frame < path.length; frame++) {
    const f = emptyFrame(rows, cols);

    for (let i = 0; i < snakeLength; i++) {
      const idx = frame - i;
      if (idx >= 0 && idx < path.length) {
        const [y, x] = path[idx];
        const brightness = 1 - i / snakeLength;
        setPixel(f, y, x, brightness);
      }
    }

    frames.push(f);
  }

  return frames;
})();

// ---------- Component ----------

export const Matrix = React.forwardRef<HTMLDivElement, MatrixProps>(
  (
    {
      rows,
      cols,
      pattern,
      frames,
      fps = 12,
      autoplay = true,
      loop = true,
      size = 10,
      gap = 2,
      palette = {
        on: "currentColor",
        off: "var(--muted-foreground)",
      },
      brightness = 1,
      ariaLabel,
      onFrame,
      mode = "default",
      levels,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const width = cols * (size + gap) - gap;
    const height = rows * (size + gap) - gap;

    // Resolve CSS-variable colors against the actual element so the canvas
    // gets concrete rgba(...) values to paint with. We resolve once on mount
    // and again whenever palette inputs change.
    const resolvedPalette = useMemo(
      () => ({ on: palette.on, off: palette.off }),
      [palette.on, palette.off]
    );

    // Compose the static frame for non-animated cases (pattern / vu) so the
    // animation loop can be skipped entirely.
    const staticFrame = useMemo<Frame | null>(() => {
      if (mode === "vu" && levels && levels.length > 0) {
        return ensureFrameSize(vu(cols, levels), rows, cols);
      }
      if (pattern) {
        return ensureFrameSize(pattern, rows, cols);
      }
      if (!frames || frames.length === 0) {
        return ensureFrameSize([], rows, cols);
      }
      return null;
    }, [mode, levels, pattern, frames, rows, cols]);

    const isAnimating = staticFrame === null && !!frames && frames.length > 0;

    // Track latest props in refs so the long-lived RAF loop reads fresh data
    // without restarting on every render.
    const propsRef = useRef({
      frames,
      fps,
      loop,
      onFrame,
      brightness,
      palette: resolvedPalette,
      size,
      gap,
      rows,
      cols,
    });
    propsRef.current = {
      frames,
      fps,
      loop,
      onFrame,
      brightness,
      palette: resolvedPalette,
      size,
      gap,
      rows,
      cols,
    };

    // ----- Drawing -----

    // Build a per-frame color reader once per palette change.
    //
    // Three resolution paths, picked once at build time so the hot draw loop
    // is just `reader()` — no regex re-checks, no DOM mutations:
    //
    //   - literal (`#rgb`, `rgb()`, `hsl()`, `oklch()`, `oklab()`, `color()`)
    //     → constant string, returned as-is.
    //   - `currentColor` → live `getComputedStyle(container).color`. Caller
    //     can drive it via Tailwind `text-*` and `dark:text-*` utility
    //     classes; theme toggle picks up automatically.
    //   - anything else (`var(--foo)`, named tokens) → probe element. Less
    //     hot than `currentColor` but still works and stays theme-reactive
    //     since CSS vars resolve against the live cascade.
    type ColorReader = () => string;
    const makeColorReader = (
      cssValue: string,
      fallback: string
    ): ColorReader => {
      if (
        cssValue.startsWith("#") ||
        cssValue.startsWith("rgb") ||
        cssValue.startsWith("hsl") ||
        cssValue.startsWith("oklch") ||
        cssValue.startsWith("oklab") ||
        cssValue.startsWith("color(")
      ) {
        return () => cssValue;
      }
      if (cssValue === "currentColor") {
        return () => {
          const el = containerRef.current;
          return el ? getComputedStyle(el).color || fallback : fallback;
        };
      }
      return () => {
        const el = containerRef.current;
        if (!el) return fallback;
        const probe = document.createElement("span");
        probe.style.color = cssValue;
        probe.style.display = "none";
        el.appendChild(probe);
        const resolved = getComputedStyle(probe).color || fallback;
        el.removeChild(probe);
        return resolved;
      };
    };

    // Recompute readers only when palette inputs change.
    const onReader = useMemo(
      () => makeColorReader(resolvedPalette.on, "rgb(255, 255, 255)"),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [resolvedPalette.on]
    );
    const offReader = useMemo(
      () => makeColorReader(resolvedPalette.off, "rgba(255, 255, 255, 0.2)"),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [resolvedPalette.off]
    );

    const drawFrame = (frame: Frame) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const cssW =
        propsRef.current.cols * (propsRef.current.size + propsRef.current.gap) -
        propsRef.current.gap;
      const cssH =
        propsRef.current.rows * (propsRef.current.size + propsRef.current.gap) -
        propsRef.current.gap;
      const targetW = Math.max(1, Math.round(cssW * dpr));
      const targetH = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const onColor = onReader();
      const offColor = offReader();

      const r = (propsRef.current.size / 2) * 0.9;
      const cellSize = propsRef.current.size + propsRef.current.gap;
      const b = propsRef.current.brightness;

      // Draw OFF cells first in a single fill batch.
      ctx.fillStyle = offColor;
      ctx.globalAlpha = 0.18;
      for (let row = 0; row < propsRef.current.rows; row++) {
        const fr = frame[row];
        if (!fr) continue;
        for (let col = 0; col < propsRef.current.cols; col++) {
          const v = fr[col] ?? 0;
          const opacity = clamp01(b * v);
          if (opacity > 0.05) continue;
          const cx = col * cellSize + propsRef.current.size / 2;
          const cy = row * cellSize + propsRef.current.size / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw ON cells with per-cell alpha. We batch by rounding alpha to 1
      // decimal to cut state changes, but keep it simple — modern canvases
      // handle thousands of arcs comfortably.
      ctx.fillStyle = onColor;
      for (let row = 0; row < propsRef.current.rows; row++) {
        const fr = frame[row];
        if (!fr) continue;
        for (let col = 0; col < propsRef.current.cols; col++) {
          const v = fr[col] ?? 0;
          const opacity = clamp01(b * v);
          if (opacity <= 0.05) continue;
          ctx.globalAlpha = opacity;
          const cx = col * cellSize + propsRef.current.size / 2;
          const cy = row * cellSize + propsRef.current.size / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
    };

    // Static draw (pattern / vu / no-frames). Re-draw whenever the static
    // frame or any visual input changes.
    useEffect(() => {
      if (!staticFrame) return;
      drawFrame(staticFrame);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      staticFrame,
      rows,
      cols,
      size,
      gap,
      brightness,
      resolvedPalette.on,
      resolvedPalette.off,
    ]);

    // Animated draw — single RAF loop for the lifetime of the animated state.
    useEffect(() => {
      if (!isAnimating) return;
      if (!autoplay) {
        // Still draw the first frame so something shows up.
        const f0 = frames?.[0];
        if (f0) drawFrame(ensureFrameSize(f0, rows, cols));
        return;
      }

      let rafId: number | null = null;
      let lastDrawAt = 0;
      let frameIndex = 0;
      let stopped = false;

      const tick = (now: number) => {
        if (stopped) return;
        const cur = propsRef.current;
        const interval = 1000 / Math.max(1, cur.fps);
        if (lastDrawAt === 0) lastDrawAt = now;
        if (now - lastDrawAt >= interval) {
          lastDrawAt = now;
          const fr = cur.frames?.[frameIndex];
          if (fr) {
            drawFrame(ensureFrameSize(fr, cur.rows, cur.cols));
            cur.onFrame?.(frameIndex);
          }
          frameIndex += 1;
          if (frameIndex >= (cur.frames?.length ?? 0)) {
            if (cur.loop) {
              frameIndex = 0;
            } else {
              stopped = true;
              return;
            }
          }
        }
        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
      return () => {
        stopped = true;
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAnimating, autoplay, frames, rows, cols]);

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref)
            (ref as React.MutableRefObject<HTMLDivElement | null>).current =
              node;
        }}
        role="img"
        aria-label={ariaLabel ?? "matrix display"}
        aria-live={isAnimating ? "polite" : undefined}
        className={cn("relative inline-block", className)}
        style={style}
        {...props}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ width, height, display: "block" }}
        />
      </div>
    );
  }
);

Matrix.displayName = "Matrix";

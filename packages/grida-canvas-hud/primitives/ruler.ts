// Inlined draw routine for a paired top+left ruler. Kept here so the
// published @grida/hud package has no workspace dependency on the private
// @grida/ruler. Pure-function form — the upstream `@grida/ruler` ships a
// class-based, multi-canvas variant (`RulerCanvas`) for hosts that want to
// run rulers in their own DOM elements; THIS file is the pure-function
// equivalent used by the HUD's single back-most pass.
//
// Semantics must stay in sync — if you fix a layout / step / subtick bug
// here, mirror it in `packages/grida-canvas-ruler/ruler.ts` (and vice
// versa). Diverging behaviour is the bug.
//
// Why a pure function, not a class:
// - The HUD already owns the canvas, the DPR, the camera transform, the
//   per-frame paint loop. A class re-introducing canvas ownership inside
//   the HUD is a duplicate of `HUDCanvas`.
// - The class shape in `@grida/ruler` exists so it can hold its own
//   `<canvas>` for hosts that want a sidecar ruler. The HUD's job is the
//   opposite — paint into the single back-most slot.
// - Per the package README ("Not a renderer"), the HUD does NOT take on
//   stateful chrome renderers; it inlines small pure draw routines (see
//   `pixel-grid.ts` for the established precedent).

import type cmath from "@grida/cmath";

export type RulerAxis = "x" | "y";

/**
 * Width (in CSS pixels) of the strip the top ruler occupies along the
 * top edge of the viewport, and equivalently the width of the strip the
 * left ruler occupies along the left edge. Same value for both so the
 * corner clip is square — change one and the L-shape stops aligning.
 */
export const DEFAULT_RULER_STRIP = 20;
export const DEFAULT_RULER_TICK_HEIGHT = 6;
export const DEFAULT_RULER_OVERLAP_THRESHOLD = 80;
export const DEFAULT_RULER_TEXT_SIDE_OFFSET = 12;
export const DEFAULT_RULER_FONT = "10px sans-serif";
export const DEFAULT_RULER_COLOR = "rgba(128, 128, 128, 0.5)";
export const DEFAULT_RULER_ACCENT_BACKGROUND = "rgba(80, 200, 255, 0.25)";
export const DEFAULT_RULER_ACCENT_COLOR = "rgba(80, 200, 255, 1)";
export const DEFAULT_RULER_BACKGROUND = "transparent";
export const DEFAULT_RULER_STEPS: readonly number[] = [
  1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000,
];

/**
 * Recommended drag distance threshold (in CSS pixels) for the ruler's
 * create-guide gesture. Hosts implementing drag-from-strip should not
 * commit a new guide until the pointer has moved this far from
 * pointer-down — without it, a stray click on the strip creates an
 * unwanted guide.
 *
 * Threshold-only — hud does not own the gesture. It owns the value
 * because the value is a property of the ruler chrome's UX, not of
 * any particular host's gesture pipeline.
 */
export const DEFAULT_RULER_DRAG_THRESHOLD = 4;

export type RulerRange = [a: number, b: number];

/**
 * A priority mark on a ruler strip — typically a guide position the host
 * wants the user to see at all zooms, regardless of where the regular
 * step ticks land.
 *
 * With only `pos` set, the mark renders identically to a regular step
 * tick — short stroke at `tickHeight`, label color = `color`. The extra
 * fields below let a consumer render a mark as a full-strip line with
 * an accent stroke + label color — the standard guide-position
 * affordance every editor ships:
 *
 * ```ts
 * { pos: 120, strokeHeight: strip, strokeColor: red, color: red, text: "120" }
 * ```
 *
 * Defaults are chosen so an existing minimal `{ pos }` mark keeps
 * rendering exactly as before. All extra fields are optional.
 */
export interface RulerMark {
  pos: number;
  /** Tick stroke + (default) label color. */
  color?: string;
  /** Label text. */
  text?: string;
  /** Override the stroke color independently of the label color. */
  strokeColor?: string;
  /** Stroke width in CSS pixels. Default 1. */
  strokeWidth?: number;
  /**
   * Stroke height in CSS pixels. Default `tickHeight`. Pass `strip`
   * (the strip width) for a full-strip mark — the standard
   * guide-position affordance.
   */
  strokeHeight?: number;
  /** Label color. Defaults to `color` if omitted. */
  textColor?: string;
  /** Label alignment. Default "center". */
  textAlign?: CanvasTextAlign;
  /** Label position offset from `pos`. Default 0. */
  textAlignOffset?: number;
}

/**
 * Public config for the back-most ruler chrome.
 *
 * The HUD draws both axes in one pass: a horizontal strip across the top
 * edge and a vertical strip down the left edge, with the corner square
 * left blank. This is the L-shape every editor ruler ships.
 *
 * Coordinate model: identical to `PixelGridConfig` — `transform` is the
 * camera (screen ↔ doc). If omitted, the HUD's chrome transform is used.
 * Hosts that drive the HUD canvas at identity (e.g. the camera is on the
 * underlying SVG/canvas) MUST supply this and update it on camera change
 * via `setRulerTransform`.
 */
export interface RulerConfig {
  enabled: boolean;
  /** Optional camera transform. See `PixelGridConfig.transform` for the
   *  two-transform contract. */
  transform?: cmath.Transform;
  /** Which axes to render. Default both. */
  axes?: readonly RulerAxis[];
  /** Strip width in CSS pixels. Default {@link DEFAULT_RULER_STRIP}. */
  strip?: number;
  /** Tick line height in CSS pixels. */
  tickHeight?: number;
  /** Ranges to highlight (in doc-space units), per axis. */
  ranges?: { x?: readonly RulerRange[]; y?: readonly RulerRange[] };
  /** Priority marks (in doc-space units), per axis. */
  marks?: { x?: readonly RulerMark[]; y?: readonly RulerMark[] };
  /** Minimum tick spacing in screen px before ticks fade near priority points. */
  overlapThreshold?: number;
  /** Offset from the strip edge for the label text. */
  textSideOffset?: number;
  /** Label font. */
  font?: string;
  /** Background fill for the ruler strip. */
  backgroundColor?: string;
  /** Tick + label color. */
  color?: string;
  /**
   * Color of the 1-px inner-edge separator (the line where the strip
   * meets the editing area). Defaults to `color` — the tick color —
   * so existing consumers don't regress.
   *
   * Every production editor (Figma, Sketch, XD, Illustrator, Affinity)
   * paints this line distinctly LIGHTER than the ticks. With shared
   * color the host has to choose: ticks readable but separator looks
   * like a heavy underline, OR separator correct but ticks too faint.
   * Pass a lighter value here to match the universal convention; e.g.
   * the OKLCH `border` token most design systems already define.
   *
   * The separator field is decoupled from `color` precisely because
   * the two responsibilities (read-the-number vs. mark-the-edge) want
   * different weights, and no single token gets both right.
   */
  borderColor?: string;
  /** Range fill color. */
  accentBackgroundColor?: string;
  /** Range label / boundary color. */
  accentColor?: string;
  /** Custom step series, e.g. for non-decimal units. */
  steps?: readonly number[];
  /**
   * Subdivisions between major ticks. See `@grida/ruler` for the heuristic.
   * - `false` / `0`: no subticks (default)
   * - `true` / `"auto"`: 1-2-5 heuristic
   * - `number`: fixed subdivision count
   */
  subticks?: false | true | "auto" | number;
  /** Subtick line height. Defaults to `round(tickHeight * 0.4)`. */
  subtickHeight?: number;
  /** Subtick color. Defaults to `color`. */
  subtickColor?: string;
}

export interface DrawRulerParams {
  ctx: CanvasRenderingContext2D;
  transform: cmath.Transform;
  /** Viewport width in CSS pixels. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
  /** Device pixel ratio of the canvas. */
  dpr: number;
  config: RulerConfig;
}

// --- internal axis-level renderer (one pass per axis) ------------------------

interface DrawAxisParams {
  ctx: CanvasRenderingContext2D;
  axis: RulerAxis;
  /** Screen-space size along the ruler's long axis (px). */
  length: number;
  /** Screen-space size across the ruler's short axis (px) — the strip. */
  strip: number;
  /** Doc-space scale along the axis. */
  zoom: number;
  /** Screen-space translation along the axis. */
  offset: number;
  tickHeight: number;
  font: string;
  color: string;
  borderColor: string;
  overlapThreshold: number;
  textSideOffset: number;
  backgroundColor: string;
  accentBackgroundColor: string;
  accentColor: string;
  ranges: readonly RulerRange[];
  marks: readonly RulerMark[];
  steps: readonly number[];
  subticks: false | true | "auto" | number;
  subtickHeight: number | undefined;
  subtickColor: string | undefined;
}

function getStepSize(steps: readonly number[], zoom: number): number {
  const minPxPerTick = 50;
  // Filter non-positive / non-finite entries — they'd produce
  // step = 0 and hang the tick loops in `paintAxis`. Fall back to the
  // shipped defaults if the caller's series carries nothing usable.
  const valid = steps.filter((s) => Number.isFinite(s) && s > 0);
  const series = valid.length > 0 ? valid : DEFAULT_RULER_STEPS;
  const z = Math.abs(zoom);
  for (const s of series) if (s * z >= minPxPerTick) return s;
  return series[series.length - 1];
}

function resolveSubticks(
  step: number,
  subticks: false | true | "auto" | number
): number {
  if (subticks === false || subticks === 0) return 0;
  if (typeof subticks === "number") return Math.max(Math.round(subticks), 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(step)));
  const leading = Math.round((step / magnitude) * 10) / 10;
  if (leading === 1) return 10;
  if (leading === 2) return 4;
  if (leading === 2.5) return 5;
  if (leading === 5) return 5;
  return 5;
}

function mergeOverlappingRanges(ranges: readonly RulerRange[]): RulerRange[] {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: RulerRange[] = [];
  let prev: RulerRange = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr[0] <= prev[1]) {
      prev = [prev[0], Math.max(prev[1], curr[1])];
    } else {
      merged.push(prev);
      prev = curr;
    }
  }
  merged.push(prev);
  return merged;
}

interface TickPaint {
  pos: number;
  color: string;
  text?: string;
  textColor?: string;
  textAlign?: CanvasTextAlign;
  textAlignOffset?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeHeight?: number;
}

function paintTick(
  p: DrawAxisParams,
  priorityPoints: readonly number[],
  tick: TickPaint
) {
  const {
    ctx,
    axis,
    strip,
    font,
    tickHeight,
    overlapThreshold,
    textSideOffset,
  } = p;
  const {
    pos,
    color,
    text,
    textColor = color,
    textAlign = "center",
    textAlignOffset = 0,
    strokeColor = color,
    strokeWidth = 1,
    strokeHeight = tickHeight,
  } = tick;

  let alpha =
    Math.abs(pos) < overlapThreshold ? Math.abs(pos) / overlapThreshold : 1;
  for (const q of priorityPoints) {
    const d = Math.abs(q - pos);
    if (d < overlapThreshold) alpha = Math.min(alpha, d / overlapThreshold);
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.fillStyle = textColor;
  ctx.textAlign = textAlign;
  ctx.font = font;

  if (axis === "x") {
    const lineTop = strip - strokeHeight;
    const lineBottom = strip;
    ctx.beginPath();
    ctx.moveTo(pos, lineTop);
    ctx.lineTo(pos, lineBottom);
    ctx.stroke();
    if (text) {
      ctx.fillText(text, pos + textAlignOffset, strip - textSideOffset);
    }
  } else {
    const lineRight = strip;
    const lineLeft = strip - strokeHeight;
    ctx.beginPath();
    ctx.moveTo(lineRight, pos);
    ctx.lineTo(lineLeft, pos);
    ctx.stroke();
    if (text) {
      ctx.translate(strip - textSideOffset, pos + textAlignOffset);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(text, 0, 0);
    }
  }

  ctx.restore();
}

function paintRange(
  p: DrawAxisParams,
  priorityPoints: number[],
  [start, end]: RulerRange
) {
  const { ctx, axis, strip, length, zoom, offset, accentBackgroundColor } = p;
  const startCanvas = start * zoom + offset;
  const endCanvas = end * zoom + offset;
  const a = Math.min(startCanvas, endCanvas);
  const b = Math.max(startCanvas, endCanvas);

  ctx.save();
  ctx.fillStyle = accentBackgroundColor;
  if (axis === "x") {
    ctx.fillRect(a, 0, b - a, strip);
  } else {
    ctx.fillRect(0, a, strip, b - a);
  }
  ctx.restore();

  // accent boundary labels match `@grida/ruler`'s renderRange — note the
  // left/right text-align asymmetry per axis (preserved verbatim).
  if (axis === "x") {
    paintTick(p, priorityPoints, {
      pos: a,
      text: String(start),
      color: p.accentColor,
      textAlign: "end",
      textAlignOffset: -4,
    });
    paintTick(p, priorityPoints, {
      pos: b,
      text: String(end),
      color: p.accentColor,
      textAlign: "start",
      textAlignOffset: 4,
    });
  } else {
    paintTick(p, priorityPoints, {
      pos: a,
      text: String(start),
      color: p.accentColor,
      textAlign: "start",
      textAlignOffset: -4,
    });
    paintTick(p, priorityPoints, {
      pos: b,
      text: String(end),
      color: p.accentColor,
      textAlign: "end",
      textAlignOffset: 4,
    });
  }
  priorityPoints.push(a, b);
  // suppress unused-arg warnings — length is read by callers/tests
  void length;
}

function drawAxis(p: DrawAxisParams): void {
  const {
    ctx,
    axis,
    length,
    strip,
    zoom,
    offset,
    color,
    borderColor,
    backgroundColor,
    ranges,
    marks,
    steps,
    subticks,
    subtickHeight,
    subtickColor,
    tickHeight,
  } = p;

  // background fill — only the strip, not the whole viewport.
  if (backgroundColor !== "transparent") {
    ctx.save();
    ctx.fillStyle = backgroundColor;
    if (axis === "x") {
      ctx.fillRect(0, 0, length, strip);
    } else {
      ctx.fillRect(0, 0, strip, length);
    }
    ctx.restore();
  }

  // Inner-edge separator — the 1-px line where the strip meets the
  // editing area. Universal "good default UI" affordance: without it,
  // the strip visually bleeds into content. Every editor (Figma, Sketch,
  // XD, Illustrator, Affinity) draws this line.
  //
  // Painted EARLY — after the background fill, before any range / mark /
  // tick stroke — so the strip's data (ticks, marks, range boundaries)
  // sits visually ON TOP of it. The two roles answer different questions:
  //
  //   - Separator → "where does the strip end?" (cosmetic chrome, low
  //     information; belongs beneath data)
  //   - Ticks / marks → "what's the position at this x/y?" (data, high
  //     information; belongs on top)
  //
  // When a full-strip mark (`strokeHeight: strip`) is painted, it now
  // reads as one continuous stroke crossing the strip boundary into the
  // canvas guide below — exactly how every production editor renders
  // guides. With the prior order (separator last) the separator covered
  // the bottom 1 px of every full-strip tick, breaking that reading.
  // See `_inbox/processed/2026-05-26-ruler-paint-order-ticks-over-separator.md`
  // for the deciding-table walk.
  //
  // Color is `borderColor` if the host supplied one; otherwise falls
  // back to `color` (the tick color) so existing consumers don't
  // regress. The two responsibilities are deliberately decoupled —
  // every production editor paints this line LIGHTER than the ticks
  // (the ticks must read as numerals; the separator only marks the
  // edge). A shared `color` cannot satisfy both at once. See the
  // `ruler-separator-color` feedback note for the deciding-table
  // walk that reopened the prior "no knob" call.
  //
  // The corner square stays blank: the top strip's separator runs to
  // `length` along x, the left strip's separator runs to `length` along
  // y, and they meet at the inside corner of the L at right angles. No
  // extra paint is needed there.
  ctx.save();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  if (axis === "x") {
    // The 0.5 offset puts the 1-px stroke on the pixel boundary so it
    // rasterizes as a single crisp row rather than a 2-px blurry band.
    const y = strip - 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(length, y);
  } else {
    const x = strip - 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, length);
  }
  ctx.stroke();
  ctx.restore();

  const priorityPoints: number[] = [];

  const mergedRanges = mergeOverlappingRanges(ranges);
  for (const r of mergedRanges) paintRange(p, priorityPoints, r);

  for (const m of marks) {
    const pos = m.pos * zoom + offset;
    // Forward every paint field the public `RulerMark` exposes. The
    // internal `paintTick` already resolves its own defaults (strokeColor
    // falls back to color, strokeWidth=1, strokeHeight=tickHeight,
    // textColor=color, textAlign="center", textAlignOffset=0), so a
    // minimal `{ pos }` mark keeps rendering identically to a step tick.
    paintTick(p, priorityPoints, {
      pos,
      color: m.color ?? color,
      text: m.text,
      strokeColor: m.strokeColor,
      strokeWidth: m.strokeWidth,
      strokeHeight: m.strokeHeight,
      textColor: m.textColor,
      textAlign: m.textAlign,
      textAlignOffset: m.textAlignOffset,
    });
    priorityPoints.push(pos);
  }

  const step = getStepSize(steps, zoom);
  // Belt-and-braces: a non-positive step (e.g. an all-zero `steps`
  // array slipping past the filter) or a zero/NaN zoom would make
  // `endUnit` infinite and the tick loops below would not terminate.
  if (
    !Number.isFinite(step) ||
    step <= 0 ||
    !Number.isFinite(zoom) ||
    zoom === 0
  ) {
    return;
  }
  const startUnit = -offset / zoom;
  const endUnit = startUnit + length / zoom;
  const firstTick = Math.floor(startUnit / step) * step;

  const subdivisions = resolveSubticks(step, subticks);
  if (subdivisions > 1) {
    const subStep = step / subdivisions;
    const subC = subtickColor ?? color;
    const subH = subtickHeight ?? Math.round(tickHeight * 0.4);
    for (let t = firstTick; t < endUnit; t += subStep) {
      const remainder = Math.abs(Math.round((t / step) * 1e9) % 1e9);
      if (remainder < 1) continue;
      const pos = t * zoom + offset;
      if (pos < 0 || pos > length) continue;
      paintTick(p, priorityPoints, {
        pos,
        color: subC,
        strokeHeight: subH,
      });
    }
  }

  for (let t = firstTick; t < endUnit; t += step) {
    const pos = t * zoom + offset;
    if (pos < 0 || pos > length) continue;
    paintTick(p, priorityPoints, {
      pos,
      text: String(t),
      color,
    });
  }
}

// --- public entry ------------------------------------------------------------

/**
 * Paint the L-shape ruler chrome (top + left strips) into the canvas
 * context. Stateless: every call clears and redraws the strips in
 * screen-space.
 *
 * The function assumes the caller has reset the ctx transform to identity
 * for the device pixel scale; it applies `dpr` itself via `setTransform`.
 *
 * The corner square (`strip × strip` at origin) is deliberately left
 * blank — neither axis is in charge of it. Hosts that want a corner fill
 * draw it as a host-fed extra above the HUD.
 */
export function drawRuler(p: DrawRulerParams): void {
  const { ctx, transform, width, height, dpr, config } = p;
  if (!config.enabled) return;

  const strip = config.strip ?? DEFAULT_RULER_STRIP;
  const axes = config.axes ?? (["x", "y"] as const);
  const color = config.color ?? DEFAULT_RULER_COLOR;
  const borderColor = config.borderColor ?? color;
  const accentBackgroundColor =
    config.accentBackgroundColor ?? DEFAULT_RULER_ACCENT_BACKGROUND;
  const accentColor = config.accentColor ?? DEFAULT_RULER_ACCENT_COLOR;
  const backgroundColor = config.backgroundColor ?? DEFAULT_RULER_BACKGROUND;
  const tickHeight = config.tickHeight ?? DEFAULT_RULER_TICK_HEIGHT;
  const font = config.font ?? DEFAULT_RULER_FONT;
  const overlapThreshold =
    config.overlapThreshold ?? DEFAULT_RULER_OVERLAP_THRESHOLD;
  const textSideOffset =
    config.textSideOffset ?? DEFAULT_RULER_TEXT_SIDE_OFFSET;
  const steps = config.steps ?? DEFAULT_RULER_STEPS;
  const subticks = config.subticks ?? false;
  const subtickHeight = config.subtickHeight;
  const subtickColor = config.subtickColor;

  const [[sx, , tx], [, sy, ty]] = transform;

  // CSS-pixel coord system on the ctx (matches the upstream RulerCanvas).
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (const axis of axes) {
    const isX = axis === "x";
    drawAxis({
      ctx,
      axis,
      length: isX ? width : height,
      strip,
      zoom: isX ? sx : sy,
      offset: isX ? tx : ty,
      tickHeight,
      font,
      color,
      borderColor,
      overlapThreshold,
      textSideOffset,
      backgroundColor,
      accentBackgroundColor,
      accentColor,
      ranges: (isX ? config.ranges?.x : config.ranges?.y) ?? [],
      marks: (isX ? config.marks?.x : config.marks?.y) ?? [],
      steps,
      subticks,
      subtickHeight,
      subtickColor,
    });
  }

  ctx.restore();
}

// Exposed for tests / hosts that want to compute tick layout without
// running a draw pass.
export const _internal = {
  getStepSize,
  resolveSubticks,
  mergeOverlappingRanges,
};

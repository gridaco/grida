import type cmath from "@grida/cmath";

export type HUDSemanticGroup = string;

export interface HUDSemantic {
  /** Semantic owner of this primitive, used for group-level visibility policy. */
  group?: HUDSemanticGroup;
}

// ---------------------------------------------------------------------------
// Draw primitives — the atoms every HUD feature composes from.
//
// All coordinates are in **document space** unless noted otherwise.
// The HUD canvas applies the viewport transform so callers never convert.
// ---------------------------------------------------------------------------

/**
 * A line segment in document space, extending `cmath.ui.Line` with
 * an optional `dashed` style.
 */
export interface HUDLine extends cmath.ui.Line, HUDSemantic {
  dashed?: boolean;
  /** Stroke width in screen-space CSS px. Defaults to the canvas default. */
  strokeWidth?: number;
  /**
   * Override the canvas color for this line's stroke and label pill. Falls
   * back to the canvas's current color when absent.
   */
  color?: string;
  /**
   * Label rotation in radians (CCW) around the label pill's screen-space
   * center. Defaults to `0`. Used to make the size meter pill rotate with
   * a `SelectionShape.transformed` parent. Only affects the pill +
   * text; the underlying line stroke is unaffected.
   */
  labelAngle?: number;
}

/**
 * A full-viewport axis-aligned line (infinite extent) at a given offset.
 *
 * `axis` indicates which axis the `offset` lives on:
 * - `"x"` → vertical line at x=offset
 * - `"y"` → horizontal line at y=offset
 *
 * Offset is in document space; the renderer projects it to screen.
 */
export interface HUDRule extends HUDSemantic {
  axis: "x" | "y";
  offset: number;
  /**
   * Override the canvas color for this rule's stroke. Falls back to
   * the canvas's current color when absent.
   */
  color?: string;
}

/**
 * A single document-space point rendered as a small crosshair "X" on
 * the canvas. The size of the crosshair is fixed in CSS pixels; the
 * anchor (x, y) is in document space.
 *
 * Stroke uses the canvas color by default. Per-point override is opt-in.
 */
export interface HUDPoint extends HUDSemantic {
  x: number;
  y: number;
  /**
   * Override the canvas color for this point's crosshair stroke.
   * Falls back to the canvas's current color when absent.
   */
  color?: string;
}

/**
 * A rectangle in document space.
 *
 * Stroke uses the canvas color by default. Fill is opt-in.
 */
export interface HUDRect extends HUDSemantic {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Whether to stroke the outline (default: true). */
  stroke?: boolean;
  /** Whether to fill the interior (default: false). */
  fill?: boolean;
  /** Opacity of the fill color, 0–1 (default: 1). Ignored when `fill` is falsy. */
  fillOpacity?: number;
  /** Draw the outline with a dash pattern. */
  dashed?: boolean;
  /** Stroke width in screen-space CSS px. Defaults to the canvas default. */
  strokeWidth?: number;
  /**
   * Override the canvas color for this rect's stroke and fill. Falls back
   * to the canvas's current color when absent.
   */
  color?: string;
}

/**
 * A polyline (or closed polygon) in document space.
 *
 * Stroke uses the canvas color by default. Fill is opt-in.
 */
export interface HUDPolyline extends HUDSemantic {
  points: cmath.Vector2[];
  /** Whether to stroke the path (default: true). */
  stroke?: boolean;
  /** Whether to fill the interior (default: false). */
  fill?: boolean;
  /** Opacity of the fill color, 0–1 (default: 1). Ignored when `fill` is falsy. */
  fillOpacity?: number;
  /** Draw the stroke with a dash pattern. */
  dashed?: boolean;
  /**
   * Override the canvas color for this polyline's stroke and fill. Falls
   * back to the canvas's current color when absent.
   */
  color?: string;
}

/**
 * A rectangle whose **size is fixed in screen-space** but whose **anchor lives
 * in document space**. Used for handles and other chrome that must not scale
 * with viewport zoom.
 *
 * The anchor `(x, y)` is the document-space point that maps to one corner (or
 * center) of the resulting screen-space rect — controlled by `anchor`.
 *
 * Default anchor is `"center"` (the doc-space point becomes the rect's center).
 */
export interface HUDScreenRect extends HUDSemantic {
  /** Document-space anchor point. */
  x: number;
  y: number;
  /** Screen-space size in CSS px. */
  width: number;
  height: number;
  /** Which point of the rect sits at (x, y). Default: "center". */
  anchor?: "center" | "tl" | "tr" | "bl" | "br";
  fill?: boolean;
  stroke?: boolean;
  /** Override the canvas color for fill. */
  fillColor?: string;
  /** Override the canvas color for stroke. */
  strokeColor?: string;
  /**
   * Rotation in radians (CCW) around the rect's screen-space center.
   * Defaults to `0`. Used to make handle knobs / size badges rotate
   * together with a `SelectionShape.transformed` parent. Hit-testing is
   * unaffected — render and hit live on independent shapes per the
   * package's render/hit-test split (see README).
   */
  angle?: number;
}

/**
 * A complete set of draw commands for one frame.
 *
 * The HUD clears the canvas and draws everything in this struct each frame.
 * Callers build a `HUDDraw` from their domain data (snap result, measurement,
 * guide state, etc.) and hand it to `HUDCanvas.draw()`.
 */
export interface HUDDraw {
  lines?: HUDLine[];
  rules?: HUDRule[];
  points?: HUDPoint[];
  rects?: HUDRect[];
  polylines?: HUDPolyline[];
  /** Screen-space-sized rects anchored to document-space points (handles). */
  screenRects?: HUDScreenRect[];
}

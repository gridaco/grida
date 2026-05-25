import type cmath from "@grida/cmath";

export type HUDSemanticGroup = string;

export interface HUDSemantic {
  /** Semantic owner of this primitive, used for group-level visibility policy. */
  group?: HUDSemanticGroup;
}

// ---------------------------------------------------------------------------
// Paint — the design-language vocabulary for fill and stroke.
//
// `HUDPaint` is the closed taxonomy of paint kinds HUD ships. New kinds
// require a PR with ≥2 internal consumers shaped — hosts cannot register
// kinds at runtime.
//
// Built-in kinds (currently `solid`, `stripes`) are HUD-owned: HUD chooses
// rasterization quality and re-rasterizes on zoom so the chrome stays sharp.
// Theming flows through the `color` field; geometry (angle, spacing,
// thickness) is fixed by HUD's defaults and overridden only for the second
// canonical look — not for re-skinning.
//
// `HUDPaint` is symmetric across fill and stroke (Canvas API has no
// asymmetry here — both `fillStyle` and `strokeStyle` accept a
// `CanvasPattern`). The same value can drive `fillPaint` or `strokePaint`
// on a primitive.
//
// @unstable Public shape may change until the vector-edit overlay rehosts
// onto `@grida/hud` and becomes the second consumer that locks the
// contract.
// ---------------------------------------------------------------------------

/**
 * Solid color paint — the existing flat-fill behavior, lifted into the
 * `HUDPaint` discriminated union.
 *
 * @unstable
 */
export interface HUDPaintSolid {
  kind: "solid";
  /** CSS color string. */
  color: string;
  /** Paint opacity, 0–1 (default: 1). */
  opacity?: number;
}

/**
 * Diagonal-stripes paint — HUD's canonical "highlighted region, not
 * committed selection" chrome. Defaults match the editor's vector-edit
 * hover language (45° / 8px / 1.5px in device pixels).
 *
 * HUD rasterizes the tile per frame at the current DPR × zoom bucket and
 * caches the result — hosts never own the bitmap.
 *
 * @unstable
 */
export interface HUDPaintStripes {
  kind: "stripes";
  /** CSS color string for the stripe. */
  color: string;
  /** Paint opacity, 0–1 (default: 1). */
  opacity?: number;
  /** Stripe angle in degrees (default: 45). */
  angle?: number;
  /** Distance between stripe centers in device px (default: 8). */
  spacing?: number;
  /** Stripe thickness in device px (default: 1.5). */
  thickness?: number;
}

/**
 * The closed taxonomy of paint kinds HUD ships. See module banner above
 * for the promotion contract.
 *
 * @unstable
 */
export type HUDPaint = HUDPaintSolid | HUDPaintStripes;

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
   * Paint applied to the stroke. When set, takes precedence over `color`
   * for the stroke; the label pill stays on `color` (labels are theming
   * surface, not paintable design-language surface).
   *
   * @unstable
   */
  strokePaint?: HUDPaint;
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
  /**
   * Paint applied to the stroke. When set, takes precedence over `color`.
   *
   * @unstable
   */
  strokePaint?: HUDPaint;
  /**
   * Stroke width in screen-space CSS px. Defaults to the canvas default
   * (`DEFAULT_LINE_WIDTH`, 0.5). Hosts emitting per-rule visual state
   * (hovered, selected) can vary this to match a corresponding
   * `RulerMark.strokeWidth`, so the strip tick and the guide line read
   * as one continuous stroke. Mirrors {@link HUDLine.strokeWidth}.
   */
  strokeWidth?: number;
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
  /**
   * Paint applied to the crosshair stroke. When set, takes precedence
   * over `color`.
   *
   * @unstable
   */
  strokePaint?: HUDPaint;
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
  /**
   * Paint applied to the fill. When set, takes precedence over `color` +
   * `fillOpacity` for the fill (`fillOpacity` is folded into `HUDPaint.opacity`
   * by the host when migrating).
   *
   * @unstable
   */
  fillPaint?: HUDPaint;
  /**
   * Paint applied to the stroke. When set, takes precedence over `color`
   * for the stroke.
   *
   * @unstable
   */
  strokePaint?: HUDPaint;
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
  /** Stroke opacity, 0–1 (default: 1). Used for hovered-but-not-selected
   *  affordances (the main editor's "50% opacity" segment hover state). */
  strokeOpacity?: number;
  /** Stroke width in screen-space CSS px. Falls back to the canvas default
   *  (1px / zoom) when absent. Required for the path-edit chrome's
   *  state-driven segment outline (idle 1px, hovered/selected 3px). */
  strokeWidth?: number;
  /** Draw the stroke with a dash pattern. */
  dashed?: boolean;
  /**
   * Override the canvas color for this polyline's stroke and fill. Falls
   * back to the canvas's current color when absent.
   */
  color?: string;
  /**
   * Paint applied to the fill. When set, takes precedence over `color` +
   * `fillOpacity` for the fill.
   *
   * @unstable
   */
  fillPaint?: HUDPaint;
  /**
   * Paint applied to the stroke. When set, takes precedence over `color`
   * + `strokeOpacity` for the stroke.
   *
   * @unstable
   */
  strokePaint?: HUDPaint;
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
   * Paint applied to the fill. When set, takes precedence over `fillColor`.
   *
   * @unstable
   */
  fillPaint?: HUDPaint;
  /**
   * Paint applied to the stroke. When set, takes precedence over `strokeColor`.
   *
   * @unstable
   */
  strokePaint?: HUDPaint;
  /**
   * Rotation in radians (CCW) around the rect's screen-space center.
   * Defaults to `0`. Used to make handle knobs / size badges rotate
   * together with a `SelectionShape.transformed` parent. Hit-testing is
   * unaffected — render and hit live on independent shapes per the
   * package's render/hit-test split (see README).
   */
  angle?: number;
  /**
   * Rendered shape. `"rect"` (default) draws an axis-aligned (or rotated)
   * rectangle of `width × height`. `"circle"` draws an ellipse inscribed
   * in that same box — so the hit AABB stays a square at `MIN_HIT_SIZE`
   * for Fitts' reach while the visible knob is round. Width = height is
   * expected for circular knobs; non-square sizes degrade gracefully to
   * an ellipse. Anchor / angle / fill / stroke / colors all apply
   * identically; only the path drawn changes.
   */
  shape?: "rect" | "circle";
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

  // ── Top layer ──────────────────────────────────────────────────────────
  // Painted LAST, after `screenRects`. Reserved for gesture-preview chrome
  // that must visually dominate every other surface element — knobs,
  // handles, outlines — so the user always sees the live region they are
  // drawing. Currently used by marquee (rect) and lasso (polyline).
  // Hosts that inline gesture preview into the same canvas as the surface
  // chrome should route those primitives here; hosts that stack a separate
  // overlay canvas (e.g. `<Lasso/>` on top of `<HUD/>`) get the same effect
  // through DOM ordering and can ignore these fields.
  topRects?: HUDRect[];
  topPolylines?: HUDPolyline[];
}

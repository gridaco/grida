import type { HUDPaint } from "../primitives/types";

/**
 * HUD style — colors, sizes, and offsets for the surface-owned chrome.
 *
 * All fields are optional; defaults follow.
 */
export interface HUDStyle {
  /** Primary chrome color (selection outline, handle border). */
  chromeColor: string;
  /** Secondary color used for hover outline (lighter than chrome). */
  hoverColor: string;
  /** Handle visual size in screen-px. */
  handleSize: number;
  /** Handle fill color. */
  handleFill: string;
  /** Handle stroke color. */
  handleStroke: string;
  /** Selection outline stroke width (in screen-px). */
  selectionOutlineWidth: number;
  /** Hover outline stroke width (in screen-px). Typically thicker than selection. */
  hoverOutlineWidth: number;
  /** Whether to render rotation handles in addition to resize handles. */
  showRotationHandles: boolean;

  // ─── Vector chrome (path content-edit mode) ────────────────────────────
  /**
   * Color used for IDLE vector segment outlines. Painted as a thin overlay
   * stroke on top of each segment to indicate "you are in path edit mode
   * and these segments are interactive" — independent of the document's
   * own stroke style. Default is a neutral gray affordance stroke.
   */
  segmentIdleColor: string;
  /** Stroke width (screen-px) for IDLE segment outlines. */
  segmentIdleWidth: number;
  /**
   * Color used for HOVERED or SELECTED vector segment outlines. Same color
   * for both — hover differentiates via lower opacity (see `segmentHoverOpacity`).
   */
  segmentActiveColor: string;
  /** Stroke width (screen-px) for hovered/selected segment outlines. */
  segmentActiveWidth: number;
  /** Opacity (0..1) applied to the hovered (not selected) segment outline. */
  segmentHoverOpacity: number;
  /** Color for tangent handle lines (vertex → control point). */
  tangentLineColor: string;
  /** Stroke width (screen-px) for tangent lines when their tangent is NOT
   *  selected. */
  tangentLineIdleWidth: number;
  /** Stroke width (screen-px) for tangent lines when their tangent IS
   *  selected. */
  tangentLineActiveWidth: number;

  // ─── Vector regions (closed-loop body chrome) ──────────────────────────
  /**
   * Paint applied to a region's interior when the cursor is hovering
   * the loop body (no other vector control claimed the pixel). Hosts
   * typically use `HUDPaintStripes` here — the canonical
   * "highlighted region, not committed selection" affordance.
   *
   * @see {@link HUDPaintStripes}
   */
  vectorRegionHoverPaint: HUDPaint;
  /**
   * Paint applied to a region's interior when the loop is in the
   * host-pushed `VectorSubSelection.regions` array. Same shape vocabulary
   * as `vectorRegionHoverPaint`; conventionally a brighter / higher-
   * opacity variant so selected reads stronger than hover. Hover wins
   * over selected when both apply (existing precedence in vector chrome).
   */
  vectorRegionSelectedPaint: HUDPaint;

  // ─── Padding overlay (named class) ─────────────────────────────────────
  /**
   * Paint applied to a padding-overlay side rect when the cursor is
   * hovering it (HUD-owned; reads modifier state for axis-mirror).
   *
   * @see {@link HUDPaintStripes}
   */
  paddingHoverPaint: HUDPaint;
  /**
   * Stroke color for the padding-overlay side rect when a `padding_handle`
   * gesture is in flight (HUD-derived from `state.gesture`). Painted as an
   * outline of the side rect — communicating "this is the padding box at
   * the current value" — instead of the hover stripe pattern. Cleaner read
   * during the drag than stripes, which clutter the geometry.
   *
   * Stroke width: `selectionOutlineWidth`. Fill: none.
   *
   * With axis-mirror on (alt-held), the opposite side also outlines.
   */
  paddingSelectedStroke: string;
  /** Fill color for the padding mid-edge drag handle (visual knob). */
  paddingHandleFill: string;
  /** Stroke color (ring) for the padding mid-edge drag handle. */
  paddingHandleStroke: string;

  /**
   * Stroke color for the transform-box quad outline. The quad is the
   * only visible chrome of the transform-box model in idle — handles
   * are invisible hit-only by default.
   *
   * Default `#a3a3a3` (neutral-400) — a muted stroke that reads as
   * "transform target boundary" without competing with selection chrome.
   */
  transformBoxStroke: string;
  /** Fill color for the (invisible by default) transform-box handles. */
  transformBoxHandleFill: string;
  /** Stroke color for transform-box handles (visible only in debug). */
  transformBoxHandleStroke: string;
}

export const DEFAULT_STYLE: HUDStyle = {
  chromeColor: "#2563eb",
  hoverColor: "#60a5fa",
  handleSize: 8,
  handleFill: "#ffffff",
  handleStroke: "#2563eb",
  selectionOutlineWidth: 1,
  hoverOutlineWidth: 2,
  showRotationHandles: false,
  // Vector chrome defaults — idle = gray-400 affordance, active = chrome
  // color (host-themable).
  segmentIdleColor: "#9ca3af",
  segmentIdleWidth: 1,
  segmentActiveColor: "#2563eb",
  segmentActiveWidth: 3,
  segmentHoverOpacity: 0.5,
  tangentLineColor: "#9ca3af",
  tangentLineIdleWidth: 1,
  tangentLineActiveWidth: 2,
  // Region defaults — diagonal stripes. Hover ≈ accent-sky/50, selected
  // ≈ accent-sky/70. Hosts can override per theme by passing partial
  // HUDStyle.
  vectorRegionHoverPaint: {
    kind: "stripes",
    color: "#0ea5e9",
    opacity: 0.5,
    angle: 45,
    spacing: 8,
    thickness: 1.5,
  },
  vectorRegionSelectedPaint: {
    kind: "stripes",
    color: "#0ea5e9",
    opacity: 0.7,
    angle: 45,
    spacing: 8,
    thickness: 1.5,
  },
  // Padding defaults — diagonal stripes at accent-sky/50.
  paddingHoverPaint: {
    kind: "stripes",
    color: "#0ea5e9",
    opacity: 0.5,
    angle: 45,
    spacing: 8,
    thickness: 1.5,
  },
  paddingSelectedStroke: "#0ea5e9",
  paddingHandleFill: "#3b82f6",
  paddingHandleStroke: "#ffffff",
  // Transform-box defaults — quad outline in neutral-400 (muted stroke).
  // Handles are transparent by default; the visible affordance is
  // cursor + bounding-quad (Fitts'-reach via hit AABB).
  transformBoxStroke: "#a3a3a3",
  transformBoxHandleFill: "transparent",
  transformBoxHandleStroke: "#a3a3a3",
};

export function mergeStyle(
  base: HUDStyle,
  partial?: Partial<HUDStyle>
): HUDStyle {
  if (!partial) return base;
  return { ...base, ...partial };
}

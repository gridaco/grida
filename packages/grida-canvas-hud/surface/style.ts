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
   * own stroke style. Mirrors the main editor's gray-400 affordance stroke.
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
  // Vector chrome defaults — derived from the main editor's tokens:
  //   stroke-gray-400  → #9ca3af
  //   stroke-workbench-accent-sky → use the chrome color (host-themable)
  segmentIdleColor: "#9ca3af",
  segmentIdleWidth: 1,
  segmentActiveColor: "#2563eb",
  segmentActiveWidth: 3,
  segmentHoverOpacity: 0.5,
  tangentLineColor: "#9ca3af",
  tangentLineIdleWidth: 1,
  tangentLineActiveWidth: 2,
};

export function mergeStyle(
  base: HUDStyle,
  partial?: Partial<HUDStyle>
): HUDStyle {
  if (!partial) return base;
  return { ...base, ...partial };
}

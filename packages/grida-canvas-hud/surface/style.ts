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
};

export function mergeStyle(
  base: HUDStyle,
  partial?: Partial<HUDStyle>
): HUDStyle {
  if (!partial) return base;
  return { ...base, ...partial };
}

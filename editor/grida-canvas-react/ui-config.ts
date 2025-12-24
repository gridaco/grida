/**
 * Minimum node size in UI space (pixels) required to display the inner content overlay handle.
 * This avoids showing the handle when nodes are too small or far zoomed out,
 * ensuring the control stays within the node's bounds for the best user experience.
 *
 * applies to:
 * - corner radius
 * - gap
 * - padding
 * - ...
 */
export const MIN_NODE_OVERLAY_INNER_CONTENT_VISIBLE_UI_SIZE = 100;

/**
 * Minimum node size in UI space (pixels) required to display the corner radius overlay handle.
 * This avoids showing the handle when nodes are too small or far zoomed out,
 * ensuring the control stays within the node's bounds for the best user experience.
 */
export const MIN_NODE_OVERLAY_CORNER_RADIUS_VISIBLE_UI_SIZE = 100;

/**
 * Minimum node size in UI space (pixels) required to display the gap overlay handle.
 * This avoids showing the handle when nodes are too small or far zoomed out,
 * ensuring the control stays within the node's bounds for the best user experience.
 */
export const MIN_NODE_OVERLAY_GAP_VISIBLE_UI_SIZE = 100;

/**
 * Minimum node size in UI space (pixels) required to display the padding overlay handle.
 * This avoids showing the handle when nodes are too small or far zoomed out,
 * ensuring the control stays within the node's bounds for the best user experience.
 */
export const MIN_NODE_OVERLAY_PADDING_VISIBLE_UI_SIZE = 100;

/**
 * Minimum node size in UI space (pixels) required to display resize handles.
 * When nodes are smaller than this threshold (zoomed out), resize handles are hidden
 * to prioritize translate-drag region, making it easier to drag thin nodes like text.
 *
 * @remarks
 * The value should theoretically be calculated as: `(knob_width * n) + (n - 1) * gap`
 * where:
 * - `knob_width` is the physical size of each resize knob
 * - `n` is the number of knobs on a single axis (usually 2 for left/right or top/bottom, or 3 for left/center/right or top/center/bottom)
 * - `gap` is the spacing between knobs
 *
 * This ensures handles don't collapse or conflict with each other before they disappear.
 * Only consider a single axis (width or height) when calculating this value.
 */
export const MIN_NODE_OVERLAY_RESIZE_HANDLES_VISIBLE_UI_SIZE = 12;

/**
 * Border width in pixels for the dropzone highlight indication.
 * This controls the visual thickness of the border shown when dragging nodes
 * to indicate the target dropzone where they will be placed.
 */
export const DROPZONE_BORDER_WIDTH = 2;

/**
 * Minimum resize handle size in UI space (pixels) required for diagonal handles to have priority over NSWE handles.
 * When handles are smaller than this threshold in viewport space, NSWE handles (n/e/s/w) get higher z-order
 * for better accessibility, especially for W/E handles which serve as double-click hotspots for resize-to-fit.
 * When handles are larger than this threshold, diagonal handles maintain priority (current default behavior).
 */
export const MIN_RESIZE_HANDLE_SIZE_FOR_DIAGONAL_PRIORITY_UI_SIZE = 36;

/**
 * Z-index for the node title bar (floating bar).
 *
 * Must be higher than selection overlays so the title bar remains interactive,
 * but should remain below resize/rotation handles.
 *
 * @remarks
 * We keep this centralized so z-ordering can be tracked/tuned in one place.
 */
export const FLOATING_BAR_Z_INDEX = 999;

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

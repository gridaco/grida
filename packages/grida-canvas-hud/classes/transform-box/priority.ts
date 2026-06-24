// Transform-box — priority + sizing constants.
//
// Hit-priority slots (lower wins). See the doctrine note on
// priority-overrides being deferred — these are SDK-internal.

/**
 * 13 — wins over corner-radius (15) and everything below; loses to
 * padding-handle (12). Rotate grab should win over corner-radius if
 * both models overlap on the same node (free-transform case).
 */
export const TRANSFORM_BOX_CORNER_PRIORITY = 13;

/** 14 — peer to corners on this model; wins over corner-radius (15). */
export const TRANSFORM_BOX_SIDE_PRIORITY = 14;

/**
 * 15 — the outer rotate ring emitted only when `corner_role === "scale"`
 * (so corners scale and rotation lives just outside / around the corner,
 * the Figma model). Loses to the inner scale-corner knob (13) so the
 * corner's center scales while its surround rotates; wins over corner-
 * radius (15)'s peers below. Hosts can override per-handle via
 * `TransformBoxInput.priority`.
 */
export const TRANSFORM_BOX_ROTATE_RING_PRIORITY = 15;

/** Screen-px size of the outer rotate ring (a square centered on the
 *  corner, larger than the inner scale knob so its surround is grabbable). */
export const TRANSFORM_BOX_ROTATE_RING_HIT_SIZE = 32;

/**
 * 38 — body translate beats marquee start (40) and selection-translate
 * body (40); loses to padding-region (35), every resize control (30/31),
 * and every other handle.
 */
export const TRANSFORM_BOX_BODY_PRIORITY = 38;

/** Screen-px size of a corner knob (the rotate hit AABB). */
export const TRANSFORM_BOX_CORNER_HIT_SIZE = 16;

/** Screen-px thickness of a side mid-edge hit strip. */
export const TRANSFORM_BOX_SIDE_HIT_THICKNESS = 12;

// Vector-path — priority ladder.
//
// Hit-priority slots for vector chrome. Lower wins.
//
// - Tangents must outrank vertices (the tangent knob is usually OFFSET
//   from the vertex, so they rarely overlap; when they do — broken handles
//   collapsed onto the vertex — the user grabbed the more specific
//   control).
// - Vertices must outrank segments (clicking a vertex shouldn't
//   accidentally split the connected segment).
// - Segment strips are the lowest of the three (they cover the entire
//   path body and should lose to any specific control).
//
// Set below `HUDHitPriority.ENDPOINT_HANDLE` (10) so vector chrome wins
// during content-edit mode.

export const TANGENT_HANDLE_PRIORITY = 4;
export const VERTEX_HANDLE_PRIORITY = 5;

/**
 * Ghost insertion knob — sits between vertex (real, wins) and segment
 * (body, loses). The ghost is a transient control born of segment hover,
 * so a real vertex collapsed onto it should win, but ANY segment-body
 * click that lands on the knob should snap to the ghost's split action.
 */
export const GHOST_HANDLE_PRIORITY = 7;

export const SEGMENT_STRIP_PRIORITY = 8;

/**
 * Closed-loop "region" body — the lowest-priority vector control. Loses
 * to every specific control (vertex / tangent / ghost / segment-strip)
 * so a click on a control within the loop's bbox still reaches the
 * control. Wins over the implicit "no overlay" miss, so an empty-body
 * click selects the region instead of falling through to the empty-
 * space marquee.
 */
export const REGION_PRIORITY = 9;

/**
 * Highest priority value = loses to everything — used for decorative
 * segment outlines and tangent lines that should never absorb input.
 */
export const DECORATIVE_PRIORITY = 1000;

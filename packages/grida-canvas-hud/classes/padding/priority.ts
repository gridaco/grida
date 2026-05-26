// Padding — priority + sizing constants.
//
// `priority.ts` holds the class's hit-priority slots and the size constants
// the chrome ladder depends on. Owned by the SDK; never exposed to the host
// as a knob (per the doctrine's "priority overrides — deferred" rule).

/**
 * Padding drag-handle priority slot. Lower wins.
 *
 * 12 — wins over corner-radius (15), every resize control (≥30), translate
 * body (40), rotate (50). The handle sits at the inner edge of the padding
 * rect; in practice it doesn't overlap perimeter resize/rotate but the
 * priority is insurance.
 */
export const PADDING_HANDLE_PRIORITY = 12;

/**
 * Padding hover-region priority slot. Lower wins.
 *
 * 35 — wins over translate body (40), loses to all resize controls (30/31).
 * Clicking inside the padding zone of a selected flex container fires
 * padding hover instead of translate; clicking a corner still resizes.
 * The padding overlay paints over the selection chrome but loses to
 * the corner resize handles.
 */
export const PADDING_REGION_PRIORITY = 35;

/**
 * Screen-px length of the drag-handle's long axis. The short axis is
 * `PADDING_HANDLE_THICKNESS`. The 16×2 pill is sized for Fitts'-reach
 * without dominating the inset side rect visually.
 */
export const PADDING_HANDLE_LENGTH = 16;

/** Screen-px thickness of the drag-handle's short axis. */
export const PADDING_HANDLE_THICKNESS = 2;

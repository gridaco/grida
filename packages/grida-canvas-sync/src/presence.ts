/**
 * @module presence
 *
 * Presence state management. Presence is ephemeral (not persisted) and
 * relayed by the server to all peers in the same room.
 */

import type { PresenceState } from "./protocol";

/**
 * Merge incoming peer presence states with the current known set.
 * Entries not in `incoming` are removed (the server sends the full peer map).
 */
export function mergePresence(
  incoming: Readonly<Record<string, PresenceState>>
): Record<string, PresenceState> {
  // The server sends a full snapshot of all peer presence states.
  // We just accept it as-is — no local merging needed.
  return { ...incoming };
}

/** Check if a presence state has a visible cursor. */
export function hasVisibleCursor(p: PresenceState): boolean {
  return (
    p.cursor !== undefined &&
    p.profile !== undefined &&
    p.profile.color !== undefined
  );
}

export type ClockSample = { monotonic: number; wall: number };
export type ServerTimeAnchor = ClockSample & { server: number };

/** Server time plus elapsed browser time, independent of the visitor's clock offset. */
export function serverTime(anchor: ServerTimeAnchor, at: ClockSample): number {
  // Relative wall time covers OS sleep where performance.now pauses. A backwards
  // wall-clock correction cannot extend expiry; a forward correction fails closed.
  return (
    anchor.server +
    Math.max(0, at.monotonic - anchor.monotonic, at.wall - anchor.wall)
  );
}

/** Count HTML transit/hydration from request start rather than restarting its TTL. */
export function initialTimeAnchor(
  servedAt: number,
  at: ClockSample,
  requestStart = at.monotonic
): ServerTimeAnchor {
  return {
    server: servedAt,
    monotonic: requestStart,
    wall: at.wall - Math.max(0, at.monotonic - requestStart),
  };
}

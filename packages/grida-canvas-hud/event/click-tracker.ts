/**
 * Multi-click tracker.
 *
 * Counts consecutive clicks that arrive within a time and distance window.
 * Matches the behavior of native dblclick but is driven by the surface's
 * own dispatch loop — so it survives DOM-identity changes that would break
 * the browser's native handler.
 */
export interface ClickTrackerOptions {
  /** Max gap between clicks in ms. Default 500. */
  windowMs?: number;
  /** Max distance between clicks in screen px. Default 5. */
  distancePx?: number;
}

export class ClickTracker {
  private window_ms: number;
  private distance_px: number;
  private last_time = 0;
  private last_x = 0;
  private last_y = 0;
  private count = 0;

  constructor(opts: ClickTrackerOptions = {}) {
    this.window_ms = opts.windowMs ?? 500;
    this.distance_px = opts.distancePx ?? 5;
  }

  /**
   * Register a click at `(x, y)` and return the current consecutive-click
   * count (1 for single, 2 for double, etc.). `now` is in milliseconds.
   */
  register(x: number, y: number, now: number = nowMs()): number {
    const dt = now - this.last_time;
    const dx = x - this.last_x;
    const dy = y - this.last_y;
    const dist2 = dx * dx + dy * dy;
    const max2 = this.distance_px * this.distance_px;

    if (dt <= this.window_ms && dist2 <= max2 && this.count > 0) {
      this.count += 1;
    } else {
      this.count = 1;
    }

    this.last_time = now;
    this.last_x = x;
    this.last_y = y;
    return this.count;
  }

  reset(): void {
    this.count = 0;
    this.last_time = 0;
  }
}

function nowMs(): number {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

// Multi-click classifier — bedrock state machine.
//
// Counts consecutive clicks within a time + distance window. Same
// algorithm as the legacy `event/click-tracker.ts`; re-declared here
// so `core/` is import-isolated from legacy code.
//
// ## Why 250 ms (not the OS-default 500 ms)
//
// Win32 `GetDoubleClickTime`, `NSEvent.doubleClickInterval`, and
// Chromium's `kDoubleClickTimeMS` all default to 500 ms — calibrated
// for general-computing surfaces (file managers, hyperlinks) where a
// stray double-click is mildly costly and accessibility matters more
// than peak responsiveness.
//
// A direct-manipulation canvas inverts that calculus: single-click
// and double-click are both intentional, frequent, and on the same
// surface. 500 ms makes every single-click wait half a second before
// downstream commits "can be sure" it wasn't a dblclick — users feel
// the lag as "the canvas hesitates." Measured human double-click
// intervals cluster at 200–300 ms; the mobile-web's 300 ms tap-delay
// was famously judged laggy enough to remove across browsers.
//
// 250 ms sits below the human-average ceiling, safely above the
// realistic fast-double-click floor (~150 ms), and reads as snappy
// rather than "barely above the line." Canvas-tuned, not OS-bound —
// intentionally not configurable per default (sdk-design: "default
// is core, not customizable"; we accept an options bag for tests).

export interface ClickTrackerOptions {
  /** Max gap between clicks in ms. Default 250. */
  readonly windowMs?: number;
  /** Max distance between clicks in screen px. Default 5. */
  readonly distancePx?: number;
}

export class ClickTracker {
  private window_ms: number;
  private distance_px: number;
  private last_time = 0;
  private last_x = 0;
  private last_y = 0;
  private count = 0;

  constructor(opts: ClickTrackerOptions = {}) {
    this.window_ms = opts.windowMs ?? 250;
    this.distance_px = opts.distancePx ?? 5;
  }

  /**
   * Register a click at `(x, y)` and return the current consecutive-
   * click count (1 = single, 2 = double, etc.). `now` is in ms.
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

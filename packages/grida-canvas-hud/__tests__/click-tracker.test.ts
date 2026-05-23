import { describe, it, expect } from "vitest";
import { ClickTracker } from "../event/click-tracker";

describe("ClickTracker", () => {
  it("first click → 1", () => {
    const t = new ClickTracker();
    expect(t.register(10, 10, 1000)).toBe(1);
  });

  it("two clicks within window → 2", () => {
    const t = new ClickTracker();
    expect(t.register(10, 10, 1000)).toBe(1);
    expect(t.register(10, 10, 1200)).toBe(2);
  });

  it("triple-click counts up", () => {
    const t = new ClickTracker();
    t.register(10, 10, 0);
    t.register(10, 10, 100);
    expect(t.register(10, 10, 200)).toBe(3);
  });

  it("outside time window resets to 1", () => {
    const t = new ClickTracker({ windowMs: 100 });
    expect(t.register(10, 10, 0)).toBe(1);
    expect(t.register(10, 10, 500)).toBe(1);
  });

  it("outside distance window resets to 1", () => {
    const t = new ClickTracker({ distancePx: 3 });
    expect(t.register(10, 10, 0)).toBe(1);
    expect(t.register(30, 30, 50)).toBe(1);
  });

  // ── UX spec: canvas-tuned dblclick window (not OS-bound) ─────────────
  //
  // The OS-wide double-click default (Win32 GetDoubleClickTime, macOS
  // NSEvent.doubleClickInterval, Chromium kDoubleClickTimeMS) is 500 ms —
  // tuned for general computing where a stray dblclick is mildly costly.
  // A direct-manipulation canvas inverts that: single- and double-click
  // are both intentional and frequent on the same surface, and 500 ms
  // means every single-click feels like a half-second "hesitation."
  //
  // We pin **250 ms**: below the 200–300 ms human-average double-click
  // interval, above the realistic fast-double-click floor (~150 ms),
  // tighter than the 300 ms mobile tap-delay that browsers famously
  // removed for being too slow. The tests below lock the default so a
  // future maintainer can't silently drift it back to OS default.
  describe("canvas-tuned default window (250 ms)", () => {
    it("two clicks 200 ms apart are a double-click (well inside 250 ms)", () => {
      // 200 ms = the fast end of the measured human dblclick range.
      // Must count as 2.
      const t = new ClickTracker();
      expect(t.register(10, 10, 0)).toBe(1);
      expect(t.register(10, 10, 200)).toBe(2);
    });

    it("two clicks 250 ms apart still count (boundary is inclusive)", () => {
      // Exactly at the window. <= comparison, not <, so this is a 2.
      const t = new ClickTracker();
      expect(t.register(10, 10, 0)).toBe(1);
      expect(t.register(10, 10, 250)).toBe(2);
    });

    it("two clicks 300 ms apart do NOT count as a double-click", () => {
      // 300 ms = the mobile tap-delay that browsers removed for feeling
      // sluggish. We intentionally sit below it. A canvas dblclick this
      // slow is treated as two separate single-clicks.
      const t = new ClickTracker();
      expect(t.register(10, 10, 0)).toBe(1);
      expect(t.register(10, 10, 300)).toBe(1);
    });

    it("two clicks 500 ms apart (OS default) do NOT count — we are NOT OS-bound", () => {
      // The most important assertion in this file: a host MUST NOT be
      // able to assume canvas dblclick == OS dblclick. Direct-manipulation
      // surfaces beat the OS clock.
      const t = new ClickTracker();
      expect(t.register(10, 10, 0)).toBe(1);
      expect(t.register(10, 10, 500)).toBe(1);
    });
  });
});

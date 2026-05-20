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
});

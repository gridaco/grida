import { describe, expect, it } from "vitest";
import { MockLayoutEngine } from "../src/layout-engine";

describe("MockLayoutEngine", () => {
  it("returns 0 when text is empty", () => {
    const m = new MockLayoutEngine(() => "");
    expect(m.positionAtPoint(50, 0)).toBe(0);
  });

  it("maps x within the text to the nearest char boundary", () => {
    const m = new MockLayoutEngine(() => "hello", 10, 0);
    // Each char is 10 wide. x=0 → 0, x=15 → round(1.5) = 2, x=44 → 4.
    expect(m.positionAtPoint(0, 0)).toBe(0);
    expect(m.positionAtPoint(15, 0)).toBe(2);
    expect(m.positionAtPoint(44, 0)).toBe(4);
  });

  it("clamps past-end to text.length", () => {
    const m = new MockLayoutEngine(() => "hi", 10, 0);
    expect(m.positionAtPoint(999, 0)).toBe(2);
  });

  it("clamps before-start to 0", () => {
    const m = new MockLayoutEngine(() => "hi", 10, 0);
    expect(m.positionAtPoint(-50, 0)).toBe(0);
  });

  it("respects originX offset", () => {
    const m = new MockLayoutEngine(() => "hello", 10, 100);
    // x=100 → 0 (origin), x=120 → round((120-100)/10) = 2
    expect(m.positionAtPoint(100, 0)).toBe(0);
    expect(m.positionAtPoint(120, 0)).toBe(2);
  });
});

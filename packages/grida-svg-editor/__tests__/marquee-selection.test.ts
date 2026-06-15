// Executable shadow of `docs/marquee-selection.md`. Pure math — fake boxes —
// so every rule is provable headlessly. Describe/it text quotes the doc's
// rule names (shadow · escape · paint-order · additive) verbatim, so "did we
// drop a rule?" is grep-able across doc and code.

import { describe, expect, it } from "vitest";
import { marquee_selection } from "../src/selection/marquee";
import type { NodeId } from "../src/types";

const id = (s: string) => s as NodeId;
const mk = (
  name: string,
  x: number,
  y: number,
  width: number,
  height: number
): marquee_selection.Box => [id(name), { x, y, width, height }];

// A bigger rect A (behind) with a smaller rect B inside it (in front), plus a
// second front rect C in a corner. Array order = paint order: A is behind, B
// and C in front. z-order is load-bearing.
const A = mk("a", 0, 0, 400, 300); // 0..400 , 0..300
const B = mk("b", 100, 100, 80, 60); // 100..180 , 100..160
const C = mk("c", 300, 250, 50, 40); // 300..350 , 250..290
const BOXES = [A, B, C];

const r = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

/** The marquee rect from the gesture anchor to the current pointer
 *  (normalized), the way a live drag produces it. */
const marquee = (ax: number, ay: number, cx: number, cy: number) => ({
  x: Math.min(ax, cx),
  y: Math.min(ay, cy),
  width: Math.abs(cx - ax),
  height: Math.abs(cy - ay),
});

// ─── The worked example, verbatim (A: 0,0,100,100 · B: 40,40,20,20) ─────────

describe("marquee_selection — worked example, anchor at 30,30", () => {
  const EX = [mk("a", 0, 0, 100, 100), mk("b", 40, 40, 20, 20)];
  const at = (cx: number, cy: number) =>
    marquee_selection.hits(EX, marquee(30, 30, cx, cy));

  it("at the start (30,30): A is selected", () => {
    expect(at(30, 30)).toEqual([id("a")]);
  });

  it("dragged to 50,50 (inside A, now crossing B): ONLY B is selected", () => {
    expect(at(50, 50)).toEqual([id("b")]);
  });

  it("dragged to 110,110 (escaped A, still crossing B): A AND B are selected", () => {
    expect(at(110, 110)).toEqual([id("a"), id("b")]);
  });
});

// ─── shadow ────────────────────────────────────────────────────────────────

describe("marquee_selection.hits — shadow", () => {
  it("a marquee that starts inside A, touching nothing in front, selects A", () => {
    expect(marquee_selection.hits(BOXES, r(20, 20, 30, 30))).toEqual([id("a")]);
  });

  it("as the marquee enters B, only B is selected (A is shadowed by the front box)", () => {
    expect(marquee_selection.hits(BOXES, r(90, 90, 30, 30))).toEqual([id("b")]);
  });

  it("a front box swallowed by the marquee shadows the container behind it", () => {
    expect(marquee_selection.hits(BOXES, r(90, 90, 100, 100))).toEqual([
      id("b"),
    ]);
  });

  it("among stacked containers, only the front-most is selected", () => {
    const BACK = mk("back", 0, 0, 400, 300);
    const FRONT = mk("front", 50, 50, 200, 150);
    expect(marquee_selection.hits([BACK, FRONT], r(100, 100, 20, 20))).toEqual([
      id("front"),
    ]);
  });
});

// ─── escape ──────────────────────────────────────────────────────────────────

describe("marquee_selection.hits — escape", () => {
  it("when the rect leaves A while still crossing B, both A and B are selected", () => {
    expect(marquee_selection.hits(BOXES, r(-10, 90, 130, 40))).toEqual([
      id("a"),
      id("b"),
    ]);
  });

  it("once the rect leaves A and no longer touches B, only A is selected", () => {
    expect(marquee_selection.hits(BOXES, r(-50, -50, 80, 80))).toEqual([
      id("a"),
    ]);
  });
});

// ─── paint-order ─────────────────────────────────────────────────────────────

describe("marquee_selection.hits — paint-order", () => {
  it("a marquee escaping A and covering everything selects all, back → front", () => {
    expect(marquee_selection.hits(BOXES, r(-10, -10, 420, 320))).toEqual([
      id("a"),
      id("b"),
      id("c"),
    ]);
  });
});

// ─── edges ───────────────────────────────────────────────────────────────────

describe("marquee_selection.hits — edges", () => {
  it("exact-fit: A contains the rect and is shadowed by the front boxes it contains", () => {
    expect(marquee_selection.hits(BOXES, r(0, 0, 400, 300))).toEqual([
      id("b"),
      id("c"),
    ]);
  });

  it("exact-fit with nothing in front: the container is selected", () => {
    expect(marquee_selection.hits([A], r(0, 0, 400, 300))).toEqual([id("a")]);
  });

  it("one unit past A's edge makes A a normal hit, kept with the front boxes", () => {
    expect(marquee_selection.hits(BOXES, r(-1, 0, 401, 300))).toEqual([
      id("a"),
      id("b"),
      id("c"),
    ]);
  });

  it("a marquee touching nothing selects nothing", () => {
    expect(marquee_selection.hits(BOXES, r(500, 500, 10, 10))).toEqual([]);
  });
});

// ─── resolve — non-additive (replace) ──────────────────────────────────────

describe("marquee_selection.resolve — non-additive", () => {
  it("returns the hits, ignoring the baseline", () => {
    expect(
      marquee_selection.resolve(BOXES, r(90, 90, 30, 30), [id("c")])
    ).toEqual([id("b")]);
  });

  it("a marquee touching nothing clears the selection", () => {
    expect(
      marquee_selection.resolve(BOXES, r(500, 500, 10, 10), [id("b")])
    ).toEqual([]);
  });
});

// ─── additive ────────────────────────────────────────────────────────────────

describe("marquee_selection.resolve — additive", () => {
  it("unions fresh hits onto the gesture-start baseline, baseline first", () => {
    expect(
      marquee_selection.resolve(BOXES, r(90, 90, 30, 30), [id("c")], {
        additive: true,
      })
    ).toEqual([id("c"), id("b")]);
  });

  it("does not duplicate a baseline member the marquee also hits", () => {
    expect(
      marquee_selection.resolve(BOXES, r(90, 90, 30, 30), [id("b")], {
        additive: true,
      })
    ).toEqual([id("b")]);
  });

  it("releases freshly-added members on shrink while keeping the baseline", () => {
    const baseline = [id("c")];
    expect(
      marquee_selection.resolve(BOXES, r(-10, -10, 200, 200), baseline, {
        additive: true,
      })
    ).toEqual([id("c"), id("a"), id("b")]);
    expect(
      marquee_selection.resolve(BOXES, r(500, 500, 10, 10), baseline, {
        additive: true,
      })
    ).toEqual([id("c")]);
  });

  it("empty hits leave the baseline untouched", () => {
    expect(
      marquee_selection.resolve(
        BOXES,
        r(500, 500, 10, 10),
        [id("c"), id("b")],
        {
          additive: true,
        }
      )
    ).toEqual([id("c"), id("b")]);
  });
});

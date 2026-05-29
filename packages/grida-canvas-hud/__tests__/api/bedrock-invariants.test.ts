// Bedrock invariants — spec-level tests. Each test name IS the rule.
//
// These pin the contract of `primitives/overlay.ts`, `primitives/painter.ts`,
// and `core/` mechanism modules. They explicitly do NOT import from
// `classes/` or `surface/` (the deferred opinion layer).

import { describe, expect, it } from "vitest";
import type cmath from "@grida/cmath";

import type {
  HUDObject,
  HUDObjectPaintOnly,
  HUDObjectInteractive,
  HitShape,
} from "../../primitives/overlay";
import {
  MIN_HIT_SIZE,
  MIN_CHROME_VISIBLE_SIZE,
} from "../../primitives/overlay";
import type { Painter, PainterViewport } from "../../primitives/painter";
import { HitRegistry, shapeContains } from "../../core/hit-registry";
import { IDENTITY, type Transform } from "../../core/transform";

// ───────────────────────────────────────────────────────────────────────
// Section 1 — HUDObject generic + invariants
// ───────────────────────────────────────────────────────────────────────

describe("HUDObject<I> is generic over consumer-typed intent", () => {
  it("compiles with an arbitrary consumer intent type", () => {
    type MyIntent =
      | { kind: "my:click"; id: string }
      | { kind: "my:drag"; from: [number, number] };

    const o: HUDObject<MyIntent> = {
      group: "my-class",
      priority: 10,
      hit: { kind: "screen_aabb", rect: { x: 0, y: 0, width: 10, height: 10 } },
      render: { kind: "doc_rect", x: 0, y: 0, width: 10, height: 10 },
      intent: { kind: "my:click", id: "abc" },
    };

    // Test that `intent` is narrowed to MyIntent at the use site. The
    // narrowed branch's value is captured into a local first so the
    // assertion below is unconditional (eslint-plugin-jest's
    // no-conditional-expect rule).
    const click = o.intent?.kind === "my:click" ? o.intent : null;
    expect(click).not.toBeNull();
    expect(click?.id).toBe("abc");
  });
});

describe("HUDObject invariants", () => {
  it("paint-only: `render` required; `hit` / `intent` / `cursor` are forbidden", () => {
    const paintOnly: HUDObjectPaintOnly = {
      priority: 5,
      render: { kind: "doc_rect", x: 0, y: 0, width: 1, height: 1 },
    };
    // Type-level: assigning `hit` to a paint-only object is rejected.
    // The error fires on the `hit` property line (TS narrows `hit?: never`
    // and rejects the assignment), not the const declaration.
    const broken: HUDObjectPaintOnly = {
      priority: 5,
      render: { kind: "doc_rect", x: 0, y: 0, width: 1, height: 1 },
      // @ts-expect-error — paint-only must not carry `hit`.
      hit: { kind: "screen_aabb", rect: { x: 0, y: 0, width: 1, height: 1 } },
    };
    expect(paintOnly.priority).toBe(5);
    expect(broken).toBeDefined(); // referenced to avoid TS6133
  });

  it("interactive: `hit` required; `render` / `intent` / `cursor` optional", () => {
    const interactive: HUDObjectInteractive<{ kind: "x" }> = {
      priority: 5,
      hit: { kind: "screen_aabb", rect: { x: 0, y: 0, width: 1, height: 1 } },
    };
    expect(interactive.intent).toBeUndefined();
    expect(interactive.render).toBeUndefined();
  });

  it("neither `hit` nor `render` is not assignable to HUDObject", () => {
    // @ts-expect-error — an object with neither field belongs to no variant.
    const illegal: HUDObject = { priority: 1 };
    expect(illegal).toBeDefined(); // referenced to avoid TS6133
  });
});

// ───────────────────────────────────────────────────────────────────────
// Section 2 — Painter shape
// ───────────────────────────────────────────────────────────────────────

describe("Painter interface is exactly 4 methods", () => {
  it("a conforming Painter exposes beginFrame, setTransform, draw, endFrame and nothing else required", () => {
    // Type-level: an empty class is not a Painter; a minimal stub is.
    class Stub implements Painter {
      calls: string[] = [];
      beginFrame(_v: PainterViewport) {
        this.calls.push("beginFrame");
      }
      setTransform(_t: Transform) {
        this.calls.push("setTransform");
      }
      draw(_d: unknown) {
        this.calls.push("draw");
      }
      endFrame() {
        this.calls.push("endFrame");
      }
    }
    const p = new Stub();
    // Exercise the lifecycle once to pin the names.
    p.beginFrame({ w: 100, h: 100, dpr: 1 });
    p.setTransform(IDENTITY);
    p.draw({} as never);
    p.endFrame();
    expect(p.calls).toEqual(["beginFrame", "setTransform", "draw", "endFrame"]);
  });

  it("the interface has no methods beyond the four (type-level cardinality guard)", () => {
    // The runtime stub above only proves a 4-method object CONFORMS; it would
    // still pass if a 5th method were added to `Painter`. This pins the
    // cardinality at the type level: `_Extra` is non-`never` if a method is
    // added or renamed; `_Missing` is non-`never` if one is removed. Either
    // makes the `true` assignment fail to compile — so the "exactly 4" claim
    // in this block's name is enforced, not just asserted in prose.
    type _Expected = "beginFrame" | "setTransform" | "draw" | "endFrame";
    type _Extra = Exclude<keyof Painter, _Expected>;
    type _Missing = Exclude<_Expected, keyof Painter>;
    const _exact: [_Extra] extends [never]
      ? [_Missing] extends [never]
        ? true
        : false
      : false = true;
    expect(_exact).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Section 3 — HitRegistry behavior
// ───────────────────────────────────────────────────────────────────────

describe("HitRegistry: hit-absent objects are never returned by queryPoint", () => {
  it("paint-only objects covering a point return null", () => {
    const reg = new HitRegistry();
    reg.add({
      priority: 1,
      render: { kind: "doc_rect", x: 0, y: 0, width: 100, height: 100 },
    });
    expect(reg.queryPoint([10, 10], IDENTITY)).toBeNull();
  });
});

describe("HitRegistry: lower priority wins on overlap", () => {
  it("with two overlapping interactive objects, the lower-priority one wins", () => {
    const reg = new HitRegistry();
    reg.add({
      priority: 10,
      hit: {
        kind: "screen_aabb",
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
      label: "background",
    });
    reg.add({
      priority: 1,
      hit: {
        kind: "screen_aabb",
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
      label: "foreground",
    });
    expect(reg.queryPoint([50, 50], IDENTITY)?.label).toBe("foreground");
  });
});

describe("HitRegistry: later-added object wins on EQUAL priority", () => {
  it("on a priority tie, the most-recently-added containing object wins (matches the legacy HitRegions `<=` feel)", () => {
    const reg = new HitRegistry();
    reg.add({
      priority: 5,
      hit: {
        kind: "screen_aabb",
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
      label: "first",
    });
    reg.add({
      priority: 5,
      hit: {
        kind: "screen_aabb",
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
      label: "second",
    });
    expect(reg.queryPoint([50, 50], IDENTITY)?.label).toBe("second");
  });

  it("queryAll[0] equals queryPoint on a priority tie (the two query paths never disagree on the winner)", () => {
    const reg = new HitRegistry();
    reg.add({
      priority: 5,
      hit: {
        kind: "screen_aabb",
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
      label: "first",
    });
    reg.add({
      priority: 5,
      hit: {
        kind: "screen_aabb",
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
      label: "second",
    });
    const all = reg.queryAll([50, 50], IDENTITY);
    expect(all.map((o) => o.label)).toEqual(["second", "first"]);
    expect(all[0].label).toBe(reg.queryPoint([50, 50], IDENTITY)?.label);
  });
});

describe("HitRegistry: `refine` narrows a shape that already matched", () => {
  it("a refine returning false rejects the hit even though the shape contained the point", () => {
    const reg = new HitRegistry();
    reg.add({
      priority: 1,
      hit: {
        kind: "screen_aabb",
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
      // Curve-near style refinement: only accept points on the diagonal.
      refine: (p) => p[0] === p[1],
      label: "diagonal-only",
    });
    expect(reg.queryPoint([50, 50], IDENTITY)?.label).toBe("diagonal-only");
    expect(reg.queryPoint([50, 10], IDENTITY)).toBeNull(); // inside AABB, off-diagonal → refined out
  });

  it("queryAll honors refine symmetrically with queryPoint (no bbox-level phantom hits)", () => {
    const reg = new HitRegistry();
    reg.add({
      priority: 1,
      hit: {
        kind: "screen_aabb",
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
      refine: (p) => p[0] === p[1],
      label: "diagonal-only",
    });
    expect(reg.queryAll([50, 50], IDENTITY).map((o) => o.label)).toEqual([
      "diagonal-only",
    ]);
    expect(reg.queryAll([50, 10], IDENTITY)).toEqual([]); // off-diagonal → refined out of the list too
  });

  it("refine cannot widen — a point outside the shape never reaches refine", () => {
    let refineCalled = false;
    const reg = new HitRegistry();
    reg.add({
      priority: 1,
      hit: { kind: "screen_aabb", rect: { x: 0, y: 0, width: 10, height: 10 } },
      refine: () => {
        refineCalled = true;
        return true;
      },
      label: "x",
    });
    expect(reg.queryPoint([999, 999], IDENTITY)).toBeNull();
    expect(refineCalled).toBe(false); // shape containment fails first; refine never runs
  });
});

describe("HitRegistry: hover-only object (no intent) is still returned", () => {
  it("interactive without intent returns from queryPoint (consumer reads it for cursor/hover)", () => {
    const reg = new HitRegistry();
    reg.add({
      priority: 1,
      hit: { kind: "screen_aabb", rect: { x: 0, y: 0, width: 10, height: 10 } },
      label: "hover-only",
    });
    const hit = reg.queryPoint([5, 5], IDENTITY);
    expect(hit?.label).toBe("hover-only");
    expect(hit?.intent).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────
// Section 4 — HitShape variants cover non-AABB cases
// ───────────────────────────────────────────────────────────────────────

describe("HitShape coverage: non-AABB variants ship in bedrock", () => {
  it("screen_circle_at_doc rejects a point outside its radius", () => {
    const shape: HitShape = {
      kind: "screen_circle_at_doc",
      anchor_doc: [0, 0],
      radius: 5,
    };
    expect(shapeContains(shape, [3, 3], IDENTITY)).toBe(true); // sqrt(18) ≈ 4.24 < 5
    expect(shapeContains(shape, [10, 10], IDENTITY)).toBe(false);
  });

  it("screen_polygon detects points inside and outside a triangle", () => {
    const shape: HitShape = {
      kind: "screen_polygon",
      points: [
        [0, 0],
        [10, 0],
        [5, 10],
      ],
    };
    expect(shapeContains(shape, [5, 2], IDENTITY)).toBe(true);
    expect(shapeContains(shape, [0, 10], IDENTITY)).toBe(false);
  });

  it("screen_polygon handles rectangles with horizontal edges", () => {
    // The pointInPolygon `if (yi === yj) continue;` guard exists for
    // horizontal edges. A square has two horizontal edges (top + bottom)
    // and two vertical; both ends of `i` iterate through all four.
    const shape: HitShape = {
      kind: "screen_polygon",
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    };
    expect(shapeContains(shape, [5, 5], IDENTITY)).toBe(true);
    expect(shapeContains(shape, [-1, 5], IDENTITY)).toBe(false);
    expect(shapeContains(shape, [11, 5], IDENTITY)).toBe(false);
  });

  it("screen_obb hits a point inside the rotated rect but rejects a point inside the AABB outside the rotated rect", () => {
    // A 1×1 rect centered at the origin, rotated 45°. Its AABB on screen
    // spans roughly [-√2/2, √2/2] in both axes; its rotated bounds form
    // a diamond. A point at (0.5, 0.5) sits inside the AABB but OUTSIDE
    // the diamond — that's the case OBB exists to refute (vs AABB
    // inflation).
    //
    // We construct inverse_transform = R(-45°) so screen → shadow rotates
    // by -45°, then test the shadow point against the axis-aligned rect
    // centered at the origin with size 1×1.
    const cos = Math.SQRT1_2;
    const sin = Math.SQRT1_2;
    // R(-θ): [[cos, sin, 0], [-sin, cos, 0]]
    const inv = [
      [cos, sin, 0],
      [-sin, cos, 0],
    ] as const;
    const shape: HitShape = {
      kind: "screen_obb",
      rect: { x: -0.5, y: -0.5, width: 1, height: 1 },
      inverse_transform: inv as unknown as cmath.Transform,
    };
    // (0, 0) — center, always inside.
    expect(shapeContains(shape, [0, 0], IDENTITY)).toBe(true);
    // (0.4, 0) — well inside the diamond (the diamond extends to ±√2/2 ≈ 0.707 along axes).
    expect(shapeContains(shape, [0.4, 0], IDENTITY)).toBe(true);
    // (0.5, 0.5) — inside the AABB, but in shadow space this becomes
    // (cos·0.5 + sin·0.5, -sin·0.5 + cos·0.5) = (√2/2 ≈ 0.707, 0). The
    // shadow point's x = 0.707 is OUTSIDE the rect's x ∈ [-0.5, 0.5].
    expect(shapeContains(shape, [0.5, 0.5], IDENTITY)).toBe(false);
  });
});

describe("MIN_HIT_SIZE and MIN_CHROME_VISIBLE_SIZE are bedrock constants", () => {
  it("MIN_HIT_SIZE = 16 (Fitts-comfortable handle hit-pad)", () => {
    expect(MIN_HIT_SIZE).toBe(16);
  });
  it("MIN_CHROME_VISIBLE_SIZE = 12 (below this, chrome suppresses)", () => {
    expect(MIN_CHROME_VISIBLE_SIZE).toBe(12);
  });
});

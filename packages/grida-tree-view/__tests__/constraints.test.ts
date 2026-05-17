import { describe, expect, it } from "vitest";
import {
  allOf,
  disallowDescendant,
  onlyIntoContainers,
  resolveDropPosition,
  sameParentOnly,
} from "..";
import { buildFixture } from "./_helpers";

describe("onlyIntoContainers", () => {
  it("rejects 'into' over a non-container", () => {
    const src = buildFixture();
    const c = onlyIntoContainers();
    expect(
      c.canMove(
        ["a1"],
        { parent: "c", index: 0, placement: "into", over: "c" },
        src
      )
    ).toBe(false);
  });
  it("coerces 'into' over a non-container to 'after'", () => {
    const src = buildFixture();
    const c = onlyIntoContainers();
    const raw = {
      parent: "c",
      index: 0,
      placement: "into",
      over: "c",
    } as const;
    const coerced = c.resolveDropPosition!(["a1"], raw, src);
    expect(coerced).not.toBeNull();
    expect(coerced!.placement).toBe("after");
    expect(coerced!.parent).toBe("<root>");
    expect(coerced!.index).toBe(3); // c is at index 2 → after = 3
  });
});

describe("sameParentOnly", () => {
  it("rejects cross-parent moves", () => {
    const src = buildFixture();
    const c = sameParentOnly();
    expect(
      c.canMove(
        ["a1"],
        { parent: "<root>", index: 0, placement: "before", over: "a" },
        src
      )
    ).toBe(false);
    expect(
      c.canMove(
        ["a1"],
        { parent: "a", index: 1, placement: "after", over: "a1" },
        src
      )
    ).toBe(true);
  });
});

describe("disallowDescendant", () => {
  it("rejects dropping into own subtree", () => {
    const src = buildFixture();
    const c = disallowDescendant();
    expect(
      c.canMove(
        ["a"],
        { parent: "a", index: 0, placement: "into", over: "a" },
        src
      )
    ).toBe(false);
  });
});

describe("allOf composes", () => {
  it("AND of canMove and chained resolveDropPosition", () => {
    const src = buildFixture();
    const c = allOf(onlyIntoContainers(), disallowDescendant());
    // into 'a' (container, not own subtree) is OK
    expect(
      c.canMove(
        ["c"],
        { parent: "a", index: 0, placement: "into", over: "a" },
        src
      )
    ).toBe(true);
    // resolveDropPosition runs onlyIntoContainers, then disallowDescendant
    // 'into' over 'c' (non-container) → coerced to after c at root
    const raw = {
      parent: "c",
      index: 0,
      placement: "into",
      over: "c",
    } as const;
    const res = c.resolveDropPosition!(["a"], raw, src);
    expect(res!.placement).toBe("after");
  });
});

describe("resolveDropPosition (insertion-index math)", () => {
  it("computes index after removing items from same parent (inverse-order fix)", () => {
    const src = buildFixture();
    // parent is <root>, children: a, b, c.  Move 'a' to be after 'b'.
    // After filtering out 'a': [b, c]. b's index is 0. 'after b' → index 1.
    const pos = resolveDropPosition(src, ["a"], "b", "after");
    expect(pos).toEqual({
      parent: "<root>",
      index: 1,
      placement: "after",
      over: "b",
    });
  });

  it("'into' returns children-length after removing items", () => {
    const src = buildFixture();
    const pos = resolveDropPosition(src, ["a1"], "a", "into");
    // 'a' has [a1, a2]. Removing a1: [a2]. Append index = 1.
    expect(pos).toEqual({
      parent: "a",
      index: 1,
      placement: "into",
      over: "a",
    });
  });

  it("returns null for 'before'/'after' on root", () => {
    const src = buildFixture();
    expect(resolveDropPosition(src, ["a"], "<root>", "before")).toBeNull();
  });

  it("horizontal-aware: 'after a2' at desiredDepth=0 pops out to 'after a' at root", () => {
    const src = buildFixture();
    // a2 is the LAST child of a (children: [a1, a2]). The pivot is
    // boundary-valid → walk up to a → 'after a' at root.
    const pos = resolveDropPosition(src, [], "a2", "after", 0);
    expect(pos).toEqual({
      parent: "<root>",
      index: 1, // a is index 0, after a → 1
      placement: "after",
      over: "a2",
    });
  });

  it("horizontal-aware: 'after a1' at desiredDepth=0 is refused — a1 isn't the last child", () => {
    const src = buildFixture();
    // a1 is NOT the last child of a. Popping out would visually drop the
    // new row inside a's parent at an unrelated position. Should fall
    // back to the over row's depth (after a1 inside a).
    const pos = resolveDropPosition(src, [], "a1", "after", 0);
    expect(pos).toMatchObject({ parent: "a", placement: "after" });
  });

  it("horizontal-aware: 'before' never pivots — even from a first-child boundary", () => {
    const src = buildFixture();
    // The `before` placement does not honor desiredDepth. The "before
    // first-child" position visually coincides with "insert at index 0
    // inside the parent" — supporting a pivot here would let the same
    // cursor resolve to two different drops based on x. Only `after`
    // pivots out.
    const pos = resolveDropPosition(src, [], "a1", "before", 0);
    expect(pos).toMatchObject({ parent: "a", placement: "before" });
  });

  it("horizontal-aware: desiredDepth >= over depth is a no-op (anchor stays at over)", () => {
    const src = buildFixture();
    const pos = resolveDropPosition(src, [], "a1", "after", 1);
    expect(pos).toMatchObject({ parent: "a", placement: "after" });
  });
});

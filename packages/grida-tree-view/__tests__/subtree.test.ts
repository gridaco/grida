import { describe, expect, it } from "vitest";
import { subtreeMembership } from "..";
import { buildFixture, buildLinear } from "./_helpers";

describe("subtreeMembership", () => {
  it("returns the inclusive subtree of a single anchor", () => {
    const src = buildFixture();
    const set = subtreeMembership(src, ["a"]);
    expect([...set].sort()).toEqual(["a", "a1", "a2"]);
  });

  it("excludes the anchor with { inclusive: false }", () => {
    const src = buildFixture();
    const set = subtreeMembership(src, ["a"], { inclusive: false });
    expect([...set].sort()).toEqual(["a1", "a2"]);
  });

  it("returns the union for multiple anchors", () => {
    const src = buildFixture();
    const set = subtreeMembership(src, ["a", "c"]);
    expect([...set].sort()).toEqual(["a", "a1", "a2", "c"]);
  });

  it("dedupes overlapping subtrees (anchor + its child)", () => {
    const src = buildFixture();
    const set = subtreeMembership(src, ["a", "a1"]);
    expect([...set].sort()).toEqual(["a", "a1", "a2"]);
  });

  it("returns just the leaves when all anchors are leaves", () => {
    const src = buildFixture();
    const set = subtreeMembership(src, ["a1", "c"]);
    expect([...set].sort()).toEqual(["a1", "c"]);
  });

  it("returns empty when given no anchors", () => {
    const src = buildFixture();
    expect(subtreeMembership(src, [])).toEqual(new Set());
  });

  it("silently skips unknown anchors", () => {
    const src = buildFixture();
    const set = subtreeMembership(src, ["a", "ghost"]);
    expect([...set].sort()).toEqual(["a", "a1", "a2"]);
  });

  it("walks a deep linear chain inclusively", () => {
    const src = buildLinear(5);
    const set = subtreeMembership(src, ["n0"]);
    expect([...set].sort()).toEqual(["n0", "n1", "n2", "n3", "n4"]);
  });
});

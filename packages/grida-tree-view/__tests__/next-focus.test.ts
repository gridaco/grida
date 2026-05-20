import { describe, expect, it } from "vitest";
import { findByLabelPrefix, nextFocusAfterRemove, TreeController } from "..";
import { buildFixture } from "./_helpers";

function rowsExpanded(): TreeController {
  const src = buildFixture();
  return new TreeController({ source: src, expanded: ["a"] });
}

describe("nextFocusAfterRemove", () => {
  it("returns null when removed is empty", () => {
    const c = rowsExpanded();
    expect(nextFocusAfterRemove(c.getRows(), [])).toBeNull();
  });

  it("returns null when no removed row is in the list", () => {
    const c = rowsExpanded();
    expect(nextFocusAfterRemove(c.getRows(), ["ghost"])).toBeNull();
  });

  it("picks the next sibling after a single-row delete in the middle", () => {
    // Rows (expanded a): a, a1, a2, b, c
    const c = rowsExpanded();
    expect(nextFocusAfterRemove(c.getRows(), ["a1"])).toBe("a2");
  });

  it("picks the previous row when the deleted is the last row", () => {
    const c = rowsExpanded();
    expect(nextFocusAfterRemove(c.getRows(), ["c"])).toBe("b");
  });

  it("picks the row after a contiguous range", () => {
    const c = rowsExpanded();
    expect(nextFocusAfterRemove(c.getRows(), ["a1", "a2"])).toBe("b");
  });

  it("picks the row after a non-contiguous range, by the last removed index", () => {
    const c = rowsExpanded();
    // Removing a1 and b: rows after b is c.
    expect(nextFocusAfterRemove(c.getRows(), ["a1", "b"])).toBe("c");
  });

  it("falls back to the parentId when everything after and before is gone", () => {
    const c = rowsExpanded();
    // Remove every visible row except a (the container). The fallback
    // for a1/a2/b/c should be a (parent of a1/a2) — picked because the
    // walk-up finds a in the row list.
    const rows = c.getRows();
    const allButA = rows.filter((r) => r.id !== "a").map((r) => r.id);
    expect(nextFocusAfterRemove(rows, allButA)).toBe("a");
  });

  it("returns null when the parent walk-up hits a non-visible ancestor", () => {
    // Default fixture hides the root; remove every visible row.
    const c = rowsExpanded();
    const all = c.getRows().map((r) => r.id);
    expect(nextFocusAfterRemove(c.getRows(), all)).toBeNull();
  });
});

describe("findByLabelPrefix", () => {
  function controller() {
    const src = buildFixture();
    return new TreeController({ source: src, expanded: ["a"] });
  }
  const getLabel = (id: string) => id;

  it("returns null for empty prefix", () => {
    const c = controller();
    expect(findByLabelPrefix(c.getRows(), "", { getLabel })).toBeNull();
  });

  it("returns null for empty row list", () => {
    expect(findByLabelPrefix([], "a", { getLabel })).toBeNull();
  });

  it("finds the first matching row from the top by default", () => {
    const c = controller();
    expect(findByLabelPrefix(c.getRows(), "a", { getLabel })).toBe("a");
  });

  it("uses prefix matching, not substring", () => {
    const c = controller();
    // "1" doesn't start any row id; "a1" does.
    expect(findByLabelPrefix(c.getRows(), "1", { getLabel })).toBeNull();
    expect(findByLabelPrefix(c.getRows(), "a1", { getLabel })).toBe("a1");
  });

  it("is case-insensitive by default", () => {
    const c = controller();
    expect(findByLabelPrefix(c.getRows(), "A", { getLabel })).toBe("a");
  });

  it("honors caseSensitive: true", () => {
    const c = controller();
    expect(
      findByLabelPrefix(c.getRows(), "A", { getLabel, caseSensitive: true })
    ).toBeNull();
  });

  it("starts after startAfterId and wraps around", () => {
    // Rows: a, a1, a2, b, c. Searching 'a' starting after 'a' should hit a1.
    const c = controller();
    expect(
      findByLabelPrefix(c.getRows(), "a", { getLabel, startAfterId: "a" })
    ).toBe("a1");
    // Starting after 'a2' should wrap and find 'a' again.
    expect(
      findByLabelPrefix(c.getRows(), "a", { getLabel, startAfterId: "a2" })
    ).toBe("a");
  });

  it("falls back to row id when getLabel is omitted", () => {
    const c = controller();
    expect(findByLabelPrefix(c.getRows(), "b")).toBe("b");
  });
});

describe("controller.reveal", () => {
  it("expands ancestors, focuses, and selects", () => {
    const src = buildFixture();
    const c = new TreeController({ source: src }); // nothing expanded
    expect(c.isExpanded("a")).toBe(false);
    c.reveal("a1");
    expect(c.isExpanded("a")).toBe(true);
    expect(c.getFocused()).toBe("a1");
    expect(c.getSelection()).toEqual(["a1"]);
  });

  it("skips selection when opts.select === false", () => {
    const src = buildFixture();
    const c = new TreeController({ source: src });
    c.reveal("a2", { select: false });
    expect(c.getFocused()).toBe("a2");
    expect(c.getSelection()).toEqual([]);
  });
});

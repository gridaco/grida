import { describe, expect, it } from "vitest";
import {
  ancestorAtRowDepth,
  flattenForRender,
  RowsSnapshot,
  rowDepthOf,
  TreeController,
} from "..";
import { buildFixture } from "./_helpers";

describe("flattenForRender", () => {
  it("hides root by default; only renders root's children when collapsed", () => {
    const src = buildFixture();
    const rows = flattenForRender(src, new Set());
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    for (const r of rows) expect(r.depth).toBe(0);
  });

  it("expands a container in document order", () => {
    const src = buildFixture();
    const rows = flattenForRender(src, new Set(["a"]));
    expect(rows.map((r) => r.id)).toEqual(["a", "a1", "a2", "b", "c"]);
    expect(rows.find((r) => r.id === "a1")!.depth).toBe(1);
  });

  it("reverses children when configured (layer-panel convention)", () => {
    const src = buildFixture();
    const rows = flattenForRender(src, new Set(["a"]), {
      reverseChildren: true,
    });
    expect(rows.map((r) => r.id)).toEqual(["c", "b", "a", "a2", "a1"]);
  });

  it("marks containers based on source.isContainer / fallback to children.length", () => {
    const src = buildFixture();
    const rows = flattenForRender(src, new Set());
    expect(rows.find((r) => r.id === "a")!.isContainer).toBe(true);
    expect(rows.find((r) => r.id === "b")!.isContainer).toBe(false); // empty
    expect(rows.find((r) => r.id === "c")!.isContainer).toBe(false);
  });
});

describe("RowsSnapshot", () => {
  it("returns identity-stable rows when nothing changed", () => {
    const src = buildFixture();
    const snap = new RowsSnapshot();
    const a = snap.get(src, new Set(), 0, {});
    const b = snap.get(src, new Set(), 0, {});
    expect(a).toBe(b);
  });

  it("rebuilds on source version bump", () => {
    const src = buildFixture();
    const snap = new RowsSnapshot();
    const a = snap.get(src, new Set(), 0, {});
    src.insertChild("<root>", { id: "d", parent: "<root>", children: [] });
    const b = snap.get(src, new Set(), 0, {});
    expect(a).not.toBe(b);
    expect(b.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("rebuilds on expanded revision change", () => {
    const src = buildFixture();
    const snap = new RowsSnapshot();
    const a = snap.get(src, new Set(), 0, {});
    const b = snap.get(src, new Set(["a"]), 1, {});
    expect(a).not.toBe(b);
    expect(b).toHaveLength(5);
  });
});

describe("depth helpers", () => {
  it("rowDepthOf matches Row.depth for hidden-root flattening", () => {
    const src = buildFixture();
    expect(rowDepthOf(src, "a")).toBe(0);
    expect(rowDepthOf(src, "a1")).toBe(1);
  });

  it("ancestorAtRowDepth walks up to the requested depth", () => {
    const src = buildFixture();
    expect(ancestorAtRowDepth(src, "a1", 0)).toBe("a");
    expect(ancestorAtRowDepth(src, "a1", 1)).toBe("a1");
    // Asking for a deeper depth than the row itself is unsatisfiable.
    expect(ancestorAtRowDepth(src, "a", 1)).toBeNull();
  });
});

describe("TreeController.getRows", () => {
  it("is stable across same-state calls", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    expect(ctrl.getRows()).toBe(ctrl.getRows());
  });

  it("changes after expand", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    const a = ctrl.getRows();
    ctrl.expand("a");
    expect(ctrl.getRows()).not.toBe(a);
    expect(ctrl.getRows().map((r) => r.id)).toEqual([
      "a",
      "a1",
      "a2",
      "b",
      "c",
    ]);
  });
});

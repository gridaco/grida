import { describe, expect, it, vi } from "vitest";
import {
  createDrag,
  disallowDescendant,
  resolveDropPosition,
  TreeController,
} from "..";
import { buildFixture } from "./_helpers";

describe("drag handle", () => {
  it("starts in move mode by default", () => {
    const src = buildFixture();
    const h = createDrag({ source: src, items: ["a1"] });
    expect(h.getMode()).toBe("move");
  });

  it("setMode flips and notifies", () => {
    const src = buildFixture();
    const onChange = vi.fn<() => void>();
    const h = createDrag({ source: src, items: ["a1"], onChange });
    onChange.mockClear();
    h.setMode("copy");
    expect(h.getMode()).toBe("copy");
    expect(onChange).toHaveBeenCalledTimes(1);
    // no-op flip
    h.setMode("copy");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("over() notifies only when the resolved position changes", () => {
    const src = buildFixture();
    const onChange = vi.fn<() => void>();
    const h = createDrag({ source: src, items: ["a1"], onChange });
    onChange.mockClear();

    // First resolve → one notify.
    const p1 = h.over("b", "into");
    expect(p1).not.toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);

    // Same target/placement again (every pointer-move) → no re-notify.
    h.over("b", "into");
    h.over("b", "into");
    expect(onChange).toHaveBeenCalledTimes(1);

    // A genuinely different position → notify again.
    const p2 = h.over("c", "before");
    expect(p2).not.toBeNull();
    expect(p2).not.toEqual(p1);
    expect(onChange).toHaveBeenCalledTimes(2);

    // Transition to "no valid drop" notifies once, then stays quiet.
    expect(h.over("a1", "into")).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(h.over("a1", "into")).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("over() computes a valid drop position", () => {
    const src = buildFixture();
    const h = createDrag({ source: src, items: ["a1"] });
    const pos = h.over("b", "into");
    expect(pos).toEqual({
      parent: "b",
      index: 0,
      placement: "into",
      over: "b",
    });
  });

  it("refuses to drop into own subtree", () => {
    const src = buildFixture();
    const h = createDrag({
      source: src,
      items: ["a"],
      constraint: disallowDescendant(),
    });
    expect(h.over("a", "into")).toBeNull();
    expect(h.over("a1", "into")).toBeNull();
  });

  it("drop() returns the latest valid position; cancel invalidates", () => {
    const src = buildFixture();
    const h = createDrag({ source: src, items: ["a1"] });
    h.over("b", "into");
    expect(h.drop()).not.toBeNull();
    h.cancel();
    expect(h.drop()).toBeNull();
  });
});

describe("reversed-list drag (F10)", () => {
  // <root>.children = [a, b, c] in document order. Rendered reversed
  // (layer-panel convention), the user sees [c, b, a] top→bottom.

  it("flips before/after so the document index matches the rendered order", () => {
    const src = buildFixture();
    // Visual "before b" (new row appears above b on screen) is, in
    // document order, *after* b.
    expect(
      resolveDropPosition(src, [], "b", "before", { reversed: true })
    ).toEqual({ parent: "<root>", index: 2, placement: "after", over: "b" });
    // Visual "after b" → document *before* b.
    expect(
      resolveDropPosition(src, [], "b", "after", { reversed: true })
    ).toEqual({ parent: "<root>", index: 1, placement: "before", over: "b" });
  });

  it("leaves `into` orientation-independent", () => {
    const src = buildFixture();
    expect(
      resolveDropPosition(src, [], "a", "into", { reversed: true })
    ).toEqual(resolveDropPosition(src, [], "a", "into"));
  });

  it("non-reversed default is unchanged", () => {
    const src = buildFixture();
    expect(resolveDropPosition(src, [], "b", "before")).toEqual({
      parent: "<root>",
      index: 1,
      placement: "before",
      over: "b",
    });
  });

  it("createDrag({ reversed }) threads through over()", () => {
    const src = buildFixture();
    const h = createDrag({ source: src, items: ["c"], reversed: true });
    // Dragging c (filtered out), hovering a, visual "before" → after a.
    expect(h.over("a", "before")).toEqual({
      parent: "<root>",
      index: 1,
      placement: "after",
      over: "a",
    });
  });

  it("TreeController passes flatten.reverseChildren into the drag", () => {
    const ctrl = new TreeController({
      source: buildFixture(),
      flatten: { reverseChildren: true },
    });
    const handle = ctrl.startDrag(["a1"]);
    handle.over("b", "before"); // visual before b → document after b
    expect(ctrl.commitDrag()).toMatchObject({
      kind: "move",
      items: ["a1"],
      to: { parent: "<root>", index: 2, placement: "after" },
    });
  });
});

describe("controller drag → commit → intent", () => {
  it("emits a move intent with final mode and position", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    const intents: unknown[] = [];
    ctrl.subscribe("intent", (i) => intents.push(i));
    const handle = ctrl.startDrag(["a1"]);
    handle.over("b", "into");
    handle.setMode("copy");
    const result = ctrl.commitDrag();
    expect(result).toMatchObject({
      kind: "copy",
      items: ["a1"],
      to: { parent: "b", placement: "into" },
    });
    expect(intents).toHaveLength(1);
  });
});

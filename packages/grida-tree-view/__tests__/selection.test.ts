import { describe, expect, it } from "vitest";
import {
  InMemorySelectionAdapter,
  applySelection,
  modeFromEvent,
  TreeController,
} from "..";
import { buildFixture } from "./_helpers";

describe("applySelection", () => {
  it("replace overwrites", () => {
    expect(applySelection(["a"], ["b"], "replace")).toEqual(["b"]);
  });
  it("add unions", () => {
    expect(applySelection(["a"], ["b"], "add")).toEqual(["a", "b"]);
    expect(applySelection(["a", "b"], ["b"], "add")).toEqual(["a", "b"]);
  });
  it("toggle xors per-id", () => {
    expect(applySelection(["a", "b"], ["b"], "toggle")).toEqual(["a"]);
    expect(applySelection(["a"], ["b"], "toggle")).toEqual(["a", "b"]);
  });
  it("range overwrites (caller is responsible for expansion)", () => {
    expect(applySelection(["a"], ["b", "c"], "range")).toEqual(["b", "c"]);
  });
});

describe("modeFromEvent", () => {
  it("shift wins over meta/ctrl", () => {
    expect(modeFromEvent({ shiftKey: true, metaKey: true })).toBe("range");
  });
  it("meta or ctrl → toggle", () => {
    expect(modeFromEvent({ metaKey: true })).toBe("toggle");
    expect(modeFromEvent({ ctrlKey: true })).toBe("toggle");
  });
  it("none → replace", () => {
    expect(modeFromEvent({})).toBe("replace");
  });
});

describe("TreeController.select", () => {
  it("range expands over the visible row list", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    ctrl.expand("a"); // visible: a, a1, a2, b, c
    ctrl.select(["a"], "replace");
    ctrl.select(["c"], "range");
    expect(ctrl.getSelection()).toEqual(["a", "a1", "a2", "b", "c"]);
  });

  it("toggle flips individual ids", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    ctrl.select(["a"], "replace");
    ctrl.select(["b"], "toggle");
    expect([...ctrl.getSelection()].sort()).toEqual(["a", "b"]);
    ctrl.select(["a"], "toggle");
    expect(ctrl.getSelection()).toEqual(["b"]);
  });
});

describe("InMemorySelectionAdapter", () => {
  it("notifies subscribers on change", () => {
    const sel = new InMemorySelectionAdapter();
    let n = 0;
    sel.subscribe(() => n++);
    sel.set(["a"], "replace");
    sel.set(["a"], "replace"); // no-op
    sel.set(["b"], "replace");
    expect(n).toBe(2);
  });
});

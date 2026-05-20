import { describe, expect, it } from "vitest";
import {
  defaultKeymap,
  keyComboOf,
  lookupAction,
  TreeController,
  type Keymap,
} from "..";
import { buildFixture } from "./_helpers";

describe("keyComboOf", () => {
  it("formats Mod+Shift order", () => {
    expect(keyComboOf({ key: "A", metaKey: true, shiftKey: true })).toBe(
      "Mod+Shift+A"
    );
    expect(keyComboOf({ key: "ArrowUp", shiftKey: true })).toBe(
      "Shift+ArrowUp"
    );
    expect(keyComboOf({ key: "F2" })).toBe("F2");
  });
});

describe("lookupAction fallback", () => {
  it("falls back to the bare key when no modified entry matches", () => {
    expect(lookupAction({ key: "ArrowUp" }, defaultKeymap)).toBe("focus-prev");
    // 'Shift+ArrowUp' is explicit in defaultKeymap
    expect(
      lookupAction({ key: "ArrowUp", shiftKey: true }, defaultKeymap)
    ).toBe("focus-prev");
  });
});

describe("controller.keyDown with defaultKeymap", () => {
  it("ArrowDown moves focus to first row when none focused", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    const r = ctrl.keyDown({ key: "ArrowDown" });
    expect(r.handled).toBe(true);
    expect(ctrl.getFocused()).toBe("a");
  });

  it("ArrowRight expands a container", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    ctrl.focus("a");
    ctrl.keyDown({ key: "ArrowRight" });
    expect(ctrl.isExpanded("a")).toBe(true);
  });

  it("ArrowLeft collapses an expanded row, else jumps to parent", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    ctrl.expand("a");
    ctrl.focus("a1");
    ctrl.keyDown({ key: "ArrowLeft" });
    expect(ctrl.getFocused()).toBe("a");
    ctrl.keyDown({ key: "ArrowLeft" });
    expect(ctrl.isExpanded("a")).toBe(false);
  });

  it("Enter emits a rename intent for the focused row", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    ctrl.focus("b");
    const intents: unknown[] = [];
    ctrl.subscribe("intent", (i) => intents.push(i));
    ctrl.keyDown({ key: "Enter" });
    expect(intents).toEqual([{ kind: "rename", id: "b" }]);
  });

  it("Delete emits a delete intent for the current selection", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    ctrl.select(["b", "c"], "replace");
    const intents: unknown[] = [];
    ctrl.subscribe("intent", (i) => intents.push(i));
    ctrl.keyDown({ key: "Delete" });
    expect(intents).toEqual([{ kind: "delete", ids: ["b", "c"] }]);
  });

  it("respects a reduced keymap (graphics-tool subset)", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    ctrl.focus("a");
    const reduced: Keymap = { ...defaultKeymap, ArrowRight: undefined };
    const r = ctrl.keyDown({ key: "ArrowRight" }, reduced);
    expect(r.handled).toBe(false);
    expect(ctrl.isExpanded("a")).toBe(false);
  });

  it("Space selects the focused row (replace by default)", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    ctrl.focus("b");
    ctrl.keyDown({ key: " " });
    expect(ctrl.getSelection()).toEqual(["b"]);
  });

  it("Cmd+Space toggles selection on the focused row", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    ctrl.select(["a"], "replace");
    ctrl.focus("b");
    ctrl.keyDown({ key: " ", metaKey: true });
    expect([...ctrl.getSelection()].sort()).toEqual(["a", "b"]);
  });

  it("Cmd+A selects all visible rows", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    ctrl.expand("a");
    ctrl.keyDown({ key: "A", metaKey: true });
    expect(ctrl.getSelection()).toEqual(["a", "a1", "a2", "b", "c"]);
  });

  it("Shift+ArrowDown extends selection as a range", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    ctrl.expand("a");
    ctrl.select(["a"], "replace");
    ctrl.focus("a");
    ctrl.keyDown({ key: "ArrowDown", shiftKey: true });
    expect(ctrl.getFocused()).toBe("a1");
    expect(ctrl.getSelection()).toEqual(["a", "a1"]);
  });
});

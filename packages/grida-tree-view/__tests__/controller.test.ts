import { describe, expect, it, vi } from "vitest";
import { TreeController } from "..";
import { buildFixture } from "./_helpers";

describe("TreeController channels", () => {
  it("emits 'rows' on expand, 'expanded' on expand, 'selection' on select", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    const rows = vi.fn<() => void>();
    const expanded = vi.fn<() => void>();
    const selection = vi.fn<() => void>();
    ctrl.subscribe("rows", rows);
    ctrl.subscribe("expanded", expanded);
    ctrl.subscribe("selection", selection);
    ctrl.expand("a");
    expect(rows).toHaveBeenCalled();
    expect(expanded).toHaveBeenCalled();
    expect(selection).not.toHaveBeenCalled();
    ctrl.select(["a"], "replace");
    expect(selection).toHaveBeenCalled();
  });

  it("expandTo reveals ancestors", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    ctrl.expandTo("a2");
    expect(ctrl.isExpanded("a")).toBe(true);
    // root is implicit; should not have been added to the expanded set
    expect(ctrl.isExpanded("<root>")).toBe(false);
  });

  it("expandTo/reveal tolerate an id the source hasn't snapshotted (F11.1)", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    // A node selected the tick before its external snapshot lands (e.g.
    // just inserted) is not yet in the source — `getNode` would throw.
    // expandTo must skip it, not take down the panel.
    expect(() => ctrl.expandTo("ghost")).not.toThrow();
    expect(ctrl.isExpanded("a")).toBe(false);
    expect(() => ctrl.reveal("ghost")).not.toThrow();
    // A real id still works after the tolerant path.
    ctrl.expandTo("a2");
    expect(ctrl.isExpanded("a")).toBe(true);
  });

  it("dispose stops emissions and breaks source subscription", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    const rows = vi.fn<() => void>();
    ctrl.subscribe("rows", rows);
    ctrl.dispose();
    ctrl.expand("a");
    expect(rows).not.toHaveBeenCalled();
  });
});

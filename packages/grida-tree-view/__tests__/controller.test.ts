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

  it("dispose stops emissions and breaks source subscription", () => {
    const ctrl = new TreeController({ source: buildFixture() });
    const rows = vi.fn<() => void>();
    ctrl.subscribe("rows", rows);
    ctrl.dispose();
    ctrl.expand("a");
    expect(rows).not.toHaveBeenCalled();
  });
});

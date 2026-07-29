import { describe, expect, it } from "vitest";
import { DesignSearchExplorer } from "./design-search-explorer";

const pin = (id: string) => ({
  id,
  title: `Reference ${id}`,
  url: `https://example.com/${id}.png`,
});

describe("DesignSearchExplorer", () => {
  it("treats the tool query as an initial, refinable seed", () => {
    const initial = DesignSearchExplorer.create("  blue poster  ");

    expect(initial.query).toBe("blue poster");
    expect(initial.revision).toBe(0);
    expect(initial.refine("blue poster")).toBe(initial);
    expect(initial.refine("   ")).toBe(initial);

    const refined = initial.refine("red editorial poster");
    expect(refined.query).toBe("red editorial poster");
    expect(refined.revision).toBe(1);
  });

  it("retains picks across searches in selection order", () => {
    const first = DesignSearchExplorer.create("blue")
      .toggle(pin("a"))
      .toggle(pin("b"));
    const second = first.refine("red").toggle(pin("c"));

    expect(second.selectedPins.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(second.selectedCount).toBe(3);
  });

  it("deduplicates by id and lets a prior-search pick be removed", () => {
    const selected = DesignSearchExplorer.create("blue").toggle(pin("a"));
    const removed = selected.refine("red").remove("a");

    expect(selected.isSelected("a")).toBe(true);
    expect(removed.isSelected("a")).toBe(false);
    expect(removed.selectedPins).toEqual([]);
    expect(removed.remove("missing")).toBe(removed);
  });

  it("invalidates old search requests without invalidating on selection", () => {
    const initial = DesignSearchExplorer.create("blue");
    const ticket = initial.ticket();
    const selected = initial.toggle(pin("a"));

    expect(selected.accepts(ticket)).toBe(true);
    expect(selected.refine("red").accepts(ticket)).toBe(false);
  });
});

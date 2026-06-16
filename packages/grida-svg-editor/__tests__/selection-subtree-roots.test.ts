// Executable shadow of `docs/selection.md`. The selection-state invariant:
// a selection is always its SUBTREE ROOTS — never a node together with one of
// its ancestors. Enforced once in `set_selection` via `prune_nested_nodes`,
// so every feature downstream stays dumb.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src";
import { MARQUEE_REDUNDANT_SVG, id_of } from "./_helpers";

// root → G(A, B), M, Z   (G/M/Z siblings under root; A/B under G)
const SVG = MARQUEE_REDUNDANT_SVG;

// root → G1(G2(A))   (a three-deep chain)
const DEEP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g id="G1"><g id="G2"><rect id="A" x="0" y="0" width="10" height="10"/></g></g></svg>`;

const ids = (editor: ReturnType<typeof createSvgEditor>, ...names: string[]) =>
  names.map((n) => id_of(editor, n));

describe("selection — subtree-roots invariant", () => {
  it("drops a child when its ancestor is also selected (G + A + B → G)", () => {
    const e = createSvgEditor({ svg: SVG });
    e.commands.select(ids(e, "G", "A", "B"));
    expect(e.state.selection).toEqual(ids(e, "G"));
  });

  it("keeps unrelated roots, drops nested ones (G + A + B + Z → G + Z) — the marquee case", () => {
    const e = createSvgEditor({ svg: SVG });
    e.commands.select(ids(e, "G", "A", "B", "Z"));
    expect(e.state.selection).toEqual(ids(e, "G", "Z"));
  });

  it("leaves a sibling selection untouched (A + B)", () => {
    const e = createSvgEditor({ svg: SVG });
    e.commands.select(ids(e, "A", "B"));
    expect(e.state.selection).toEqual(ids(e, "A", "B"));
  });

  it("preserves the requested order of retained ids (Z + G)", () => {
    const e = createSvgEditor({ svg: SVG });
    e.commands.select(ids(e, "Z", "G"));
    expect(e.state.selection).toEqual(ids(e, "Z", "G"));
  });

  it("collapses an arbitrarily deep chain (G1 + G2 + A → G1)", () => {
    const e = createSvgEditor({ svg: DEEP });
    e.commands.select(ids(e, "G1", "G2", "A"));
    expect(e.state.selection).toEqual(ids(e, "G1"));
  });

  it("a single node is never pruned", () => {
    const e = createSvgEditor({ svg: SVG });
    e.commands.select(id_of(e, "A"));
    expect(e.state.selection).toEqual(ids(e, "A"));
  });

  it("absorbs a child added (mode: add) to a selection that already holds its ancestor", () => {
    const e = createSvgEditor({ svg: SVG });
    e.commands.select(id_of(e, "A"));
    e.commands.select(id_of(e, "G"), { mode: "add" }); // {A, G} → G
    expect(e.state.selection).toEqual(ids(e, "G"));
  });

  it("select_all selects the scope's direct children (already siblings — unchanged)", () => {
    const e = createSvgEditor({ svg: SVG });
    e.commands.select_all();
    expect(e.state.selection).toEqual(ids(e, "G", "M", "Z"));
  });

  it("re-selecting a redundant superset of the current selection is a no-op", () => {
    const e = createSvgEditor({ svg: SVG });
    e.commands.select(id_of(e, "G"));
    const v0 = e.state.version;
    e.commands.select(ids(e, "G", "A", "B")); // prunes back to [G] — no change
    expect(e.state.selection).toEqual(ids(e, "G"));
    expect(e.state.version).toBe(v0); // no emit
  });
});

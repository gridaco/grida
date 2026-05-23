// Memoization contract for typed reads — `node_paint`, `node_properties`,
// `tree`, and `defs.gradients.list()`.
//
// The contract: repeated calls return the SAME reference until the
// underlying data actually changes. Consumers plug these into
// `useSyncExternalStore` and rely on `Object.is` short-circuiting; any
// regression here re-introduces per-emit re-renders across every
// inspector / layers / gradient panel in every host.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";
import { first_rect } from "./_helpers";

const TRIVIAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="50" height="40" fill="red" stroke="blue"/></svg>`;

const WITH_GRADIENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
  </defs>
  <rect x="10" y="10" width="50" height="40"/>
</svg>`;

describe("node_paint memoization", () => {
  it("returns the same reference across repeat reads with no mutations", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const id = first_rect(editor);
    const a = editor.node_paint(id, "fill");
    const b = editor.node_paint(id, "fill");
    expect(a).toBe(b);
  });

  it("returns the same reference across an emit that didn't touch this paint", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const id = first_rect(editor);
    const a = editor.node_paint(id, "fill");
    // Unrelated mutation: change x.
    editor.commands.select([id]);
    editor.commands.set_property("x", "20");
    const b = editor.node_paint(id, "fill");
    expect(b).toBe(a);
  });

  it("returns a different reference when the paint actually changes", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const id = first_rect(editor);
    editor.commands.select([id]);
    const a = editor.node_paint(id, "fill");
    editor.commands.set_paint("fill", {
      kind: "color",
      value: { kind: "rgb", value: "#00ff00" },
    });
    const b = editor.node_paint(id, "fill");
    expect(b).not.toBe(a);
    expect(b.declared).not.toBe(a.declared);
  });

  it("keeps stroke stable when fill changes", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const id = first_rect(editor);
    editor.commands.select([id]);
    const stroke_before = editor.node_paint(id, "stroke");
    editor.commands.set_paint("fill", {
      kind: "color",
      value: { kind: "rgb", value: "#123456" },
    });
    const stroke_after = editor.node_paint(id, "stroke");
    expect(stroke_after).toBe(stroke_before);
  });
});

describe("node_properties memoization", () => {
  it("returns the same outer object and inner values across no-op emits", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const id = first_rect(editor);
    const a = editor.node_properties(id, ["stroke-width", "opacity"]);
    editor.commands.select([id]); // emits but no doc mutation
    const b = editor.node_properties(id, ["stroke-width", "opacity"]);
    expect(b).toBe(a);
    expect(b["stroke-width"]).toBe(a["stroke-width"]);
    expect(b.opacity).toBe(a.opacity);
  });

  it("returns the same reference when an unrelated attribute changes", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const id = first_rect(editor);
    editor.commands.select([id]);
    const a = editor.node_properties(id, ["stroke-width", "opacity"]);
    editor.commands.set_property("x", "42");
    const b = editor.node_properties(id, ["stroke-width", "opacity"]);
    expect(b).toBe(a);
  });

  it("invalidates the outer object when one entry changes; keeps stable entries", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const id = first_rect(editor);
    editor.commands.select([id]);
    const a = editor.node_properties(id, ["stroke-width", "opacity"]);
    editor.commands.set_property("opacity", "0.5");
    const b = editor.node_properties(id, ["stroke-width", "opacity"]);
    expect(b).not.toBe(a);
    expect(b["stroke-width"]).toBe(a["stroke-width"]); // unchanged entry pooled
    expect(b.opacity).not.toBe(a.opacity);
  });
});

describe("tree() memoization", () => {
  it("returns the same snapshot reference across no-structure-change emits", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const a = editor.tree();
    const id = first_rect(editor);
    editor.commands.select([id]);
    editor.commands.set_property("x", "999"); // attribute write — bumps version but NOT structure_version
    const b = editor.tree();
    expect(b).toBe(a);
  });

  it("returns a different snapshot when structure changes", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const a = editor.tree();
    const id = first_rect(editor);
    editor.commands.select([id]);
    editor.commands.remove();
    const b = editor.tree();
    expect(b).not.toBe(a);
  });

  it("keeps a TreeNode reference stable when its fields didn't change", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"><g><rect/></g><rect/></svg>`,
    });
    const before = editor.tree();
    const [firstRectId] = [...before.nodes.entries()]
      .filter(([, n]) => n.tag === "rect")
      .map(([id]) => id);
    const before_node = before.nodes.get(firstRectId)!;
    // Touch a different element's fill (no structural change, no id rename).
    const otherId = [...before.nodes.keys()].find(
      (k) => before.nodes.get(k)?.tag === "g"
    )!;
    editor.commands.select([otherId]);
    editor.commands.set_paint("fill", {
      kind: "color",
      value: { kind: "rgb", value: "#000" },
    });
    const after = editor.tree();
    // tree itself stable (no structure change)
    expect(after).toBe(before);
    // and the node ref is the same instance
    expect(after.nodes.get(firstRectId)).toBe(before_node);
  });
});

describe("defs.gradients.list() memoization", () => {
  it("returns the same reference when no gradient changes", () => {
    const editor = createSvgEditor({ svg: WITH_GRADIENT });
    const a = editor.defs.gradients.list();
    const b = editor.defs.gradients.list();
    expect(b).toBe(a);
  });

  it("preserves the reference across unrelated doc edits", () => {
    const editor = createSvgEditor({ svg: WITH_GRADIENT });
    const a = editor.defs.gradients.list();
    const id = first_rect(editor);
    editor.commands.select([id]);
    editor.commands.set_property("x", "20");
    const b = editor.defs.gradients.list();
    expect(b).toBe(a);
  });

  it("returns a new reference (and changed entries) when a gradient is added", () => {
    const editor = createSvgEditor({ svg: WITH_GRADIENT });
    const a = editor.defs.gradients.list();
    expect(a.length).toBe(1);
    editor.defs.gradients.upsert({
      kind: "linear",
      stops: [
        { offset: 0, color: "#abc" },
        { offset: 1, color: "#def" },
      ],
    });
    const b = editor.defs.gradients.list();
    expect(b).not.toBe(a);
    expect(b.length).toBe(2);
  });

  it("keeps untouched entry references stable when another is added", () => {
    const editor = createSvgEditor({ svg: WITH_GRADIENT });
    const a = editor.defs.gradients.list();
    const a0 = a[0];
    editor.defs.gradients.upsert({
      kind: "linear",
      stops: [
        { offset: 0, color: "#abc" },
        { offset: 1, color: "#def" },
      ],
    });
    const b = editor.defs.gradients.list();
    const found = b.find((g) => g.id === a0.id);
    expect(found).toBeDefined();
    // ref_count may have changed; here it didn't (we didn't reference g1).
    expect(found).toBe(a0);
  });
});

// `editor.dom_computed_*` is a deliberately surface-dependent seam: when a
// DOM surface is attached it delegates to `getComputedStyle()` against the
// mounted SVG element, picking up `<style>` block matching, `var()`
// substitution, and the rest of the cascade that the headless engine doesn't
// implement.
//
// These tests cover the **contract**, not the DOM. The actual cascade
// resolution happens inside the browser at runtime and is verified manually
// via the dev page (per the plan's §5 verification).

import { describe, expect, it } from "vitest";
import type { DomComputedResolver, NodeId } from "../src/index";
import { createSvgEditor } from "../src/index";

const SVG_WITH_STYLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>.brand { fill: red }</style><rect class="brand" x="10" y="10" width="50" height="40"/></svg>`;

type InternalBag = {
  _internal: {
    set_computed_resolver(fn: DomComputedResolver | null): void;
  };
};

describe("editor.dom_computed_*", () => {
  it("returns null when no DOM surface (or resolver) is attached", () => {
    const editor = createSvgEditor({ svg: SVG_WITH_STYLE });
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;
    expect(editor.dom_computed_property(rect.id, "fill")).toBe(null);
    expect(editor.dom_computed_paint(rect.id, "fill")).toBe(null);
  });

  it("routes through the registered resolver when one is set", () => {
    const editor = createSvgEditor({ svg: SVG_WITH_STYLE });
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;

    const calls: Array<{ id: NodeId; name: string }> = [];
    (editor as unknown as InternalBag)._internal.set_computed_resolver({
      computed_property(id, name) {
        calls.push({ id, name });
        // Simulate getComputedStyle resolving the `<style>` block.
        return name === "fill" ? "rgb(255, 0, 0)" : null;
      },
      computed_paint(_id, channel) {
        if (channel === "fill") {
          // Mirror the real DOM resolver's shape: `computed` is the raw
          // getComputedStyle string; `resolved_paint` goes through
          // `paint.parse`, which canonicalizes solids to lowercase hex.
          return {
            computed: "rgb(255, 0, 0)",
            resolved_paint: {
              kind: "color",
              value: { kind: "rgb", value: "#ff0000" },
            },
          };
        }
        return null;
      },
    });

    // dom_computed reports the resolved cascade…
    expect(editor.dom_computed_property(rect.id, "fill")).toBe(
      "rgb(255, 0, 0)"
    );
    const computed_paint = editor.dom_computed_paint(rect.id, "fill");
    expect(computed_paint?.computed).toBe("rgb(255, 0, 0)");
    expect(computed_paint?.resolved_paint).toEqual({
      kind: "color",
      value: { kind: "rgb", value: "#ff0000" },
    });

    // …while the headless cascade does NOT see the `<style>` block's
    // `.brand { fill: red }`: it covers presentation attribute + inline
    // style + inheritance + initial only. The rect has no inline/attribute
    // `fill`, so headless falls back to inheritance from the SVG root
    // (which itself has no `fill`, defaulting to "black").
    const headless = editor.node_paint(rect.id, "fill");
    expect(headless.declared).toBe("black"); // not "red" from the stylesheet
    expect(["inherited", "defaulted"]).toContain(headless.provenance.carrier);

    expect(calls.length).toBeGreaterThan(0);
  });

  it("clears when set_computed_resolver(null) is called (detach)", () => {
    const editor = createSvgEditor({ svg: SVG_WITH_STYLE });
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;
    const internal = (editor as unknown as InternalBag)._internal;
    internal.set_computed_resolver({
      computed_property: () => "anything",
      computed_paint: () => ({
        computed: "x",
        resolved_paint: null,
      }),
    });
    expect(editor.dom_computed_property(rect.id, "fill")).toBe("anything");
    internal.set_computed_resolver(null);
    expect(editor.dom_computed_property(rect.id, "fill")).toBe(null);
    expect(editor.dom_computed_paint(rect.id, "fill")).toBe(null);
  });
});

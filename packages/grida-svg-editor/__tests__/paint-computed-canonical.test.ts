// Canonicalization contract of the computed paint channel.
//
// `declared` is what the file says — verbatim, round-trip (P1).
// `computed` is the resolved-for-consumers channel: a solid color literal
// that is resolvable without a rendering context (named / hex / rgb() /
// hsl() / hwb()) is canonicalized to lowercase hex — `#rrggbb`, or
// `#rrggbbaa` when alpha < 1 — so a host can feed it straight into a
// color control without re-implementing CSS color parsing. Literals the
// editor does not resolve (lab() / oklch() / color()) pass through as
// authored; `currentColor` stays a keyword (resolution is a used-value
// concern).

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";
import { paint } from "../src/core/paint";
import type { Paint } from "../src/types";
import { first_rect } from "./_helpers";

function computed_of(fill: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="5" height="5" fill="${fill}"/></svg>`;
  const editor = createSvgEditor({ svg });
  return editor.node_paint(first_rect(editor), "fill");
}

function solid_hex(p: ReturnType<typeof computed_of>["computed"]): string {
  const c = p as Paint & { kind: "color" };
  if (c.kind !== "color" || c.value.kind !== "rgb") {
    throw new Error(`not a solid rgb paint: ${JSON.stringify(p)}`);
  }
  return c.value.value;
}

describe("computed solid paint is canonical lowercase hex", () => {
  it("named colors resolve to #rrggbb", () => {
    expect(solid_hex(computed_of("red").computed)).toBe("#ff0000");
    expect(solid_hex(computed_of("RebeccaPurple").computed)).toBe("#663399");
  });

  it("hex shorthand and uppercase normalize (#ABC → #aabbcc)", () => {
    expect(solid_hex(computed_of("#ABC").computed)).toBe("#aabbcc");
    expect(solid_hex(computed_of("#3B82F6").computed)).toBe("#3b82f6");
  });

  it("rgb() function syntax resolves, modern and legacy alike", () => {
    expect(solid_hex(computed_of("rgb(59 130 246)").computed)).toBe("#3b82f6");
    expect(solid_hex(computed_of("rgb(59, 130, 246)").computed)).toBe(
      "#3b82f6"
    );
  });

  it("hsl() resolves to the sRGB hex a browser computes", () => {
    expect(solid_hex(computed_of("hsl(0 100% 50%)").computed)).toBe("#ff0000");
  });

  it("alpha < 1 yields #rrggbbaa", () => {
    expect(solid_hex(computed_of("rgba(255, 0, 0, 0.5)").computed)).toBe(
      "#ff000080"
    );
  });

  it("declared always carries the authored string verbatim", () => {
    const v = computed_of("RebeccaPurple");
    expect(v.declared).toBe("RebeccaPurple");
  });

  it("an unedited document serializes byte-equal — canonicalization never touches the file", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="5" height="5" fill="RED"/></svg>`;
    const editor = createSvgEditor({ svg });
    editor.node_paint(first_rect(editor), "fill"); // force the computed read
    expect(editor.serialize()).toBe(svg);
  });

  it("currentColor stays a keyword, never canonicalized", () => {
    expect(computed_of("currentColor").computed).toEqual({
      kind: "color",
      value: { kind: "current_color" },
    });
  });

  it("url(#id) fallback colors canonicalize like any solid", () => {
    expect(computed_of("url(#g1) red").computed).toEqual({
      kind: "ref",
      id: "g1",
      fallback: { kind: "color", value: { kind: "rgb", value: "#ff0000" } },
    });
  });

  it("unresolved color spaces pass through as authored (no guessing)", () => {
    expect(solid_hex(computed_of("oklch(0.7 0.1 200)").computed)).toBe(
      "oklch(0.7 0.1 200)"
    );
  });
});

describe("paint.serialize is untouched by canonicalization", () => {
  it("serializes the Paint a host hands it, byte-for-byte", () => {
    // Writes carry the host's value — canonicalization is a READ-channel
    // concern only. A host that writes "red" gets "red" in the file.
    expect(
      paint.serialize({
        kind: "color",
        value: { kind: "rgb", value: "red" },
      })
    ).toBe("red");
  });
});

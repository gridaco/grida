// Spec for the inline-`style` declaration grammar: trivia-preserving authoring
// (Grida svg-editor issue #823). Editing one declaration must not churn the
// formatting of untouched siblings, and a removed property must leave the
// survivors byte-equal. The token model is private; these tests pin the two
// public functions (`declarations` read view, `set` edit).

import { describe, expect, it } from "vitest";
import { inline_style } from "../inline-style";

describe("inline_style.declarations (read projection)", () => {
  it("returns trimmed property/value pairs in source order", () => {
    expect(inline_style.declarations("fill: red ; stroke:blue")).toEqual([
      { property: "fill", value: "red" },
      { property: "stroke", value: "blue" },
    ]);
  });

  it("returns [] for an empty string", () => {
    expect(inline_style.declarations("")).toEqual([]);
  });

  it("skips colon-less and empty-property fragments", () => {
    expect(
      inline_style.declarations("fill:red;garbage;:orphan;stroke:blue")
    ).toEqual([
      { property: "fill", value: "red" },
      { property: "stroke", value: "blue" },
    ]);
  });

  it("keeps the first colon as the split, so values may contain colons", () => {
    expect(inline_style.declarations("background:url(a:b)")).toEqual([
      { property: "background", value: "url(a:b)" },
    ]);
  });
});

describe("inline_style.set (trivia-preserving edit)", () => {
  it("editing one declaration leaves untouched siblings byte-equal (compact)", () => {
    expect(inline_style.set("fill:red;stroke:blue", "fill", "green")).toBe(
      "fill:green;stroke:blue"
    );
  });

  it("preserves authored spacing and trailing semicolon on the untouched sibling", () => {
    expect(inline_style.set("fill: red ; stroke: blue;", "fill", "green")).toBe(
      "fill: green ; stroke: blue;"
    );
  });

  it("preserves the touched declaration's own colon / value spacing", () => {
    expect(inline_style.set("fill  :  red;stroke:blue", "fill", "green")).toBe(
      "fill  :  green;stroke:blue"
    );
  });

  it("keeps a value with internal whitespace and parens intact when editing a sibling", () => {
    expect(
      inline_style.set(
        "fill:url(#g);stroke-dasharray:4 2 4;stroke:blue",
        "stroke",
        "black"
      )
    ).toBe("fill:url(#g);stroke-dasharray:4 2 4;stroke:black");
  });

  it("editing a value that itself contains a colon only swaps the value", () => {
    expect(
      inline_style.set(
        "background:url(a:b);stroke:blue",
        "background",
        "url(c:d)"
      )
    ).toBe("background:url(c:d);stroke:blue");
  });

  it("set + restore round-trips to the byte-equal authored string", () => {
    const src = "fill: red ; stroke: blue;";
    const edited = inline_style.set(src, "fill", "green");
    expect(inline_style.set(edited, "fill", "red")).toBe(src);
  });

  it("removing a declaration keeps surviving declarations byte-equal", () => {
    expect(inline_style.set("fill:red;stroke:blue", "fill", null)).toBe(
      "stroke:blue"
    );
  });

  it("removing the last declaration yields an empty string", () => {
    expect(inline_style.set("fill:red", "fill", null)).toBe("");
  });

  it("removing an absent property returns the input unchanged", () => {
    expect(inline_style.set("fill:red", "stroke", null)).toBe("fill:red");
    expect(inline_style.set("", "stroke", null)).toBe("");
  });

  it("appending a new declaration leaves existing ones byte-equal", () => {
    expect(inline_style.set("fill:red", "stroke", "blue")).toBe(
      "fill:red;stroke: blue"
    );
  });

  it("appending preserves an authored trailing semicolon", () => {
    expect(inline_style.set("fill:red;", "stroke", "blue")).toBe(
      "fill:red;stroke: blue;"
    );
  });

  it("adds the first declaration to an empty style with no leading separator", () => {
    expect(inline_style.set("", "fill", "red")).toBe("fill: red");
  });
});

// Display-label rule — the package's single source of truth for "what to
// show as a node's label in a hierarchy panel" (since SVG has no native
// name property). See editor.ts → `display_label(id)`.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";

function setup(svg: string) {
  const editor = createSvgEditor({ svg });
  const byTag = (tag: string) => {
    for (const [id, node] of editor.tree().nodes) {
      if (node.tag === tag) return id;
    }
    throw new Error(`no <${tag}> in fixture`);
  };
  return { editor, byTag };
}

describe("display_label", () => {
  it("returns the tag name for elements with no id", () => {
    const { editor, byTag } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/></svg>`
    );
    expect(editor.display_label(byTag("rect"))).toBe("rect");
  });

  it("suffixes the id when an id attribute is present", () => {
    const { editor, byTag } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="sun" x="0" y="0" width="10" height="10"/></svg>`
    );
    expect(editor.display_label(byTag("rect"))).toBe("rect #sun");
  });

  it("returns just the tag for groups without an id", () => {
    const { editor, byTag } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g><rect width="10" height="10"/></g></svg>`
    );
    expect(editor.display_label(byTag("g"))).toBe("g");
  });

  it("uses text content as the label for <text> nodes", () => {
    const { editor, byTag } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="0" y="20">Hello world</text></svg>`
    );
    expect(editor.display_label(byTag("text"))).toBe("Hello world");
  });

  it("falls back to 'text' when a <text> node has only whitespace", () => {
    const { editor, byTag } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="0" y="20">   </text></svg>`
    );
    expect(editor.display_label(byTag("text"))).toBe("text");
  });

  it("truncates long <text> content with an ellipsis", () => {
    const long = "x".repeat(60);
    const { editor, byTag } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="0" y="20">${long}</text></svg>`
    );
    const label = editor.display_label(byTag("text"));
    expect(label.endsWith("…")).toBe(true);
    // 40 chars + 1 ellipsis
    expect(label.length).toBe(41);
    expect(label.startsWith("x".repeat(40))).toBe(true);
  });

  it("collapses runs of whitespace in <text> content to a single space", () => {
    const { editor, byTag } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="0" y="20">Hello\n\n  world\t!</text></svg>`
    );
    expect(editor.display_label(byTag("text"))).toBe("Hello world !");
  });

  it("ignores the id attribute on <text> nodes (text content wins)", () => {
    const { editor, byTag } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text id="caption" x="0" y="20">Hello</text></svg>`
    );
    expect(editor.display_label(byTag("text"))).toBe("Hello");
  });

  it("applies opts.tagLabel for non-text nodes", () => {
    const friendly: Record<string, string> = {
      rect: "Rectangle",
      g: "Group",
    };
    const tagLabel = (t: string) => friendly[t] ?? t;
    const { editor, byTag } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g><rect id="sun" width="10" height="10"/></g></svg>`
    );
    expect(editor.display_label(byTag("rect"), { tagLabel })).toBe(
      "Rectangle #sun"
    );
    expect(editor.display_label(byTag("g"), { tagLabel })).toBe("Group");
  });

  it("does NOT invoke opts.tagLabel for <text> nodes (text content wins)", () => {
    const tagLabel = (t: string) => `should-not-see-${t}`;
    const { editor, byTag } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="0" y="20">Hello</text></svg>`
    );
    expect(editor.display_label(byTag("text"), { tagLabel })).toBe("Hello");
  });
});

// Headless producer tests for the designed `<image>` insertion command.
//
// Contract: docs/wg/feat-svg-editor/image-insertion.md. Same idiom as
// `insertions.test.ts` — create an editor, call `commands.insert_image`,
// assert document state + a serialize round-trip + undo/redo. No surface is
// attached: the command is synchronous and headless by construction, so
// every test here runs in plain node (no getBBox / getScreenCTM needed).
//
// Each test NAME states the locked behavior as a spec sentence.

import { describe, expect, it } from "vitest";
import { insertions } from "../src/core/insertions";
import { createSvgEditor } from "../src/index";

const SVG_NS = "http://www.w3.org/2000/svg";
const EMPTY = `<svg xmlns="${SVG_NS}" viewBox="0 0 100 100"/>`;

const PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

describe("commands.insert_image — href authoring (P1 / FRD R4)", () => {
  it("authors an SVG 2 href, never xlink:href, and forces no xmlns:xlink on the root", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const id = editor.commands.insert_image("https://example.com/a.png");

    // SVG 2 namespace-free href is the authored form.
    expect(editor.document.get_attr(id, "href")).toBe(
      "https://example.com/a.png"
    );
    // The legacy form is never authored.
    expect(editor.document.get_attr(id, "xlink:href")).toBeNull();

    // And no xmlns:xlink declaration is forced onto the root for it.
    const out = editor.serialize();
    expect(out).not.toContain("xlink:href");
    expect(out).not.toContain("xmlns:xlink");
    expect(out).toContain("<image");
    expect(out).toContain('href="https://example.com/a.png"');
  });
});

describe("commands.insert_image — explicit size (FRD R3)", () => {
  it("with a supplied size, writes that exact width/height", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const id = editor.commands.insert_image(PNG_DATA_URI, {
      width: 320,
      height: 240,
    });
    expect(editor.document.get_attr(id, "width")).toBe("320");
    expect(editor.document.get_attr(id, "height")).toBe("240");
  });

  it("with no supplied size, falls back to the named default placeholder size", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const id = editor.commands.insert_image(PNG_DATA_URI);
    const expected = String(insertions.DEFAULT_IMAGE_SIZE);
    // Always written — never absent (an <image> with no size has
    // renderer-dependent bounds; the editor refuses that ambiguity).
    expect(editor.document.get_attr(id, "width")).toBe(expected);
    expect(editor.document.get_attr(id, "height")).toBe(expected);
  });
});

describe("commands.insert_image — placement (FRD § Placement)", () => {
  it("centers the element on the supplied point (an image's x/y is its top-left)", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const id = editor.commands.insert_image(PNG_DATA_URI, {
      at: { x: 50, y: 60 },
      width: 20,
      height: 10,
    });
    // top-left = at − size/2  →  (50 − 10, 60 − 5) = (40, 55)
    expect(editor.document.get_attr(id, "x")).toBe("40");
    expect(editor.document.get_attr(id, "y")).toBe("55");
  });

  it("anchors at the document origin when no point is supplied (top-left at 0,0)", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const id = editor.commands.insert_image(PNG_DATA_URI, {
      width: 20,
      height: 10,
    });
    expect(editor.document.get_attr(id, "x")).toBe("0");
    expect(editor.document.get_attr(id, "y")).toBe("0");
  });
});

describe("commands.insert_image — one history step (FRD R5)", () => {
  it("inserts at root, selects the new node, and is one undoable step (undo restores byte-equal)", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const baseline = editor.serialize();

    const id = editor.commands.insert_image(PNG_DATA_URI, {
      at: { x: 10, y: 10 },
    });
    expect(editor.state.selection).toEqual([id]);
    expect(editor.tree().nodes.get(id)?.tag).toBe("image");
    expect(editor.state.can_undo).toBe(true);

    // Exactly one undo restores the document byte-for-byte.
    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
  });

  it("redo re-inserts and re-selects the same node", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const id = editor.commands.insert_image(PNG_DATA_URI);
    const after_insert = editor.serialize();

    editor.commands.undo();
    editor.commands.redo();

    expect(editor.state.selection).toEqual([id]);
    expect(editor.serialize()).toBe(after_insert);
  });

  it("does not auto-select when opts.select === false", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    // Snapshot by value: a "selection did not change" assertion must not
    // alias the live array, or an in-place mutation would compare equal to
    // itself and pass falsely.
    const before = [...editor.state.selection];
    editor.commands.insert_image(PNG_DATA_URI, { select: false });
    expect(editor.state.selection).toEqual(before);
  });
});

describe("commands.insert_image — round-trip & content policy (FRD R4 / R6)", () => {
  it("insert → serialize → reparse is byte-stable", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    editor.commands.insert_image(PNG_DATA_URI, { at: { x: 50, y: 50 } });
    const once = editor.serialize();
    // Reparsing the editor's own output and re-serializing must be a
    // fixpoint — the inserted <image> round-trips like any authored node.
    const twice = createSvgEditor({ svg: once }).serialize();
    expect(twice).toBe(once);
  });

  it("writes a large data: URI href verbatim — no cap, no rewrite (content is sovereign)", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    // A multi-megabyte-class href: far past any size a policing editor
    // would cap. The editor imposes no content policy.
    const big_href = `data:image/png;base64,${"A".repeat(2_000_000)}`;
    const id = editor.commands.insert_image(big_href);

    // Stored verbatim in the model …
    expect(editor.document.get_attr(id, "href")).toBe(big_href);
    // … and round-tripped verbatim through serialize.
    expect(editor.serialize()).toContain(big_href);
  });
});

describe("commands.insert_image — headless (FRD R2)", () => {
  it("runs with no surface attached (synchronous, no DOM, no decode)", () => {
    // No `editor.attach(...)` — geometry_provider is null. A command that
    // tried to decode the image or measure it would need a rendering
    // context; this one must not. It returns a real NodeId synchronously.
    const editor = createSvgEditor({ svg: EMPTY });
    const id = editor.commands.insert_image(PNG_DATA_URI);
    expect(typeof id).toBe("string");
    expect(editor.tree().nodes.get(id)?.tag).toBe("image");
  });
});

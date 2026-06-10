// Headless tests for `commands.insert_fragment` — atomic insertion of a
// pre-authored SVG fragment / full-document string:
//   - root ids returned in document order; contiguous landing.
//   - ONE undo restores the exact pre-insert serialization; redo restores
//     the post-insert one (byte-equal both ways).
//   - full `<svg>` doc input → children only; the shell is discarded.
//   - parent / index / select opts.
//   - id-collision policy: authored ids inserted verbatim, never rewritten.
//   - namespace hoisting: well-known `xlink` and shell-declared prefixes
//     land on the root in the same history step; authored declarations win.
//   - empty / invalid input behavior (no-op vs throw).
//   - positioning is authored content: a transform-wrapped fragment lands
//     positioned and undoes in one step.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";

const EMPTY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>`;
const WITH_RECT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="base" x="0" y="0" width="10" height="10"/></svg>`;

describe("commands.insert_fragment / multi-element fragments", () => {
  it("returns the inserted root ids in document order", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const ids = editor.commands.insert_fragment(
      `<path d="M0 0H10"/><path d="M0 5H10"/>`
    );
    expect(ids).toHaveLength(2);
    // Returned order is document order — the parent's element children
    // end with the two roots in source order.
    const children = editor.document.element_children_of(editor.document.root);
    expect(children).toEqual(ids);
    expect(editor.document.get_attr(ids[0], "d")).toBe("M0 0H10");
    expect(editor.document.get_attr(ids[1], "d")).toBe("M0 5H10");
  });

  it("inserts the subtree verbatim into the serialized output", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    editor.commands.insert_fragment(`<path d="M0 0H10"/><path d="M0 5H10"/>`);
    expect(editor.serialize()).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0H10"/><path d="M0 5H10"/></svg>`
    );
  });

  it("a `<g>`-wrapped fragment returns one root id with its children intact", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const ids = editor.commands.insert_fragment(
      `<g fill="red"><path d="M0 0H10"/><path d="M0 5H10"/></g>`
    );
    expect(ids).toHaveLength(1);
    expect(editor.document.tag_of(ids[0])).toBe("g");
    expect(editor.document.element_children_of(ids[0])).toHaveLength(2);
  });

  it("ONE undo restores the exact pre-insert serialization; redo restores the post-insert one", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const baseline = editor.serialize();

    editor.commands.insert_fragment(
      `<g transform="translate(1 2)"><path d="M0 0H10"/><circle cx="5" cy="5" r="2"/></g><line x1="0" y1="0" x2="9" y2="9"/>`
    );
    const after = editor.serialize();
    expect(after).not.toBe(baseline);

    expect(editor.state.can_undo).toBe(true);
    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);
    // The whole fragment was ONE step — nothing left to undo.
    expect(editor.state.can_undo).toBe(false);

    editor.commands.redo();
    expect(editor.serialize()).toBe(after);
  });

  it("preserves the fragment's inner trivia verbatim (quotes, attr spacing, comments)", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const fragment = `<g fill ='red' data-x="1"><!-- note --><path d="M0 0H5"/></g>`;
    editor.commands.insert_fragment(fragment);
    expect(editor.serialize()).toContain(fragment);
  });

  it("drops top-level non-element junk between roots (comments, stray text)", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const ids = editor.commands.insert_fragment(
      `<!-- a --> <rect width="1" height="1"/> stray <circle r="2"/>`
    );
    expect(ids).toHaveLength(2);
    expect(editor.document.tag_of(ids[0])).toBe("rect");
    expect(editor.document.tag_of(ids[1])).toBe("circle");
    const out = editor.serialize();
    expect(out).not.toContain("<!-- a -->");
    expect(out).not.toContain("stray");
  });

  it("selects the inserted roots by default; undo restores the previous selection", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const base = editor.document.element_children_of(editor.document.root)[0];
    editor.commands.select(base);

    const ids = editor.commands.insert_fragment(
      `<path d="M0 0H10"/><path d="M0 5H10"/>`
    );
    expect(editor.state.selection).toEqual(ids);

    editor.commands.undo();
    expect(editor.state.selection).toEqual([base]);
  });

  it("doesn't touch selection when opts.select === false", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const before = editor.state.selection;
    editor.commands.insert_fragment(`<path d="M0 0H10"/>`, { select: false });
    expect(editor.state.selection).toEqual(before);
  });
});

describe("commands.insert_fragment / full-document input", () => {
  it("a full `<svg>` doc takes children only — the shell is discarded", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const ids = editor.commands.insert_fragment(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10"/></svg>`
    );
    expect(ids).toHaveLength(1);
    expect(editor.document.tag_of(ids[0])).toBe("circle");
    const out = editor.serialize();
    // No nested <svg>, and none of the shell's attrs leaked in.
    expect(out.match(/<svg/g)).toHaveLength(1);
    expect(out).not.toContain(`viewBox="0 0 24 24"`);
  });

  it("XML prolog / doctype on a full-doc input are discarded with the shell", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const ids = editor.commands.insert_fragment(
      `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg>\n<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>`
    );
    expect(ids).toHaveLength(1);
    expect(editor.document.tag_of(ids[0])).toBe("rect");
    const out = editor.serialize();
    expect(out).not.toContain("<?xml");
    expect(out).not.toContain("DOCTYPE");
  });

  it("an `<svg>` among SEVERAL top-level elements is content, inserted as-is", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const ids = editor.commands.insert_fragment(
      `<rect width="1" height="1"/><svg width="2" height="2"/>`
    );
    expect(ids).toHaveLength(2);
    expect(editor.document.tag_of(ids[1])).toBe("svg");
    expect(editor.serialize()).toContain(`<svg width="2" height="2"/>`);
  });
});

describe("commands.insert_fragment / parent and index opts", () => {
  it("opts.parent inserts into a non-root container", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"><g id="layer"/></svg>`,
    });
    const layer = editor.document.element_children_of(editor.document.root)[0];
    const ids = editor.commands.insert_fragment(`<path d="M0 0H10"/>`, {
      parent: layer,
    });
    expect(editor.document.parent_of(ids[0])).toBe(layer);
    expect(editor.serialize()).toContain(
      `<g id="layer"><path d="M0 0H10"/></g>`
    );
  });

  it("opts.index places the whole fragment contiguously at the element-children position", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const root = editor.document.root;
    const base = editor.document.element_children_of(root)[0];
    const ids = editor.commands.insert_fragment(
      `<path d="M0 0H10"/><path d="M0 5H10"/>`,
      { index: 0 }
    );
    expect(editor.document.element_children_of(root)).toEqual([
      ids[0],
      ids[1],
      base,
    ]);
  });

  it("an out-of-range index appends", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const root = editor.document.root;
    const base = editor.document.element_children_of(root)[0];
    const ids = editor.commands.insert_fragment(`<path d="M0 0H10"/>`, {
      index: 99,
    });
    expect(editor.document.element_children_of(root)).toEqual([base, ids[0]]);
  });

  it("throws on a parent id that isn't a live element of the document", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const baseline = editor.serialize();
    expect(() =>
      editor.commands.insert_fragment(`<path d="M0 0H10"/>`, {
        parent: "no-such-node",
      })
    ).toThrow(/parent/);

    // A removed (detached, but still id-mapped for undo) node is not a
    // live parent either.
    const base = editor.document.element_children_of(editor.document.root)[0];
    editor.commands.select(base);
    editor.commands.remove();
    expect(() =>
      editor.commands.insert_fragment(`<path d="M0 0H10"/>`, { parent: base })
    ).toThrow(/parent/);

    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);
  });
});

describe("commands.insert_fragment / id collisions", () => {
  it("authored ids are inserted verbatim — never rewritten", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const base = editor.document.element_children_of(editor.document.root)[0];
    const baseline = editor.serialize();

    const ids = editor.commands.insert_fragment(
      `<circle id="base" cx="5" cy="5" r="2"/>`
    );
    // Both elements carry the authored id; the pre-existing one is
    // untouched and the fragment's was not renamed.
    expect(editor.document.get_attr(base, "id")).toBe("base");
    expect(editor.document.get_attr(ids[0], "id")).toBe("base");
    expect(editor.serialize().match(/id="base"/g)).toHaveLength(2);

    // The collision is still one clean undo step away.
    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);
  });

  it("a fragment carrying defs + url(#…) references registers in the defs view", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    editor.commands.insert_fragment(
      `<defs><linearGradient id="lg1"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="5" height="5" fill="url(#lg1)"/>`
    );
    const entries = editor.defs.gradients.list();
    expect(entries.map((e) => e.id)).toContain("lg1");
    expect(entries.find((e) => e.id === "lg1")?.ref_count).toBe(1);

    editor.commands.undo();
    expect(editor.defs.gradients.list()).toHaveLength(0);
  });
});

describe("commands.insert_fragment / namespace hoisting", () => {
  it("hoists xmlns:xlink onto the root when the fragment uses the prefix undeclared", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"/>`,
    });
    const baseline = editor.serialize();

    editor.commands.insert_fragment(`<use xlink:href="#x"/>`);
    const after = editor.serialize();
    expect(after).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#x"/></svg>`
    );

    // The hoist rides the same single history step.
    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
    editor.commands.redo();
    expect(editor.serialize()).toBe(after);
  });

  it("doesn't duplicate a declaration the root already carries", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"/>`,
    });
    editor.commands.insert_fragment(`<use xlink:href="#x"/>`);
    expect(editor.serialize().match(/xmlns:xlink/g)).toHaveLength(1);
  });

  it("a fragment declaring its own prefix needs no hoist", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"/>`,
    });
    editor.commands.insert_fragment(
      `<g xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#x"/></g>`
    );
    // The declaration stays where it was authored — not copied to root.
    expect(editor.serialize().match(/xmlns:xlink/g)).toHaveLength(1);
    expect(editor.serialize()).toContain(
      `<g xmlns:xlink="http://www.w3.org/1999/xlink">`
    );
  });

  it("hoists a custom prefix declared on a discarded `<svg>` shell, with the shell's URI", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"/>`,
    });
    editor.commands.insert_fragment(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:acme="https://acme.example/ns"><path acme:meta="x" d="M0 0H4"/></svg>`
    );
    const out = editor.serialize();
    expect(out).toContain(`xmlns:acme="https://acme.example/ns"`);
    expect(out).toContain(`acme:meta="x"`);
  });

  it("an authored root declaration wins over a hoist candidate — never rebound", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:acme="https://host.example/ns"/>`,
    });
    editor.commands.insert_fragment(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:acme="https://acme.example/ns"><path acme:meta="x" d="M0 0H4"/></svg>`
    );
    const out = editor.serialize();
    expect(out).toContain(`xmlns:acme="https://host.example/ns"`);
    expect(out).not.toContain(`https://acme.example/ns`);
  });

  it("a prefix with no discoverable URI is left as authored — no hoist", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"/>`,
    });
    editor.commands.insert_fragment(`<path foo:bar="1" d="M0 0H4"/>`);
    const out = editor.serialize();
    expect(out).toContain(`foo:bar="1"`);
    expect(out).not.toContain("xmlns:foo");
  });
});

describe("commands.insert_fragment / empty and invalid input", () => {
  it.each(["", "   \n  ", "<!-- nothing here -->"])(
    "input with no top-level elements (%j) returns [] with NO history step",
    (input) => {
      const editor = createSvgEditor({ svg: WITH_RECT });
      const baseline = editor.serialize();
      expect(editor.commands.insert_fragment(input)).toEqual([]);
      expect(editor.serialize()).toBe(baseline);
      expect(editor.state.can_undo).toBe(false);
    }
  );

  it("throws on malformed markup, leaving the document untouched", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const baseline = editor.serialize();
    expect(() => editor.commands.insert_fragment(`<g><path></g>`)).toThrow(
      /mismatched end tag/
    );
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
  });

  it("throws TypeError on a non-string input", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    expect(() =>
      editor.commands.insert_fragment(undefined as unknown as string)
    ).toThrow(TypeError);
  });
});

describe("commands.insert_fragment / positioning is authored content", () => {
  // The contract has no placement opt. Drop-at-point composes by authoring
  // the position INTO the fragment — wrap in `<g transform="translate(x
  // y)">` — so placement round-trips as ordinary markup and the whole
  // drop is one undo step.
  it("a transform-wrapped fragment lands positioned and undoes in ONE step", () => {
    const editor = createSvgEditor({ svg: EMPTY });
    const baseline = editor.serialize();

    const ids = editor.commands.insert_fragment(
      `<g transform="translate(40 50)"><path d="M0 0H10"/><path d="M0 5H10"/></g>`
    );
    expect(ids).toHaveLength(1);
    expect(editor.document.get_attr(ids[0], "transform")).toBe(
      "translate(40 50)"
    );

    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
  });
});

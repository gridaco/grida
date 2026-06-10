// Headless tests for `commands.copy` / `commands.cut` / `commands.paste`
// and the `clipboard.*` registry handlers. Contract:
// docs/wg/feat-svg-editor/clipboard.md §Command semantics / §Transport.
//
//   - copy: pure read (no history, no content_version bump); buffer is the
//     unconditional success floor; provider delivery is best-effort.
//   - cut: ONE history step labeled "cut"; undo restores byte-equal; the
//     buffer survives undo (cut → undo → paste = move idiom).
//   - paste: sync over delivered text (arg wins over buffer); gesture-
//     grade refusal table — junk / malformed input is a no-op `[]`, never
//     a throw; non-string arg throws TypeError; same-document round-trip
//     is byte-equal per subtree PLUS the carried closure (the accepted
//     cost, asserted rather than hidden); ids verbatim; appended last;
//     pasted roots selected; ONE undo removes the whole paste including
//     hoisted xmlns.
//   - registry: ids registered; `select`-mode gate; paste routing
//     (provider-async when configured, buffer-sync otherwise).

import { describe, expect, it, vi } from "vitest";
import { createSvgEditor } from "../src/index";
import { createSvgEditorWithInternals, first_rect } from "./_helpers";
import type { ClipboardProvider } from "../src/types";

const SVG_NS = "http://www.w3.org/2000/svg";
const WITH_RECT = `<svg xmlns="${SVG_NS}" viewBox="0 0 100 100"><rect id="base" x="0" y="0" width="10" height="10"/></svg>`;
const WITH_GRADIENT =
  `<svg xmlns="${SVG_NS}"><defs><linearGradient id="g1"/></defs>` +
  `<rect id="base" fill="url(#g1)"/></svg>`;

function fake_provider(opts?: { read?: string | null; fail_write?: boolean }) {
  const written: string[] = [];
  const provider: ClipboardProvider = {
    write: vi.fn<(text: string) => Promise<void>>(async (text) => {
      if (opts?.fail_write) throw new Error("denied");
      written.push(text);
    }),
    read: vi.fn<() => Promise<string | null>>(async () => opts?.read ?? null),
  };
  return { provider, written };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("commands.copy", () => {
  it("returns the payload and writes the buffer (paste() round-trips it)", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    editor.commands.select(first_rect(editor));
    const payload = editor.commands.copy();
    expect(payload).toBe(
      `<svg xmlns="${SVG_NS}"><rect id="base" x="0" y="0" width="10" height="10"/></svg>`
    );
    const pasted = editor.commands.paste();
    expect(pasted).toHaveLength(1);
    // Byte-equal subtree round-trip (FRD R3).
    expect(editor.serialize_node(pasted[0])).toBe(
      editor.serialize_node(first_rect(editor))
    );
  });

  it("is a pure read — no history entry, no content_version bump", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    editor.commands.select(first_rect(editor));
    const before = editor.state.content_version;
    editor.commands.copy();
    expect(editor.state.can_undo).toBe(false);
    expect(editor.state.content_version).toBe(before);
    expect(editor.state.dirty).toBe(false);
  });

  it("returns null on empty selection and leaves the buffer untouched", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    expect(editor.commands.copy()).toBeNull();
    expect(editor.commands.paste()).toEqual([]);
  });

  it("delivers to the provider exactly once (write-through)", async () => {
    const { provider, written } = fake_provider();
    const editor = createSvgEditor({
      svg: WITH_RECT,
      providers: { clipboard: provider },
    });
    editor.commands.select(first_rect(editor));
    const payload = editor.commands.copy();
    await tick();
    expect(written).toEqual([payload]);
    expect(provider.write).toHaveBeenCalledTimes(1);
  });

  it("a rejected provider write is not a copy failure — the buffer floor holds", async () => {
    const { provider } = fake_provider({ fail_write: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const editor = createSvgEditor({
        svg: WITH_RECT,
        providers: { clipboard: provider },
      });
      editor.commands.select(first_rect(editor));
      const payload = editor.commands.copy();
      expect(payload).not.toBeNull();
      await tick();
      // Buffer path still works after the failed external write.
      expect(editor.commands.paste()).toHaveLength(1);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("commands.cut", () => {
  it("removes the selection; ONE undo restores byte-equal", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const baseline = editor.serialize();
    editor.commands.select(first_rect(editor));
    const payload = editor.commands.cut();
    expect(payload).not.toBeNull();
    expect(editor.serialize()).not.toContain("<rect");
    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
  });

  it("records the history step as 'cut', not 'remove'", () => {
    const editor = createSvgEditorWithInternals({ svg: WITH_RECT });
    editor.commands.select(first_rect(editor));
    editor.commands.cut();
    expect(editor._internal.history.undo_label()).toBe("cut");
  });

  it("the buffer survives undo — cut → undo → paste is the move idiom", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    editor.commands.select(first_rect(editor));
    editor.commands.cut();
    editor.commands.undo();
    const pasted = editor.commands.paste();
    expect(pasted).toHaveLength(1);
    // Original restored + pasted copy.
    expect(editor.serialize().match(/<rect/g)).toHaveLength(2);
  });

  it("is a no-op on empty selection — no mutation, no history", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const baseline = editor.serialize();
    expect(editor.commands.cut()).toBeNull();
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
  });
});

describe("commands.paste", () => {
  it("pastes explicit text, selects the roots, appends last", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const ids = editor.commands.paste(`<circle cx="5" cy="5" r="2"/>`);
    expect(ids).toHaveLength(1);
    expect(editor.state.selection).toEqual(ids);
    const children = editor.document.element_children_of(editor.document.root);
    expect(children[children.length - 1]).toBe(ids[0]);
  });

  it("explicit text wins over the buffer", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    editor.commands.select(first_rect(editor));
    editor.commands.copy();
    const ids = editor.commands.paste(`<circle r="1"/>`);
    expect(editor.document.tag_of(ids[0])).toBe("circle");
  });

  it("returns [] when there is no text and no buffer", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    expect(editor.commands.paste()).toEqual([]);
    expect(editor.state.can_undo).toBe(false);
  });

  it("junk prose is a no-op refusal — [], no mutation, no history", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const baseline = editor.serialize();
    expect(editor.commands.paste("hello, clipboard")).toEqual([]);
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
  });

  it("malformed markup is a no-op refusal, NOT a throw (gesture-grade table)", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    const baseline = editor.serialize();
    expect(editor.commands.paste(`<rect width="10`)).toEqual([]);
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
  });

  it("a non-string argument throws TypeError — caller bug, not environment input", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    expect(() => editor.commands.paste(123 as unknown as string)).toThrow(
      TypeError
    );
    expect(() => editor.commands.paste(null as unknown as string)).toThrow(
      TypeError
    );
  });

  it("same-document copy → paste: subtree byte-equal AND the carried closure lands (the accepted cost)", () => {
    const editor = createSvgEditor({ svg: WITH_GRADIENT });
    editor.commands.select(first_rect(editor));
    editor.commands.copy();
    const pasted = editor.commands.paste();
    // The payload's carried <defs> block is itself an adopted root — paste
    // returns [defs, rect] in document order.
    expect(pasted).toHaveLength(2);
    expect(editor.document.tag_of(pasted[0])).toBe("defs");
    expect(editor.serialize_node(pasted[1])).toBe(
      editor.serialize_node(first_rect(editor))
    );
    // The payload's <defs> clone is adopted verbatim (R2/R4 forbid
    // recognizing or rewriting it) — the document now holds the gradient
    // twice. Documented, not hidden; Tidy is the recovery.
    expect(editor.serialize().match(/<linearGradient/g)).toHaveLength(2);
  });

  it("colliding ids are inserted verbatim — never rewritten", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    editor.commands.select(first_rect(editor));
    editor.commands.copy();
    editor.commands.paste();
    expect(editor.serialize().match(/id="base"/g)).toHaveLength(2);
  });

  it("ONE undo removes the whole paste including hoisted xmlns", () => {
    const editor = createSvgEditorWithInternals({ svg: WITH_RECT });
    const baseline = editor.serialize();
    const ids = editor.commands.paste(
      `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#base"/></svg>`
    );
    expect(ids).toHaveLength(1);
    expect(editor.serialize()).toContain(`xmlns:xlink`);
    expect(editor._internal.history.undo_label()).toBe("paste");
    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
  });
});

describe("clipboard.* registry handlers", () => {
  it("registers all three command ids", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    expect(editor.commands.has("clipboard.copy")).toBe(true);
    expect(editor.commands.has("clipboard.cut")).toBe(true);
    expect(editor.commands.has("clipboard.paste")).toBe(true);
  });

  it("gates on select mode — refuses during content edit", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    editor.commands.select(first_rect(editor));
    editor.commands.set_mode("edit-content");
    expect(editor.commands.invoke("clipboard.copy")).toBe(false);
    expect(editor.commands.invoke("clipboard.cut")).toBe(false);
    expect(editor.commands.invoke("clipboard.paste")).toBe(false);
  });

  it("copy / cut handlers guard on empty selection", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    expect(editor.commands.invoke("clipboard.copy")).toBe(false);
    expect(editor.commands.invoke("clipboard.cut")).toBe(false);
  });

  it("paste handler routes through the provider when configured", async () => {
    const { provider } = fake_provider({ read: `<circle r="3"/>` });
    const editor = createSvgEditor({
      svg: WITH_RECT,
      providers: { clipboard: provider },
    });
    expect(editor.commands.invoke("clipboard.paste")).toBe(true);
    await tick();
    expect(provider.read).toHaveBeenCalledTimes(1);
    expect(editor.serialize()).toContain(`<circle r="3"/>`);
  });

  it("paste handler prefers explicitly delivered args.text over the provider", async () => {
    const { provider } = fake_provider({ read: `<rect width="9"/>` });
    const editor = createSvgEditor({
      svg: WITH_RECT,
      providers: { clipboard: provider },
    });
    expect(
      editor.commands.invoke("clipboard.paste", { text: `<circle r="7"/>` })
    ).toBe(true);
    expect(editor.serialize()).toContain(`<circle r="7"/>`);
    await tick();
    expect(provider.read).not.toHaveBeenCalled();
  });

  it("paste handler falls back to the buffer with honest chain semantics", () => {
    const editor = createSvgEditor({ svg: WITH_RECT });
    // Empty buffer → false (chain may keep going).
    expect(editor.commands.invoke("clipboard.paste")).toBe(false);
    editor.commands.select(first_rect(editor));
    expect(editor.commands.invoke("clipboard.copy")).toBe(true);
    expect(editor.commands.invoke("clipboard.paste")).toBe(true);
    expect(editor.serialize().match(/<rect/g)).toHaveLength(2);
  });
});

// Regression contract for the editor `_internal` bag.
//
// The DOM surface drives preview sessions (drag, resize, set-endpoint) by
// reaching into `editor._internal.history.preview()` and `editor._internal.emit()`.
// Those fields are not on the public API surface, but removing them silently
// breaks the surface at runtime — the tests that exercise headless paths
// don't catch it.
//
// This test pins the shape of `_internal` so future cleanup can't trim
// fields the surface depends on without a corresponding test update.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect id="r" x="0" y="0" width="10" height="10" fill="red"/>
</svg>`;

type Internal = {
  doc: {
    text_of: (id: string) => string;
    set_text: (id: string, text: string) => void;
    all_elements: () => string[];
  };
  history: {
    preview: (label: string) => unknown;
    undo_label: () => string | null;
  };
  clipboard: { copy: () => string | null; cut: () => string | null };
  insert_text_preview: (
    initial: Readonly<Record<string, string>>,
    opts?: { parent?: string }
  ) => { id: string; commit: () => void; discard: () => void };
  emit: () => void;
  bump_geometry: () => void;
  subscribe_translate_commit: (cb: () => void) => () => void;
  notify_translate_commit: () => void;
  set_content_edit_driver: (fn: unknown) => void;
  set_surface_hover_override_driver: (fn: unknown) => void;
  push_surface_hover: (id: unknown) => void;
  push_pick: (e: unknown) => void;
  set_computed_resolver: (fn: unknown) => void;
  set_geometry: (p: unknown) => void;
};

function internalOf(editor: ReturnType<typeof createSvgEditor>): Internal {
  return (editor as unknown as { _internal: Internal })._internal;
}

describe("editor._internal contract", () => {
  it("exposes the fields the DOM surface depends on", () => {
    const editor = createSvgEditor({ svg: SVG });
    const internal = internalOf(editor);
    expect(Object.keys(internal).sort()).toEqual(
      [
        "clipboard",
        "doc",
        "emit",
        "bump_geometry",
        "history",
        "insert_text_preview",
        "notify_translate_commit",
        "push_pick",
        "push_surface_hover",
        "set_computed_resolver",
        "set_content_edit_driver",
        "set_geometry",
        "set_surface_hover_override_driver",
        "subscribe_translate_commit",
      ].sort()
    );
    expect(typeof internal.history.preview).toBe("function");
    expect(typeof internal.history.undo_label).toBe("function");
    expect(typeof internal.clipboard.copy).toBe("function");
    expect(typeof internal.clipboard.cut).toBe("function");
    expect(typeof internal.emit).toBe("function");
    expect(typeof internal.subscribe_translate_commit).toBe("function");
    expect(typeof internal.notify_translate_commit).toBe("function");
  });

  it("history.preview opens a session that commits into editor history", () => {
    const editor = createSvgEditor({ svg: SVG });
    const internal = internalOf(editor);
    expect(editor.state.can_undo).toBe(false);

    let applied = 0;
    let reverted = 0;
    const session = internal.history.preview("test") as {
      set: (d: {
        providerId: string;
        apply: () => void;
        revert: () => void;
      }) => void;
      commit: () => void;
      discard: () => void;
    };
    session.set({
      providerId: "test",
      apply: () => {
        applied++;
      },
      revert: () => {
        reverted++;
      },
    });
    session.commit();

    expect(applied).toBeGreaterThan(0);
    expect(reverted).toBe(0);
    expect(editor.state.can_undo).toBe(true);

    editor.commands.undo();
    expect(reverted).toBeGreaterThan(0);
    expect(editor.state.can_undo).toBe(false);
  });

  it("emit() bumps state.version so subscribers re-snapshot", () => {
    const editor = createSvgEditor({ svg: SVG });
    const internal = internalOf(editor);
    const v0 = editor.state.version;
    let fired = 0;
    const unsub = editor.subscribe(() => {
      fired++;
    });
    internal.emit();
    unsub();
    expect(editor.state.version).toBeGreaterThan(v0);
    expect(fired).toBeGreaterThan(0);
  });
});

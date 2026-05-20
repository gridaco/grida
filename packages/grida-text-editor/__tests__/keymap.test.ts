import { describe, expect, it } from "vitest";
import { key_event_to_action } from "../src/keymap";

// Duck-typed: vitest's node env doesn't have KeyboardEvent. keymap only
// reads `.key`, `.metaKey`, `.ctrlKey`, `.altKey`, `.shiftKey` — a plain
// object is enough.
function ev(init: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): KeyboardEvent {
  return {
    key: init.key,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
  } as unknown as KeyboardEvent;
}

const onMac = (e: KeyboardEvent) => key_event_to_action(e, true);
const onWin = (e: KeyboardEvent) => key_event_to_action(e, false);

describe("key_event_to_action — lifecycle", () => {
  it("Enter → commit", () => {
    expect(onMac(ev({ key: "Enter" }))).toEqual({ kind: "commit" });
    expect(onWin(ev({ key: "Enter" }))).toEqual({ kind: "commit" });
  });

  it("Escape → cancel", () => {
    expect(onMac(ev({ key: "Escape" }))).toEqual({ kind: "cancel" });
  });
});

describe("key_event_to_action — deletion (Mac)", () => {
  it("Backspace → grapheme", () => {
    expect(onMac(ev({ key: "Backspace" }))).toEqual({
      kind: "command",
      cmd: { type: "backspace", granularity: "grapheme" },
    });
  });

  it("Option+Backspace → word (Mac word-mod is Alt)", () => {
    expect(onMac(ev({ key: "Backspace", altKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "backspace", granularity: "word" },
    });
  });

  it("Cmd+Backspace → line (Mac line-mod is Cmd)", () => {
    expect(onMac(ev({ key: "Backspace", metaKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "backspace", granularity: "line" },
    });
  });

  it("Cmd+Delete → line-forward", () => {
    expect(onMac(ev({ key: "Delete", metaKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "delete", granularity: "line" },
    });
  });
});

describe("key_event_to_action — deletion (Win/Linux)", () => {
  it("Ctrl+Backspace → word (Win/Linux word-mod is Ctrl)", () => {
    expect(onWin(ev({ key: "Backspace", ctrlKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "backspace", granularity: "word" },
    });
  });

  it("Alt+Backspace → grapheme on Win/Linux (Alt is not the word mod)", () => {
    expect(onWin(ev({ key: "Backspace", altKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "backspace", granularity: "grapheme" },
    });
  });
});

describe("key_event_to_action — navigation (Mac)", () => {
  it("ArrowLeft → grapheme left", () => {
    expect(onMac(ev({ key: "ArrowLeft" }))).toEqual({
      kind: "command",
      cmd: { type: "move_left", extend: false, granularity: "grapheme" },
    });
  });

  it("Option+ArrowLeft → word left", () => {
    expect(onMac(ev({ key: "ArrowLeft", altKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "move_left", extend: false, granularity: "word" },
    });
  });

  it("Cmd+ArrowLeft → line start (V1 single-line → doc start)", () => {
    expect(onMac(ev({ key: "ArrowLeft", metaKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "move_doc_start", extend: false },
    });
  });

  it("Cmd+Shift+ArrowRight → line end + extend", () => {
    expect(
      onMac(ev({ key: "ArrowRight", metaKey: true, shiftKey: true }))
    ).toEqual({
      kind: "command",
      cmd: { type: "move_doc_end", extend: true },
    });
  });

  it("Shift+Option+ArrowLeft → word left + extend", () => {
    expect(
      onMac(ev({ key: "ArrowLeft", altKey: true, shiftKey: true }))
    ).toEqual({
      kind: "command",
      cmd: { type: "move_left", extend: true, granularity: "word" },
    });
  });
});

describe("key_event_to_action — vertical navigation", () => {
  it("ArrowUp → move_up (layout-dependent)", () => {
    expect(onMac(ev({ key: "ArrowUp" }))).toEqual({
      kind: "command",
      cmd: { type: "move_up", extend: false },
    });
    expect(onWin(ev({ key: "ArrowUp" }))).toEqual({
      kind: "command",
      cmd: { type: "move_up", extend: false },
    });
  });

  it("ArrowDown → move_down", () => {
    expect(onMac(ev({ key: "ArrowDown" }))).toEqual({
      kind: "command",
      cmd: { type: "move_down", extend: false },
    });
  });

  it("Shift+ArrowUp → move_up with extend", () => {
    expect(onMac(ev({ key: "ArrowUp", shiftKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "move_up", extend: true },
    });
  });

  it("Cmd+ArrowUp on Mac → doc start", () => {
    expect(onMac(ev({ key: "ArrowUp", metaKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "move_doc_start", extend: false },
    });
  });

  it("Cmd+ArrowDown on Mac → doc end", () => {
    expect(onMac(ev({ key: "ArrowDown", metaKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "move_doc_end", extend: false },
    });
  });

  it("PageUp / PageDown → page_up / page_down", () => {
    expect(onMac(ev({ key: "PageUp" }))).toEqual({
      kind: "command",
      cmd: { type: "page_up", extend: false },
    });
    expect(onMac(ev({ key: "PageDown" }))).toEqual({
      kind: "command",
      cmd: { type: "page_down", extend: false },
    });
  });
});

describe("key_event_to_action — navigation (Win/Linux)", () => {
  it("Ctrl+ArrowRight → word right", () => {
    expect(onWin(ev({ key: "ArrowRight", ctrlKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "move_right", extend: false, granularity: "word" },
    });
  });

  it("Home → doc start", () => {
    expect(onWin(ev({ key: "Home" }))).toEqual({
      kind: "command",
      cmd: { type: "move_doc_start", extend: false },
    });
  });

  it("End → doc end", () => {
    expect(onWin(ev({ key: "End" }))).toEqual({
      kind: "command",
      cmd: { type: "move_doc_end", extend: false },
    });
  });
});

describe("key_event_to_action — modifier keys", () => {
  it("Cmd+A → select_all (Mac)", () => {
    expect(onMac(ev({ key: "a", metaKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "select_all" },
    });
  });

  it("Ctrl+A → select_all (Win)", () => {
    expect(onWin(ev({ key: "a", ctrlKey: true }))).toEqual({
      kind: "command",
      cmd: { type: "select_all" },
    });
  });

  it("Cmd+Z → undo (Mac)", () => {
    expect(onMac(ev({ key: "z", metaKey: true }))).toEqual({ kind: "undo" });
  });

  it("Cmd+Shift+Z → redo (Mac)", () => {
    expect(onMac(ev({ key: "z", metaKey: true, shiftKey: true }))).toEqual({
      kind: "redo",
    });
  });

  it("Cmd+Y on Mac is NOT redo (legacy emacs-y noise)", () => {
    expect(onMac(ev({ key: "y", metaKey: true }))).toBeNull();
  });

  it("Ctrl+Y on Win → redo", () => {
    expect(onWin(ev({ key: "y", ctrlKey: true }))).toEqual({ kind: "redo" });
  });

  it("Cmd+C/X/V → copy/cut/paste (Mac)", () => {
    expect(onMac(ev({ key: "c", metaKey: true }))).toEqual({ kind: "copy" });
    expect(onMac(ev({ key: "x", metaKey: true }))).toEqual({ kind: "cut" });
    expect(onMac(ev({ key: "v", metaKey: true }))).toEqual({ kind: "paste" });
  });

  it("Ctrl+C/X/V → copy/cut/paste (Win)", () => {
    expect(onWin(ev({ key: "c", ctrlKey: true }))).toEqual({ kind: "copy" });
  });
});

describe("key_event_to_action — fallthrough", () => {
  it("plain printable key returns null", () => {
    expect(onMac(ev({ key: "a" }))).toBeNull();
    expect(onWin(ev({ key: "1" }))).toBeNull();
  });
});

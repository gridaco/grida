import { describe, expect, it } from "vitest";
import { apply_command } from "../src/edit-command";
import {
  MockLayoutEngine,
  type NavigationDirection,
} from "../src/layout-engine";
import { TextEditSession } from "../src/session";

describe("apply_command — mutations", () => {
  it("insert returns 'typing' for a single char", () => {
    const s = new TextEditSession("ab");
    s.moveCaret(2, false);
    const kind = apply_command(s, { type: "insert", text: "c" });
    expect(s.text).toBe("abc");
    expect(kind).toBe("typing");
  });

  it("insert returns 'paste' for multi-char", () => {
    const s = new TextEditSession("ab");
    s.moveCaret(2, false);
    const kind = apply_command(s, { type: "insert", text: "cd" });
    expect(s.text).toBe("abcd");
    expect(kind).toBe("paste");
  });

  it("backspace grapheme deletes one char", () => {
    const s = new TextEditSession("hello");
    const kind = apply_command(s, { type: "backspace" });
    expect(s.text).toBe("hell");
    expect(kind).toBe("backspace");
  });

  it("backspace word deletes the previous word", () => {
    const s = new TextEditSession("hello world");
    const kind = apply_command(s, {
      type: "backspace",
      granularity: "word",
    });
    expect(s.text).toBe("hello ");
    expect(kind).toBe("backspace");
  });

  it("delete grapheme at end is a no-op", () => {
    const s = new TextEditSession("hi");
    const kind = apply_command(s, { type: "delete" });
    expect(kind).toBeNull();
    expect(s.text).toBe("hi");
  });

  it("delete word forward removes the next word", () => {
    const s = new TextEditSession("hello world");
    s.moveCaret(0, false);
    const kind = apply_command(s, { type: "delete", granularity: "word" });
    expect(s.text).toBe(" world");
    expect(kind).toBe("delete");
  });
});

describe("apply_command — navigation", () => {
  it("move_left grapheme moves the caret back one", () => {
    const s = new TextEditSession("abc");
    apply_command(s, { type: "move_left", extend: false });
    expect(s.caret).toBe(2);
  });

  it("move_left word jumps to the previous word", () => {
    const s = new TextEditSession("hello world");
    apply_command(s, {
      type: "move_left",
      extend: false,
      granularity: "word",
    });
    expect(s.caret).toBe(6);
  });

  it("move_right grapheme advances by one", () => {
    const s = new TextEditSession("abc");
    s.moveCaret(0, false);
    apply_command(s, { type: "move_right", extend: false });
    expect(s.caret).toBe(1);
  });

  it("move_right word advances past the current word", () => {
    const s = new TextEditSession("hello world");
    s.moveCaret(0, false);
    apply_command(s, {
      type: "move_right",
      extend: false,
      granularity: "word",
    });
    expect(s.caret).toBe(5);
  });

  it("move_doc_start jumps to 0", () => {
    const s = new TextEditSession("hello");
    apply_command(s, { type: "move_doc_start", extend: false });
    expect(s.caret).toBe(0);
  });

  it("move_doc_end jumps to text.length", () => {
    const s = new TextEditSession("hello");
    s.moveCaret(0, false);
    apply_command(s, { type: "move_doc_end", extend: false });
    expect(s.caret).toBe(5);
  });

  it("extend=true builds a selection", () => {
    const s = new TextEditSession("hello");
    s.moveCaret(0, false);
    apply_command(s, {
      type: "move_right",
      extend: true,
      granularity: "word",
    });
    expect(s.selection).toEqual({ start: 0, end: 5 });
  });
});

describe("apply_command — selection collapse on arrow", () => {
  it("move_left with selection collapses to selection.start (no extra step)", () => {
    const s = new TextEditSession("Click an element");
    // Select "an" (indices 6..8)
    apply_command(s, { type: "set_selection", anchor: 6, focus: 8 });
    expect(s.selection).toEqual({ start: 6, end: 8 });
    apply_command(s, { type: "move_left", extend: false });
    expect(s.caret).toBe(6); // start of selection, NOT 7 (one past) or 5
    expect(s.selection).toBeNull();
  });

  it("move_right with selection collapses to selection.end", () => {
    const s = new TextEditSession("Click an element");
    apply_command(s, { type: "set_selection", anchor: 6, focus: 8 });
    apply_command(s, { type: "move_right", extend: false });
    expect(s.caret).toBe(8);
    expect(s.selection).toBeNull();
  });

  it("move_left with reverse-anchor selection still collapses to start", () => {
    const s = new TextEditSession("hello world");
    // Anchor at 7, focus at 3 → selection [3, 7], but caret is at 3
    apply_command(s, { type: "set_selection", anchor: 7, focus: 3 });
    expect(s.selection).toEqual({ start: 3, end: 7 });
    apply_command(s, { type: "move_left", extend: false });
    expect(s.caret).toBe(3);
    expect(s.selection).toBeNull();
  });

  it("move_left with select_all collapses to 0", () => {
    const s = new TextEditSession("hello");
    apply_command(s, { type: "select_all" });
    apply_command(s, { type: "move_left", extend: false });
    expect(s.caret).toBe(0);
    expect(s.selection).toBeNull();
  });

  it("move_right with select_all collapses to text.length", () => {
    const s = new TextEditSession("hello");
    apply_command(s, { type: "select_all" });
    apply_command(s, { type: "move_right", extend: false });
    expect(s.caret).toBe(5);
    expect(s.selection).toBeNull();
  });

  it("move_left with extend=true still moves past the selection edge", () => {
    const s = new TextEditSession("Click an element");
    apply_command(s, { type: "set_selection", anchor: 6, focus: 8 });
    // Shift+Left: extend selection by one grapheme on the focus side
    apply_command(s, { type: "move_left", extend: true });
    expect(s.caret).toBe(7);
    expect(s.selection).toEqual({ start: 6, end: 7 });
  });

  it("move_left word granularity with selection still collapses (granularity ignored)", () => {
    const s = new TextEditSession("hello world foo");
    apply_command(s, { type: "set_selection", anchor: 6, focus: 11 });
    apply_command(s, {
      type: "move_left",
      extend: false,
      granularity: "word",
    });
    expect(s.caret).toBe(6);
    expect(s.selection).toBeNull();
  });
});

describe("apply_command — selection", () => {
  it("select_all selects the whole text", () => {
    const s = new TextEditSession("abc");
    apply_command(s, { type: "select_all" });
    expect(s.selection).toEqual({ start: 0, end: 3 });
  });

  it("set_selection drives anchor + focus", () => {
    const s = new TextEditSession("hello");
    apply_command(s, { type: "set_selection", anchor: 1, focus: 4 });
    expect(s.selection).toEqual({ start: 1, end: 4 });
  });

  it("select_at word selects the word at index", () => {
    const s = new TextEditSession("hello world");
    apply_command(s, {
      type: "select_at",
      index: 8,
      granularity: "word",
    });
    expect(s.selection).toEqual({ start: 6, end: 11 });
  });

  it("select_at line selects all (V1 single-line)", () => {
    const s = new TextEditSession("hello world");
    apply_command(s, {
      type: "select_at",
      index: 5,
      granularity: "line",
    });
    expect(s.selection).toEqual({ start: 0, end: 11 });
  });
});

describe("apply_command — layout-dependent navigation", () => {
  it("move_up without layout is a no-op", () => {
    const s = new TextEditSession("hello");
    s.moveCaret(3, false);
    apply_command(s, { type: "move_up", extend: false });
    expect(s.caret).toBe(3);
  });

  it("move_up consults the layout's positionForNavigation", () => {
    const s = new TextEditSession("hello");
    s.moveCaret(3, false);
    // Mock layout that returns 0 for "up"
    class L extends MockLayoutEngine {
      override positionForNavigation(
        _i: number,
        d: NavigationDirection
      ): number | null {
        return d === "up" ? 0 : null;
      }
    }
    apply_command(s, { type: "move_up", extend: false }, new L(() => s.text));
    expect(s.caret).toBe(0);
  });

  it("move_down with extend creates selection", () => {
    const s = new TextEditSession("hello");
    s.moveCaret(0, false);
    class L extends MockLayoutEngine {
      override positionForNavigation(
        _i: number,
        d: NavigationDirection
      ): number | null {
        return d === "down" ? 5 : null;
      }
    }
    apply_command(s, { type: "move_down", extend: true }, new L(() => s.text));
    expect(s.selection).toEqual({ start: 0, end: 5 });
  });

  it("move_line_start / move_line_end resolve via layout", () => {
    const s = new TextEditSession("hello world");
    s.moveCaret(7, false);
    class L extends MockLayoutEngine {
      override positionForNavigation(
        _i: number,
        d: NavigationDirection
      ): number | null {
        if (d === "line_start") return 0;
        if (d === "line_end") return s.text.length;
        return null;
      }
    }
    const layout = new L(() => s.text);
    apply_command(s, { type: "move_line_start", extend: false }, layout);
    expect(s.caret).toBe(0);
    apply_command(s, { type: "move_line_end", extend: false }, layout);
    expect(s.caret).toBe(11);
  });

  it("page_up / page_down route through layout", () => {
    const s = new TextEditSession("abc");
    class L extends MockLayoutEngine {
      override positionForNavigation(
        _i: number,
        d: NavigationDirection
      ): number | null {
        if (d === "page_up") return 0;
        if (d === "page_down") return 3;
        return null;
      }
    }
    const layout = new L(() => s.text);
    apply_command(s, { type: "page_down", extend: false }, layout);
    expect(s.caret).toBe(3);
    apply_command(s, { type: "page_up", extend: false }, layout);
    expect(s.caret).toBe(0);
  });
});

describe("apply_command — composition (IME)", () => {
  it("composition_set creates a preedit at the caret", () => {
    const s = new TextEditSession("ab");
    apply_command(s, { type: "composition_set", text: "に" });
    expect(s.composition).toEqual({ start: 2, text: "に" });
    expect(s.displayText).toBe("abに");
    expect(s.text).toBe("ab"); // committed text unchanged
  });

  it("composition_set updates an existing preedit", () => {
    const s = new TextEditSession("");
    apply_command(s, { type: "composition_set", text: "n" });
    apply_command(s, { type: "composition_set", text: "に" });
    expect(s.composition?.text).toBe("に");
  });

  it("composition_commit finalizes the text", () => {
    const s = new TextEditSession("");
    apply_command(s, { type: "composition_set", text: "に" });
    const kind = apply_command(s, {
      type: "composition_commit",
      text: "日",
    });
    expect(s.text).toBe("日");
    expect(s.composition).toBeNull();
    expect(kind).toBe("ime_commit");
  });

  it("composition_cancel discards the preedit", () => {
    const s = new TextEditSession("ab");
    apply_command(s, { type: "composition_set", text: "X" });
    apply_command(s, { type: "composition_cancel" });
    expect(s.text).toBe("ab");
    expect(s.composition).toBeNull();
  });
});

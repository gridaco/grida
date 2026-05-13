import { describe, expect, it } from "vitest";
import { TextEditSession } from "../src/session";

describe("TextEditSession", () => {
  it("constructs with the caret at the end of the initial text", () => {
    const s = new TextEditSession("hello");
    expect(s.text).toBe("hello");
    expect(s.caret).toBe(5);
    expect(s.selection).toBeNull();
  });

  it("inserts text at the caret and advances the caret", () => {
    const s = new TextEditSession("ab");
    s.moveCaret(1, false);
    s.insertText("X");
    expect(s.text).toBe("aXb");
    expect(s.caret).toBe(2);
  });

  it("inserting with an active selection replaces the range", () => {
    const s = new TextEditSession("hello");
    s.selectAll();
    s.insertText("Hi");
    expect(s.text).toBe("Hi");
    expect(s.caret).toBe(2);
    expect(s.selection).toBeNull();
  });

  it("deleteBackward removes the char before the caret", () => {
    const s = new TextEditSession("abc");
    s.deleteBackward();
    expect(s.text).toBe("ab");
    expect(s.caret).toBe(2);
  });

  it("deleteBackward with selection removes the range", () => {
    const s = new TextEditSession("hello world");
    s.moveCaret(5, false);
    s.moveCaret(0, true); // selection = [0,5]
    s.deleteBackward();
    expect(s.text).toBe(" world");
    expect(s.caret).toBe(0);
  });

  it("deleteForward removes the char at the caret", () => {
    const s = new TextEditSession("abc");
    s.moveCaret(0, false);
    s.deleteForward();
    expect(s.text).toBe("bc");
    expect(s.caret).toBe(0);
  });

  it("moveCaret with extend creates and grows a selection", () => {
    const s = new TextEditSession("hello");
    s.moveCaret(0, false);
    s.moveCaret(3, true);
    expect(s.selection).toEqual({ start: 0, end: 3 });
    s.moveCaret(5, true);
    expect(s.selection).toEqual({ start: 0, end: 5 });
  });

  it("moveCaret without extend clears any selection", () => {
    const s = new TextEditSession("hello");
    s.selectAll();
    s.moveCaret(2, false);
    expect(s.selection).toBeNull();
    expect(s.caret).toBe(2);
  });

  it("selectAll selects the whole text", () => {
    const s = new TextEditSession("abc");
    s.selectAll();
    expect(s.selection).toEqual({ start: 0, end: 3 });
  });

  it("replace overwrites a range and lands the caret after the inserted text", () => {
    const s = new TextEditSession("hello world");
    s.replace(6, 11, "there");
    expect(s.text).toBe("hello there");
    expect(s.caret).toBe(11);
  });

  it("moveCaret fires emit when anchor is cleared even if caret didn't move", () => {
    // Reproduces the bug where Shift+Home (caret=0, anchor=n) followed
    // by ArrowLeft (collapse to start) cleared the anchor but never
    // emitted, leaving the surface drawing a stale selection rect.
    const s = new TextEditSession("word");
    s.setSelection(4, 0); // anchor=4, caret=0 — selection [0, 4]
    let calls = 0;
    s.subscribe(() => calls++);
    s.moveCaret(0, false);
    // Caret didn't move (0 → 0) but anchor went from 4 → null.
    // Visible state changed → emit must fire.
    expect(s.selection).toBeNull();
    expect(s.caret).toBe(0);
    expect(calls).toBe(1);
  });

  it("moveCaret is a true no-op when nothing changes", () => {
    const s = new TextEditSession("hello");
    s.moveCaret(3, false);
    let calls = 0;
    s.subscribe(() => calls++);
    s.moveCaret(3, false); // identical state
    expect(calls).toBe(0);
  });

  it("subscribe is called on every mutation", () => {
    const s = new TextEditSession("ab");
    let calls = 0;
    const unsub = s.subscribe(() => calls++);
    s.insertText("c");
    s.deleteBackward();
    s.selectAll();
    s.moveCaret(0, false);
    expect(calls).toBe(4);
    unsub();
    s.insertText("X");
    expect(calls).toBe(4);
  });

  it("snapshot reflects current state", () => {
    const s = new TextEditSession("hi");
    s.moveCaret(0, false);
    s.moveCaret(2, true);
    expect(s.snapshot).toEqual({ text: "hi", caret: 2, anchor: 0 });
  });
});

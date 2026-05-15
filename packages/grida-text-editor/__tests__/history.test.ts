import { describe, expect, it } from "vitest";
import { HistoryStack } from "../src/history";
import type { SessionSnapshot } from "../src/session";

function snap(text: string, caret = text.length): SessionSnapshot {
  return { text, caret, anchor: null };
}

describe("HistoryStack", () => {
  it("starts empty", () => {
    const h = new HistoryStack();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it("push enables undo", () => {
    const h = new HistoryStack();
    h.push(snap(""), snap("a"), "typing");
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it("undo restores the before-snapshot", () => {
    const h = new HistoryStack();
    h.push(snap(""), snap("hi"), "paste");
    const before = h.undo();
    expect(before?.text).toBe("");
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
  });

  it("redo restores the after-snapshot", () => {
    const h = new HistoryStack();
    h.push(snap(""), snap("hi"), "paste");
    h.undo();
    const after = h.redo();
    expect(after?.text).toBe("hi");
  });

  it("typing within the merge window merges entries", () => {
    let t = 0;
    const h = new HistoryStack(() => t);
    h.push(snap(""), snap("h"), "typing");
    t += 100;
    h.push(snap("h"), snap("he"), "typing");
    t += 100;
    h.push(snap("he"), snap("hel"), "typing");
    expect(h.size).toBe(1);
    // Undo should go back to the start of the run, not one char back.
    expect(h.undo()?.text).toBe("");
  });

  it("typing past the merge window splits entries", () => {
    let t = 0;
    const h = new HistoryStack(() => t);
    h.push(snap(""), snap("h"), "typing");
    t += 3000; // exceeds 2s merge timeout
    h.push(snap("h"), snap("hi"), "typing");
    expect(h.size).toBe(2);
  });

  it("paste is never merged", () => {
    let t = 0;
    const h = new HistoryStack(() => t);
    h.push(snap(""), snap("a"), "paste");
    t += 100;
    h.push(snap("a"), snap("ab"), "paste");
    expect(h.size).toBe(2);
  });

  it("cut is never merged", () => {
    let t = 0;
    const h = new HistoryStack(() => t);
    h.push(snap("abc"), snap("bc"), "cut");
    t += 100;
    h.push(snap("bc"), snap("c"), "cut");
    expect(h.size).toBe(2);
  });

  it("ime_commit is never merged with itself or typing", () => {
    let t = 0;
    const h = new HistoryStack(() => t);
    h.push(snap(""), snap("に"), "ime_commit");
    t += 100;
    h.push(snap("に"), snap("にち"), "ime_commit");
    expect(h.size).toBe(2);
  });

  it("a new mutation truncates the redo tail", () => {
    let t = 0;
    const h = new HistoryStack(() => t);
    h.push(snap(""), snap("a"), "typing");
    t += 3000;
    h.push(snap("a"), snap("ab"), "typing");
    h.undo();
    expect(h.canRedo).toBe(true);
    t += 100;
    h.push(snap("a"), snap("ac"), "typing");
    expect(h.canRedo).toBe(false);
  });

  it("undo on empty stack returns null", () => {
    const h = new HistoryStack();
    expect(h.undo()).toBeNull();
  });

  it("redo on empty redo tail returns null", () => {
    const h = new HistoryStack();
    h.push(snap(""), snap("a"), "typing");
    expect(h.redo()).toBeNull();
  });
});

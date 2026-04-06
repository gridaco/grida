/**
 * Gate 3: Behavioral Correctness - Subscription System
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";

describe("Subscription (headless)", () => {
  let ed: Editor;

  beforeEach(() => {
    ed = createHeadlessEditor();
  });

  afterEach(() => {
    ed.dispose();
  });

  test("subscribe fires on dispatch", () => {
    const spy = vi.fn();
    ed.subscribe(spy);
    ed.doc.select(["rect-0"]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("subscribe fires on every dispatch", () => {
    const spy = vi.fn();
    ed.subscribe(spy);
    ed.doc.select(["rect-0"]);
    ed.doc.blur();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("unsubscribe stops notifications", () => {
    const spy = vi.fn();
    const unsub = ed.subscribe(spy);
    ed.doc.select(["rect-0"]);
    expect(spy).toHaveBeenCalledTimes(1);
    unsub();
    ed.doc.blur();
    expect(spy).toHaveBeenCalledTimes(1); // still 1
  });

  test("doc.subscribeWithSelector only fires on selected state change", () => {
    const spy = vi.fn();
    ed.doc.subscribeWithSelector(
      (state) => state.selection,
      (_doc, selection) => spy(selection),
      (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
    );

    // This should fire - selection changes
    ed.doc.select(["rect-0"]);
    expect(spy).toHaveBeenCalledTimes(1);

    // Dispatching a camera transform should NOT fire the selection subscriber
    ed.doc.dispatch({ type: "transform", transform: [[2, 0, 0], [0, 2, 0]], sync: false });
    expect(spy).toHaveBeenCalledTimes(1); // still 1
  });
});

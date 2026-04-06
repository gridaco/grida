/**
 * Gate 3: Behavioral Correctness - Selection
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";

describe("Selection (headless)", () => {
  let ed: Editor;

  beforeEach(() => {
    ed = createHeadlessEditor();
  });

  afterEach(() => {
    ed.dispose();
  });

  test("select single node", () => {
    ed.doc.select(["rect-0"]);
    expect(ed.state.selection).toEqual(["rect-0"]);
  });

  test("select multiple nodes", () => {
    ed.doc.select(["rect-0", "rect-1"]);
    expect(ed.state.selection).toEqual(["rect-0", "rect-1"]);
  });

  test("blur clears selection", () => {
    ed.doc.select(["rect-0"]);
    ed.doc.blur();
    expect(ed.state.selection).toEqual([]);
  });

  test("select with reset mode replaces selection", () => {
    ed.doc.select(["rect-0"]);
    ed.doc.select(["rect-1"], "reset");
    expect(ed.state.selection).toEqual(["rect-1"]);
  });

  test("select with add mode appends", () => {
    ed.doc.select(["rect-0"]);
    ed.doc.select(["rect-1"], "add");
    expect(ed.state.selection).toContain("rect-0");
    expect(ed.state.selection).toContain("rect-1");
  });

  test("select non-existent node throws", () => {
    // The reducer validates node existence and throws if not found
    expect(() => ed.doc.select(["does-not-exist"])).toThrow();
  });
});

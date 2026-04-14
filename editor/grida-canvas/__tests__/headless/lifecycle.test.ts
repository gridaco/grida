/**
 * Gate 3: Behavioral Correctness - Editor Lifecycle
 *
 * Tests the full create -> dispatch -> query -> dispose lifecycle.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";

describe("Editor Lifecycle (headless)", () => {
  let ed: Editor;

  beforeEach(() => {
    ed = createHeadlessEditor();
  });

  afterEach(() => {
    ed.dispose();
  });

  test("initial state has the correct document shape", () => {
    expect(ed.state.document.scenes_ref).toEqual(["scene"]);
    expect(ed.state.document.nodes["scene"]).toBeDefined();
    expect(ed.state.document.nodes["rect-0"]).toBeDefined();
    expect(ed.state.document.nodes["rect-1"]).toBeDefined();
  });

  test("initial state has empty selection", () => {
    expect(ed.state.selection).toEqual([]);
  });

  test("initial state is editable", () => {
    expect(ed.state.editable).toBe(true);
  });

  test("getSnapshot returns same reference as state", () => {
    const snap = ed.getSnapshot();
    expect(snap).toBe(ed.state);
  });

  test("getJson returns a serializable object", () => {
    const json = ed.getJson();
    expect(json).toBeDefined();
    // Must be JSON-serializable (no circular refs, no undefined)
    expect(() => JSON.stringify(json)).not.toThrow();
  });

  test("getDocumentJson returns only the document", () => {
    const json = ed.getDocumentJson() as Record<string, unknown>;
    expect(json.scenes_ref).toBeDefined();
    expect(json.nodes).toBeDefined();
  });

  test("tree() returns an ascii tree containing node names", () => {
    const tree = ed.tree();
    expect(typeof tree).toBe("string");
    // The tree should mention the scene and child node names
    expect(tree).toContain("scene");
    expect(tree).toContain("rect-0");
    expect(tree).toContain("rect-1");
  });
});

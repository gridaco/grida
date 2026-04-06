/**
 * Gate 1: Instantiation Gate
 *
 * Proves that Editor can be constructed and disposed in pure Node.js
 * without any browser globals (window, document, navigator, etc.).
 *
 * @vitest-environment node
 */
import { describe, test, expect } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";

describe("Gate 0: No browser globals present", () => {
  test("window is NOT defined (proves we are in pure Node.js, not jsdom)", () => {
    expect(typeof window).toBe("undefined");
  });

  test("document is NOT defined", () => {
    expect(typeof document).toBe("undefined");
  });

  test("HTMLElement is NOT defined", () => {
    expect(typeof HTMLElement).toBe("undefined");
  });
});

describe("Gate 1: Headless Instantiation", () => {
  test("Editor.createHeadless() succeeds", () => {
    const ed = createHeadlessEditor();
    expect(ed).toBeInstanceOf(Editor);
    ed.dispose();
  });

  test("editor.state is defined after construction", () => {
    const ed = createHeadlessEditor();
    expect(ed.state).toBeDefined();
    expect(ed.state.document).toBeDefined();
    expect(ed.state.document.nodes).toBeDefined();
    ed.dispose();
  });

  test("editor.doc (EditorDocumentStore) is available", () => {
    const ed = createHeadlessEditor();
    expect(ed.doc).toBeDefined();
    expect(ed.doc.state).toBe(ed.state);
    ed.dispose();
  });

  test("editor.surface (EditorSurface) is available", () => {
    const ed = createHeadlessEditor();
    expect(ed.surface).toBeDefined();
    ed.dispose();
  });

  test("editor.camera (Camera) is available", () => {
    const ed = createHeadlessEditor();
    expect(ed.camera).toBeDefined();
    expect(ed.camera.transform).toBeDefined();
    ed.dispose();
  });

  test("editor.commands alias points to doc", () => {
    const ed = createHeadlessEditor();
    expect(ed.commands).toBe(ed.doc);
    ed.dispose();
  });

  test("dispose does not throw", () => {
    const ed = createHeadlessEditor();
    expect(() => ed.dispose()).not.toThrow();
  });

  test("static createHeadless with custom viewport", () => {
    const ed = createHeadlessEditor({ viewport: { width: 800, height: 600 } });
    expect(ed.camera.viewport.size).toEqual({ width: 800, height: 600 });
    ed.dispose();
  });
});

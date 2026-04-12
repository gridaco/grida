/**
 * Tests for SlideEditorMode — stateless facade over Editor.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { editor } from "@/grida-canvas";
import {
  SlideEditorMode,
  createInitialSlidesDocument,
} from "@/grida-canvas/modes/slide-mode";

function createSlidesEditor(): Editor {
  return Editor.createHeadless(createInitialSlidesDocument());
}

describe("SlideEditorMode", () => {
  let ed: Editor;
  let mode: SlideEditorMode;

  beforeEach(() => {
    ed = createSlidesEditor();
    mode = new SlideEditorMode(ed);
  });

  afterEach(() => {
    mode.dispose();
    ed.dispose();
  });

  // ---- Construction ----

  test("initial document has editor_type 'slides'", () => {
    expect(ed.state.editor_type).toBe("slides");
  });

  test("constructor isolates the first slide", () => {
    expect(ed.state.isolation_root_node_id).toBe("slide-1");
  });

  test("slides returns the initial slide", () => {
    expect(mode.slides).toHaveLength(1);
    expect(mode.slides[0].id).toBe("slide-1");
    expect(mode.slides[0].index).toBe(0);
  });

  test("currentSlide returns the isolated slide", () => {
    expect(mode.currentSlide).not.toBeNull();
    expect(mode.currentSlide!.id).toBe("slide-1");
  });

  // ---- addSlide ----

  test("addSlide creates a new slide and isolates it", () => {
    const newId = mode.addSlide();
    expect(newId).not.toBeNull();
    expect(mode.slides).toHaveLength(2);
    expect(ed.state.isolation_root_node_id).toBe(newId);
  });

  test("addSlide positions the new slide correctly", () => {
    mode.addSlide();
    const slide2 = mode.slides[1];
    const node = ed.state.document.nodes[slide2.id];
    expect(node).toBeDefined();
    expect((node as any).layout_inset_left).toBe(1920 + 200); // slideWidth + slideGap
    expect((node as any).layout_inset_top).toBe(0);
  });

  // ---- navigateSlide ----

  test("navigateSlide moves to the next slide", () => {
    mode.addSlide();
    mode.goToSlide(0); // go back to first
    expect(mode.currentSlide!.index).toBe(0);
    mode.navigateSlide(1);
    expect(mode.currentSlide!.index).toBe(1);
  });

  test("navigateSlide clamps at boundaries", () => {
    mode.addSlide();
    mode.goToSlide(0);
    mode.navigateSlide(-1); // already at start
    expect(mode.currentSlide!.index).toBe(0);
    mode.goToSlide(1);
    mode.navigateSlide(1); // already at end
    expect(mode.currentSlide!.index).toBe(1);
  });

  // ---- deleteSlide ----

  test("deleteSlide removes a slide", () => {
    const newId = mode.addSlide()!;
    expect(mode.slides).toHaveLength(2);
    mode.deleteSlide(newId);
    expect(mode.slides).toHaveLength(1);
  });

  test("deleteSlide refuses to delete the last slide", () => {
    const result = mode.deleteSlide("slide-1");
    expect(result).toBe(false);
    expect(mode.slides).toHaveLength(1);
  });

  test("deleteSlide navigates to neighbor when isolated slide is deleted", () => {
    const newId = mode.addSlide()!;
    mode.goToSlide(0);
    mode.deleteSlide("slide-1");
    expect(mode.currentSlide).not.toBeNull();
    expect(mode.currentSlide!.id).toBe(newId);
  });

  // ---- duplicateSlide ----

  test("duplicateSlide creates a copy and isolates it", () => {
    const dupId = mode.duplicateSlide("slide-1");
    expect(dupId).not.toBeNull();
    expect(mode.slides).toHaveLength(2);
    expect(ed.state.isolation_root_node_id).toBe(dupId);
  });

  // ---- Post-dispatch invariant: isolation recovery ----

  test("resetDocument re-isolates first slide after document replacement", () => {
    const newDoc = createInitialSlidesDocument();
    const newState = editor.state.init(newDoc);
    mode.resetDocument(newState);
    expect(ed.state.isolation_root_node_id).not.toBeNull();
    expect(mode.slides.length).toBeGreaterThan(0);
    expect(ed.state.isolation_root_node_id).toBe(mode.slides[0].id);
  });

  test("falls back to first slide when isolated node disappears", () => {
    const newId = mode.addSlide()!;
    mode.goToSlide(newId);
    expect(ed.state.isolation_root_node_id).toBe(newId);
    // Delete the node via the raw editor command (bypassing mode guard)
    ed.commands.delete([newId]);
    // The hook should have fallen back to the first remaining slide
    expect(mode.slides).toHaveLength(1);
    expect(ed.state.isolation_root_node_id).toBe(mode.slides[0].id);
  });

  // ---- dispose ----

  test("dispose clears isolation", () => {
    expect(ed.state.isolation_root_node_id).not.toBeNull();
    mode.dispose();
    expect(ed.state.isolation_root_node_id).toBeNull();
  });

  test("dispose unregisters the hook (no re-isolation after further dispatches)", () => {
    mode.dispose();
    // Manually clear isolation — should stay null, no hook to re-set it
    ed.doc.setIsolation(null);
    expect(ed.state.isolation_root_node_id).toBeNull();
  });
});

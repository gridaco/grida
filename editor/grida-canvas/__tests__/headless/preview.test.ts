/**
 * Gate: Preview — hover-preview interactions don't pollute undo stack
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import { sceneNode, rectNode } from "@/grida-canvas/__tests__/utils/factories";
import type grida from "@grida/schema";

function createPreviewDocument(): grida.program.document.Document {
  return {
    scenes_ref: ["scene1"],
    links: {
      scene1: ["rect1"],
    },
    nodes: {
      scene1: sceneNode("scene1", "Scene 1"),
      rect1: rectNode("rect1", { name: "Original Name" }),
    },
    entry_scene_id: "scene1",
    bitmaps: {},
    images: {},
    properties: {},
  };
}

describe("Preview (headless)", () => {
  let ed: Editor;

  beforeEach(() => {
    ed = createHeadlessEditor({ document: createPreviewDocument() });
  });

  afterEach(() => {
    ed.dispose();
  });

  test("preview changes are applied to state", () => {
    ed.doc.previewStart("test");

    // Dispatch a change and capture it as preview
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "Preview A" });
    ed.doc.previewSet();

    expect((ed.state.document.nodes.rect1 as any).name).toBe("Preview A");
    // Not on the undo stack
    expect(ed.doc.historySnapshot.past).toHaveLength(0);

    ed.doc.previewDiscard();
  });

  test("preview set reverts previous before applying new", () => {
    ed.doc.previewStart("test");

    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "Preview A" });
    ed.doc.previewSet();
    expect((ed.state.document.nodes.rect1 as any).name).toBe("Preview A");

    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "Preview B" });
    ed.doc.previewSet();
    expect((ed.state.document.nodes.rect1 as any).name).toBe("Preview B");

    // Still not on the undo stack
    expect(ed.doc.historySnapshot.past).toHaveLength(0);

    ed.doc.previewDiscard();
  });

  test("preview discard reverts to original state", () => {
    const originalName = (ed.state.document.nodes.rect1 as any).name;

    ed.doc.previewStart("test");

    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "Preview A" });
    ed.doc.previewSet();

    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "Preview B" });
    ed.doc.previewSet();

    ed.doc.previewDiscard();
    expect((ed.state.document.nodes.rect1 as any).name).toBe(originalName);
    expect(ed.doc.historySnapshot.past).toHaveLength(0);
  });

  test("preview commit creates one undo step", () => {
    const originalName = (ed.state.document.nodes.rect1 as any).name;

    ed.doc.previewStart("test");

    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "Committed" });
    ed.doc.previewSet();

    ed.doc.previewCommit();

    expect((ed.state.document.nodes.rect1 as any).name).toBe("Committed");
    expect(ed.doc.historySnapshot.past).toHaveLength(1);

    // Undo reverts to original
    ed.doc.undo();
    expect((ed.state.document.nodes.rect1 as any).name).toBe(originalName);
  });

  test("isPreviewActive reflects preview state", () => {
    expect(ed.doc.isPreviewActive).toBe(false);
    ed.doc.previewStart("test");
    expect(ed.doc.isPreviewActive).toBe(true);
    ed.doc.previewDiscard();
    expect(ed.doc.isPreviewActive).toBe(false);
  });
});

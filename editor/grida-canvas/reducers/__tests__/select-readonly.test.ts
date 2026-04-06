/**
 * @vitest-environment node
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import { sceneNode, rectNode } from "@/grida-canvas/__tests__/utils/factories";
import type grida from "@grida/schema";

function createReadonlyDocument(): grida.program.document.Document {
  return {
    scenes_ref: ["scene1"],
    links: {
      scene1: ["node-1", "node-2"],
    },
    nodes: {
      scene1: sceneNode("scene1", "Scene 1"),
      "node-1": rectNode("node-1", { name: "Node 1" }),
      "node-2": rectNode("node-2", { name: "Node 2", x: 200 }),
    },
    entry_scene_id: "scene1",
    images: {},
    bitmaps: {},
    properties: {},
  };
}

describe("selection in readonly mode (editable: false)", () => {
  let ed: Editor;

  beforeEach(() => {
    ed = createHeadlessEditor({
      document: createReadonlyDocument(),
      editable: false,
    });
  });

  afterEach(() => {
    ed.dispose();
  });

  test("select single node", () => {
    expect(ed.state.selection).toEqual([]);
    ed.doc.select(["node-1"]);
    expect(ed.state.selection).toEqual(["node-1"]);
  });

  test("select multiple nodes", () => {
    ed.doc.select(["node-1", "node-2"]);
    expect(ed.state.selection).toEqual(["node-1", "node-2"]);
  });

  test("clear selection via blur", () => {
    ed.doc.select(["node-1"]);
    expect(ed.state.selection).toEqual(["node-1"]);
    ed.doc.blur();
    expect(ed.state.selection).toEqual([]);
  });

  test("replace existing selection", () => {
    ed.doc.select(["node-1"]);
    ed.doc.select(["node-2"]);
    expect(ed.state.selection).toEqual(["node-2"]);
  });

  test("does not mutate document nodes", () => {
    const originalNodes = ed.state.document.nodes;
    ed.doc.select(["node-1"]);
    expect(ed.state.document.nodes).toBe(originalNodes);
  });

  test("no-op when selection is unchanged", () => {
    ed.doc.select(["node-1"]);
    const stateAfterFirst = ed.state;
    ed.doc.select(["node-1"]);
    expect(ed.state).toBe(stateAfterFirst);
  });

  test("document-mutating actions are still blocked", () => {
    const originalDoc = ed.state.document;
    ed.doc.dispatch({
      type: "node/change/*",
      node_id: "node-1",
      name: "Modified",
    });
    expect(ed.state.document).toBe(originalDoc);
  });
});

/**
 * Gate 3: Behavioral Correctness - Node Property Changes
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import type grida from "@grida/schema";
import color from "@grida/color";

describe("Node Properties (headless)", () => {
  let ed: Editor;

  beforeEach(() => {
    ed = createHeadlessEditor();
  });

  afterEach(() => {
    ed.dispose();
  });

  test("change node name via dispatch", () => {
    ed.doc.dispatch({
      type: "node/change/*",
      node_id: "rect-0",
      name: "My Rectangle",
    });
    const node = ed.state.document.nodes["rect-0"] as grida.program.nodes.UnknownNode;
    expect(node.name).toBe("My Rectangle");
  });

  test("toggle node active", () => {
    const before = (ed.state.document.nodes["rect-0"] as grida.program.nodes.UnknownNode).active;
    ed.doc.toggleNodeActive("rect-0");
    const after = (ed.state.document.nodes["rect-0"] as grida.program.nodes.UnknownNode).active;
    expect(after).toBe(!before);
  });

  test("toggle node locked", () => {
    const before = (ed.state.document.nodes["rect-0"] as grida.program.nodes.UnknownNode).locked;
    ed.doc.toggleNodeLocked("rect-0");
    const after = (ed.state.document.nodes["rect-0"] as grida.program.nodes.UnknownNode).locked;
    expect(after).toBe(!before);
  });

  test("change opacity via dispatch", () => {
    ed.doc.dispatch({
      type: "node/change/*",
      node_id: "rect-0",
      opacity: 0.5,
    });
    const node = ed.state.document.nodes["rect-0"] as grida.program.nodes.UnknownNode;
    expect(node.opacity).toBe(0.5);
  });

  test("change rotation via dispatch", () => {
    ed.doc.dispatch({
      type: "node/change/*",
      node_id: "rect-0",
      rotation: 45,
    });
    const node = ed.state.document.nodes["rect-0"] as grida.program.nodes.UnknownNode;
    expect(node.rotation).toBe(45);
  });

  test("change fills applies the paint value", () => {
    const paint = {
      type: "solid" as const,
      color: color.colorformats.RGBA32F.BLACK,
      active: true,
    };
    ed.doc.changeNodePropertyFills(["rect-0"], [paint]);
    const node = ed.state.document.nodes["rect-0"] as any;
    // Fill can be stored as `fill` (single) or `fill_paints` (array)
    const fill = node.fill ?? node.fill_paints?.[0];
    expect(fill).toBeDefined();
    expect(fill.type).toBe("solid");
    expect(fill.active).toBe(true);
    // TODO: Assert the actual color value once the fill storage format
    // is stabilized (single `fill` vs `fill_paints` array).
  });

  test("change node size via dispatch", () => {
    ed.doc.dispatch({
      type: "node/change/*",
      node_id: "rect-0",
      layout_target_width: 300,
    });
    const node = ed.state.document.nodes["rect-0"] as grida.program.nodes.UnknownNode;
    expect(node.layout_target_width).toBe(300);
  });

  test("NodeProxy get/set roundtrip", () => {
    const proxy = ed.doc.getNodeById("rect-0");
    expect(proxy.id).toBe("rect-0");

    proxy.name = "Renamed";
    const node = ed.state.document.nodes["rect-0"] as grida.program.nodes.UnknownNode;
    expect(node.name).toBe("Renamed");
    expect(proxy.name).toBe("Renamed");
  });

  test("NodeProxy opacity set", () => {
    const proxy = ed.doc.getNodeById("rect-0");
    proxy.opacity = 0.3;
    const node = ed.state.document.nodes["rect-0"] as grida.program.nodes.UnknownNode;
    expect(node.opacity).toBe(0.3);
  });
});

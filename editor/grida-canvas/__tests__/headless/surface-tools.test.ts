/**
 * Gate 3: Behavioral Correctness - Surface Tools & Modes
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";

describe("Surface Tools (headless)", () => {
  let ed: Editor;

  beforeEach(() => {
    ed = createHeadlessEditor();
  });

  afterEach(() => {
    ed.dispose();
  });

  test("initial tool is cursor", () => {
    expect(ed.state.tool.type).toBe("cursor");
  });

  test("set tool to rectangle", () => {
    ed.surface.surfaceSetTool({ type: "insert", node: "rectangle" });
    expect(ed.state.tool.type).toBe("insert");
  });

  test("set tool back to cursor", () => {
    ed.surface.surfaceSetTool({ type: "insert", node: "rectangle" });
    ed.surface.surfaceSetTool({ type: "cursor" });
    expect(ed.state.tool.type).toBe("cursor");
  });

  test("a11yEscape resets tool to cursor", () => {
    ed.surface.surfaceSetTool({ type: "insert", node: "rectangle" });
    ed.surface.a11yEscape();
    expect(ed.state.tool.type).toBe("cursor");
  });

  test("a11yEscape on cursor with selection clears selection", () => {
    ed.doc.select(["rect-0"]);
    expect(ed.state.selection).toEqual(["rect-0"]);
    ed.surface.a11yEscape();
    expect(ed.state.selection).toEqual([]);
  });

  test("pixel grid toggle", () => {
    // Default state: check initial and toggle
    const initial = ed.state.pixelgrid;
    const result = ed.surface.surfaceTogglePixelGrid();
    expect(result).not.toBe(initial);
    expect(ed.state.pixelgrid).toBe(result);

    const result2 = ed.surface.surfaceTogglePixelGrid();
    expect(result2).toBe(initial);
  });

  test("ruler toggle", () => {
    const initial = ed.state.ruler;
    const result = ed.surface.surfaceToggleRuler();
    expect(result).not.toBe(initial);
    expect(ed.state.ruler).toBe(result);
  });

  test("outline mode toggle", () => {
    expect(ed.state.outline_mode).toBe("off");
    const result = ed.surface.surfaceToggleOutlineMode();
    expect(result).toBe("on");
    expect(ed.state.outline_mode).toBe("on");
  });

  test("onblur resets modifier state", () => {
    ed.surface.surfaceSetTool({ type: "insert", node: "rectangle" });
    ed.surface.onblur();
    expect(ed.state.tool.type).toBe("cursor");
  });

  test("surface measurement config updates state", () => {
    ed.surface.surfaceConfigureMeasurement("on");
    expect(ed.state.surface_measurement_targeting).toBe("on");
    ed.surface.surfaceConfigureMeasurement("off");
    expect(ed.state.surface_measurement_targeting).toBe("off");
  });

  test("modifier configs update state", () => {
    ed.surface.surfaceConfigureTranslateWithCloneModifier("on");
    expect(ed.state.gesture_modifiers.translate_with_clone).toBe("on");

    ed.surface.surfaceConfigureTranslateWithAxisLockModifier("on");
    expect(ed.state.gesture_modifiers.tarnslate_with_axis_lock).toBe("on");

    ed.surface.surfaceConfigureTransformWithCenterOriginModifier("on");
    expect(ed.state.gesture_modifiers.transform_with_center_origin).toBe("on");

    ed.surface.surfaceConfigureTransformWithPreserveAspectRatioModifier("on");
    expect(
      ed.state.gesture_modifiers.transform_with_preserve_aspect_ratio
    ).toBe("on");

    ed.surface.surfaceConfigureRotateWithQuantizeModifier(15);
    expect(ed.state.gesture_modifiers.rotate_with_quantize).toBe(15);

    ed.surface.surfaceConfigurePaddingWithMirroringModifier("on");
    expect(ed.state.gesture_modifiers.padding_with_axis_mirroring).toBe("on");
  });

  // TODO: Add state assertions for surfaceConfigureSurfaceRaycastTargeting
  // once the hit-testing config shape on IEditorState is confirmed stable.
  test("raycast targeting config does not throw", () => {
    expect(() =>
      ed.surface.surfaceConfigureSurfaceRaycastTargeting({ target: "auto" })
    ).not.toThrow();
  });
});

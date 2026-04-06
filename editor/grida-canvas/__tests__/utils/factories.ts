/**
 * Node factory functions and event data factories for tests.
 */
import type grida from "@grida/schema";
import color from "@grida/color";
import type { editor } from "@/grida-canvas";

/**
 * Create a minimal scene node.
 */
export function sceneNode(
  id: string,
  name?: string
): grida.program.nodes.SceneNode {
  return {
    type: "scene",
    id,
    name: name ?? id,
    active: true,
    locked: false,
    constraints: { children: "multiple" },
    guides: [],
    edges: [],
    background_color: null,
  };
}

/**
 * Create a minimal rectangle node at a given position.
 */
export function rectNode(
  id: string,
  opts?: {
    name?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }
): grida.program.nodes.RectangleNode {
  return {
    id,
    type: "rectangle",
    name: opts?.name ?? id,
    active: true,
    locked: false,
    layout_positioning: "absolute",
    layout_inset_left: opts?.x ?? 0,
    layout_inset_top: opts?.y ?? 0,
    layout_target_width: opts?.width ?? 100,
    layout_target_height: opts?.height ?? 100,
    rotation: 0,
    opacity: 1,
    z_index: 0,
    corner_radius: 0,
    stroke_width: 0,
    stroke_cap: "butt",
    stroke_join: "miter",
    fill: {
      type: "solid",
      color: color.colorformats.RGBA32F.BLACK,
      active: true,
    },
  } as grida.program.nodes.RectangleNode;
}

/**
 * Create a minimal text span node.
 */
export function textNode(
  id: string,
  text?: string
): grida.program.nodes.TextSpanNode {
  return {
    id,
    type: "tspan",
    name: id,
    active: true,
    locked: false,
    layout_positioning: "absolute",
    layout_inset_left: 0,
    layout_inset_top: 0,
    layout_target_width: 200,
    layout_target_height: 40,
    rotation: 0,
    opacity: 1,
    z_index: 0,
    text: text ?? "Hello",
    font_family: "Inter",
    font_weight: 400,
    font_size: 16,
    line_height: 1.2,
    letter_spacing: 0,
    text_align: "left",
    text_align_vertical: "top",
    fill: {
      type: "solid",
      color: color.colorformats.RGBA32F.BLACK,
      active: true,
    },
  } as grida.program.nodes.TextSpanNode;
}

/**
 * Create a minimal container node.
 *
 * TODO: Fill in all required ContainerNode fields (layout_mode,
 * layout_direction, layout_main_axis_alignment, etc.) so the
 * `as unknown` cast can be removed.
 */
export function containerNode(
  id: string,
  name?: string
): grida.program.nodes.ContainerNode {
  return {
    id,
    type: "container",
    name: name ?? id,
    active: true,
    locked: false,
    layout_positioning: "absolute",
    layout_inset_left: 0,
    layout_inset_top: 0,
    layout_target_width: 400,
    layout_target_height: 400,
    rotation: 0,
    opacity: 1,
    z_index: 0,
    layout: "flow",
    clips_content: false,
  } as unknown as grida.program.nodes.ContainerNode;
}

/**
 * Create a mock pointer event data object for headless surface testing.
 * Satisfies `editor.api.events.IPointerEvent`.
 */
export function mockPointerEvent(
  opts?: Partial<editor.api.events.IPointerEvent>
): editor.api.events.IPointerEvent {
  return {
    clientX: opts?.clientX ?? 0,
    clientY: opts?.clientY ?? 0,
    button: opts?.button ?? 0,
    shiftKey: opts?.shiftKey ?? false,
    ctrlKey: opts?.ctrlKey ?? false,
    metaKey: opts?.metaKey ?? false,
    altKey: opts?.altKey ?? false,
  };
}

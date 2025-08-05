import type { Draft } from "immer";
import { editor } from "@/grida-canvas";
import { getVectorSelectionStartPoint } from "./selection";

/**
 * Selects the given tool and stores the previous tool type.
 */
export function self_select_tool<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  tool: editor.state.ToolMode
) {
  if (
    draft.flags.__unstable_brush_tool !== "on" &&
    (tool.type === "brush" || tool.type === "eraser")
  ) {
    console.warn("unstable brush tool is not enabled");
    return;
  }

  const vector_edit_mode_valid_tool_modes: editor.state.ToolModeType[] = [
    "cursor",
    "hand",
    "bend",
    "path",
    "lasso",
  ];
  const text_edit_mode_valid_tool_modes: editor.state.ToolModeType[] = [
    "cursor",
  ];
  const bitmap_edit_mode_valid_tool_modes: editor.state.ToolModeType[] = [
    "brush",
    "eraser",
    "flood-fill",
  ];
  const no_content_edit_mode_valid_enter_tool_modes: editor.state.ToolModeType[] =
    ["cursor", "hand", "zoom", "insert", "draw", "path"];

  // validate cursor mode
  if (draft.content_edit_mode) {
    switch (draft.content_edit_mode.type) {
      case "vector":
        if (!vector_edit_mode_valid_tool_modes.includes(tool.type)) return;
        break;
      case "text":
        if (!text_edit_mode_valid_tool_modes.includes(tool.type)) return;
        break;
      case "bitmap":
        if (!bitmap_edit_mode_valid_tool_modes.includes(tool.type)) {
          draft.content_edit_mode = undefined;
        }
        break;
    }
  } else {
    if (!no_content_edit_mode_valid_enter_tool_modes.includes(tool.type))
      return;
  }

  draft.__tool_previous = draft.tool;
  draft.tool = tool;

  if (tool.type === "path" && draft.content_edit_mode?.type === "vector") {
    const { selected_vertices, selected_tangents } = draft.content_edit_mode;
    draft.content_edit_mode.a_point = getVectorSelectionStartPoint({
      selected_vertices,
      selected_tangents,
    });
  }
}

/**
 * Reverts to the previously selected tool type.
 */
export function self_revert_tool<S extends editor.state.IEditorState>(
  draft: Draft<S>
) {
  if (!draft.__tool_previous) return;
  draft.tool = draft.__tool_previous;
  draft.__tool_previous = null;
}

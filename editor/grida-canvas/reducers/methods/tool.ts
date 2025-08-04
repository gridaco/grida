import type { Draft } from "immer";
import { editor } from "@/grida-canvas";

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
  }

  draft.__tool_previous = draft.tool;
  draft.tool = tool;
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

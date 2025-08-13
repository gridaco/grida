import type { Draft } from "immer";
import { editor } from "@/grida-canvas";
import { getVectorSelectionStartPoint } from "./selection";

const VECTOR_EDIT_MODE_VALID_TOOL_MODES: editor.state.ToolModeType[] = [
  "cursor",
  "hand",
  "bend",
  "path",
  "lasso",
  "width",
];
const TEXT_EDIT_MODE_VALID_TOOL_MODES: editor.state.ToolModeType[] = ["cursor"];
const BITMAP_EDIT_MODE_VALID_TOOL_MODES: editor.state.ToolModeType[] = [
  "brush",
  "eraser",
  "flood-fill",
];
const NO_CONTENT_EDIT_MODE_VALID_TOOL_MODES: editor.state.ToolModeType[] = [
  "cursor",
  "hand",
  "zoom",
  "insert",
  "draw",
  "path",
];
// when reverting a tool while no content edit mode is active, path is invalid
const NO_CONTENT_EDIT_MODE_VALID_REVERT_TOOL_MODES: editor.state.ToolModeType[] =
  ["cursor", "hand", "zoom", "insert", "draw"];

function validToolModesForContentEditMode(
  mode: editor.state.ContentEditModeState | undefined,
  opts: { for: "select" | "revert" } = { for: "select" }
): editor.state.ToolModeType[] {
  switch (mode?.type) {
    case "vector":
      return VECTOR_EDIT_MODE_VALID_TOOL_MODES;
    case "text":
      return TEXT_EDIT_MODE_VALID_TOOL_MODES;
    case "bitmap":
      return BITMAP_EDIT_MODE_VALID_TOOL_MODES;
    default:
      return opts.for === "revert"
        ? NO_CONTENT_EDIT_MODE_VALID_REVERT_TOOL_MODES
        : NO_CONTENT_EDIT_MODE_VALID_TOOL_MODES;
  }
}

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

  const valid_tool_modes = validToolModesForContentEditMode(
    draft.content_edit_mode
  );
  if (!valid_tool_modes.includes(tool.type)) {
    if (draft.content_edit_mode?.type === "bitmap") {
      draft.content_edit_mode = undefined;
    } else {
      return;
    }
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
  const next_tool = draft.__tool_previous;
  draft.__tool_previous = null;

  const valid_tool_modes = validToolModesForContentEditMode(
    draft.content_edit_mode,
    { for: "revert" }
  );
  if (valid_tool_modes.includes(next_tool.type)) {
    draft.tool = next_tool;
  } else {
    draft.tool = { type: "cursor" };
  }
}

import type { Draft } from "immer";
import { editor } from "@/grida-canvas";
import { getVectorSelectionStartPoint } from "./selection";
import type { ReducerContext } from "..";
import { __self_try_enter_content_edit_mode_vector } from "../surface.reducer";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";

const VECTOR_EDIT_MODE_VALID_TOOL_MODES: editor.state.ToolModeType[] = [
  "cursor",
  "hand",
  "bend",
  "path",
  "lasso",
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

function validToolsForContentEditMode(
  mode: editor.state.ContentEditModeState["type"] | undefined,
  opts: { for: "select" | "revert" } = { for: "select" }
): editor.state.ToolModeType[] {
  switch (mode) {
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

function isValidToolForContentEditMode(
  mode: editor.state.ContentEditModeState["type"] | undefined,
  tool: editor.state.ToolModeType
) {
  const valid_tool_modes = validToolsForContentEditMode(mode);
  return valid_tool_modes.includes(tool);
}

export function self_select_cursor_tool<S extends editor.state.IEditorState>(
  draft: Draft<S>
) {
  draft.tool = { type: "cursor" };
}

/**
 * Selects the given tool and stores the previous tool type.
 */
export function self_select_tool<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  tool: editor.state.ToolMode,
  context: ReducerContext
) {
  const current_tool = draft.tool.type;
  if (
    draft.flags.__unstable_brush_tool !== "on" &&
    (tool.type === "brush" || tool.type === "eraser")
  ) {
    console.warn("unstable brush tool is not enabled");
    return;
  }

  // width tool can only be selected when in vector edit mode, and when selected, it sets the mode to width
  if (tool.type === "width") {
    if (
      draft.content_edit_mode?.type === "vector" ||
      draft.content_edit_mode?.type === "width"
    ) {
      // TODO: additional validation required - check if the network has 0 or exactly 1 loop.
      draft.tool = { type: "width" };
      // Get the current node to initialize the width profile
      const node = dq.__getNodeById(
        draft,
        draft.content_edit_mode.node_id
      ) as grida.program.nodes.VectorNode;

      const currentProfile = node.stroke_width_profile || { stops: [] };
      draft.content_edit_mode = {
        type: "width",
        node_id: draft.content_edit_mode.node_id,
        snapped_p: null,
        initial_vector_network: draft.content_edit_mode.initial_vector_network,
        variable_width_selected_stop: null,
        initial_variable_width_profile: currentProfile,
        variable_width_profile: { ...currentProfile },
      };
      return;
    }
  }
  // exiting the width tool automatically goes back to the vector edit mode
  else if (current_tool === "width") {
    if (draft.content_edit_mode?.type !== "width") {
      reportError("must be in width edit mode - logical error");
    } else {
      let next_tool: editor.state.ToolMode = tool;
      if (!isValidToolForContentEditMode("vector", tool.type)) {
        // fallback to cursor
        next_tool = { type: "cursor" };
      }

      draft.tool = next_tool;
      __self_try_enter_content_edit_mode_vector(
        draft,
        draft.content_edit_mode.node_id,
        context
      );
      return;
    }
  }

  const valid_tool_modes = validToolsForContentEditMode(
    draft.content_edit_mode?.type
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
    const { selection } = draft.content_edit_mode;
    draft.content_edit_mode.a_point = getVectorSelectionStartPoint(selection);
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

  const valid_tool_modes = validToolsForContentEditMode(
    draft.content_edit_mode?.type,
    { for: "revert" }
  );
  if (valid_tool_modes.includes(next_tool.type)) {
    draft.tool = next_tool;
  } else {
    draft.tool = { type: "cursor" };
  }
}

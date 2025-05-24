import type { editor } from "@/grida-canvas";

export type ToolbarToolType =
  | "cursor"
  | "hand"
  | "rectangle"
  | "ellipse"
  | "text"
  | "container"
  | "image"
  | "line"
  | "pencil"
  | "brush"
  | "eraser"
  | "flood-fill"
  | "path";

export function toolmode_to_toolbar_value(
  cm: editor.state.ToolMode
): ToolbarToolType {
  switch (cm.type) {
    case "cursor":
    case "zoom":
      return "cursor";
    case "hand":
      return "hand";
    case "insert":
      return cm.node;
    case "draw":
      return cm.tool;
    case "path":
      return "path";
    case "brush":
      return "brush";
    case "eraser":
      return "eraser";
    case "flood-fill":
      return "flood-fill";
  }
}

export function toolbar_value_to_cursormode(
  tt: ToolbarToolType
): editor.state.ToolMode {
  switch (tt) {
    case "cursor":
      return { type: "cursor" };
    case "hand":
      return { type: "hand" };
    case "container":
    case "ellipse":
    case "image":
    case "rectangle":
    case "text":
      return { type: "insert", node: tt };
    case "line":
    case "pencil":
      return { type: "draw", tool: tt };
    case "path":
      return { type: "path" };
    case "brush":
      return { type: "brush" };
    case "eraser":
      return { type: "eraser" };
    case "flood-fill":
      return { type: "flood-fill" };
    default:
      return { type: "cursor" };
  }
}

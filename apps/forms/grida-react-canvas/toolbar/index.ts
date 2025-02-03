import type { ToolMode } from "../state";

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
  | "path";

export function toolmode_to_toolbar_value(cm: ToolMode): ToolbarToolType {
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
  }
}

export function toolbar_value_to_cursormode(tt: ToolbarToolType): ToolMode {
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
      return { type: "brush" };
    default:
      return { type: "cursor" };
  }
}

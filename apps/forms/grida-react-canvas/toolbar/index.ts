import type { CursorMode } from "../state";

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
  | "paint"
  | "eraser"
  | "path";

export function cursormode_to_toolbar_value(cm: CursorMode): ToolbarToolType {
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
      return cm.brush;
  }
}

export function toolbar_value_to_cursormode(tt: ToolbarToolType): CursorMode {
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
    case "paint":
    case "eraser":
      return { type: "brush", brush: tt };
    default:
      return { type: "cursor" };
  }
}

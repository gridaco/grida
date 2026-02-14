import type { editor } from "@/grida-canvas";

export type ToolbarToolType =
  | "cursor"
  | "scale"
  | "hand"
  | "rectangle"
  | "ellipse"
  | "text"
  | "polygon"
  | "star"
  | "container"
  | "image"
  | "line"
  | "arrow"
  | "pencil"
  | "brush"
  | "eraser"
  | "flood-fill"
  | "path"
  | "bend"
  | "width"
  | "lasso";

export function toolmode_to_toolbar_value(
  cm: editor.state.ToolMode
): ToolbarToolType {
  switch (cm.type) {
    case "cursor":
    case "zoom":
      return "cursor";
    case "scale":
      return "scale";
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
    case "lasso":
      return "lasso";
    case "bend":
      return "bend";
    case "width":
      return "width";
  }
}

export function toolbar_value_to_cursormode(
  tt: ToolbarToolType
): editor.state.ToolMode {
  switch (tt) {
    case "cursor":
      return { type: "cursor" };
    case "scale":
      return { type: "scale" };
    case "hand":
      return { type: "hand" };
    case "container":
    case "ellipse":
    case "image":
    case "rectangle":
    case "text":
    case "polygon":
    case "star":
      return { type: "insert", node: tt };
    case "line":
    case "arrow":
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
    case "lasso":
      return { type: "lasso" };
    case "bend":
      return { type: "bend" };
    case "width":
      return { type: "width" };
    default:
      return { type: "cursor" };
  }
}

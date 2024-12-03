import { useHotkeys } from "react-hotkeys-hook";
import { useDocument, useEventTarget } from "../provider";

export function useEditorHotKeys() {
  const { setCursorMode } = useEventTarget();
  const {
    cut,
    copy,
    paste,
    deleteNode,
    nudge,
    configureSurfaceRaycastTargeting,
  } = useDocument();

  useHotkeys("meta+x, ctrl+x", () => cut("selection"));

  useHotkeys("meta+c, ctrl+c", () => copy("selection"));

  useHotkeys("meta+v, ctrl+v", () => paste());

  useHotkeys("Backspace, Delete", () => deleteNode("selection"));

  useHotkeys("ArrowRight", () => {
    nudge("selection", "x", 1);
  });

  useHotkeys("Shift+ArrowRight", () => {
    nudge("selection", "x", 10);
  });

  useHotkeys("ArrowLeft", () => {
    nudge("selection", "x", -1);
  });

  useHotkeys("Shift+ArrowLeft", () => {
    nudge("selection", "x", -10);
  });

  useHotkeys("ArrowUp", () => {
    nudge("selection", "y", -1);
  });

  useHotkeys("Shift+ArrowUp", () => {
    nudge("selection", "y", -10);
  });

  useHotkeys("ArrowDown", () => {
    nudge("selection", "y", 1);
  });

  useHotkeys("Shift+ArrowDown", () => {
    nudge("selection", "y", 10);
  });

  // keydown
  useHotkeys(
    "Meta, Control",
    () => {
      configureSurfaceRaycastTargeting({ target: "deepest" });
    },
    {
      keydown: true,
      keyup: false,
    }
  );

  // keyup
  useHotkeys(
    "Meta, Control",
    () => {
      configureSurfaceRaycastTargeting({ target: "shallowest" });
    },
    {
      keydown: false,
      keyup: true,
    }
  );

  useHotkeys("a, f", () => {
    setCursorMode({ type: "cursor" });
  });

  useHotkeys("a, f", () => {
    setCursorMode({ type: "insert", node: "container" });
  });

  useHotkeys("r", () => {
    setCursorMode({ type: "insert", node: "rectangle" });
  });

  useHotkeys("o", () => {
    setCursorMode({ type: "insert", node: "ellipse" });
  });

  useHotkeys("l", () => {
    setCursorMode({ type: "insert", node: "line" });
  });

  useHotkeys("t", () => {
    setCursorMode({ type: "insert", node: "text" });
  });
}

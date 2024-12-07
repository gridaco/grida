import { useHotkeys } from "react-hotkeys-hook";
import { useDocument, useEventTarget } from "../provider";
import toast from "react-hot-toast";

export function useEditorHotKeys() {
  const { setCursorMode, tryEnterContentEditMode, tryExitContentEditMode } =
    useEventTarget();
  const {
    cut,
    copy,
    paste,
    deleteNode,
    nudge,
    align,
    distributeEvenly,
    configureSurfaceRaycastTargeting,
    configureMeasurement,
    clearSelection,
    selectedNode,
  } = useDocument();

  // always triggering. (alt, meta, ctrl, shift)
  useHotkeys(
    "*",
    (e) => {
      switch (e.key) {
        case "Meta":
        case "Control":
          configureSurfaceRaycastTargeting({ target: "deepest" });
          break;
        case "Alt":
          configureMeasurement("on");
          break;
      }
      //
    },
    {
      keydown: true,
      keyup: false,
    }
  );

  useHotkeys(
    "*",
    (e) => {
      switch (e.key) {
        case "Meta":
        case "Control":
          configureSurfaceRaycastTargeting({ target: "shallowest" });
          break;
        case "Alt":
          configureMeasurement("off");
          break;
      }
      //
    },
    {
      keydown: false,
      keyup: true,
    }
  );
  //

  useHotkeys("meta+z, ctrl+z", () => {
    // TODO:
    toast.error("[undo] is not implemented yet");
  });

  useHotkeys("meta+shift+z, ctrl+shift+z", () => {
    // TODO:
    toast.error("[redo] is not implemented yet");
  });

  useHotkeys("meta+b, ctrl+b", () => {
    // TODO:
    toast.error("[bold] is not implemented yet");
  });

  useHotkeys("shift+r", () => {
    // TODO:
    toast.error("[ruler] is not implemented yet");
  });

  useHotkeys("meta+d, ctrl+d", () => {
    // TODO:
    toast.error("[duplicate] is not implemented yet");
  });

  useHotkeys("shift+h", () => {
    // TODO:
    toast.error("[flip horizontal] is not implemented yet");
  });

  useHotkeys("shift+v", () => {
    // TODO:
    toast.error("[flip vertical] is not implemented yet");
  });

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

  useHotkeys("enter", (e) => {
    // required for preventing this enter to replace autofocused content.
    e.stopPropagation();
    e.preventDefault();
    tryEnterContentEditMode();
  });

  useHotkeys("escape", (e) => {
    tryExitContentEditMode();
    clearSelection();
  });

  // keyup

  useHotkeys("v", () => {
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

  useHotkeys("0, 1, 2, 3, 4, 5, 6, 7, 8, 9", (e) => {
    const i = parseInt(e.key);
    const o = i / 10;
    selectedNode?.opacity(o);
    toast.success(`opacity: ${o}`);
  });

  useHotkeys("]", (e) => {
    selectedNode?.bringFront();
  });

  useHotkeys("[", (e) => {
    selectedNode?.pushBack();
  });

  useHotkeys("alt+a", (e) => {
    align("selection", {
      horizontal: "min",
    });
  });
  useHotkeys("alt+d", (e) => {
    align("selection", {
      horizontal: "max",
    });
  });
  useHotkeys("alt+w", (e) => {
    align("selection", {
      vertical: "min",
    });
  });
  useHotkeys("alt+s", (e) => {
    align("selection", {
      vertical: "max",
    });
  });

  useHotkeys("alt+v", (e) => {
    align("selection", {
      vertical: "center",
    });
  });
  useHotkeys("alt+h", (e) => {
    align("selection", {
      horizontal: "center",
    });
  });

  useHotkeys("alt+ctrl+v", (e) => {
    distributeEvenly("selection", "x");
  });

  useHotkeys("alt+ctrl+h", (e) => {
    distributeEvenly("selection", "y");
  });

  useHotkeys("shift+a", (e) => {
    // TODO:
    toast.error("[container layout] is not implemented yet");
  });

  useHotkeys("alt+meta+k, alt+ctrl+k", (e) => {
    // TODO:
    toast.error("[create component] is not implemented yet");
  });

  useHotkeys("alt+meta+b, alt+ctrl+b", (e) => {
    // TODO:
    toast.error("[eject component] is not implemented yet");
  });
}

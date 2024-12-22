import { useHotkeys } from "react-hotkeys-hook";
import { useDocument, useEventTarget } from "../provider";
import toast from "react-hot-toast";

export function useEditorHotKeys() {
  const { setCursorMode, tryEnterContentEditMode, tryExitContentEditMode } =
    useEventTarget();
  const {
    select,
    blur,
    undo,
    redo,
    cut,
    copy,
    paste,
    duplicate,
    deleteNode,
    nudge,
    nudgeResize,
    align,
    distributeEvenly,
    configureSurfaceRaycastTargeting,
    configureMeasurement,
    configureTranslateWithCloneModifier,
    configureTranslateWithAxisLockModifier,
    configureTransformWithCenterOriginModifier,
    configureTransformWithPreserveAspectRatioModifier,
    configureRotateWithQuantizeModifier,
    toggleActive,
    toggleLocked,
    toggleBold,
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
          configureTranslateWithCloneModifier("on");
          configureTransformWithCenterOriginModifier("on");
          break;
        case "Shift":
          configureTranslateWithAxisLockModifier("on");
          configureTransformWithPreserveAspectRatioModifier("on");
          configureRotateWithQuantizeModifier(15);
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
          configureSurfaceRaycastTargeting({ target: "next" });
          break;
        case "Alt":
          configureMeasurement("off");
          configureTranslateWithCloneModifier("off");
          configureTransformWithCenterOriginModifier("off");
          break;
        case "Shift":
          configureTranslateWithAxisLockModifier("off");
          configureTransformWithPreserveAspectRatioModifier("off");
          configureRotateWithQuantizeModifier("off");
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

  // #region selection
  useHotkeys(
    "meta+a, ctrl+a",
    () => {
      select("selection", "~");
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  useHotkeys(
    "enter",
    () => {
      select(">");
      tryEnterContentEditMode();
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  useHotkeys(
    "shift+enter, \\",
    () => {
      select("..");
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  useHotkeys(
    "tab",
    () => {
      // TODO: select next sibling
      toast.error("[next sibling] is not implemented yet");
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  useHotkeys(
    "shift+tab",
    () => {
      // TODO: select previous sibling
      toast.error("[prev sibling] is not implemented yet");
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  useHotkeys("escape, clear", (e) => {
    tryExitContentEditMode();
    blur();
  });

  useHotkeys(
    "meta+shift+h, ctrl+shift+h",
    () => {
      toggleActive("selection");
    },
    {
      preventDefault: true,
    }
  );

  useHotkeys("meta+shift+l, ctrl+shift+l", () => {
    toggleLocked("selection");
  });
  // #endregion

  useHotkeys("undo, meta+z, ctrl+z", () => {
    undo();
  });

  useHotkeys("redo, meta+shift+z, ctrl+shift+z", () => {
    redo();
  });

  useHotkeys("meta+b, ctrl+b", () => {
    toggleBold("selection");
  });

  useHotkeys("shift+r", () => {
    // TODO:
    toast.error("[ruler] is not implemented yet");
  });

  useHotkeys(
    "meta+d, ctrl+d",
    () => {
      duplicate("selection");
    },
    {
      preventDefault: true,
    }
  );

  useHotkeys("shift+h", () => {
    // TODO:
    toast.error("[flip horizontal] is not implemented yet");
  });

  useHotkeys("shift+v", () => {
    // TODO:
    toast.error("[flip vertical] is not implemented yet");
  });

  useHotkeys("cut, meta+x, ctrl+x", () => cut("selection"), {
    preventDefault: true,
    enableOnContentEditable: false,
    enableOnFormTags: false,
  });

  useHotkeys("copy, meta+c, ctrl+c", () => copy("selection"), {
    preventDefault: true,
    enableOnContentEditable: false,
    enableOnFormTags: false,
  });

  useHotkeys("paste, meta+v, ctrl+v", () => paste(), {
    preventDefault: true,
    enableOnContentEditable: false,
    enableOnFormTags: false,
  });

  useHotkeys("backspace, delete", () => deleteNode("selection"), {
    preventDefault: true,
    enableOnContentEditable: false,
    enableOnFormTags: false,
  });

  useHotkeys(
    "arrowright, arrowleft, arrowup, arrowdown",
    (e) => {
      e.preventDefault();
      const mod = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case "ArrowRight":
          nudge("selection", "x", mod);
          break;
        case "ArrowLeft":
          nudge("selection", "x", -mod);
          break;
        case "ArrowUp":
          nudge("selection", "y", -mod);
          break;
        case "ArrowDown":
          nudge("selection", "y", mod);
          break;
      }
    },
    {
      preventDefault: true,
      ignoreModifiers: true,
      ignoreEventWhen: (event) => event.ctrlKey,
    }
  );

  //

  useHotkeys("ctrl+alt+arrowright", () => {
    nudgeResize("selection", "x", 1);
  });

  useHotkeys("ctrl+alt+shift+arrowright", () => {
    nudgeResize("selection", "x", 10);
  });

  useHotkeys("ctrl+alt+arrowleft", () => {
    nudgeResize("selection", "x", -1);
  });

  useHotkeys("ctrl+alt+shift+arrowleft", () => {
    nudgeResize("selection", "x", -10);
  });

  useHotkeys("ctrl+alt+arrowup", () => {
    nudgeResize("selection", "y", -1);
  });

  useHotkeys("ctrl+alt+shift+arrowup", () => {
    nudgeResize("selection", "y", -10);
  });

  useHotkeys("ctrl+alt+arrowdown", () => {
    nudgeResize("selection", "y", 1);
  });

  useHotkeys("ctrl+alt+shift+arrowdown", () => {
    nudgeResize("selection", "y", 10);
  });

  // keyup

  useHotkeys("v, escape", () => {
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

  useHotkeys("t", () => {
    setCursorMode({ type: "insert", node: "text" });
  });

  useHotkeys("l", () => {
    setCursorMode({ type: "draw", tool: "line" });
  });

  useHotkeys("p", () => {
    setCursorMode({ type: "draw", tool: "polyline" });
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
  useHotkeys(
    "alt+d",
    (e) => {
      align("selection", {
        horizontal: "max",
      });
    },
    { preventDefault: true }
  );
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

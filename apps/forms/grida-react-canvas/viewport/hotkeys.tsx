import { useHotkeys } from "react-hotkeys-hook";
import { useDocument, useEventTarget, useSelection } from "../provider";
import toast from "react-hot-toast";
import { grida } from "@/grida";
import { useEffect } from "react";

export const keybindings_sheet = [
  {
    name: "select all siblings",
    description: "Select all siblings of the current selection",
    keys: ["meta+a"],
  },
  {
    name: "select children",
    description: "Select all children of the current selection",
    keys: ["enter"],
  },
  {
    name: "nudge",
    description: "Move selection by 1px",
    keys: ["arrowright", "arrowleft", "arrowup", "arrowdown"],
  },
  {
    name: "duplicate",
    description: "Duplicate the current selection",
    keys: ["meta+d"],
  },
  {
    name: "undo",
    description: "Undo the last action",
    keys: ["meta+z"],
  },
  {
    name: "redo",
    description: "Redo the last undone action",
    keys: ["meta+shift+z"],
  },
  {
    name: "cut",
    description: "Cut the current selection",
    keys: ["meta+x"],
  },
  {
    name: "copy",
    description: "Copy the current selection",
    keys: ["meta+c"],
  },
  {
    name: "paste",
    description: "Paste from the clipboard",
    keys: ["meta+v"],
  },
  {
    name: "toggle bold",
    description: "Toggle bold style",
    keys: ["meta+b"],
  },
  {
    name: "toggle active",
    description: "Toggle active state for the selection",
    keys: ["meta+shift+h"],
  },
  {
    name: "toggle locked",
    description: "Toggle locked state for the selection",
    keys: ["meta+shift+l"],
  },
  {
    name: "select parent",
    description: "Select the parent of the current selection",
    keys: ["shift+enter", "\\"],
  },
  {
    name: "select next sibling",
    description: "Select the next sibling of the current selection",
    keys: ["tab"],
  },
  {
    name: "select previous sibling",
    description: "Select the previous sibling of the current selection",
    keys: ["shift+tab"],
  },
  {
    name: "delete node",
    description: "Delete the current selection",
    keys: ["backspace", "delete"],
  },
  {
    name: "align left",
    description: "Align selection to the left",
    keys: ["alt+a"],
  },
  {
    name: "align right",
    description: "Align selection to the right",
    keys: ["alt+d"],
  },
  {
    name: "align top",
    description: "Align selection to the top",
    keys: ["alt+w"],
  },
  {
    name: "align bottom",
    description: "Align selection to the bottom",
    keys: ["alt+s"],
  },
  {
    name: "align horizontal center",
    description: "Align selection horizontally centered",
    keys: ["alt+h"],
  },
  {
    name: "align vertical center",
    description: "Align selection vertically centered",
    keys: ["alt+v"],
  },
  {
    name: "distribute horizontally",
    description: "Distribute selection evenly horizontally",
    keys: ["alt+ctrl+v"],
  },
  {
    name: "distribute vertically",
    description: "Distribute selection evenly vertically",
    keys: ["alt+ctrl+h"],
  },
];

export function useEditorHotKeys() {
  const { setCursorMode, tryExitContentEditMode, tryToggleContentEditMode } =
    useEventTarget();
  const {
    select,
    blur,
    undo,
    redo,
    cut,
    copy,
    duplicate,
    deleteNode,
    nudge,
    nudgeResize,
    align,
    order,
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
    setOpacity,
  } = useDocument();

  const { selection, actions } = useSelection();

  useEffect(() => {
    const cb = (e: any) => {
      configureSurfaceRaycastTargeting({ target: "auto" });
      configureMeasurement("off");
      configureTranslateWithCloneModifier("off");
      configureTransformWithCenterOriginModifier("off");
      configureTranslateWithAxisLockModifier("off");
      configureTransformWithPreserveAspectRatioModifier("off");
      configureRotateWithQuantizeModifier("off");
    };
    window.addEventListener("blur", cb);
    return () => {
      window.removeEventListener("blur", cb);
    };
  }, [
    configureMeasurement,
    configureRotateWithQuantizeModifier,
    configureSurfaceRaycastTargeting,
    configureTransformWithCenterOriginModifier,
    configureTransformWithPreserveAspectRatioModifier,
    configureTranslateWithAxisLockModifier,
    configureTranslateWithCloneModifier,
  ]);

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
          // NOTE: on some systems, the alt key focuses to the browser menu, so we need to prevent that. (e.g. alt key on windows/chrome)
          e.preventDefault();
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
          configureSurfaceRaycastTargeting({ target: "auto" });
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

  // #region selection
  useHotkeys(
    "i",
    () => {
      if (window.EyeDropper) {
        const eyeDropper = new window.EyeDropper();

        eyeDropper
          .open()
          .then(
            (result: {
              /**
               * A string representing the selected color, in hexadecimal sRGB format (#aabbcc).
               * @see https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper/open
               */
              sRGBHex: string;
            }) => {
              // set fill if selection
              if (selection.length > 0) {
                //
                const rgba = grida.program.cg.hex_to_rgba8888(result.sRGBHex);
                actions.fill({
                  type: "solid",
                  color: rgba,
                });
              }
              // copy to clipboard if no selection
              else {
                window.navigator.clipboard
                  .writeText(result.sRGBHex)
                  .then(() => {
                    toast.success(
                      `Copied hex color to clipboard  ${result.sRGBHex}`
                    );
                  });
              }
              result.sRGBHex;
            }
          )
          .catch((e: any) => {});
        //
      } else {
        toast.error("EyeDropper is not available on this browser (use Chrome)");
      }
    },
    {
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  useHotkeys(
    "enter",
    () => {
      select(">");

      // TODO: check if select(">") is possible first, then toggle when not possible
      tryToggleContentEditMode();
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
    preventDefault: false,
    enableOnContentEditable: false,
    enableOnFormTags: false,
  });

  // paste is handled via data transfer
  // useHotkeys("paste, meta+v, ctrl+v", () => paste(), {
  //   preventDefault: false,
  //   enableOnContentEditable: false,
  //   enableOnFormTags: false,
  // });

  useHotkeys("backspace, delete", () => deleteNode("selection"), {
    preventDefault: true,
    enableOnContentEditable: false,
    enableOnFormTags: false,
    ignoreEventWhen: (e) => e.defaultPrevented,
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
    setCursorMode({ type: "path" });
  });

  useHotkeys("shift+p", () => {
    setCursorMode({ type: "draw", tool: "pencil" });
  });

  useHotkeys("0, 1, 2, 3, 4, 5, 6, 7, 8, 9", (e) => {
    const i = parseInt(e.key);
    const o = i / 10;
    setOpacity("selection", o);
    toast.success(`opacity: ${o}`);
  });

  useHotkeys("]", (e) => {
    order("selection", "front");
  });

  useHotkeys("[", (e) => {
    order("selection", "back");
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

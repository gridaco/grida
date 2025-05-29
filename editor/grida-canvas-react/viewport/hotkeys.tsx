import { useHotkeys } from "react-hotkeys-hook";
import { useCurrentSelection, useToolState, useA11yActions } from "../provider";
import { toast } from "sonner";
import type cg from "@grida/cg";
import { useEffect, useRef } from "react";
import cmath from "@grida/cmath";
import { useCurrentEditor } from "../use-editor";

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
    name: "Auto-layout",
    description: "Auto-layout the current selection",
    keys: ["shift+a"],
  },
  {
    name: "Group with Container",
    description: "Group the current selection with a container",
    keys: ["ctrl+alt+g", "meta+alt+g"],
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
  {
    name: "zoom to fit",
    description: "Zoom to fit the content",
    keys: ["shift+1", "shift+9"],
  },
  {
    name: "zoom to selection",
    description: "Zoom to the current selection",
    keys: ["shift+2"],
  },
  {
    name: "zoom to 100%",
    description: "Zoom to 100%",
    keys: ["shift+0"],
  },
  {
    name: "zoom in",
    description: "Zoom in",
    keys: ["meta+=, ctrl+=", "meta+plus, ctrl+plus"],
  },
  {
    name: "zoom out",
    description: "Zoom out",
    keys: ["meta+minus, ctrl+minus"],
  },
  {
    name: "move to front",
    description: "Move the selection to the front",
    keys: ["]"],
  },
  {
    name: "move to back",
    description: "Move the selection to the back",
    keys: ["["],
  },
  {
    name: "hide/show ruler",
    description: "Toggle ruler visibility",
    keys: ["shift+r"],
  },
  {
    name: "hide/show pixel grid",
    description: "Toggle pixel grid visibility",
    keys: ["shift+'"],
  },
  {
    name: "preview",
    description: "preview current selection",
    keys: ["shift+space"],
  },
  {
    name: "eye dropper",
    description: "Use eye dropper to pick color",
    keys: ["i"],
  },
  {
    name: "hand tool",
    description: "Use hand tool to pan the canvas",
    keys: ["space"],
  },
  {
    name: "zoom tool",
    description: "Use zoom tool to zoom the canvas",
    keys: ["z"],
  },
  {
    name: "cursor",
    description: "Select tool",
    keys: ["v"],
  },
  {
    name: "hand",
    description: "Hand tool",
    keys: ["h"],
  },
  {
    name: "rectangle",
    description: "Rectangle tool",
    keys: ["r"],
  },
  {
    name: "ellipse",
    description: "Ellipse tool",
    keys: ["o"],
  },
  {
    name: "text",
    description: "Text tool",
    keys: ["t"],
  },
  {
    name: "line",
    description: "Line tool",
    keys: ["l"],
  },
  {
    name: "container",
    description: "Container tool",
    keys: ["a", "f"],
  },
  {
    name: "pencil",
    description: "Pencil tool",
    keys: ["shift+p"],
  },
  {
    name: "path",
    description: "Path tool",
    keys: ["p"],
  },
  {
    name: "brush",
    description: "Brush tool",
    keys: ["b"],
  },
  {
    name: "eraser",
    description: "Eraser tool",
    keys: ["e"],
  },
  {
    name: "paint bucket",
    description: "Paint bucket tool",
    keys: ["g"],
  },
  {
    name: "increase brush size",
    description: "Increase brush size",
    keys: ["]"],
  },
  {
    name: "decrease brush size",
    description: "Decrease brush size",
    keys: ["["],
  },
  {
    name: "set opacity to 0%",
    description: "Set opacity to 0%",
    keys: ["0+0"],
  },
  {
    name: "set opacity to 10%",
    description: "Set opacity to 10%",
    keys: ["1"],
  },
  {
    name: "set opacity to 50%",
    description: "Set opacity to 50%",
    keys: ["5"],
  },
  {
    name: "set opacity to 100%",
    description: "Set opacity to 100%",
    keys: ["0"],
  },
];

function useSingleDoublePressHotkey(
  key: string,
  cb: (pressType: "single" | "double") => void,
  options?: Parameters<typeof useHotkeys>[2]
) {
  const lastTime = useRef(0);

  useHotkeys(
    key,
    () => {
      const now = Date.now();
      if (now - lastTime.current < 300) {
        cb("double");
      } else {
        cb("single");
      }
      lastTime.current = now;
    },
    options
  );
}

export function useEditorHotKeys() {
  const editor = useCurrentEditor();
  const { tool, content_edit_mode } = useToolState();
  const { a11yarrow } = useA11yActions();

  const { selection, actions } = useCurrentSelection();

  useEffect(() => {
    const cb = (e: any) => {
      editor.configureSurfaceRaycastTargeting({ target: "auto" });
      editor.configureMeasurement("off");
      editor.configureTranslateWithCloneModifier("off");
      editor.configureTransformWithCenterOriginModifier("off");
      editor.configureTranslateWithAxisLockModifier("off");
      editor.configureTransformWithPreserveAspectRatioModifier("off");
      editor.configureRotateWithQuantizeModifier("off");
    };
    window.addEventListener("blur", cb);
    return () => {
      window.removeEventListener("blur", cb);
    };
  }, [editor]);

  // always triggering. (alt, meta, ctrl, shift)
  useHotkeys(
    "*",
    (e) => {
      switch (e.key) {
        case "Meta":
        case "Control":
          editor.configureSurfaceRaycastTargeting({ target: "deepest" });
          break;
        case "Alt":
          editor.configureMeasurement("on");
          editor.configureTranslateWithCloneModifier("on");
          editor.configureTransformWithCenterOriginModifier("on");
          // NOTE: on some systems, the alt key focuses to the browser menu, so we need to prevent that. (e.g. alt key on windows/chrome)
          e.preventDefault();
          break;
        case "Shift":
          editor.configureTranslateWithAxisLockModifier("on");
          editor.configureTransformWithPreserveAspectRatioModifier("on");
          editor.configureRotateWithQuantizeModifier(15);
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
          editor.configureSurfaceRaycastTargeting({ target: "auto" });
          break;
        case "Alt":
          editor.configureMeasurement("off");
          editor.configureTranslateWithCloneModifier("off");
          editor.configureTransformWithCenterOriginModifier("off");
          break;
        case "Shift":
          editor.configureTranslateWithAxisLockModifier("off");
          editor.configureTransformWithPreserveAspectRatioModifier("off");
          editor.configureRotateWithQuantizeModifier("off");
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

  const __hand_tool_triggered_by_hotkey = useRef(false);
  useHotkeys(
    "space",
    (e) => {
      // cancel if already in hand tool, but not triggered by hotkey
      if (tool.type === "hand" && !__hand_tool_triggered_by_hotkey.current)
        return;

      // check if up or down
      switch (e.type) {
        case "keydown":
          editor.setTool({ type: "hand" });
          __hand_tool_triggered_by_hotkey.current = true;
          break;
        case "keyup":
          editor.setTool({ type: "cursor" });
          __hand_tool_triggered_by_hotkey.current = false;
          break;
      }
    },
    {
      keydown: true,
      keyup: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  const __zoom_tool_triggered_by_hotkey = useRef(false);
  useHotkeys(
    "z",
    (e) => {
      // cancel if already in zoom tool, but not triggered by hotkey
      if (tool.type === "zoom" && !__zoom_tool_triggered_by_hotkey.current)
        return;

      // check if up or down
      switch (e.type) {
        case "keydown":
          editor.setTool({ type: "zoom" });
          __zoom_tool_triggered_by_hotkey.current = true;
          break;
        case "keyup":
          editor.setTool({ type: "cursor" });
          __zoom_tool_triggered_by_hotkey.current = false;
          break;
      }
    },
    {
      keydown: true,
      keyup: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  // #region selection
  useHotkeys(
    "meta+a, ctrl+a",
    () => {
      editor.select("selection", "~");
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
              const rgba = cmath.color.hex_to_rgba8888(result.sRGBHex);
              // set fill if selection
              if (selection.length > 0) {
                //
                actions.fill({
                  type: "solid",
                  color: rgba,
                } satisfies cg.SolidPaint);
              }
              // copy to clipboard if no selection
              else {
                // editor clipboard
                editor.setClipboardColor(rgba);
                // os clipboard
                window.navigator.clipboard
                  .writeText(result.sRGBHex)
                  .then(() => {
                    toast.success(
                      `Copied hex color to clipboard  ${result.sRGBHex}`
                    );
                  });
              }
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
      editor.select(">");

      // TODO: check if select(">") is possible first, then toggle when not possible
      editor.tryToggleContentEditMode();
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
      editor.select("..");
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
    editor.tryExitContentEditMode();
    editor.blur();
  });

  useHotkeys(
    "meta+shift+h, ctrl+shift+h",
    () => {
      editor.toggleActive("selection");
    },
    {
      preventDefault: true,
    }
  );

  useHotkeys("meta+shift+l, ctrl+shift+l", () => {
    editor.toggleLocked("selection");
  });
  // #endregion

  useHotkeys("undo, meta+z, ctrl+z", () => {
    editor.undo();
  });

  useHotkeys("redo, meta+shift+z, ctrl+shift+z", () => {
    editor.redo();
  });

  useHotkeys("meta+b, ctrl+b", () => {
    editor.toggleBold("selection");
  });

  useHotkeys("shift+r", () => {
    const v = editor.toggleRuler();
    toast.success(`Ruler ${v === "on" ? "on" : "off"}`);
  });

  useHotkeys("shift+\", shift+'", () => {
    const v = editor.togglePixelGrid();
    toast.success(`Pixel Grid ${v === "on" ? "on" : "off"}`);
  });

  useHotkeys(
    "meta+d, ctrl+d",
    () => {
      editor.duplicate("selection");
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

  useHotkeys("cut, meta+x, ctrl+x", () => editor.cut("selection"), {
    preventDefault: true,
    enableOnContentEditable: false,
    enableOnFormTags: false,
  });

  useHotkeys("copy, meta+c, ctrl+c", () => editor.copy("selection"), {
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

  useHotkeys("backspace, delete", () => editor.deleteNode("selection"), {
    preventDefault: true,
    enableOnContentEditable: false,
    enableOnFormTags: false,
    ignoreEventWhen: (e) => e.defaultPrevented,
  });

  useHotkeys(
    "arrowright, arrowleft, arrowup, arrowdown",
    (e) => {
      e.preventDefault();
      switch (e.key) {
        case "ArrowRight":
          a11yarrow("selection", "right", e.shiftKey);
          break;
        case "ArrowLeft":
          a11yarrow("selection", "left", e.shiftKey);
          break;
        case "ArrowUp":
          a11yarrow("selection", "up", e.shiftKey);
          break;
        case "ArrowDown":
          a11yarrow("selection", "down", e.shiftKey);
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
    editor.nudgeResize("selection", "x", 1);
  });

  useHotkeys("ctrl+alt+shift+arrowright", () => {
    editor.nudgeResize("selection", "x", 10);
  });

  useHotkeys("ctrl+alt+arrowleft", () => {
    editor.nudgeResize("selection", "x", -1);
  });

  useHotkeys("ctrl+alt+shift+arrowleft", () => {
    editor.nudgeResize("selection", "x", -10);
  });

  useHotkeys("ctrl+alt+arrowup", () => {
    editor.nudgeResize("selection", "y", -1);
  });

  useHotkeys("ctrl+alt+shift+arrowup", () => {
    editor.nudgeResize("selection", "y", -10);
  });

  useHotkeys("ctrl+alt+arrowdown", () => {
    editor.nudgeResize("selection", "y", 1);
  });

  useHotkeys("ctrl+alt+shift+arrowdown", () => {
    editor.nudgeResize("selection", "y", 10);
  });

  // keyup

  useHotkeys("v, escape", () => {
    editor.setTool({ type: "cursor" });
  });

  useHotkeys("h", () => {
    editor.setTool({ type: "hand" });
  });

  useHotkeys("a, f", () => {
    editor.setTool({ type: "insert", node: "container" });
  });

  useHotkeys("r", () => {
    editor.setTool({ type: "insert", node: "rectangle" });
  });

  useHotkeys("o", () => {
    editor.setTool({ type: "insert", node: "ellipse" });
  });

  useHotkeys("t", () => {
    editor.setTool({ type: "insert", node: "text" });
  });

  useHotkeys("l", () => {
    editor.setTool({ type: "draw", tool: "line" });
  });

  useHotkeys("p", () => {
    editor.setTool({ type: "path" });
  });

  useHotkeys("shift+p", () => {
    editor.setTool({ type: "draw", tool: "pencil" });
  });

  useHotkeys("b", () => {
    editor.setTool({
      type: "brush",
    });
  });

  useHotkeys("e", () => {
    editor.setTool({
      type: "eraser",
    });
  });

  useHotkeys("g", () => {
    if (content_edit_mode?.type === "bitmap") {
      editor.setTool({
        type: "flood-fill",
      });
    }
  });

  useHotkeys("1, 2, 3, 4, 5, 6, 7, 8, 9", (e) => {
    if (selection.length) {
      const i = parseInt(e.key);
      const o = i / 10;
      editor.setOpacity("selection", o);
      toast.success(`opacity: ${o}`);
    }
  });

  useSingleDoublePressHotkey("0", (type) => {
    const o = type === "single" ? 1 : 0;
    editor.setOpacity("selection", o);
    toast.success(`opacity: ${o}`);
  });

  useHotkeys("shift+0", (e) => {
    editor.scale(1, "center");
    toast.success(`Zoom to 100%`);
  });

  useHotkeys("shift+1, shift+9", (e) => {
    editor.fit("*", { margin: 64 });
    toast.success(`Zoom to fit`);
  });

  useHotkeys("shift+2", (e) => {
    editor.fit("selection", { margin: 64, animate: true });
    toast.success(`Zoom to selection`);
  });

  useHotkeys(
    "meta+=, ctrl+=, meta+plus, ctrl+plus",
    () => {
      editor.zoomIn();
    },
    { preventDefault: true }
  );

  useHotkeys(
    "meta+minus, ctrl+minus",
    () => {
      editor.zoomOut();
    },
    { preventDefault: true }
  );

  useHotkeys("]", (e) => {
    if (tool.type === "brush") {
      editor.changeBrushSize({ type: "delta", value: 1 });
    } else {
      editor.order("selection", "front");
    }
  });

  useHotkeys("[", (e) => {
    if (tool.type === "brush") {
      editor.changeBrushSize({ type: "delta", value: -1 });
    } else {
      editor.order("selection", "back");
    }
  });

  useHotkeys("alt+a", (e) => {
    editor.align("selection", {
      horizontal: "min",
    });
  });
  useHotkeys(
    "alt+d",
    (e) => {
      editor.align("selection", {
        horizontal: "max",
      });
    },
    { preventDefault: true }
  );
  useHotkeys("alt+w", (e) => {
    editor.align("selection", {
      vertical: "min",
    });
  });
  useHotkeys("alt+s", (e) => {
    editor.align("selection", {
      vertical: "max",
    });
  });

  useHotkeys("alt+v", (e) => {
    editor.align("selection", {
      vertical: "center",
    });
  });
  useHotkeys("alt+h", (e) => {
    editor.align("selection", {
      horizontal: "center",
    });
  });

  useHotkeys("alt+ctrl+v", (e) => {
    editor.distributeEvenly("selection", "x");
  });

  useHotkeys("alt+ctrl+h", (e) => {
    editor.distributeEvenly("selection", "y");
  });

  useHotkeys("shift+a", (e) => {
    editor.autoLayout("selection");
  });

  useHotkeys(
    "ctrl+g, meta+g",
    () => {
      // TODO:
      toast("use ⌥⌘G for grouping");
    },
    {
      preventDefault: true,
    }
  );

  useHotkeys("ctrl+alt+g, meta+alt+g", () => {
    editor.contain("selection");
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

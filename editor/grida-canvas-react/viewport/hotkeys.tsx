import { useHotkeys } from "react-hotkeys-hook";
import {
  useToolState,
  useA11yArrow,
  useContentEditModeMinimalState,
  useCurrentSelectionIds,
} from "../provider";
import { toast } from "sonner";
import type cg from "@grida/cg";
import { useEffect, useRef, useState } from "react";
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
    name: "flatten",
    description: "Flatten the current selection",
    keys: ["meta+e", "alt+shift+f"],
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
    name: "copy as png",
    description: "Copy selection as PNG",
    keys: ["meta+shift+c"],
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
    name: "toggle italic",
    description: "Toggle italic style",
    keys: ["meta+i"],
  },
  {
    name: "toggle line-through",
    description: "Toggle line-through style",
    keys: ["meta+shift+x"],
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
    name: "lasso",
    description: "Lasso tool (vector mode)",
    keys: ["q"],
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
    name: "polygon",
    description: "Polygon tool",
    keys: ["y"],
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
    name: "variable width",
    description: "Variable width tool",
    keys: ["shif+w"],
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
  const tool = useToolState();
  const content_edit_mode = useContentEditModeMinimalState();
  const { a11yarrow } = useA11yArrow();

  const selection = useCurrentSelectionIds();
  const [altKey, setAltKey] = useState(false);

  useEffect(() => {
    const cb = (e: FocusEvent) => {
      if (e.defaultPrevented) return;
      editor.surface.surfaceConfigureSurfaceRaycastTargeting({
        target: "auto",
      });
      editor.surface.surfaceConfigureMeasurement("off");
      editor.surface.surfaceConfigureTranslateWithCloneModifier("off");
      editor.surface.surfaceConfigureTransformWithCenterOriginModifier("off");
      editor.surface.surfaceConfigureTranslateWithAxisLockModifier("off");
      editor.surface.surfaceConfigureTransformWithPreserveAspectRatioModifier(
        "off"
      );
      editor.surface.surfaceConfigureRotateWithQuantizeModifier("off");
      editor.surface.surfaceConfigurePaddingWithMirroringModifier("off");
      setAltKey(false);
      editor.surface.surfaceSetTool({ type: "cursor" }, "window blur");
    };
    window.addEventListener("blur", cb);
    return () => {
      window.removeEventListener("blur", cb);
    };
  }, [editor]);

  useEffect(() => {
    let mode: "auto" | "all" | "none" = "auto";
    if (tool.type === "bend") {
      mode = "all";
    }
    if (altKey) {
      mode = "none";
    }
    editor.surface.surfaceConfigureCurveTangentMirroringModifier(mode);
  }, [tool.type, altKey, editor]);

  // always triggering. (alt, meta, ctrl, shift)
  useHotkeys(
    "*",
    (e) => {
      switch (e.key) {
        case "Meta":
          editor.surface.surfaceConfigureSurfaceRaycastTargeting({
            target: "deepest",
          });
          break;
        case "Control":
          editor.surface.surfaceConfigureSurfaceRaycastTargeting({
            target: "deepest",
          });
          editor.surface.surfaceConfigureTranslateWithForceDisableSnap("on");
          break;
        case "Alt":
          editor.surface.surfaceConfigureMeasurement("on");
          editor.surface.surfaceConfigureTranslateWithCloneModifier("on");
          editor.surface.surfaceConfigureTransformWithCenterOriginModifier(
            "on"
          );
          editor.surface.surfaceConfigurePaddingWithMirroringModifier("on");
          setAltKey(true);
          // NOTE: on some systems, the alt key focuses to the browser menu, so we need to prevent that. (e.g. alt key on windows/chrome)
          e.preventDefault();
          break;
        case "Shift":
          editor.surface.surfaceConfigureTranslateWithAxisLockModifier("on");
          editor.surface.surfaceConfigureTransformWithPreserveAspectRatioModifier(
            "on"
          );
          editor.surface.surfaceConfigureRotateWithQuantizeModifier(15);
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
          editor.surface.surfaceConfigureSurfaceRaycastTargeting({
            target: "auto",
          });
          break;
        case "Control":
          editor.surface.surfaceConfigureSurfaceRaycastTargeting({
            target: "auto",
          });
          editor.surface.surfaceConfigureTranslateWithForceDisableSnap("off");
          break;
        case "Alt":
          editor.surface.surfaceConfigureMeasurement("off");
          editor.surface.surfaceConfigureTranslateWithCloneModifier("off");
          editor.surface.surfaceConfigureTransformWithCenterOriginModifier(
            "off"
          );
          editor.surface.surfaceConfigurePaddingWithMirroringModifier("off");
          setAltKey(false);
          break;
        case "Shift":
          editor.surface.surfaceConfigureTranslateWithAxisLockModifier("off");
          editor.surface.surfaceConfigureTransformWithPreserveAspectRatioModifier(
            "off"
          );
          editor.surface.surfaceConfigureRotateWithQuantizeModifier("off");
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
          editor.surface.surfaceSetTool({ type: "hand" });
          __hand_tool_triggered_by_hotkey.current = true;
          break;
        case "keyup":
          editor.surface.surfaceSetTool({ type: "cursor" }, "hand tool keyup");
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
          editor.surface.surfaceSetTool({ type: "zoom" });
          __zoom_tool_triggered_by_hotkey.current = true;
          break;
        case "keyup":
          editor.surface.surfaceSetTool({ type: "cursor" });
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

  const __bend_tool_triggered_by_hotkey = useRef(false);
  useHotkeys(
    "meta",
    (e) => {
      if (e.type === "keydown" && content_edit_mode?.type !== "vector") return;
      if (tool.type === "bend" && !__bend_tool_triggered_by_hotkey.current)
        return;

      switch (e.type) {
        case "keydown":
          editor.surface.surfaceSetTool({ type: "bend" });
          __bend_tool_triggered_by_hotkey.current = true;
          break;
        case "keyup":
          editor.surface.surfaceSetTool({ type: "cursor" }, "bend tool keyup");
          __bend_tool_triggered_by_hotkey.current = false;
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
      editor.commands.select("selection", "~");
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
              const solidPaint: cg.SolidPaint = {
                type: "solid",
                color: rgba,
                active: true,
              };

              if (selection.length > 0) {
                editor.commands.changeNodePropertyFills(selection, [
                  solidPaint,
                ]);
              } else {
                editor.surface.a11ySetClipboardColor(rgba);
                window.navigator.clipboard
                  .writeText(result.sRGBHex)
                  .then(() => {
                    toast.success(
                      `Copied hex color to clipboard ${result.sRGBHex}`
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
      const maybe_selected = editor.commands.select(">");
      if (!maybe_selected) {
        // check if select(">") is possible first, then toggle when not possible
        editor.surface.surfaceTryToggleContentEditMode();
      }
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
      editor.commands.select("..");
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
      editor.commands.select("~+");
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
      editor.commands.select("~-");
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  useHotkeys("escape, clear", () => {
    editor.surface.a11yEscape();
  });

  useHotkeys(
    "meta+shift+h, ctrl+shift+h",
    () => {
      editor.surface.a11yToggleActive("selection");
    },
    {
      preventDefault: true,
    }
  );

  useHotkeys("meta+shift+l, ctrl+shift+l", () => {
    editor.surface.a11yToggleLocked("selection");
  });
  // #endregion

  useHotkeys(
    "undo, meta+z, ctrl+z",
    () => {
      editor.commands.undo();
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  useHotkeys(
    "redo, meta+shift+z, ctrl+shift+z",
    () => {
      editor.commands.redo();
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  useHotkeys("meta+b, ctrl+b", () => {
    editor.surface.a11yToggleBold("selection");
  });

  useHotkeys("meta+i, ctrl+i", () => {
    editor.surface.a11yToggleItalic("selection");
  });

  useHotkeys("meta+u, ctrl+u", () => {
    editor.surface.a11yToggleUnderline("selection");
  });

  useHotkeys("meta+shift+x, ctrl+shift+x", () => {
    editor.surface.a11yToggleLineThrough("selection");
  });

  useHotkeys("shift+r", () => {
    const v = editor.surface.surfaceToggleRuler();
    toast.success(`Ruler ${v === "on" ? "on" : "off"}`);
  });

  useHotkeys("shift+\", shift+'", () => {
    const v = editor.surface.surfaceTogglePixelGrid();
    toast.success(`Pixel Grid ${v === "on" ? "on" : "off"}`);
  });

  useHotkeys(
    "meta+d, ctrl+d",
    () => {
      editor.commands.duplicate("selection");
    },
    {
      preventDefault: true,
    }
  );

  useHotkeys(
    "meta+e, ctrl+e, alt+shift+f",
    () => {
      editor.commands.flatten("selection");
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

  useHotkeys("cut, meta+x, ctrl+x", () => editor.surface.a11yCut(), {
    preventDefault: true,
    enableOnContentEditable: false,
    enableOnFormTags: false,
  });

  useHotkeys("copy, meta+c, ctrl+c", () => editor.surface.a11yCopy(), {
    preventDefault: false,
    enableOnContentEditable: false,
    enableOnFormTags: false,
  });

  useHotkeys(
    "meta+shift+c, ctrl+shift+c",
    () => {
      if (editor.backend === "canvas") {
        const task = editor.surface.a11yCopyAsImage("png");
        toast.promise(task, {
          success: "Copied as PNG",
          error: "Failed to copy as PNG",
        });
      }
    },
    {
      preventDefault: true,
      enableOnContentEditable: false,
      enableOnFormTags: false,
    }
  );

  // paste is handled via data transfer
  // useHotkeys("paste, meta+v, ctrl+v", () => editor.a11yPaste(), {
  //   preventDefault: false,
  //   enableOnContentEditable: false,
  //   enableOnFormTags: false,
  // });

  useHotkeys("backspace, delete", () => editor.surface.a11yDelete(), {
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
    editor.surface.a11yNudgeResize("selection", "x", 1);
  });

  useHotkeys("ctrl+alt+shift+arrowright", () => {
    editor.surface.a11yNudgeResize("selection", "x", 10);
  });

  useHotkeys("ctrl+alt+arrowleft", () => {
    editor.surface.a11yNudgeResize("selection", "x", -1);
  });

  useHotkeys("ctrl+alt+shift+arrowleft", () => {
    editor.surface.a11yNudgeResize("selection", "x", -10);
  });

  useHotkeys("ctrl+alt+arrowup", () => {
    editor.surface.a11yNudgeResize("selection", "y", -1);
  });

  useHotkeys("ctrl+alt+shift+arrowup", () => {
    editor.surface.a11yNudgeResize("selection", "y", -10);
  });

  useHotkeys("ctrl+alt+arrowdown", () => {
    editor.surface.a11yNudgeResize("selection", "y", 1);
  });

  useHotkeys("ctrl+alt+shift+arrowdown", () => {
    editor.surface.a11yNudgeResize("selection", "y", 10);
  });

  // keyup

  useHotkeys("v", () => {
    editor.surface.surfaceSetTool({ type: "cursor" });
  });

  useHotkeys("q", () => {
    if (content_edit_mode?.type === "vector") {
      editor.surface.surfaceSetTool({ type: "lasso" });
    }
  });

  useHotkeys("h", () => {
    editor.surface.surfaceSetTool({ type: "hand" });
  });

  useHotkeys("a, f", () => {
    editor.surface.surfaceSetTool({ type: "insert", node: "container" });
  });

  useHotkeys("r", () => {
    editor.surface.surfaceSetTool({ type: "insert", node: "rectangle" });
  });

  useHotkeys("o", () => {
    editor.surface.surfaceSetTool({ type: "insert", node: "ellipse" });
  });

  useHotkeys("y", () => {
    editor.surface.surfaceSetTool({ type: "insert", node: "polygon" });
  });

  useHotkeys("t", () => {
    editor.surface.surfaceSetTool({ type: "insert", node: "text" });
  });

  useHotkeys("l", () => {
    editor.surface.surfaceSetTool({ type: "draw", tool: "line" });
  });

  useHotkeys(
    "p",
    () => {
      // Holding `p` continues a path even when closing on an existing vertex.
      editor.surface.surfaceConfigurePathKeepProjectingModifier("on");
      editor.surface.surfaceSetTool({ type: "path" });
    },
    { keydown: true, keyup: false }
  );

  useHotkeys(
    "p",
    () => {
      editor.surface.surfaceConfigurePathKeepProjectingModifier("off");
    },
    { keydown: false, keyup: true }
  );

  useHotkeys("shift+p", () => {
    editor.surface.surfaceSetTool({ type: "draw", tool: "pencil" });
  });

  useHotkeys("b", () => {
    editor.surface.surfaceSetTool({ type: "brush" });
  });

  useHotkeys("e", () => {
    editor.surface.surfaceSetTool({ type: "eraser" });
  });

  useHotkeys("g", () => {
    if (content_edit_mode?.type === "bitmap") {
      editor.surface.surfaceSetTool({ type: "flood-fill" });
    }
  });

  useHotkeys("shift+w", () => {
    if (content_edit_mode?.type === "vector") {
      editor.surface.surfaceSetTool({ type: "width" });
    }
  });

  useHotkeys("1, 2, 3, 4, 5, 6, 7, 8, 9", (e) => {
    if (selection.length) {
      const i = parseInt(e.key);
      const o = i / 10;
      editor.surface.a11ySetOpacity("selection", o);
      toast.success(`opacity: ${o}`);
    }
  });

  useSingleDoublePressHotkey("0", (type) => {
    const o = type === "single" ? 1 : 0;
    editor.surface.a11ySetOpacity("selection", o);
    toast.success(`opacity: ${o}`);
  });

  useHotkeys("shift+0", (e) => {
    editor.camera.scale(1, "center");
    toast.success(`Zoom to 100%`);
  });

  useHotkeys("shift+1, shift+9", (e) => {
    editor.camera.fit("*", { margin: 64 });
    toast.success(`Zoom to fit`);
  });

  useHotkeys("shift+2", (e) => {
    editor.camera.fit("selection", { margin: 64, animate: true });
    toast.success(`Zoom to selection`);
  });

  useHotkeys(
    "meta+=, ctrl+=, meta+plus, ctrl+plus",
    () => {
      editor.camera.zoomIn();
    },
    { preventDefault: true }
  );

  useHotkeys(
    "meta+minus, ctrl+minus",
    () => {
      editor.camera.zoomOut();
    },
    { preventDefault: true }
  );

  useHotkeys("]", (e) => {
    if (tool.type === "brush") {
      editor.commands.changeBrushSize({ type: "delta", value: 1 });
    } else {
      editor.commands.order("selection", "front");
    }
  });

  useHotkeys("[", (e) => {
    if (tool.type === "brush") {
      editor.commands.changeBrushSize({ type: "delta", value: -1 });
    } else {
      editor.commands.order("selection", "back");
    }
  });

  useHotkeys("alt+a", () => {
    editor.surface.a11yAlign({ horizontal: "min" });
  });
  useHotkeys(
    "alt+d",
    () => {
      editor.surface.a11yAlign({ horizontal: "max" });
    },
    { preventDefault: true }
  );
  useHotkeys("alt+w", () => {
    editor.surface.a11yAlign({ vertical: "min" });
  });
  useHotkeys("alt+s", () => {
    editor.surface.a11yAlign({ vertical: "max" });
  });
  useHotkeys("alt+v", () => {
    editor.surface.a11yAlign({ vertical: "center" });
  });
  useHotkeys("alt+h", () => {
    editor.surface.a11yAlign({ horizontal: "center" });
  });

  useHotkeys("alt+ctrl+v", (e) => {
    editor.commands.distributeEvenly("selection", "x");
  });

  useHotkeys("alt+ctrl+h", (e) => {
    editor.commands.distributeEvenly("selection", "y");
  });

  useHotkeys("shift+a", (e) => {
    editor.commands.autoLayout("selection");
  });

  useHotkeys(
    "ctrl+g, meta+g",
    () => {
      try {
        editor.commands.group("selection");
      } catch (e) {
        console.error(e);
        toast.error("use ⌥⌘G for grouping");
      }
    },
    {
      preventDefault: true,
    }
  );

  useHotkeys(
    "ctrl+shift+g, meta+shift+g",
    () => {
      try {
        editor.commands.ungroup("selection");
      } catch {}
    },
    {
      preventDefault: true,
    }
  );

  useHotkeys("ctrl+alt+g, meta+alt+g", () => {
    editor.commands.contain("selection");
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

export function Hotkeys() {
  useEditorHotKeys();

  return null;
}

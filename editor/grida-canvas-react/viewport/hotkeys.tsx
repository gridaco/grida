import { useHotkeys } from "react-hotkeys-hook";
import {
  useToolState,
  useA11yArrow,
  useContentEditModeMinimalState,
  useCurrentSelectionIds,
} from "../provider";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { useCurrentEditor } from "../use-editor";

function isApplePlatform(): boolean {
  const platform = typeof navigator === "object" ? navigator.platform : "";
  return /Mac|iPod|iPhone|iPad/.test(platform);
}

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
          editor.surface.surfaceConfigureScaleWithForceDisableSnap("on");
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
          editor.surface.surfaceConfigureScaleWithForceDisableSnap("off");
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
      const targets = editor.commands.querySelectAll("selection", "~");
      editor.commands.select(targets);
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  // #region selection
  // Color picker: I on all platforms, Ctrl+C on macOS only (Windows uses Ctrl+C for copy)
  useHotkeys(
    isApplePlatform() ? "i, ctrl+c" : "i",
    () => editor.surface.surfacePickColor(),
    {
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

  useHotkeys(
    "enter",
    () => {
      const targets = editor.commands.querySelectAll(">");
      if (targets.length === 0) {
        // check if querySelectAll(">") is possible first, then toggle when not possible
        editor.surface.surfaceTryToggleContentEditMode();
      } else {
        editor.commands.select(targets);
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
      const targets = editor.commands.querySelectAll("..");
      editor.commands.select(targets);
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
      const targets = editor.commands.querySelectAll("~+");
      editor.commands.select(targets);
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
      const targets = editor.commands.querySelectAll("~-");
      editor.commands.select(targets);
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

  // Text alignment shortcuts
  useHotkeys(
    "meta+alt+l, ctrl+alt+l",
    () => {
      editor.surface.a11yTextAlign("selection", "left");
    },
    // prevent chrome: show download history
    { preventDefault: true }
  );

  useHotkeys("meta+alt+t, ctrl+alt+t", () => {
    editor.surface.a11yTextAlign("selection", "center");
  });

  useHotkeys("meta+alt+r, ctrl+alt+r", () => {
    editor.surface.a11yTextAlign("selection", "right");
  });

  useHotkeys(
    "meta+alt+j, ctrl+alt+j",
    () => {
      editor.surface.a11yTextAlign("selection", "justify");
    },
    // prevent chrome: open devtools
    { preventDefault: true }
  );

  // Helper for text formatting shortcuts with period/comma keys
  // Note: Period (.) with Shift produces >, Comma (,) with Shift produces <
  // Using splitKey: "|" because comma is the default separator in react-hotkeys-hook
  const textFormattingOptions = {
    preventDefault: true,
    enableOnFormTags: false,
    enableOnContentEditable: false,
    splitKey: "|" as const,
  };

  // Font size: ⌘+⇧+>/< (macOS) / Ctrl+⇧+>/< (Windows/Linux)
  useHotkeys(
    "meta+shift+period | ctrl+shift+period",
    () => editor.surface.a11yChangeTextFontSize("selection", 1),
    textFormattingOptions
  );
  useHotkeys(
    "meta+shift+comma | ctrl+shift+comma",
    () => editor.surface.a11yChangeTextFontSize("selection", -1),
    textFormattingOptions
  );

  // Font weight: ⌘+⌥+>/< (macOS) / Ctrl+Alt+>/< (Windows/Linux)
  // Note: ⌘+⌥+> means Command+Option+Period (without Shift)
  // Using keycode names (period/comma) for safer cross-platform compatibility.
  // Verified to work on macOS.
  useHotkeys(
    "meta+alt+period | ctrl+alt+period",
    () => editor.surface.a11yChangeTextFontWeight("selection", "increase"),
    textFormattingOptions
  );
  useHotkeys(
    "meta+alt+comma | ctrl+alt+comma",
    () => editor.surface.a11yChangeTextFontWeight("selection", "decrease"),
    textFormattingOptions
  );

  // Line height: ⌥+⇧+>/< (macOS) / Alt+⇧+>/< (Windows/Linux)
  useHotkeys(
    "alt+shift+period | alt+shift+period",
    () => editor.surface.a11yChangeTextLineHeight("selection", 1),
    textFormattingOptions
  );
  useHotkeys(
    "alt+shift+comma | alt+shift+comma",
    () => editor.surface.a11yChangeTextLineHeight("selection", -1),
    textFormattingOptions
  );

  // Letter spacing: ⌥+>/< (macOS) / Alt+>/< (Windows/Linux)
  // Note: ⌥+> means Alt+Period (without Shift), producing period character
  // This is different from line height (⌥+⇧+>) which is Alt+Shift+Period
  useHotkeys(
    "alt+period | alt+period",
    () => editor.surface.a11yChangeTextLetterSpacing("selection", 0.1),
    textFormattingOptions
  );
  useHotkeys(
    "alt+comma | alt+comma",
    () => editor.surface.a11yChangeTextLetterSpacing("selection", -0.1),
    textFormattingOptions
  );

  useHotkeys("shift+r", () => {
    const v = editor.surface.surfaceToggleRuler();
    toast.success(`Ruler ${v === "on" ? "on" : "off"}`);
  });

  useHotkeys("shift+\", shift+'", () => {
    const v = editor.surface.surfaceTogglePixelGrid();
    toast.success(`Pixel Grid ${v === "on" ? "on" : "off"}`);
  });

  // Remove fill: ⌥/ (macOS) / Alt+/ (Windows/Linux)
  useHotkeys(
    "alt+slash",
    () => {
      editor.surface.a11yClearFill("selection");
    },
    {
      preventDefault: true,
      enableOnContentEditable: false,
      enableOnFormTags: false,
    }
  );

  // Remove stroke: ⇧/ (macOS) / Shift+/ (Windows/Linux)
  useHotkeys(
    "shift+slash",
    () => {
      editor.surface.a11yClearStroke("selection");
    },
    {
      preventDefault: true,
      enableOnContentEditable: false,
      enableOnFormTags: false,
    }
  );

  // Swap fill and stroke: ⇧X (macOS) / Shift+X (Windows/Linux)
  useHotkeys(
    "shift+x",
    () => {
      editor.surface.a11ySwapFillAndStroke("selection");
    },
    {
      preventDefault: true,
      enableOnContentEditable: false,
      enableOnFormTags: false,
    }
  );

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

  useHotkeys(
    "k",
    () => {
      editor.surface.surfaceSetTool({ type: "scale" });
    },
    // need below, k might open a ui with autofocus input, below prevents "k" being typed in to the input.
    {
      preventDefault: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  );

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
      editor.surface.order("front");
    }
  });

  useHotkeys("[", (e) => {
    if (tool.type === "brush") {
      editor.commands.changeBrushSize({ type: "delta", value: -1 });
    } else {
      editor.surface.order("back");
    }
  });

  useHotkeys(
    "meta+], ctrl+]",
    () => {
      editor.surface.order("forward");
    },
    { preventDefault: true }
  );

  useHotkeys(
    "meta+[, ctrl+[",
    () => {
      editor.surface.order("backward");
    },
    { preventDefault: true }
  );

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
        editor.surface.ungroup(editor.state.selection);
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

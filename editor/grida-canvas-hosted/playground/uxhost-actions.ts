import { KeyCode } from "@/grida-canvas/keycode";
import {
  type Keybinding,
  type Keybindings,
  kb,
  c,
  seq,
  M,
  platformKb,
} from "@/grida-canvas/keybinding";

interface UXHostAction {
  name: string;
  description: string;
  /**
   * @deprecated NOT IMPLEMENTED YET
   */
  command: string;
  keybindings: Keybindings;
}

/**
 * Playground-specific keyboard shortcut actions
 */
export const actions: Record<string, UXHostAction> = {
  ["workbench.surface.edit.undo"]: {
    name: "undo",
    description: "Undo the last action",
    command: "workbench.surface.edit.undo",
    keybindings: kb(KeyCode.KeyZ, M.CtrlCmd),
  },

  ["workbench.surface.edit.redo"]: {
    name: "redo",
    description: "Redo the last undone action",
    command: "workbench.surface.edit.redo",
    keybindings: kb(KeyCode.KeyZ, M.CtrlCmd | M.Shift),
  },

  ["workbench.surface.edit.cut"]: {
    name: "cut",
    description: "Cut the current selection",
    command: "workbench.surface.edit.cut",
    keybindings: kb(KeyCode.KeyX, M.CtrlCmd),
  },

  ["workbench.surface.edit.copy"]: {
    name: "copy",
    description: "Copy the current selection",
    command: "workbench.surface.edit.copy",
    keybindings: kb(KeyCode.KeyC, M.CtrlCmd),
  },

  ["workbench.surface.edit.copy-as-png"]: {
    name: "copy as png",
    description: "Copy selection as PNG",
    command: "workbench.surface.edit.copy-as-png",
    keybindings: kb(KeyCode.KeyC, M.CtrlCmd | M.Shift),
  },

  ["workbench.surface.edit.paste"]: {
    name: "paste",
    description: "Paste from the clipboard",
    command: "workbench.surface.edit.paste",
    keybindings: kb(KeyCode.KeyV, M.CtrlCmd),
  },

  ["workbench.surface.view.zoom-to-fit"]: {
    name: "zoom to fit",
    description: "Zoom to fit the content",
    command: "workbench.surface.view.zoom-to-fit",
    keybindings: [kb(KeyCode.Digit1, M.Shift), kb(KeyCode.Digit9, M.Shift)],
  },

  ["workbench.surface.view.zoom-to-selection"]: {
    name: "zoom to selection",
    description: "Zoom to the current selection",
    command: "workbench.surface.view.zoom-to-selection",
    keybindings: kb(KeyCode.Digit2, M.Shift),
  },

  ["workbench.surface.view.zoom-to-100"]: {
    name: "zoom to 100%",
    description: "Zoom to 100%",
    command: "workbench.surface.view.zoom-to-100",
    keybindings: kb(KeyCode.Digit0, M.Shift),
  },

  ["workbench.surface.view.zoom-in"]: {
    name: "zoom in",
    description: "Zoom in",
    command: "workbench.surface.view.zoom-in",
    keybindings: kb(KeyCode.Equal, M.CtrlCmd), // Plus key is same as Equal
  },

  ["workbench.surface.view.zoom-out"]: {
    name: "zoom out",
    description: "Zoom out",
    command: "workbench.surface.view.zoom-out",
    keybindings: kb(KeyCode.Minus, M.CtrlCmd),
  },

  ["workbench.surface.view.move-to-front"]: {
    name: "move to front",
    description: "Move the selection to the front",
    command: "workbench.surface.view.move-to-front",
    keybindings: kb(KeyCode.BracketRight),
  },

  ["workbench.surface.view.move-to-back"]: {
    name: "move to back",
    description: "Move the selection to the back",
    command: "workbench.surface.view.move-to-back",
    keybindings: kb(KeyCode.BracketLeft),
  },

  ["workbench.surface.view.move-forward"]: {
    name: "move forward",
    description: "Move the selection forward one layer",
    command: "workbench.surface.view.move-forward",
    keybindings: kb(KeyCode.BracketRight, M.CtrlCmd),
  },

  ["workbench.surface.view.move-backward"]: {
    name: "move backward",
    description: "Move the selection backward one layer",
    command: "workbench.surface.view.move-backward",
    keybindings: kb(KeyCode.BracketLeft, M.CtrlCmd),
  },

  ["workbench.surface.view.hide-show-ruler"]: {
    name: "hide/show ruler",
    description: "Toggle ruler visibility",
    command: "workbench.surface.view.hide-show-ruler",
    keybindings: kb(KeyCode.KeyR, M.Shift),
  },

  ["workbench.surface.view.hide-show-pixel-grid"]: {
    name: "hide/show pixel grid",
    description: "Toggle pixel grid visibility",
    command: "workbench.surface.view.hide-show-pixel-grid",
    keybindings: kb(KeyCode.Quote, M.Shift),
  },

  ["workbench.surface.view.preview"]: {
    name: "preview",
    description: "preview current selection",
    command: "workbench.surface.view.preview",
    keybindings: kb(KeyCode.Space, M.Shift),
  },

  ["workbench.surface.cursor.select-all-siblings"]: {
    name: "select all siblings",
    description: "Select all siblings of the current selection",
    command: "workbench.surface.cursor.select-all-siblings",
    keybindings: kb(KeyCode.KeyA, M.CtrlCmd),
  },

  ["workbench.surface.cursor.select-children"]: {
    name: "select children",
    description: "Select all children of the current selection",
    command: "workbench.surface.cursor.select-children",
    keybindings: kb(KeyCode.Enter),
  },

  ["workbench.surface.cursor.select-parent"]: {
    name: "select parent",
    description: "Select the parent of the current selection",
    command: "workbench.surface.cursor.select-parent",
    keybindings: [kb(KeyCode.Enter, M.Shift), kb(KeyCode.Backslash, 0)],
  },

  ["workbench.surface.cursor.select-next-sibling"]: {
    name: "select next sibling",
    description: "Select the next sibling of the current selection",
    command: "workbench.surface.cursor.select-next-sibling",
    keybindings: kb(KeyCode.Tab, 0),
  },

  ["workbench.surface.cursor.select-previous-sibling"]: {
    name: "select previous sibling",
    description: "Select the previous sibling of the current selection",
    command: "workbench.surface.cursor.select-previous-sibling",
    keybindings: kb(KeyCode.Tab, M.Shift),
  },

  ["workbench.surface.cursor.escape"]: {
    name: "Escape/Clear",
    description: "Clear selection and exit modes",
    command: "workbench.surface.cursor.escape",
    keybindings: [kb(KeyCode.Escape, 0), kb(KeyCode.Clear, 0)],
  },

  ["workbench.surface.cursor.hand-tool"]: {
    name: "hand tool",
    description: "Pan the canvas (Space is hold-to-activate)",
    command: "workbench.surface.cursor.hand-tool",
    keybindings: [kb(KeyCode.KeyH, 0), kb(KeyCode.Space, 0)],
  },

  ["workbench.surface.cursor.zoom-tool"]: {
    name: "zoom tool",
    description: "Zoom the canvas (hold-to-activate)",
    command: "workbench.surface.cursor.zoom-tool",
    keybindings: kb(KeyCode.KeyZ, 0),
  },

  ["workbench.surface.cursor.cursor"]: {
    name: "cursor",
    description: "Select tool",
    command: "workbench.surface.cursor.cursor",
    keybindings: kb(KeyCode.KeyV, 0),
  },

  ["workbench.surface.cursor.scale"]: {
    name: "scale",
    description: "Scale tool (parametric scaling)",
    command: "workbench.surface.cursor.scale",
    keybindings: kb(KeyCode.KeyK, 0),
  },

  ["workbench.surface.cursor.lasso"]: {
    name: "lasso",
    description: "Lasso tool (vector mode)",
    command: "workbench.surface.cursor.lasso",
    keybindings: kb(KeyCode.KeyQ, 0),
  },

  ["workbench.surface.cursor.hand"]: {
    name: "hand",
    description: "Hand tool (alternative to hand-tool)",
    command: "workbench.surface.cursor.hand",
    keybindings: kb(KeyCode.KeyH, 0),
  },

  ["workbench.surface.cursor.rectangle"]: {
    name: "rectangle",
    description: "Rectangle tool",
    command: "workbench.surface.cursor.rectangle",
    keybindings: kb(KeyCode.KeyR, 0),
  },

  ["workbench.surface.cursor.ellipse"]: {
    name: "ellipse",
    description: "Ellipse tool",
    command: "workbench.surface.cursor.ellipse",
    keybindings: kb(KeyCode.KeyO, 0),
  },

  ["workbench.surface.cursor.polygon"]: {
    name: "polygon",
    description: "Polygon tool",
    command: "workbench.surface.cursor.polygon",
    keybindings: kb(KeyCode.KeyY, 0),
  },

  ["workbench.surface.cursor.text"]: {
    name: "text",
    description: "Text tool",
    command: "workbench.surface.cursor.text",
    keybindings: kb(KeyCode.KeyT, 0),
  },

  ["workbench.surface.cursor.line"]: {
    name: "line",
    description: "Line tool",
    command: "workbench.surface.cursor.line",
    keybindings: kb(KeyCode.KeyL, 0),
  },

  ["workbench.surface.cursor.container"]: {
    name: "container",
    description: "Container tool",
    command: "workbench.surface.cursor.container",
    keybindings: [kb(KeyCode.KeyA, 0), kb(KeyCode.KeyF, 0)],
  },

  ["workbench.surface.cursor.pencil"]: {
    name: "pencil",
    description: "Pencil tool",
    command: "workbench.surface.cursor.pencil",
    keybindings: kb(KeyCode.KeyP, M.Shift),
  },

  ["workbench.surface.cursor.path"]: {
    name: "path",
    description: "Path tool",
    command: "workbench.surface.cursor.path",
    keybindings: kb(KeyCode.KeyP),
  },

  ["workbench.surface.cursor.brush"]: {
    name: "brush",
    description: "Brush tool",
    command: "workbench.surface.cursor.brush",
    keybindings: kb(KeyCode.KeyB),
  },

  ["workbench.surface.cursor.eraser"]: {
    name: "eraser",
    description: "Eraser tool",
    command: "workbench.surface.cursor.eraser",
    keybindings: kb(KeyCode.KeyE),
  },

  ["workbench.surface.cursor.paint-bucket"]: {
    name: "paint bucket",
    description: "Paint bucket tool",
    command: "workbench.surface.cursor.paint-bucket",
    keybindings: kb(KeyCode.KeyG),
  },

  ["workbench.surface.cursor.variable-width"]: {
    name: "variable width",
    description: "Variable width tool",
    command: "workbench.surface.cursor.variable-width",
    keybindings: kb(KeyCode.KeyW, M.Shift),
  },

  ["workbench.surface.cursor.increase-brush-size"]: {
    name: "increase brush size",
    description: "Increase brush size",
    command: "workbench.surface.cursor.increase-brush-size",
    keybindings: kb(KeyCode.BracketRight, 0),
  },

  ["workbench.surface.cursor.decrease-brush-size"]: {
    name: "decrease brush size",
    description: "Decrease brush size",
    command: "workbench.surface.cursor.decrease-brush-size",
    keybindings: kb(KeyCode.BracketLeft, 0),
  },

  ["workbench.surface.object.nudge"]: {
    name: "nudge",
    description: "Move selection by 1px",
    command: "workbench.surface.object.nudge",
    keybindings: [
      kb(KeyCode.RightArrow),
      kb(KeyCode.LeftArrow),
      kb(KeyCode.UpArrow),
      kb(KeyCode.DownArrow),
    ],
  },

  ["workbench.surface.object.nudge-resize-right"]: {
    name: "nudge resize (right)",
    description: "Resize selection width by 1px",
    command: "workbench.surface.object.nudge-resize-right",
    keybindings: kb(KeyCode.RightArrow, M.Ctrl | M.Alt),
  },

  ["workbench.surface.object.nudge-resize-right-10"]: {
    name: "nudge resize (right, 10px)",
    description: "Resize selection width by 10px",
    command: "workbench.surface.object.nudge-resize-right-10",
    keybindings: kb(KeyCode.RightArrow, M.Ctrl | M.Alt | M.Shift),
  },

  ["workbench.surface.object.nudge-resize-left"]: {
    name: "nudge resize (left)",
    description: "Resize selection width by -1px",
    command: "workbench.surface.object.nudge-resize-left",
    keybindings: kb(KeyCode.LeftArrow, M.Ctrl | M.Alt),
  },

  ["workbench.surface.object.nudge-resize-left-10"]: {
    name: "nudge resize (left, 10px)",
    description: "Resize selection width by -10px",
    command: "workbench.surface.object.nudge-resize-left-10",
    keybindings: kb(KeyCode.LeftArrow, M.Ctrl | M.Alt | M.Shift),
  },

  ["workbench.surface.object.nudge-resize-up"]: {
    name: "nudge resize (up)",
    description: "Resize selection height by -1px",
    command: "workbench.surface.object.nudge-resize-up",
    keybindings: kb(KeyCode.UpArrow, M.Ctrl | M.Alt),
  },

  ["workbench.surface.object.nudge-resize-up-10"]: {
    name: "nudge resize (up, 10px)",
    description: "Resize selection height by -10px",
    command: "workbench.surface.object.nudge-resize-up-10",
    keybindings: kb(KeyCode.UpArrow, M.Ctrl | M.Alt | M.Shift),
  },

  ["workbench.surface.object.nudge-resize-down"]: {
    name: "nudge resize (down)",
    description: "Resize selection height by 1px",
    command: "workbench.surface.object.nudge-resize-down",
    keybindings: kb(KeyCode.DownArrow, M.Ctrl | M.Alt),
  },

  ["workbench.surface.object.nudge-resize-down-10"]: {
    name: "nudge resize (down, 10px)",
    description: "Resize selection height by 10px",
    command: "workbench.surface.object.nudge-resize-down-10",
    keybindings: kb(KeyCode.DownArrow, M.Ctrl | M.Alt | M.Shift),
  },

  ["workbench.surface.object.flatten"]: {
    name: "flatten",
    description: "Flatten the current selection",
    command: "workbench.surface.object.flatten",
    keybindings: [
      kb(KeyCode.KeyE, M.CtrlCmd),
      kb(KeyCode.KeyF, M.Alt | M.Shift),
    ],
  },

  ["workbench.surface.text.toggle-bold"]: {
    name: "toggle bold",
    description: "Toggle bold style",
    command: "workbench.surface.text.toggle-bold",
    keybindings: kb(KeyCode.KeyB, M.CtrlCmd),
  },

  ["workbench.surface.text.toggle-italic"]: {
    name: "toggle italic",
    description: "Toggle italic style",
    command: "workbench.surface.text.toggle-italic",
    keybindings: kb(KeyCode.KeyI, M.CtrlCmd),
  },

  ["workbench.surface.text.toggle-underline"]: {
    name: "toggle underline",
    description: "Toggle underline style",
    command: "workbench.surface.text.toggle-underline",
    keybindings: kb(KeyCode.KeyU, M.CtrlCmd),
  },

  ["workbench.surface.text.toggle-line-through"]: {
    name: "toggle line-through",
    description: "Toggle line-through style",
    command: "workbench.surface.text.toggle-line-through",
    keybindings: kb(KeyCode.KeyX, M.CtrlCmd | M.Shift),
  },

  ["workbench.surface.text.text-align-left"]: {
    name: "text align left",
    description: "Align text to the left",
    command: "workbench.surface.text.text-align-left",
    keybindings: kb(KeyCode.KeyL, M.CtrlCmd | M.Alt),
  },

  ["workbench.surface.text.text-align-center"]: {
    name: "text align center",
    description: "Center text horizontally",
    command: "workbench.surface.text.text-align-center",
    keybindings: kb(KeyCode.KeyT, M.CtrlCmd | M.Alt),
  },

  ["workbench.surface.text.text-align-right"]: {
    name: "text align right",
    description: "Align text to the right",
    command: "workbench.surface.text.text-align-right",
    keybindings: kb(KeyCode.KeyR, M.CtrlCmd | M.Alt),
  },

  ["workbench.surface.text.text-align-justify"]: {
    name: "text align justify",
    description: "Justify text horizontally",
    command: "workbench.surface.text.text-align-justify",
    keybindings: kb(KeyCode.KeyJ, M.CtrlCmd | M.Alt),
  },

  ["workbench.surface.text.increase-font-size"]: {
    name: "increase font size",
    description: "Increase font size by 1px",
    command: "workbench.surface.text.increase-font-size",
    keybindings: kb(KeyCode.Period, M.CtrlCmd | M.Shift),
  },

  ["workbench.surface.text.decrease-font-size"]: {
    name: "decrease font size",
    description: "Decrease font size by 1px",
    command: "workbench.surface.text.decrease-font-size",
    keybindings: kb(KeyCode.Comma, M.CtrlCmd | M.Shift),
  },

  ["workbench.surface.text.increase-font-weight"]: {
    name: "increase font weight",
    description: "Increase font weight",
    command: "workbench.surface.text.increase-font-weight",
    keybindings: kb(KeyCode.Period, M.CtrlCmd | M.Alt),
  },

  ["workbench.surface.text.decrease-font-weight"]: {
    name: "decrease font weight",
    description: "Decrease font weight",
    command: "workbench.surface.text.decrease-font-weight",
    keybindings: kb(KeyCode.Comma, M.CtrlCmd | M.Alt),
  },

  ["workbench.surface.text.increase-line-height"]: {
    name: "increase line height",
    description: "Increase line height",
    command: "workbench.surface.text.increase-line-height",
    keybindings: kb(KeyCode.Period, M.Alt | M.Shift),
  },

  ["workbench.surface.text.decrease-line-height"]: {
    name: "decrease line height",
    description: "Decrease line height",
    command: "workbench.surface.text.decrease-line-height",
    keybindings: kb(KeyCode.Comma, M.Alt | M.Shift),
  },

  ["workbench.surface.text.increase-letter-spacing"]: {
    name: "increase letter spacing",
    description: "Increase letter spacing",
    command: "workbench.surface.text.increase-letter-spacing",
    keybindings: kb(KeyCode.Period, M.Alt),
  },

  ["workbench.surface.text.decrease-letter-spacing"]: {
    name: "decrease letter spacing",
    description: "Decrease letter spacing",
    command: "workbench.surface.text.decrease-letter-spacing",
    keybindings: kb(KeyCode.Comma, M.Alt),
  },

  ["workbench.surface.object.toggle-active"]: {
    name: "toggle active",
    description: "Toggle active state for the selection",
    command: "workbench.surface.object.toggle-active",
    keybindings: kb(KeyCode.KeyH, M.CtrlCmd | M.Shift),
  },

  ["workbench.surface.object.toggle-locked"]: {
    name: "toggle locked",
    description: "Toggle locked state for the selection",
    command: "workbench.surface.object.toggle-locked",
    keybindings: kb(KeyCode.KeyL, M.CtrlCmd | M.Shift),
  },

  ["workbench.surface.object.remove-fill"]: {
    name: "remove fill",
    description: "Remove fill from selection",
    command: "workbench.surface.object.remove-fill",
    keybindings: kb(KeyCode.Slash, M.Alt),
  },

  ["workbench.surface.object.remove-stroke"]: {
    name: "remove stroke",
    description: "Remove stroke from selection (sets width to 0)",
    command: "workbench.surface.object.remove-stroke",
    keybindings: kb(KeyCode.Slash, M.Shift),
  },

  ["workbench.surface.object.swap-fill-and-stroke"]: {
    name: "swap fill and stroke",
    description: "Swap fill paints and stroke paints",
    command: "workbench.surface.object.swap-fill-and-stroke",
    keybindings: kb(KeyCode.KeyX, M.Shift),
  },

  ["workbench.surface.edit.duplicate"]: {
    name: "duplicate",
    description: "Duplicate the current selection",
    command: "workbench.surface.edit.duplicate",
    keybindings: kb(KeyCode.KeyD, M.CtrlCmd),
  },

  ["workbench.surface.edit.delete-node"]: {
    name: "delete node",
    description: "Delete the current selection",
    command: "workbench.surface.edit.delete-node",
    keybindings: [kb(KeyCode.Backspace, 0), kb(KeyCode.Delete, 0)],
  },

  ["workbench.surface.edit.eye-dropper"]: {
    name: "eye dropper",
    description: "Pick color from screen",
    command: "workbench.surface.edit.eye-dropper",
    keybindings: platformKb({
      mac: [kb(KeyCode.KeyI, 0), kb(KeyCode.KeyC, M.Ctrl)],
      windows: kb(KeyCode.KeyI, 0),
      linux: kb(KeyCode.KeyI, 0),
    }),
  },

  ["workbench.surface.object.auto-layout"]: {
    name: "Auto-layout",
    description: "Auto-layout the current selection",
    command: "workbench.surface.object.auto-layout",
    keybindings: kb(KeyCode.KeyA, M.Shift),
  },

  ["workbench.surface.object.group"]: {
    name: "group",
    description: "Group the current selection",
    command: "workbench.surface.object.group",
    keybindings: kb(KeyCode.KeyG, M.CtrlCmd),
  },

  ["workbench.surface.object.ungroup"]: {
    name: "ungroup",
    description: "Ungroup the current selection",
    command: "workbench.surface.object.ungroup",
    keybindings: kb(KeyCode.KeyG, M.CtrlCmd | M.Shift),
  },

  ["workbench.surface.object.group-with-container"]: {
    name: "Group with Container",
    description: "Group the current selection with a container",
    command: "workbench.surface.object.group-with-container",
    keybindings: kb(KeyCode.KeyG, M.CtrlCmd | M.Alt),
  },

  ["workbench.surface.arrange.align-left"]: {
    name: "align left",
    description: "Align selection to the left",
    command: "workbench.surface.arrange.align-left",
    keybindings: kb(KeyCode.KeyA, M.Alt),
  },

  ["workbench.surface.arrange.align-right"]: {
    name: "align right",
    description: "Align selection to the right",
    command: "workbench.surface.arrange.align-right",
    keybindings: kb(KeyCode.KeyD, M.Alt),
  },

  ["workbench.surface.arrange.align-top"]: {
    name: "align top",
    description: "Align selection to the top",
    command: "workbench.surface.arrange.align-top",
    keybindings: kb(KeyCode.KeyW, M.Alt),
  },

  ["workbench.surface.arrange.align-bottom"]: {
    name: "align bottom",
    description: "Align selection to the bottom",
    command: "workbench.surface.arrange.align-bottom",
    keybindings: kb(KeyCode.KeyS, M.Alt),
  },

  ["workbench.surface.arrange.align-horizontal-center"]: {
    name: "align horizontal center",
    description: "Align selection horizontally centered",
    command: "workbench.surface.arrange.align-horizontal-center",
    keybindings: kb(KeyCode.KeyH, M.Alt),
  },

  ["workbench.surface.arrange.align-vertical-center"]: {
    name: "align vertical center",
    description: "Align selection vertically centered",
    command: "workbench.surface.arrange.align-vertical-center",
    keybindings: kb(KeyCode.KeyV, M.Alt),
  },

  ["workbench.surface.arrange.distribute-horizontally"]: {
    name: "distribute horizontally",
    description: "Distribute selection evenly horizontally",
    command: "workbench.surface.arrange.distribute-horizontally",
    keybindings: kb(KeyCode.KeyV, M.Alt | M.Ctrl),
  },

  ["workbench.surface.arrange.distribute-vertically"]: {
    name: "distribute vertically",
    description: "Distribute selection evenly vertically",
    command: "workbench.surface.arrange.distribute-vertically",
    keybindings: kb(KeyCode.KeyH, M.Alt | M.Ctrl),
  },

  ["workbench.surface.object.set-opacity-0"]: {
    name: "set opacity to 0%",
    description: "Set opacity to 0% (double press 0)",
    command: "workbench.surface.object.set-opacity-0",
    keybindings: seq(c(0, KeyCode.Digit0), c(0, KeyCode.Digit0)),
  },

  ["workbench.surface.object.set-opacity-10"]: {
    name: "set opacity to 10%",
    description: "Set opacity to 10%",
    command: "workbench.surface.object.set-opacity-10",
    keybindings: kb(KeyCode.Digit1, 0),
  },

  ["workbench.surface.object.set-opacity-20"]: {
    name: "set opacity to 20%",
    description: "Set opacity to 20%",
    command: "workbench.surface.object.set-opacity-20",
    keybindings: kb(KeyCode.Digit2, 0),
  },

  ["workbench.surface.object.set-opacity-30"]: {
    name: "set opacity to 30%",
    description: "Set opacity to 30%",
    command: "workbench.surface.object.set-opacity-30",
    keybindings: kb(KeyCode.Digit3, 0),
  },

  ["workbench.surface.object.set-opacity-40"]: {
    name: "set opacity to 40%",
    description: "Set opacity to 40%",
    command: "workbench.surface.object.set-opacity-40",
    keybindings: kb(KeyCode.Digit4, 0),
  },

  ["workbench.surface.object.set-opacity-50"]: {
    name: "set opacity to 50%",
    description: "Set opacity to 50%",
    command: "workbench.surface.object.set-opacity-50",
    keybindings: kb(KeyCode.Digit5, 0),
  },

  ["workbench.surface.object.set-opacity-60"]: {
    name: "set opacity to 60%",
    description: "Set opacity to 60%",
    command: "workbench.surface.object.set-opacity-60",
    keybindings: kb(KeyCode.Digit6, 0),
  },

  ["workbench.surface.object.set-opacity-70"]: {
    name: "set opacity to 70%",
    description: "Set opacity to 70%",
    command: "workbench.surface.object.set-opacity-70",
    keybindings: kb(KeyCode.Digit7, 0),
  },

  ["workbench.surface.object.set-opacity-80"]: {
    name: "set opacity to 80%",
    description: "Set opacity to 80%",
    command: "workbench.surface.object.set-opacity-80",
    keybindings: kb(KeyCode.Digit8, 0),
  },

  ["workbench.surface.object.set-opacity-90"]: {
    name: "set opacity to 90%",
    description: "Set opacity to 90%",
    command: "workbench.surface.object.set-opacity-90",
    keybindings: kb(KeyCode.Digit9, 0),
  },

  ["workbench.surface.object.set-opacity-100"]: {
    name: "set opacity to 100%",
    description: "Set opacity to 100%",
    command: "workbench.surface.object.set-opacity-100",
    keybindings: kb(KeyCode.Digit0, 0),
  },
};

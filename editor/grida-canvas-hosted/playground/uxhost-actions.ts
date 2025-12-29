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
    name: "text align left",
    description: "Align text to the left",
    keys: ["meta+alt+l", "ctrl+alt+l"],
  },
  {
    name: "text align center",
    description: "Center text horizontally",
    keys: ["meta+alt+t", "ctrl+alt+t"],
  },
  {
    name: "text align right",
    description: "Align text to the right",
    keys: ["meta+alt+r", "ctrl+alt+r"],
  },
  {
    name: "text align justify",
    description: "Justify text horizontally",
    keys: ["meta+alt+j", "ctrl+alt+j"],
  },
  {
    name: "increase font size",
    description: "Increase font size for text",
    keys: ["meta+shift+>", "ctrl+shift+>"],
  },
  {
    name: "decrease font size",
    description: "Decrease font size for text",
    keys: ["meta+shift+<", "ctrl+shift+<"],
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
    name: "move forward",
    description: "Move the selection forward one layer",
    keys: ["meta+]", "ctrl+]"],
  },
  {
    name: "move backward",
    description: "Move the selection backward one layer",
    keys: ["meta+[", "ctrl+["],
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
    keys: ["i"], // Note: ctrl+c is macOS only (Windows uses Ctrl+C for copy)
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
    name: "scale",
    description: "Scale tool (parametric scaling)",
    keys: ["k"],
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

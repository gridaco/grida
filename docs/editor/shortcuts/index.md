# Grida Editor Shortcuts

Welcome to the official keyboard shortcuts guide for the Grida Canvas Editor. This reference covers all available keyboard shortcuts to help you work more efficiently and navigate the editor with ease.

Keyboard shortcuts allow you to perform actions quickly without using the mouse, significantly speeding up your workflow. Whether you're selecting tools, transforming objects, aligning elements, or managing your canvas view, these shortcuts will help you become a more productive designer.

This guide is organized by category, making it easy to find the shortcuts you need. Each shortcut is listed with both macOS and Windows/Linux key combinations, so you can quickly reference the commands for your platform.

> **Note:** On macOS, use `Cmd` (⌘) for `meta`. On Windows/Linux, use `Ctrl` for `ctrl`.

<!--
Internal reference: This document is maintained as the single source of truth for keyboard shortcuts.
Implementation source: editor/grida-canvas-react/viewport/hotkeys.tsx
Last updated: Based on keybindings_sheet array and useHotkeys calls in hotkeys.tsx
-->

<!-- use below symbols table for user-facing documentation -->
<!-- | Key                | macOS (native) | Windows (native) | Symbol understood by Windows users? | Recommended display       | -->
<!-- | ------------------ | -------------- | ---------------- | ----------------------------------- | ------------------------- | -->
<!-- | Command            | ⌘              | —                | ❌ No                               | ⌘ (macOS only)            | -->
<!-- | Control            | ⌃              | Ctrl             | ❌ No                               | Ctrl (Windows), ⌃ (macOS) | -->
<!-- | Option / Alt       | ⌥              | Alt              | ❌ No                               | Alt (Windows), ⌥ (macOS)  | -->
<!-- | Shift              | ⇧              | Shift            | ❌ No                               | Shift (Windows), ⇧ (macOS) | -->
<!-- | Enter / Return     | ⏎ / ↵          | Enter            | ❌ No                               | Enter (Windows), ↵ (macOS) | -->
<!-- | Escape             | ⎋              | Esc              | ⚠️ Mixed                            | Esc                       | -->
<!-- | Backspace / Delete | ⌫ / ⌦          | Backspace / Del  | ❌ No                               | Text label                | -->

## Tools

| Action          | macOS          | Windows/Linux  | Description                                |
| --------------- | -------------- | -------------- | ------------------------------------------ |
| Cursor (Select) | `V`            | `V`            | Select tool                                |
| Hand tool       | `H` or `Space` | `H` or `Space` | Pan the canvas (Space is hold-to-activate) |
| Zoom tool       | `Z`            | `Z`            | Zoom the canvas (hold-to-activate)         |
| Scale tool      | `K`            | `K`            | Parametric scaling tool                    |
| Lasso tool      | `Q`            | `Q`            | Lasso tool (vector mode only)              |
| Rectangle tool  | `R`            | `R`            | Insert rectangle                           |
| Ellipse tool    | `O`            | `O`            | Insert ellipse                             |
| Polygon tool    | `Y`            | `Y`            | Insert polygon                             |
| Text tool       | `T`            | `T`            | Insert text                                |
| Line tool       | `L`            | `L`            | Draw line                                  |
| Arrow tool      | `⇧ + L`        | `⇧ + L`        | Draw arrow (line with arrowhead)           |
| Container tool  | `A` or `F`     | `A` or `F`     | Insert container                           |
| Tray tool       | `⇧ + F`        | `⇧ + F`        | Insert tray (organizational section)       |
| Path tool       | `P`            | `P`            | Draw path (Pen tool)                       |
| Pencil tool     | `⇧ + P`        | `⇧ + P`        | Draw with pencil                           |
| Brush tool      | `B`            | `B`            | Brush tool                                 |
| Eraser tool     | `E`            | `E`            | Eraser tool                                |
| Paint bucket    | `G`            | `G`            | Flood fill tool (bitmap mode only)         |
| Variable width  | `⇧ + W`        | `⇧ + W`        | Variable width tool (vector mode only)     |
| Eye dropper     | `I` or `⌃ + C` | `I`            | Pick color from screen                     |

## Selection & Navigation

| Action                  | macOS               | Windows/Linux       | Description                                  |
| ----------------------- | ------------------- | ------------------- | -------------------------------------------- |
| Select all siblings     | `⌘ + A`             | `Ctrl + A`          | Select all siblings of the current selection |
| Select children         | `Enter`             | `Enter`             | Select all children of the current selection |
| Select parent           | `⇧ + Enter` or `\`  | `⇧ + Enter` or `\`  | Select the parent of the current selection   |
| Select next sibling     | `Tab`               | `Tab`               | Select the next sibling                      |
| Select previous sibling | `⇧ + Tab`           | `⇧ + Tab`           | Select the previous sibling                  |
| Escape/Clear            | `Escape` or `Clear` | `Escape` or `Clear` | Clear selection and exit modes               |

## Editing

| Action      | macOS                   | Windows/Linux               | Description                       |
| ----------- | ----------------------- | --------------------------- | --------------------------------- |
| Undo        | `⌘ + Z`                 | `Ctrl + Z`                  | Undo the last action              |
| Redo        | `⌘ + ⇧ + Z`             | `Ctrl + ⇧ + Z`              | Redo the last undone action       |
| Cut         | `⌘ + X`                 | `Ctrl + X`                  | Cut the current selection         |
| Copy        | `⌘ + C`                 | `Ctrl + C`                  | Copy the current selection        |
| Copy as PNG | `⌘ + ⇧ + C`             | `Ctrl + ⇧ + C`              | Copy selection as PNG image       |
| Paste       | `⌘ + V`                 | `Ctrl + V`                  | Paste from clipboard              |
| Duplicate   | `⌘ + D`                 | `Ctrl + D`                  | Duplicate the current selection   |
| Delete      | `Delete` or `Backspace` | `Delete` or `Backspace`     | Delete the current selection      |
| Flatten     | `⌘ + E` or `⌥ + ⇧ + F`  | `Ctrl + E` or `Alt + ⇧ + F` | Convert selection to vector paths |

## Transformation

| Action                     | macOS              | Windows/Linux        | Description                                                           |
| -------------------------- | ------------------ | -------------------- | --------------------------------------------------------------------- |
| Nudge                      | `Arrow Keys`       | `Arrow Keys`         | Move selection by 1px                                                 |
| Nudge resize (right)       | `Ctrl + ⌥ + →`     | `Ctrl + Alt + →`     | Resize selection width by 1px                                         |
| Nudge resize (right, 10px) | `Ctrl + ⌥ + ⇧ + →` | `Ctrl + Alt + ⇧ + →` | Resize selection width by 10px                                        |
| Nudge resize (left)        | `Ctrl + ⌥ + ←`     | `Ctrl + Alt + ←`     | Resize selection width by -1px                                        |
| Nudge resize (left, 10px)  | `Ctrl + ⌥ + ⇧ + ←` | `Ctrl + Alt + ⇧ + ←` | Resize selection width by -10px                                       |
| Nudge resize (up)          | `Ctrl + ⌥ + ↑`     | `Ctrl + Alt + ↑`     | Resize selection height by -1px                                       |
| Nudge resize (up, 10px)    | `Ctrl + ⌥ + ⇧ + ↑` | `Ctrl + Alt + ⇧ + ↑` | Resize selection height by -10px                                      |
| Nudge resize (down)        | `Ctrl + ⌥ + ↓`     | `Ctrl + Alt + ↓`     | Resize selection height by 1px                                        |
| Nudge resize (down, 10px)  | `Ctrl + ⌥ + ⇧ + ↓` | `Ctrl + Alt + ⇧ + ↓` | Resize selection height by 10px                                       |
| Move to front              | `]`                | `]`                  | Move selection to front (or increase brush size if brush tool active) |
| Move to back               | `[`                | `[`                  | Move selection to back (or decrease brush size if brush tool active)  |
| Move forward               | `⌘ + ]`            | `Ctrl + ]`           | Move selection forward one layer                                      |
| Move backward              | `⌘ + [`            | `Ctrl + [`           | Move selection backward one layer                                     |

## Alignment & Distribution

| Action                  | macOS          | Windows/Linux    | Description                              |
| ----------------------- | -------------- | ---------------- | ---------------------------------------- |
| Align left              | `⌥ + A`        | `Alt + A`        | Align selection to the left              |
| Align right             | `⌥ + D`        | `Alt + D`        | Align selection to the right             |
| Align top               | `⌥ + W`        | `Alt + W`        | Align selection to the top               |
| Align bottom            | `⌥ + S`        | `Alt + S`        | Align selection to the bottom            |
| Align horizontal center | `⌥ + H`        | `Alt + H`        | Center selection horizontally            |
| Align vertical center   | `⌥ + V`        | `Alt + V`        | Center selection vertically              |
| Distribute horizontally | `⌥ + Ctrl + V` | `Alt + Ctrl + V` | Distribute selection evenly horizontally |
| Distribute vertically   | `⌥ + Ctrl + H` | `Alt + Ctrl + H` | Distribute selection evenly vertically   |

## Grouping & Layout

| Action               | macOS       | Windows/Linux    | Description                                  |
| -------------------- | ----------- | ---------------- | -------------------------------------------- |
| Group                | `⌘ + G`     | `Ctrl + G`       | Group the current selection                  |
| Ungroup              | `⌘ + ⇧ + G` | `Ctrl + ⇧ + G`   | Ungroup the current selection                |
| Group with Container | `⌘ + ⌥ + G` | `Ctrl + Alt + G` | Group the current selection with a container |
| Auto-layout          | `⇧ + A`     | `⇧ + A`          | Auto-layout the current selection            |

## Text Formatting

| Action                  | macOS       | Windows/Linux    | Description               |
| ----------------------- | ----------- | ---------------- | ------------------------- |
| Toggle bold             | `⌘ + B`     | `Ctrl + B`       | Toggle bold style         |
| Toggle italic           | `⌘ + I`     | `Ctrl + I`       | Toggle italic style       |
| Toggle underline        | `⌘ + U`     | `Ctrl + U`       | Toggle underline style    |
| Toggle line-through     | `⌘ + ⇧ + X` | `Ctrl + ⇧ + X`   | Toggle line-through style |
| Text align left         | `⌘ + ⌥ + L` | `Ctrl + Alt + L` | Align text to the left    |
| Text align center       | `⌘ + ⌥ + T` | `Ctrl + Alt + T` | Center text horizontally  |
| Text align right        | `⌘ + ⌥ + R` | `Ctrl + Alt + R` | Align text to the right   |
| Text align justify      | `⌘ + ⌥ + J` | `Ctrl + Alt + J` | Justify text horizontally |
| Increase font size      | `⌘ + ⇧ + >` | `Ctrl + ⇧ + >`   | Increase font size by 1px |
| Decrease font size      | `⌘ + ⇧ + <` | `Ctrl + ⇧ + <`   | Decrease font size by 1px |
| Increase font weight    | `⌘ + ⌥ + >` | `Ctrl + Alt + >` | Increase font weight      |
| Decrease font weight    | `⌘ + ⌥ + <` | `Ctrl + Alt + <` | Decrease font weight      |
| Increase line height    | `⌥ + ⇧ + >` | `Alt + ⇧ + >`    | Increase line height      |
| Decrease line height    | `⌥ + ⇧ + <` | `Alt + ⇧ + <`    | Decrease line height      |
| Increase letter spacing | `⌥ + >`     | `Alt + >`        | Increase letter spacing   |
| Decrease letter spacing | `⌥ + <`     | `Alt + <`        | Decrease letter spacing   |

## Object Properties

| Action               | macOS              | Windows/Linux      | Description                                    |
| -------------------- | ------------------ | ------------------ | ---------------------------------------------- |
| Toggle active        | `⌘ + ⇧ + H`        | `Ctrl + ⇧ + H`     | Toggle active state for the selection          |
| Toggle locked        | `⌘ + ⇧ + L`        | `Ctrl + ⇧ + L`     | Toggle locked state for the selection          |
| Remove fill          | `⌥ + /`            | `Alt + /`          | Remove fill from selection                     |
| Remove stroke        | `⇧ + /`            | `⇧ + /`            | Remove stroke from selection (sets width to 0) |
| Swap fill and stroke | `⇧ + X`            | `⇧ + X`            | Swap fill paints and stroke paints             |
| Set opacity to 0%    | `0` (double press) | `0` (double press) | Set opacity to 0%                              |
| Set opacity to 10%   | `1`                | `1`                | Set opacity to 10%                             |
| Set opacity to 20%   | `2`                | `2`                | Set opacity to 20%                             |
| Set opacity to 30%   | `3`                | `3`                | Set opacity to 30%                             |
| Set opacity to 40%   | `4`                | `4`                | Set opacity to 40%                             |
| Set opacity to 50%   | `5`                | `5`                | Set opacity to 50%                             |
| Set opacity to 60%   | `6`                | `6`                | Set opacity to 60%                             |
| Set opacity to 70%   | `7`                | `7`                | Set opacity to 70%                             |
| Set opacity to 80%   | `8`                | `8`                | Set opacity to 80%                             |
| Set opacity to 90%   | `9`                | `9`                | Set opacity to 90%                             |
| Set opacity to 100%  | `0` (single press) | `0` (single press) | Set opacity to 100%                            |

## View & Zoom

| Action               | macOS                  | Windows/Linux                | Description                                       |
| -------------------- | ---------------------- | ---------------------------- | ------------------------------------------------- |
| Zoom to fit          | `⇧ + 1` or `⇧ + 9`     | `⇧ + 1` or `⇧ + 9`           | Zoom to fit all content                           |
| Zoom to selection    | `⇧ + 2`                | `⇧ + 2`                      | Zoom to the current selection                     |
| Zoom to 100%         | `⇧ + 0`                | `⇧ + 0`                      | Zoom to 100%                                      |
| Zoom in              | `⌘ + =` or `⌘ + Plus`  | `Ctrl + =` or `Ctrl + Plus`  | Zoom in                                           |
| Zoom out             | `⌘ + -` or `⌘ + Minus` | `Ctrl + -` or `Ctrl + Minus` | Zoom out                                          |
| Toggle ruler         | `⇧ + R`                | `⇧ + R`                      | Toggle ruler visibility                           |
| Toggle pixel grid    | `⇧ + '`                | `⇧ + '`                      | Toggle pixel grid visibility                      |
| Toggle pixel preview | `⌘ + ⇧ + ⌥ + P`        | `Ctrl + ⇧ + Alt + P`         | Toggle pixel preview (Disabled ↔ last used 1x/2x) |
| Toggle outline mode  | `⌘ + ⇧ + O` or `⌘ + Y` | `Ctrl + ⇧ + O` or `Ctrl + Y` | Toggle outline mode (wireframe)                   |
| Preview              | `⇧ + Space`            | `⇧ + Space`                  | Preview current selection                         |

## Brush Tools

| Action              | macOS | Windows/Linux | Description                                     |
| ------------------- | ----- | ------------- | ----------------------------------------------- |
| Increase brush size | `]`   | `]`           | Increase brush size (when brush tool is active) |
| Decrease brush size | `[`   | `[`           | Decrease brush size (when brush tool is active) |

## Modifier Keys (While Pressed)

These modifiers affect behavior while they are held down:

| Modifier   | macOS  | Windows/Linux | Effect                                                                                                                           |
| ---------- | ------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Shift      | `⇧`    | `⇧`           | Lock to dominant axis while translating, preserve aspect ratio while scaling, quantize rotation (15°)                            |
| Alt/Option | `⌥`    | `Alt`         | Translate with clone (duplicate while dragging), transform from center origin, enable measurement tool, enable padding mirroring |
| Meta/Cmd   | `⌘`    | `Ctrl`        | Configure surface raycast targeting for deepest objects                                                                          |
| Control    | `Ctrl` | `Ctrl`        | Force disable snapping while moving/scaling                                                                                      |

## Planned (Reserved)

The following shortcuts are defined but not yet implemented:

- `⇧ + H` - Flip horizontal
- `⇧ + V` - Flip vertical
- `⌥ + ⌘ + K` / `Alt + Ctrl + K` - Create component
- `⌥ + ⌘ + B` / `Alt + Ctrl + B` - Eject component
- `Tab` - Text range: Increase indentation
- `⇧ + Tab` - Text range: Decrease indentation

# Grida Canvas - Insider's Features List

This document lists all implemented features including the ones that are not yet documented. The list is intended to be a reference for the developers and the users of the Grida Canvas.

## Features

### Standard Keyboard Shortcuts

**Bindings**

| action                  | description                             | macos                      | windows                 | env    |
| ----------------------- | --------------------------------------- | -------------------------- | ----------------------- | ------ |
| select all siblings     | select all siblings of the current node | `meta+a`                   | `ctrl+a`                | canvas |
| select children         | select all children of the current node | `enter`                    | `enter`                 | canvas |
| nudge                   | move selection by 1px                   | `arrow keys`               | `arrow keys`            | canvas |
| duplicate               | duplicate the current selection         | `meta+d`                   | `ctrl+d`                | canvas |
| flatten                 | convert selection to vector paths       | `meta+e`, `option+shift+f` | `ctrl+e`, `alt+shift+f` | canvas |
| undo                    | undo the last action                    | `meta+z`                   | `ctrl+z`                | canvas |
| redo                    | redo the last undone action             | `meta+shift+z`             | `ctrl+shift+z`          | canvas |
| cut                     | cut the current selection               | `meta+x`                   | `ctrl+x`                | canvas |
| copy                    | copy the current selection              | `meta+c`                   | `ctrl+c`                | canvas |
| paste                   | paste from the clipboard                | `meta+v`                   | `ctrl+v`                | canvas |
| toggle bold             | toggle bold style                       | `meta+b`                   | `ctrl+b`                | canvas |
| toggle italic           | toggle italic style                     | `meta+i`                   | `ctrl+i`                | canvas |
| toggle underline        | toggle underline style                  | `meta+u`                   | `ctrl+u`                | canvas |
| toggle active           | toggle active state for the selection   | `meta+shift+h`             | `ctrl+shift+h`          | canvas |
| toggle locked           | toggle locked state for the selection   | `meta+shift+l`             | `ctrl+shift+l`          | canvas |
| select parent           | select the parent of the current node   | `shift+enter`              | `shift+enter`           | canvas |
| select next sibling     | select the next sibling of the node     | `tab`                      | `tab`                   | canvas |
| select previous sibling | select the previous sibling of the node | `shift+tab`                | `shift+tab`             | canvas |
| delete node             | delete the current selection            | `delete`                   | `delete`                | canvas |
| align left              | align selection to the left             | `alt+a`                    | `alt+a`                 | canvas |
| align right             | align selection to the right            | `alt+d`                    | `alt+d`                 | canvas |
| align top               | align selection to the top              | `alt+w`                    | `alt+w`                 | canvas |
| align bottom            | align selection to the bottom           | `alt+s`                    | `alt+s`                 | canvas |
| align horizontal center | center selection horizontally           | `alt+h`                    | `alt+h`                 | canvas |
| align vertical center   | center selection vertically             | `alt+v`                    | `alt+v`                 | canvas |
| distribute horizontally | distribute selection horizontally       | `alt+ctrl+v`               | `alt+ctrl+v`            | canvas |
| distribute vertically   | distribute selection vertically         | `alt+ctrl+h`               | `alt+ctrl+h`            | canvas |
| eye dropper             | open eye dropper                        | `i`                        | `i`                     | canvas |

**Modifiers (while pressed)**

| action                    | description                                     | macos   | windows | env    |
| ------------------------- | ----------------------------------------------- | ------- | ------- | ------ |
| lock to dominant axis     | lock to dominant axis while translating         | `shift` | `shift` | canvas |
| preserve aspect ratio     | preserve aspect ratio while scaling             | `shift` | `shift` | canvas |
| quantize rotation         | quantize rotation while rotating                | `shift` | `shift` | canvas |
| translate with clone      | duplicate selection while dragging              | `alt`   | `alt`   | canvas |
| transform origin          | scale or rotate around center                   | `alt`   | `alt`   | canvas |
| surface raycast targeting | configure raycast targeting for deepest objects | `meta`  | `ctrl`  | canvas |
| force disable snapping    | move selection freely without snapping          | `ctrl`  | `ctrl`  | canvas |
| keep projecting path      | continue extending path after closing on vertex | `p`     | `p`     | vector |

### Actions

**General**

- [x] cut (`meta+x`)
- [x] copy (`meta+c`)
- [x] paste (`meta+v`)
- [x] delete (`delete, backspace`)
- [x] duplicate (`meta+d`)
- [x] repeating duplicate (`meta+d`)
- [x] flatten (`meta+e`, `option+shift+f`)
- [x] undo (`meta+z`)
- [x] redo (`meta+shift+z`)
- [x] select all siblings (`meta+a`)
- [x] select next sibling (`tab`)
- [x] select previous sibling (`shift+tab`)
- [x] select all children (go inner) (`enter`)
- [x] select all parents (go outer) (`shift+enter`)
- [x] toggle bold (`meta+b`)
- [x] toggle italic (`meta+i`)

**Alignment**

- [x] align selection with selection bounds
- [ ] align item with parent
- [x] distribute evenly

### Marqyee

- [x] marquee
- [x] marquee selection (`drag`)
- [x] marquee boolean selection (`shift + drag`)
- [x] marquee segment selection in vector edit mode

### Measurement

- [x] (`alt + hover`)
- [x] measure distance - no intersection
- [x] measure distance - intersection
- [x] measure distance - contains

### Gestures

**Modifiers**

- [x] lock to dominant axis while translate (`shift`)
- [x] preserve aspect ratio while scale (`shift`)
- [x] quantize rotation (rotate by 15 degrees) (`shift`)
- [x] quantize rotation by 1 degree by default

**Snapping**

- [ ] snap to pixel grid (quantize to 1)
- [x] snap to objects while translate
- [ ] snap to objects while scale
- [ ] snap to geometry while translate-vertex (snap vertices)
- [ ] snap to geometry while translate-tangent (snap tangents)

**Rotation**

- [ ] rotation based on atan relative to the center, based on rotation handle position

**Edge Scrolling**

> "edge scrolling" scrolls the canvas when the pointer is near the edge of the viewport, while dragging.

- [x] edge scrolling
- [ ] edge scrolling with pointer synchronization (the updated transform should also be applied to current gesture)

**Inserting**

- [x] insert with click (with static size)
- [x] insert with drag (with user-resizing size)
- [x] contain after insert-and-resize (when drag ends, contains the contained node behind that container)

### Content Edit Mode

- [x] Exiting vector edit mode automatically removes unused points from the vector network.
- [x] Exiting text edit mode automatically deletes the text node when its content is empty.
- [x] Escape in vector edit mode resets tool, clears selection, then exits the mode.
- [x] Copy/cut/paste vector network selections (pasting outside vector edit mode creates a new vector node. Pasting back into the same vector node preserves the geometry's absolute position at the moment of copy.)

### Controls

**Mixed Properties**

- [ ] mixed properties

### Uncategorised, TODOs & Suggestions.

- [external] drop image / svg to insert
- [external] paste value from clipboard

### Known Limitations

**dom backend**

- css backend node's `linear-gradient` does not support custom transform matrix
- css does not support `diamond-gradient`

---

## All Features ever implemented (Implemented, May not persist)

Below list may contain uncatagorized or even duplicate features. It's our history and iterations archive for future reference, for ensuring them as tests.

We keep below list as-is, as new issues discovered, to-do list added, and handled.

They are very specific, details per-scenario descriptions.

- [x] `2025.09` text stroke - outside default
      when stroke added to text, it should apply default outside

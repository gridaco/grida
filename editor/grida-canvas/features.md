# Grida Canvas - Insider's Features List

This document lists all implemented features including the ones that are not yet documented. The list is intended to be a reference for the developers and the users of the Grida Canvas.

## Features

### Standard Keyboard Shortcuts

**Bindings**

| action                  | description                             | macos          | windows        | env    |
| ----------------------- | --------------------------------------- | -------------- | -------------- | ------ |
| select all siblings     | select all siblings of the current node | `meta+a`       | `ctrl+a`       | canvas |
| select children         | select all children of the current node | `enter`        | `enter`        | canvas |
| nudge                   | move selection by 1px                   | `arrow keys`   | `arrow keys`   | canvas |
| duplicate               | duplicate the current selection         | `meta+d`       | `ctrl+d`       | canvas |
| undo                    | undo the last action                    | `meta+z`       | `ctrl+z`       | canvas |
| redo                    | redo the last undone action             | `meta+shift+z` | `ctrl+shift+z` | canvas |
| cut                     | cut the current selection               | `meta+x`       | `ctrl+x`       | canvas |
| copy                    | copy the current selection              | `meta+c`       | `ctrl+c`       | canvas |
| paste                   | paste from the clipboard                | `meta+v`       | `ctrl+v`       | canvas |
| toggle bold             | toggle bold style                       | `meta+b`       | `ctrl+b`       | canvas |
| toggle active           | toggle active state for the selection   | `meta+shift+h` | `ctrl+shift+h` | canvas |
| toggle locked           | toggle locked state for the selection   | `meta+shift+l` | `ctrl+shift+l` | canvas |
| select parent           | select the parent of the current node   | `shift+enter`  | `shift+enter`  | canvas |
| select next sibling     | select the next sibling of the node     | `tab`          | `tab`          | canvas |
| select previous sibling | select the previous sibling of the node | `shift+tab`    | `shift+tab`    | canvas |
| delete node             | delete the current selection            | `delete`       | `delete`       | canvas |
| align left              | align selection to the left             | `alt+a`        | `alt+a`        | canvas |
| align right             | align selection to the right            | `alt+d`        | `alt+d`        | canvas |
| align top               | align selection to the top              | `alt+w`        | `alt+w`        | canvas |
| align bottom            | align selection to the bottom           | `alt+s`        | `alt+s`        | canvas |
| align horizontal center | center selection horizontally           | `alt+h`        | `alt+h`        | canvas |
| align vertical center   | center selection vertically             | `alt+v`        | `alt+v`        | canvas |
| distribute horizontally | distribute selection horizontally       | `alt+ctrl+v`   | `alt+ctrl+v`   | canvas |
| distribute vertically   | distribute selection vertically         | `alt+ctrl+h`   | `alt+ctrl+h`   | canvas |
| eye dropper             | open eye dropper                        | `i`            | `i`            | canvas |

**Modifiers (while pressed)**

| action                     | description                                     | macos   | windows | env    |
| -------------------------- | ----------------------------------------------- | ------- | ------- | ------ |
| lock to dominant axis      | lock to dominant axis while translating         | `shift` | `shift` | canvas |
| preserve aspect ratio      | preserve aspect ratio while scaling             | `shift` | `shift` | canvas |
| quantize rotation          | quantize rotation while rotating                | `shift` | `shift` | canvas |
| translate with clone       | duplicate selection while dragging              | `alt`   | `alt`   | canvas |
| transform origin           | scale or rotate around center                   | `alt`   | `alt`   | canvas |
| surface raycast targeting  | configure raycast targeting for deepest objects | `meta`  | `ctrl`  | canvas |
| context-sensitive snapping | toggle snapping behavior dynamically            | `meta`  | `ctrl`  | canvas |

### Actions

**General**

- [x] cut
- [x] copy
- [x] paste
- [x] delete
- [x] duplicate
- [ ] repeating duplicate
- [x] undo
- [x] redo
- [x] select all siblings
- [x] select all children (go inner) (`enter`)
- [x] select all parents (go outer) (`shift+enter`)
- [x] toggle bold (`meta+b`)

**Alignment**

- [x] align selection with selection bounds
- [ ] align item with parent
- [x] distribute evenly

### Marqyee

- [x] marquee
- [x] marquee selection
- [x] marquee boolean selection (`shift + drag`)

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

### Controls

**Mixed Properties**

- [ ] mixed properties

### Uncategorised, TODOs & Suggestions.

- [external] drop image / svg to insert
- [external] paste value from clipboard

### Known Limitations

- css backend node's `linear-gradient` does not support custom transform matrix

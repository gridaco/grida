---
id: TC-CANVAS-INPUT-007
title: Dropdown Preview Reverts on Close Without Selection (and on Mouse-Leave Where Supported)
module: canvas
area: input
tags:
  [undo, history, preview, hover, blend-mode, font-style, font-family, dropdown]
status: untested
severity: medium
date: 2026-04-07
updated: 2026-04-07
automatable: false
covered_by:
  - editor/grida-canvas/__tests__/headless/preview.test.ts
---

## Behavior

Property dropdowns that support hover preview (blend mode, font style, font family) must:

1. Preview the hovered value live on the canvas without creating an undo entry
2. Keep the checkmark on the originally selected value (not the hovered one)
3. Revert the canvas to the original value when the mouse leaves all options (for controls that emit highlight-cleared events)
4. Revert the canvas to the original value when the dropdown closes without a selection
5. Commit as one undo step when the user clicks to select a value

This is implemented via `usePropertyPreview` — the hook captures the committed value on open, tells the history adapter to enter preview mode (which suppresses recording), and reverts or commits on close.

The checkmark stability is achieved by passing `preview.committedValue ?? liveValue` as the `value` prop to the dropdown. During preview, `committedValue` is the frozen pre-open value, so the dropdown renders the checkmark on the original. On commit or close, `committedValue` resets to `null` and the live store value takes over.

## Steps

### Blend mode dropdown

1. Select a rectangle with blend mode "Normal"
2. Open the blend mode dropdown
3. Hover over "Multiply" — canvas should show the node in Multiply blend mode
4. Expected: checkmark still on "Normal"
5. Hover over "Screen" — canvas updates to Screen
6. Move mouse outside the dropdown items
7. Expected: canvas reverts to Normal
8. Hover over "Overlay"
9. Close the dropdown without clicking (press Escape or click outside)
10. Expected: canvas reverts to Normal, no undo entry created
11. Reopen, hover "Darken", click "Darken"
12. Expected: canvas shows Darken, 1 undo entry created
13. Cmd+Z — reverts to Normal

### Font style dropdown

1. Select a text node with style "Regular"
2. Open the font style dropdown
3. Hover over "Bold" — canvas should render text in Bold
4. Expected: checkmark still on "Regular"
5. Move mouse off all items — canvas reverts to Regular
6. Hover "Italic", click to select
7. Expected: 1 undo entry, canvas shows Italic
8. Cmd+Z — reverts to Regular

### Font family picker

1. Select a text node with font "Inter"
2. Open the font family picker
3. Hover over "Roboto" — canvas should render text in Roboto
4. Expected: checkmark still on "Inter"
5. Close without selection — canvas reverts to Inter
6. Reopen, hover "Georgia", click to select
7. Expected: 1 undo entry

## Notes

The revert-on-mouse-leave behavior depends on the UI primitive firing a "highlight cleared" event. `PropertyEnumV2` (Combobox) fires `onValueSeeked(undefined)` when no item is highlighted. `BlendModeDropdown` (DropdownMenu) does not currently emit this event and reverts on close without selection instead. This is a known limitation.

The `usePropertyPreview` hook's `onSeek(null | undefined)` handler calls `apply(committedValue)` + `previewSet()` to revert the canvas while keeping the preview session open for the next hover.

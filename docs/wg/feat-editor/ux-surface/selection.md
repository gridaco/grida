# Selection

This document describes the selection behavior for pointer interactions and keyboard modifiers.

## Global Rules

- Selection is normalized: parent and child nodes cannot be selected simultaneously.

## Overlay Concept

The selection overlay is the event receiver for selection interactions.

**Definition:**

- Overlay is a UX box rendered on the surface, not direct canvas content
- Overlay acts as an event target for pointer interactions
- Overlay is present even when the selected item is culled (invisible)

**Behavior:**

- Dragging within the selected overlay region preserves selection
- Clicking on nodes within the overlay allows selection changes (deferred to `click`)
- Clicking empty space within the overlay clears selection (deferred to `click`)
- This ensures consistent behavior regardless of item visibility

<!-- Implementation note: Overlay uses DOM elements with event listeners rather than pure geometric queries. This is necessary because culled (invisible) items require a hittester that skips culling (pure absolute geometry query) and checks if the point is within the selection box bounds. -->

## Event Model

**Note on terminology:** The term `click` in this document refers to a virtual concept: `pointerdown` + `pointerup` without drag (no cancellation intent). This is distinct from the DOM/JavaScript `click` event, which may fire even after drags if the down/up targets match. Our system uses a virtual click that only occurs when no drag has occurred.

**Primary events:**

- `pointerdown` - Some selection changes occur immediately at this event (for new/empty targets not under current selection)
- `pointerup` - Used to distinguish click from drag
- `click` - Completion of pointerdown + pointerup without drag (virtual, not DOM click event). Deferred selection changes are applied at this event.
- `dragstart` - Indicates user intent to drag (cancels deferred selection changes)
- `drag` - Continuous drag gesture
- `dragend` - Completion of drag gesture

**Modifiers:**

- `Shift` key - Modifies selection behavior (additive/toggle mode)

## Selection Timing

Selection changes occur at different times based on whether the target is within the current selection:

**Rule of thumb:**

- **Select immediately** (on `pointerdown`): if target is new or empty, and when not under current selection
- **Select on `click`** (on `pointerup` without drag): if target is within current selection

**Rationale:** When the target is within the current selection, we don't yet know if the user's intent is to toggle/change selection or to drag. If we handle selection changes (especially Shift+toggle) immediately on `pointerdown`, users will never be able to drag the current selection with Shift key pressed (for axis lock), forcing them to first drag, then press Shift key (annoying UX). By deferring selection changes until `click`, we can distinguish between drag intent and selection change intent.

### Immediate (on `pointerdown`)

Selection changes immediately when:

- Target is an unselected node (without Shift) → selects that node
- Target is an unselected node (with Shift) → adds to selection
- Target is empty space outside selection overlay (without Shift) → clears selection

**Rationale:** User intent is unambiguous - they want to select, add, or clear. Target is not within current selection.

### Deferred (on `click`, cancelled on `dragstart`)

Selection changes are deferred when the target is within the current selection (applies to both single and multi-selection):

- Target is a selected node (without Shift) → defer reset to just that node
- Target is a selected node (with Shift) → defer toggle (deselect)
- Target is a child of selected node(s) → defer reset to that child
- Target is empty space within selection overlay (without Shift) → defer clear selection

**Rationale:** User intent is ambiguous - they may want to drag the selection or change selection. Deferring allows distinguishing between drag and click. This applies equally to single and multi-selection - if we toggle immediately on `pointerdown` when Shift is pressed on a selected node, users cannot start a drag with Shift already pressed for axis lock.

**Behavior:**

- If `dragstart` occurs → deferred operation is cancelled, selection preserved
- If `click` occurs (no drag) → deferred operation is applied, selection changes

## Test Cases

### Empty Space Click

**Scenario:** User clicks on empty space (no target node) without Shift key.

**Expected behavior:**

- Selection is cleared immediately on `pointerdown`
- Does not wait for `pointerup` or `click`

**Rationale:** User intent is clear - they want to deselect everything.

### Single Selection - Child Hover During Drag

**Scenario:**

- One container node is selected (contains a rectangle child, total 2 nodes)
- User hovers over the inner rectangle
- User drags

**Expected behavior:**

- Selection does not change during drag
- Container remains selected

**Rationale:** User's intent is to drag the selected container, not change selection.

### Single Selection - Child Click

**Scenario:**

- One container node is selected (contains a rectangle child)
- User clicks (no drag) on the inner rectangle

**Expected behavior:**

- Selection changes to the inner rectangle on `click` (pointerup without drag)
- Does not change on `pointerdown`

**Rationale:** To select inner content, selection occurs on `click`, not `pointerdown`, to avoid confusing drag intent.

### Multi-Selection - Child Hover During Drag

**Scenario:**

- Two root containers are selected (each contains a rectangle, total 4 nodes)
- User hovers over inner rectangle of one container
- User drags

**Expected behavior:**

- Selection does not change during drag
- Both containers remain selected

**Rationale:** User's intent is to drag the selection group, not change selection.

### Multi-Selection - Node Click Within Selection

**Scenario:**

- Two nodes (A and B) are selected
- User clicks (no drag) on node A

**Expected behavior:**

- Selection changes to just node A on `click` (pointerup without drag)
- Does not change on `pointerdown`

**Rationale:** User can change selection by clicking on a node within the selection group. Selection change is deferred to `click` to distinguish from drag intent.

### Single Selection - Node Toggle (Shift+Click)

**Scenario:**

- One node (A) is selected
- User presses Shift and clicks (no drag) on node A

**Expected behavior:**

- Node A is toggled out of selection (deselected) on `click` (pointerup without drag)
- Selection becomes empty
- Does not change on `pointerdown`

**Rationale:** If toggle happened immediately on `pointerdown`, users could not start a drag with Shift already pressed for axis lock. Deferring to `click` allows distinguishing between drag intent and toggle intent.

### Multi-Selection - Node Toggle Within Selection

**Scenario:**

- Two nodes (A and B) are selected
- User presses Shift and clicks (no drag) on node A

**Expected behavior:**

- Node A is toggled out of selection on `click` (pointerup without drag)
- Selection becomes just node B
- Does not change on `pointerdown`

**Rationale:** If toggle happened immediately on `pointerdown`, users could not start a drag with Shift already pressed for axis lock. Deferring to `click` allows distinguishing between drag intent and toggle intent. This applies equally to single and multi-selection.

### Multi-Selection - Empty Space Drag Within Overlay

**Scenario:**

- Two nodes (A and B) are selected, forming a selection group overlay
- User presses pointer down on empty space within the selection overlay bounds (no node behind the pointer)
- User drags (with or without Shift key)

**Expected behavior:**

- Selection does not change during drag
- Both nodes remain selected
- Selection group is dragged as a unit
- Applies whether Shift key is pressed or not

**Rationale:** User's intent is to drag the selection group, not clear selection or start marquee. Empty space within the overlay bounds is part of the selection region. Shift key should enable axis lock for dragging, not start marquee selection.

### Multi-Selection - Empty Space Click Within Overlay

**Scenario:**

- Two nodes (A and B) are selected, forming a selection group overlay
- User clicks (no drag) on empty space within the selection overlay bounds (no node behind the pointer)

**Expected behavior:**

- Selection is cleared on `click` (pointerup without drag)
- Both nodes are deselected

**Rationale:** A complete click (pointerdown + pointerup without drag) on empty space is a clear intent to clear selection, even within the overlay bounds.

## Selection Change Rules

### On `pointerdown`

**Immediate selection changes:**

- Unselected node (no Shift) → select that node
- Unselected node (with Shift) → add to selection
- Empty space outside selection overlay (no Shift) → clear selection

**Deferred selection changes:**

- Selected node (no Shift) → defer reset to that node
- Selected node (with Shift) → defer toggle (deselect)
- Child of selected node(s) → defer reset to that child
- Empty space within selection overlay (no Shift) → defer clear selection

### On `click` (pointerup without drag)

**Applied operations:**

- All deferred selection operations are applied

### On `dragstart`

**Cancelled operations:**

- All deferred selection operations are cancelled
- Selection remains unchanged

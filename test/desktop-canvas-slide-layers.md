---
id: TC-DESKTOP-CANVAS-001
title: Browse the active slide in the Layers pane
module: desktop
area: canvas
tags: [deck, layers, selection, resize]
status: untested
severity: medium
date: 2026-11-21
updated: 2026-11-22
automatable: true
covered_by: []
---

## Behavior

The deck sidebar shows slide thumbnails above the active slide’s layer tree.
Layers starts collapsed, leaving most of the sidebar for thumbnails. The
Layers header opens the pane at 160 px the first time. It restores its previous
height on later openings.
The two panes scroll independently. The divider between them changes their
heights, and the divider next to the slide changes the sidebar width. Both
dividers stay in place when the active slide changes. Selecting an object on
the slide reveals its row in the tree. Selecting a row highlights that object
on the slide. Right-clicking an object on the slide opens the same editing
menu as right-clicking its row in Layers.

## Steps

1. Open a Desktop deck with two or more slides whose contents differ. Verify
   only the Layers header is visible. Click it and verify the pane opens at
   160 px.
2. Select an object and drag the divider next to the slide left and right.
   Verify that the sidebar and slide resize together and the object stays
   selected. Focus the divider and verify Left and Right also resize it.
3. Drag the divider between Slides and Layers up and down. Verify that both
   panes resize and scroll independently. Focus that divider and press Up or
   Down. Verify that it resizes and the same slide remains active.
4. Click the Layers header to collapse the pane. Verify the thumbnails gain
   the space and the header stays available. Switch slides, then activate
   the header with the keyboard and verify Layers reopens at its prior height.
5. Select a row in Layers and verify the slide highlights the corresponding
   object. Select an object inside a collapsed group on the slide and verify
   the group expands to reveal the selected row.
6. Right-click an object on the slide. Verify the clicked object is selected
   and the menu offers the same actions as its layer row. Choose an action
   and verify it applies to that object.
7. Click another slide’s thumbnail. Verify that Layers shows that slide’s
   objects and both dividers stay in place.
8. Repeat in a dedicated deck window.

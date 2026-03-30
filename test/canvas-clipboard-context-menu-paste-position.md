---
id: TC-CANVAS-CLIPBOARD-002
title: Context Menu Paste Should Respect Cursor Position
module: canvas
area: clipboard
tags: [clipboard, paste, context-menu, cursor-position, right-click]
status: verified
severity: high
date: 2025-12-27
updated: 2025-12-27
automatable: false
covered_by: []
---

## Behavior

When pasting via the context menu (right-click), the pasted content should be inserted at the cursor position where the context menu was triggered, not at the center of the viewport. This ensures context menu paste behaves consistently with drag-and-drop, where content is placed at the drop location.

The system must use the pointer position at the time the context menu was opened to determine paste location. This applies to all paste operations from the context menu: Grida clipboard payloads, Figma clipboard payloads, SVG text, images, and plain text content.

## Steps

1. Copy a node (Cmd+C)
2. Right-click at a specific location on the canvas (away from center)
3. Select "Paste" from the context menu
4. Expected: the node appears at the right-click location, not viewport center
5. Repeat with different content types (SVG, image, text)
6. Expected: all paste at the cursor position consistently

## Notes

Applies to all clipboard content types routed through context menu paste.

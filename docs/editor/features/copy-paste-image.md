# Image Copy & Paste Model

This document captures the end-to-end experience of bringing raster images into a Grida document and reusing them inside the canvas. It covers existing image import flows and details the dedicated copy-and-paste behaviour available when editing image paints directly on the canvas.

## Goals

- Provide a predictable path for loading external imagery onto the canvas.
- Offer keyboard-friendly workflows that behave consistently with the platform clipboard.
- Preserve the fidelity of image paints edited in place while keeping the system clipboard free from transient editor data.

## Feature Summary

| Interaction                | Entry points                                                        | Result                                                                                    |
| -------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Drag & drop image          | Drop bitmap file, browser download, or remote image onto the canvas | Creates an image node sized to the asset and positioned at the drop location.             |
| Paste image from clipboard | `Cmd/Ctrl + V`, context menu → Paste                                | Inserts a new image node that inherits the image data from the system clipboard.          |
| Copy as PNG                | `Cmd/Ctrl + Shift + C`, context menu → Copy/Paste as… → Copy as PNG | Copies the current selection as a flattened PNG into the system clipboard.                |
| Image paint copy           | `Cmd/Ctrl + C` while editing an image paint                         | Captures only the paint transform and metadata in a document-scoped clipboard.            |
| Image paint paste          | `Cmd/Ctrl + V` while editing an image paint                         | Applies the copied paint to the current selection or is ignored if no nodes are selected. |

---

## Drag & Drop Image Import

Drag-and-drop is the fastest way to place new imagery on the canvas. Users can drop:

- Files from the desktop (PNG, JPEG, GIF, SVG, and other supported bitmap formats).
- Images dragged from the browser, including direct downloads and `<img>` elements.

When an eligible payload enters the canvas, the editor highlights the drop target. Releasing the pointer creates a new image node:

1. The node is positioned under the drop location, adjusted to the current viewport scale.
2. The node’s bounds are set to the intrinsic dimensions of the bitmap.
3. The file is uploaded asynchronously to the project asset store; once available, the node points to the hosted asset URL.
4. The freshly created node becomes the active selection, giving immediate access to transforms and the inspector.

If multiple files are dropped, each file produces a sibling image node, preserving the order reported by the OS drag payload.

## Paste Image from Clipboard

The editor listens for paste events coming from the system clipboard. When the clipboard contains bitmap data (e.g., a screenshot), the canvas creates a new image node at the centre of the current viewport. The node inherits:

- The raster pixels embedded in the clipboard item.
- The bitmap size, ensuring that screenshots land at a 1:1 scale by default.

Pasted images respect any existing selection: pasting does not replace the current selection and always yields a new node. Subsequent transforms can be applied immediately without leaving the paste flow. When the clipboard contains multiple image items, only the primary bitmap entry is used; non-image items fall back to the default paste behaviour (text, nodes, etc.).

## Copy as PNG (Export Shortcut)

Copy as PNG is a dedicated export shortcut that flattens the current selection into a raster image and places it in the system clipboard. This is ideal for sharing a quick capture with external tools while preserving the editable nodes in the document.

- Accessible via `Cmd/Ctrl + Shift + C` or the context menu.
- Requires the canvas to run on the WASM rendering backend so the selection can be rasterised on demand.
- Produces a bitmap sized to the selection bounds, including visual effects (fills, strokes, shadows) as they appear on the canvas.

Consumers outside Grida (design critiques, chat apps, documentation tools) receive a standard PNG payload that can be pasted directly.

---

## Image Paint Editing & Clipboard Behaviour

Image paints can be edited in place by entering the surface image editor (double-click a node with an image fill or stroke). While in this dedicated `paint/image` mode, the copy-and-paste commands are repurposed to let designers reuse meticulous paint adjustments across multiple nodes without polluting the system clipboard.

### Entering and Exiting Paint Mode

1. Double-click a node whose fills or strokes include an image paint.
2. The surface image editor renders the paint bounds, handles, and overlays described in the [Surface Image Editor](./surface-image-editor.md) document.
3. Press `Esc`, double-click outside, or switch modes through the inspector to exit and restore the standard selection overlay.

### Copy: Capturing Paint Data Only

- Trigger: `Cmd/Ctrl + C` while the paint editor is active.
- Scope: Applies solely to the image paint currently being edited. Regular copy operations outside paint mode remain unaffected.
- Payload: Stores the paint metadata (transform matrix, crop, applied filters, and repeat mode) inside a document-scoped clipboard.
- Isolation: No raster pixels are copied. The payload cannot be pasted into external applications and is cleared when the document is closed.

This behaviour ensures that meticulous paint adjustments (alignment, crop, rotation) can be transferred without duplicating large bitmap data or clobbering the user’s system clipboard.

### Paste: Reusing a Paint Payload

When pasting inside paint mode, the editor first inspects whether the document clipboard holds a compatible paint payload from the current document.

1. **Selection-aware application** – If one or more nodes are selected, the stored paint is applied to each selected node. The copied paint is added to the end of the existing fills or strokes array, preserving all existing paints. Nodes without any existing paints will have the payload added as their first fill entry.
2. **No selection** – If nothing is selected, the paste command is ignored to prevent accidental overrides.

The operation is silent and non-destructive: the underlying bitmap reference remains unchanged, and the document clipboard retains the payload for subsequent pastes until a new paint copy occurs or the editing session ends.

### Consistency with Global Clipboard

- Exiting paint mode restores the standard clipboard behaviour immediately.
- Copying nodes or using Copy as PNG always writes to the system clipboard, even if a paint payload is still stored internally.
- The document clipboard can coexist with the system clipboard, allowing designers to copy a paint, exit edit mode, copy nodes for duplication, then return to paint mode and continue pasting the preserved paint adjustments.

---

## Design Considerations

- **Predictability:** Paint-specific clipboard actions avoid surprising the user by keeping external paste targets unaffected.
- **Performance:** By transferring only transform metadata, paste operations remain instant even for large images.
- **Safety:** Ignoring paste when no nodes are selected prevents invisible state changes and maintains a reversible history through the standard undo stack.

These behaviours collectively provide a cohesive image workflow—from first import to fine-grained paint reuse—tailored for fast, reliable editing sessions on the Grida canvas.

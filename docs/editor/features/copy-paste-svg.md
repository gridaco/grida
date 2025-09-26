# SVG Copy & Paste Model

This document describes how the Grida canvas handles SVG content throughout copy, paste, and drag-and-drop workflows. It documents the current user-facing behaviour and outlines the remaining work required to finish the SVG clipboard experience alongside the existing raster-oriented model.

## Goals

- Let designers bring external vector artwork into the canvas with minimal friction.
- Preserve the structure of pasted SVGs by converting them into native Grida nodes rather than rasterising them.
- Provide symmetry between importing SVGs and exporting the current selection back to the system clipboard.
- Keep the canvas responsive by validating payloads early and surfacing clear feedback on unsupported content.

## Feature Summary

| Interaction          | Entry points                                                                     | Result                                                                                | status  |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------- |
| Drag & drop SVG file | Drop `.svg` files from the desktop, downloads, or library assets onto the canvas | Converts the SVG into editable nodes positioned at the drop target.                   | ready   |
| Paste SVG file       | `Cmd/Ctrl + V` when the system clipboard holds an SVG file item                  | Reads the SVG payload and inserts it at the viewport centre as editable vector nodes. | ready   |
| Paste SVG text       | `Cmd/Ctrl + V` with raw `<svg>` markup in the clipboard                          | Parses the markup and inserts the resulting nodes at the viewport centre.             | planned |
| Copy as SVG          | context menu → Copy/Paste as… → Copy as SVG                                      | Exports the selection as optimised SVG markup and writes it to the system clipboard.  | planned |

---

## Existing Behaviour

### Drag & Drop Vector Assets

The editor already reacts to drop events emitted from the canvas surface:

1. The dropzone intercepts `dragover` and `drop` events to keep the browser from navigating away from the page.
2. When the payload originates from Grida (via the `x-grida-data-transfer` MIME), SVG assets are fetched and inserted directly without relying on local files.
3. For general OS drops, each file is type-checked. Valid raster types (`image/png`, `image/jpeg`, `image/gif`) are routed to the image import flow, while `image/svg+xml` is handled by the SVG pipeline.
4. SVG files are read as UTF‑8 text. The filename (sans extension) becomes the node name.
5. The SVG string is passed to `createNodeFromSvg`, which optimises the markup and converts it into a container node tree. The node is positioned so that its geometric centre aligns with the drop location.
6. Unsupported file types surface a toast notification instead of silently failing.

This flow is already functional, but it lacks SVG-specific affordances such as payload validation feedback and drop previews. Completing the feature requires fine-tuning those edge cases and ensuring multi-file drops keep their relative order.

### Clipboard: File Payloads

Pasting while the clipboard contains an SVG file item follows the same conversion path:

1. The paste handler inspects every clipboard item using the shared clipboard decoder.
2. If it encounters an `image/svg+xml` entry, the file is read and passed to the same `insertFromFile → insertSVG` pipeline used for drops.
3. The resulting vector nodes are created at the centre of the current viewport, mirroring the bitmap paste behaviour.
4. When multiple clipboard items are available, the SVG file takes precedence over generic text unless it carries a recognised Grida payload (e.g., vector network edits).

This gives users parity between dropping files from the desktop and pasting captured vector assets directly from compatible design tools or browsers.

---

## New Additions

### 1. Drop SVG File (Polish & Completion)

Although the core insertion path exists, the feature is still considered partially implemented. The remaining scope includes:

- **Validation & messaging** – Detect malformed SVGs before conversion, surface friendly toasts (e.g., missing `<svg>` root, no `viewBox`), and keep the canvas state untouched on failure.
- **Ordering guarantees** – When dropping multiple SVG files, maintain their drop order and stack them around the cursor with a consistent offset, matching the raster image experience.
- **Library parity** – Ensure assets dragged from the built-in library provide progress and error messaging identical to local file drops.
- **Performance budget** – Defer heavy conversions to a worker if large SVGs degrade interaction during the drop gesture.

### 2. Paste SVG Text Payloads

Designers often copy raw SVG markup from code editors or inspection tools. The editor should interpret plain-text payloads that describe an SVG document even when no file item exists:

- **Detection** – When the primary clipboard item is `text/plain`, trim whitespace and check if it starts with `<svg`. Only treat the payload as vector data if both opening and closing `<svg>` tags are present and a `viewBox` attribute exists (required for sizing).
- **Minimal valid payload** – The parser should accept markup as small as:

  ```xml
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>
  ```

  The `xmlns` attribute can be empty, and self-contained SVG documents with no children create empty container nodes.

- **Fallback** – If validation fails, revert to the default text paste behaviour (inserting a text node that holds the clipboard string) so that standard clipboard expectations are preserved.
- **Placement** – Insert the resulting vector nodes at the viewport centre with the same naming strategy used for file drops (e.g., `Pasted SVG` plus a counter).

### 3. Copy as SVG

To complete the round trip, the editor needs a “Copy as SVG” export option parallel to “Copy as PNG”:

- **Entry points** – Add the action to the context menu (Copy/Paste as…) and bind it to `Cmd/Ctrl + Shift + C` when the selection is vector-compatible. The shortcut is shared with Copy as PNG today; the UI should offer a submenu for explicit format choice.
- **Backend bridge** – Reuse the existing SVG exporter (`export_as_svg`) provided by the canvas backend. This produces an optimised SVG string that honours the current fill, stroke, effect, and transform stack.
- **Clipboard write** – Create a `ClipboardItem` with the `image/svg+xml` MIME type and provide the exporter result. Also include a `text/plain` fallback containing the same markup for hosts that do not yet support structured clipboard writes.
- **Selection scope** – Support single nodes, multi-selection, and frames. Flattened results should preserve grouping so that the exported SVG mirrors the canvas hierarchy.
- **Error handling** – When the exporter is unavailable (e.g., DOM backend) or fails, show a toast and keep the clipboard untouched.

---

## Edge Cases & Error Handling

- **Malformed markup** – Wrap conversion calls in try/catch blocks. Report parsing failures without breaking the undo stack. Offer guidance such as “Ensure the SVG includes a viewBox attribute.”
- **Large payloads** – Guard against SVGs that expand into huge node trees. If the conversion exceeds a size threshold, warn the user and allow cancelling the insertion.
- **Canvas mode awareness** – SVG copy/paste should only activate on the WASM canvas backend where the exporter and converter are available. The UI must communicate when actions are disabled.
- **Undo/redo** – Every successful insertion or copy action should register on the undo stack to keep the workflow predictable.

---

## Relationship to Raster Workflows

SVG support complements, rather than replaces, the existing raster copy-and-paste pipeline. Raster payloads still prefer `Copy as PNG` and image file drops. When both raster and SVG data are present on the clipboard, SVG takes precedence for vector fidelity, but users can always fall back to text or bitmap pastes through the system-provided clipboard UI.

Delivering these enhancements will make the SVG copy-and-paste experience feel at home alongside the rest of the Grida canvas tooling while keeping the implementation approachable for future backend iterations.

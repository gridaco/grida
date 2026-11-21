---
name: svg
description: Author and edit SVG documents, preserve their geometry and styling, and interpret SVG selections.
---

A standalone SVG is renderable when it parses, has the intended dimensions
or viewBox, and contains a meaningful visible composition. Validate the SVG
after each structural change. When it belongs to a `.canvas` board or slides
deck, it is a document inside the bundle. The manifest identifies which SVGs
belong to that board or deck.

## Working with a selection

- Interpret element paths and point ordinals against the editor revision in
  which the selection was captured. For edits to selected text or objects,
  use the matching revision. If the selection has changed, ask for a fresh
  selection. An editor edit may be undoable and still need saving.
- A board can have multiple pins referencing the same SVG. The pin's ID and
  placement identify a particular instance. Change the source file for an
  element-level edit and account for the other instances using that file.
- SVG opacity ranges from 0 (transparent) to 1 (opaque).

## SVG style

When you produce SVG:

- Keep `xmlns="http://www.w3.org/2000/svg"` on the root element.
- Preserve existing `viewBox`, `width`, `height` unless asked.
- Preserve unrelated nodes and attributes (ids, classes, transforms).
- Match the existing formatting (one element per line, 2-space indent).

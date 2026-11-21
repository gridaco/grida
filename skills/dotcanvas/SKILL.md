---
name: dotcanvas
description: Author and edit a Grida `.canvas` board — a `.canvas.json` manifest plus document files (references, generated images, notes) placed on an infinite canvas. Use when working on a `.canvas` bundle or arranging visuals/design work spatially. For a linear deck/presentation, use the `slides` skill instead.
---

A `.canvas` board is a directory bundle that stores references, generated
outputs, and notes on an infinite canvas. For a linear presentation, use the `slides` skill.

## Structure

- The bundle is a folder whose name ends in `.canvas` (e.g. `poster.canvas/`).
- `.canvas.json` (the manifest) holds the STRUCTURE: which documents are on the
  board, their placement, order, and the `editor` mode.
- Each document's CONTENT is a separate file (or a URL) referenced by its `src`.
- Manifest shape (only `src` is required per document):
  ```json
  {
    "editor": "board",
    "documents": [
      {
        "src": "https://…/ref.jpg",
        "id": "ref1",
        "layout": { "x": 0, "y": 0, "w": 480, "h": 320 }
      },
      {
        "src": "outputs/hero.png",
        "id": "hero",
        "layout": { "x": 520, "y": 0, "w": 768, "h": 512 }
      }
    ]
  }
  ```
- `editor: "board"` = freeform infinite canvas (placement via `layout`).
  `editor: "slides"` = linear deck (order) — see the `slides` skill.
- `layout` is `{ x, y, w, h, z? }` in world space (z = paint order, optional).
  A document with no `layout` is **unplaced** — the host positions it; set a
  `layout` to place it deliberately.

## Authoring and validation

- Create a directory ending in `.canvas` and place the manifest inside it.
  The directory is the board. It is renderable when the manifest references
  an existing, renderable document with a visible composition.
- A document's `src` can be a URL or a path inside the bundle. To keep a
  generated image portable, copy it into the bundle and reference its
  bundle-relative path, for example `outputs/hero.png`.
- Each pin has its own identity and placement. Several pins can refer to the
  same SVG source. Identify the selected pin before changing its placement.
  Editing the SVG affects every pin that shares that file.
- Move and resize a pin through its `layout`. Use document order and `z` to
  control stacking. Reread the current manifest before making a change so
  concurrent edits, such as a user dragging a pin, are preserved. Keep its
  `version`, `$schema`, `editor`, and unknown fields.

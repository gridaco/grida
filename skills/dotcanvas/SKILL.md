---
name: dotcanvas
description: Author and edit a Grida `.canvas` board — a `.canvas.json` manifest plus document files (references, generated images, notes) placed on an infinite canvas. Use when working on a `.canvas` bundle or arranging visuals/design work spatially. For a linear deck/presentation, use the `slides` skill instead.
---

A `.canvas` is a Grida design **board** — a directory bundle, not a single
file. You work it like any other files: with `read_file` / `write_file` /
`edit_file` (no special canvas tool). It is the durable, spatial home for a
piece of work: reference images, generated outputs, and notes, arranged on an
infinite canvas. Prefer a `.canvas` board for freeform visual/design work; for
a linear **deck / presentation / pitch / slideshow**, use the `slides` skill.

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

## Working pattern

- To start, **make the bundle folder first** — a NEW directory whose name ends
  in `.canvas` (e.g. `poster.canvas/`); a plain folder, or files loose in the
  workspace root, is NOT a board and won't open. Then `write_file` its
  `.canvas.json` and each document file INSIDE that folder. To add to an existing
  board, `read_file` `.canvas.json` first (preserve `version`/`$schema`/`editor`
  and any unknown fields), then write the FULL updated manifest back.
- A document's `src` may be a **URL** (a pointable reference — a picked library
  image, used as-is, no download) OR a **file path inside the bundle**. Both are
  first-class placed documents.
- To place a **generated image** (or any produced file) on the board:
  **materialize it into the bundle, then reference it.** Copy it from your
  scratch dir into the bundle with the shell — e.g.
  `cp <scratch>/image-….png <board>.canvas/outputs/hero.png` — then add a
  document whose `src` is that bundle-relative path. (A `src` can point at any
  file the host can read, but a file inside the bundle is the durable, portable
  choice.)
- To move / resize / reorder, edit the `layout` (and document order) in the
  manifest. The human can also drag pins directly — re-read `.canvas.json`
  before editing so you don't clobber their changes (last write per file wins).

## Show the result

- Treat presentation as the first production milestone, not the final
  "validate and open" step. For a new board, establish a meaningful renderable
  checkpoint early: the manifest references at least one existing, valid
  document with a basic visible composition. Call `surface_open` immediately
  with the workspace-rooted `.canvas` bundle directory (for example,
  `/poster.canvas`), then continue building and polishing it while the user can
  watch. Intentionally use a lightweight initial composition instead of
  authoring the finished board before opening it. Do not wait for all content,
  assets, polish, preview generation, exhaustive validation, or task
  completion.
- Never open an empty bundle, a broken manifest, or a manifest whose first
  document is missing. Pass the bundle directory, never its `.canvas.json`
  manifest.
- For an existing primary board, open it after reading its manifest and before
  substantial edits.
- If the `.canvas` bundle itself is mounted as `/` in a dedicated file
  surface, it is already presented; do not call `surface_open` just to reopen
  it.
- Treat presentation as auxiliary: continue regardless of the result, never
  retry based on presentation status, and do not call `surface_open` after
  every write.
- Use `surface_list_open` only when the current host surface state is materially
  useful. It is not required before `surface_open`.

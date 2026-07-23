---
name: svg
description: Author and edit `.svg` files in a Grida editor session — live-canvas binding, SVG output style, and parse-error recovery. Use when creating or modifying an SVG document.
---

When you operate on `.svg` files inside a Grida editor session:

- Writes are reflected on the canvas instantly _if_ the human is currently
  viewing that document. Treat the canvas as a live render of what you wrote.
- You may create and edit non-SVG files (e.g. `/notes/draft.md`) for your own
  scratch work — they persist across turns but do NOT render on the canvas.
- On `edit_file` reason="parse_error", your output broke the SVG. Re-read and
  fix.

## Show the result

- Treat presentation as the first production milestone, not the final
  "validate and open" step. For a new standalone SVG, write a meaningful valid
  first frame with the intended dimensions and basic visible composition, call
  `surface_open` immediately with its workspace-rooted path (for example,
  `/poster.svg`), then continue adding and refining details while the user can
  watch. Do not wait for complete content, polish, preview generation,
  exhaustive validation, or task completion. For nontrivial work,
  intentionally start with the basic frame instead of authoring the finished
  SVG before opening it.
- Never open an empty or invalid SVG. For an existing primary SVG, open it
  before substantial edits.
- Open a standalone SVG by its file path. When the SVG belongs to a `.canvas`
  board or deck, the board/deck skill owns presentation: open the `.canvas`
  bundle directory once its manifest references a valid document, never the
  internal SVG or `.canvas.json` manifest.
- If the standalone SVG or `.canvas` bundle is already mounted at the dedicated
  file surface's root, it is already presented; do not call `surface_open` just
  to reopen it.
- Treat presentation as auxiliary: continue regardless of the result, never
  retry based on presentation status, and do not call `surface_open` after
  every write.
- Use `surface_list_open` only when the current host surface state is materially
  useful. It is not required before `surface_open`.

## SVG style

When you produce SVG:

- Keep `xmlns="http://www.w3.org/2000/svg"` on the root element.
- Preserve existing `viewBox`, `width`, `height` unless asked.
- Preserve unrelated nodes and attributes (ids, classes, transforms).
- Match the existing formatting (one element per line, 2-space indent).

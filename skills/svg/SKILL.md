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

- When the workbench offers presentation, use `workbench_show` with a
  workspace file target such as `{"target":{"kind":"file","path":"/poster.svg"}}`.
  Discover deferred workbench tools with `tool_search` before invoking them.
  On an older host that offers `surface_open`, follow that tool's schema.
- For a new standalone SVG, write a meaningful valid first frame with the
  intended dimensions and basic visible composition. Show it at that
  checkpoint, then continue adding and refining details while the user can
  watch.
- Never open an empty or invalid SVG. For an existing primary SVG, open it
  before substantial edits.
- Open a standalone SVG by its file path. When the SVG belongs to a `.canvas`
  board or deck, the board/deck skill owns presentation: open the `.canvas`
  bundle directory once its manifest references a valid document, never the
  internal SVG or `.canvas.json` manifest.
- If the standalone SVG or `.canvas` bundle is already mounted at the
  dedicated file surface's root, keep the current view open.
- Continue artifact work after the reveal request. Show it again only when the
  user asks or the primary artifact changes.
- Use `workbench_list_tabs` only when the current tabs matter to the task. On
  an older host, use `surface_list_open` for this read when offered.

## SVG style

When you produce SVG:

- Keep `xmlns="http://www.w3.org/2000/svg"` on the root element.
- Preserve existing `viewBox`, `width`, `height` unless asked.
- Preserve unrelated nodes and attributes (ids, classes, transforms).
- Match the existing formatting (one element per line, 2-space indent).

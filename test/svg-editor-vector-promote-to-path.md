---
id: TC-SVGEDITOR-VECTOR-001
title: Primitive shapes promote to <path> on first vector edit
module: svg-editor
area: vector
tags: [vector, content-edit, promotion, history, undo, round-trip]
status: untested
severity: medium
date: 2026-06-04
updated: 2026-06-04
automatable: false
covered_by:
  - packages/grida-svg-editor/__tests__/promote-to-path.test.ts
  - packages/grida-svg-editor/__tests__/vector-edit-promote.test.ts
  - packages/grida-svg-editor/__tests__/is-vector-edit-target.test.ts
---

## Behavior

`<rect>`, `<circle>`, and `<ellipse>` can be vector-edited (anchors, segments,
tangents) even though their native attribute forms have no addressable interior
vertices. Honoring such a gesture requires re-typing the element to `<path>` —
**promotion** (design: `docs/wg/feat-svg-editor/promote-to-path.md`).

Promotion is **lazy**: entering vector-edit mode on a primitive shows a
path-equivalent vertex overlay (a circle/ellipse appears as four cubic-Bézier
segments with anchors at the cardinal points; a rect as its four corners) but
**mutates nothing in the document**. The element re-types to `<path>` only on
the first geometry-committing gesture. Promotion and that first edit collapse
into a **single undo step**: undo restores the original primitive byte-for-byte
(tag, geometry attributes, all other attributes, and source trivia intact).

The full automatable surface — eligibility, the cubic/rect geometry, the
byte-equal round-trip, and the `vector_apply`/`vector_revert` commit path — is
covered by the unit tests listed in `covered_by`. This TC covers the parts that
only manifest through real pointer interaction in a mounted editor: that the
overlay tracks the drag, that the live shape re-renders as a path, and that the
enter-then-escape (no edit) case truly leaves the file untouched.

## Steps

1. Mount the editor on a document containing `<circle cx="50" cy="50" r="30"
fill="red"/>` and at least one comment or extra attribute on the circle.
2. Double-click the circle to enter vector-edit (content-edit) mode.
   - Expected: a vertex overlay appears with four anchors at the cardinal
     points (top/right/bottom/left) and tangent handles; the document is still
     a `<circle>` (serialize is byte-identical to the input).
3. Press Escape to exit without editing.
   - Expected: still a `<circle>`; `serialize()` is byte-identical to the input
     (lazy promotion — no edit, no diff).
4. Re-enter vector-edit, then drag one anchor and release.
   - Expected: the overlay tracks the anchor during the drag; on release the
     rendered shape is a `<path>` whose `d` reflects the moved anchor, with
     `fill="red"` and the comment/extra attribute preserved, and no leftover
     `cx`/`cy`/`r` attributes.
5. Press Cmd/Ctrl+Z once.
   - Expected: a single undo restores the original `<circle …/>` exactly
     (geometry, attributes, and trivia) — not a `<path>` holding the
     circle-shaped geometry.
6. Repeat steps 1–5 for `<rect>` (including a rounded `<rect rx>`) and
   `<ellipse>`. A rect with no `rx`/`ry` promotes to a four-line closed path; a
   rounded rect keeps its corner radii in the resulting `d`.

7. **Vertex tags — native edits stay, curves escape.** For `<polyline>`,
   `<polygon>`, and `<line>`:
   - Double-click to enter vector-edit, then **drag a vertex** (straight
     move). Expected: the element stays a `<polyline>` / `<polygon>` /
     `<line>` — only its `points` (or `x1/y1/x2/y2`) change; no `d`, no tag
     change.
   - **Cmd/Ctrl-drag a vertex or drag a tangent handle** to curve a segment.
     Expected: the element re-types to `<path>` whose `d` carries the curve;
     other attributes/trivia are preserved. A single undo restores the
     original `<polyline>` / `<polygon>` / `<line>` exactly.
   - Adding a vertex to a `<line>` (a 2-point tag) re-types it to `<path>`;
     inserting a vertex into a `<polyline>` keeps it a `<polyline>`.

## Notes

- Lazy timing is the decisive choice over eager (promote-on-mode-entry): it is
  what preserves the "inspect anchors, press Escape → byte-equal" guarantee.
- Conics use a four-cubic-Bézier representation (cardinal anchors) rather than
  arcs — chosen as the better _editing_ surface (four anchors + tangent handles
  vs. two), and arcs would collapse to cubics on the first tangent edit anyway.
- One uniform rule spans all non-path shapes: write the edit back to the native
  tag while the tag can express the result, otherwise re-type to `<path>`. The
  geometry primitives (`rect` / `circle` / `ellipse`) are the degenerate case —
  they have no native vector form, so every vector edit re-types them.
- `<image>` / `<use>` remain ineligible for vector-edit (raster / reference
  bounding boxes, no editable outline).
- Curving a `<line>` that declares no fill must render **stroke-only** — no
  black fill. A line has no fill region so its (default) fill never paints;
  the re-type pins `fill="none"` so the resulting path matches. Undo removes
  it (byte-equal). Other shapes need no such guard — they fill the same way a
  path does.

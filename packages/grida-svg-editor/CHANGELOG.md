# @grida/svg-editor

## 1.1.0

### Minor Changes

- Image insertion ([#885](https://github.com/gridaco/grida/issues/885)). New `commands.insert_image(href, opts?)` — a designed, **synchronous, headless** command that adds one `<image>` to the open document from a **resolvable href** (a remote URL, a `data:` URI, or a host-served URL). It authors SVG 2 `href` (never `xlink:href`, so no `xmlns:xlink` is forced onto the root), always writes an explicit `width`/`height` (the supplied intrinsic size, or a named `DEFAULT_IMAGE_SIZE` placeholder when omitted), centers the element on `opts.at` (anchors at the document origin when absent), imposes **no** content policy on the href (no `data:` size cap, no scheme filter, no fetch), and records one undoable step.

  The boundary is the point: the editor inserts a _reference_ and never reads a file. Turning a local `File` or an `image/*` blob into a resolvable href, and decoding bytes to learn an intrinsic size, is host-owned I/O — the host resolves and measures, then calls this command. `<image>` is deliberately **not** an `InsertableTag` (it has an intrinsic size and carries content — the mirror of why `<text>` is excluded). An async resolver provider, a pointer-driven place tool, and a passive drop-observation channel are named deferrals. Design: [`docs/wg/feat-svg-editor/image-insertion.md`](https://github.com/gridaco/grida/blob/main/docs/wg/feat-svg-editor/image-insertion.md).

  Also: the DOM surface's native paste handler now calls `preventDefault()` only when it actually consumed `text/plain` SVG markup, so an `image/*`-only paste is left unclaimed for the host to handle.

## 1.0.0

### Minor Changes

- b0d2c6a: Vector sub-selection transform box ([#881](https://github.com/gridaco/grida/issues/881)). In path edit mode (`mode === "edit-content"`), selecting **two or more vertices** now renders a transform box that **translates**, **scales** (edge or corner, anchored at the opposite edge/corner), and **rotates** the selected vertices and their tangents via a single affine — with the same handles, `Shift` (aspect-lock / 15° rotation snap / body axis-lock) and `Alt` (scale-from-center) modifiers as the element transform box. The box is a vertex tool (a segment- or tangent-only selection does not summon it) and applies the `transform-vertices` policy-class sub-intent: always `bake`, count- and type-preserving (a polygon stays a polygon, a path stays a path), one undo step.

  The box frame is **edit-session state**, shared across gestures: a rotation carries into the next gesture and reconciles to the geometry (a uniform translation of the selection is absorbed; any other edit resets it to a fresh axis-aligned box). The box claims drags while the vector control beneath each handle stays **click-selectable** — a click narrows/toggles the point underneath, and it **lights up on hover** to preview that selection.

  `@grida/hud`'s transform box gains a `corner_role: "scale"` mode (inner scale knob + outer rotate ring), per-handle `priority` overrides, a `scale_corner` op, and `Shift`/`Alt` modifier support in `reduceTransformBox`. A selectable control beneath a box handle now defers to it uniformly for both click-through and hover-preview.

### Patch Changes

- Updated dependencies [b0d2c6a]
  - @grida/hud@0.4.0

## 1.0.0-alpha.26

### Patch Changes

- Delete / Backspace in path edit mode (`mode === "edit-content"`) now removes the sub-selected vertices / segments / tangents instead of detaching the whole element ([#880](https://github.com/gridaco/grida/issues/880)). `selection.remove` is guarded on `select` mode, and a new `vector.delete-vertex` command honors the policy-class `delete-vertex` verdict (vertex-chain `restrict` — polygon ≥ 3, polyline ≥ 2, line keeps 2; path `bake`). Deletion is a single undo step that restores both the geometry and the sub-selection; tangent-only deletes preserve untouched segments' authored verbs.

---
id: TC-SVGEDITOR-IMAGE-001
title: Dropping (or picking) a raster image inserts an <image> at the drop point; SVG files still load as documents
module: svg-editor
area: image-insertion
tags:
  [
    image,
    insert,
    insert_image,
    drop,
    drag-drop,
    data-uri,
    transport,
    host-owned,
    round-trip,
    history,
    undo,
  ]
status: untested
severity: high
date: 2026-06-23
updated: 2026-06-23
automatable: false
covered_by:
  - packages/grida-svg-editor/__tests__/image-insertion.test.ts
  - packages/grida-svg-editor/__tests__/clipboard.browser.test.ts
---

## Behavior

The editor accepts an image insertion at a point given a **resolvable
href** (a remote URL, a `data:` URI, or a host-served URL) via
`commands.insert_image`, and guarantees the round-trip of the resulting
`<image>`. Turning a local `File` into a usable href — and decoding it to
learn its intrinsic size — is **host-owned I/O**, not the editor's job:
the headless core has no decoder, no network, no rendering context. So the
host resolves and measures, then calls the command synchronously. Spec:
`docs/wg/feat-svg-editor/image-insertion.md`.

The `/svg/examples/default` demo is the host here. Its **drop** handler
branches on file kind:

- A **raster image** (`image/png`, `image/jpeg`, … — anything
  `image/*` except `image/svg+xml`) is read into a `data:` URI and
  decoded for its natural width/height (host work), then inserted as one
  `<image>` into the **open document** at the drop point, centered under
  the pointer. A `data:` URI (not a `blob:` object URL) is used so the
  inserted reference survives serialization, persistence to the `.canvas`
  bundle, and reload.
- An **SVG file** (`image/svg+xml` or `.svg`) keeps the existing
  behavior: it loads as a new document/page, not as an embedded `<image>`.

The **Open-file** picker is SVG-only — the shared file input filters to
`.svg,image/svg+xml`, so a raster cannot be selected there. Raster image
insertion is a **drop-only** affordance in this demo.

The editor authors SVG 2 `href` (never `xlink:href`, so no `xmlns:xlink`
is forced onto the root), always writes an explicit `width`/`height`
(the decoded size, or a default placeholder when the host omits it),
imposes no content policy on the href (a large `data:` URI is inlined
verbatim), and records exactly one undo step.

The editor installs **no** drop / dragover / image-paste listeners of its
own — the demo owns the drop affordance and computes the drop point via
the surface camera's `screen_to_world`. Pasting an `image/*`-only
clipboard payload (no `text/plain` SVG) is left for the host: the editor's
native paste handler no longer `preventDefault()`s a paste it cannot
consume.

## Steps

1. Open `/svg/examples/default` and let the canvas hydrate.
2. Drag a **PNG/JPEG** file from the OS onto the canvas. The drop overlay
   reads "Drop SVG to load, or an image to insert."
3. Drop it over a specific spot on the canvas.
4. Expected: a toast ("Inserting image…" → "Image inserted"), and the
   image appears as a selectable `<image>` **centered on the drop point**,
   at its natural pixel dimensions. It is the current selection.
5. Press undo (⌘Z): the image is removed and the document returns to its
   prior state in one step. Redo (⌘⇧Z) re-inserts and re-selects it.
6. Open the document source (or serialize): the new element is
   `<image href="data:image/...;base64,…" x=… y=… width=… height=…>`,
   with **no** `xlink:href` and **no** `xmlns:xlink` on the root. Reload
   the page — the image persists (the `data:` URI survived persistence).
7. Drag an **`.svg`** file onto the canvas. Expected: it loads as a new
   document/page (the pre-existing behavior), **not** as an embedded
   `<image>`.
8. While a large image is still decoding (e.g. a multi-MB photo), switch
   the active document before it lands. Expected: the insertion is silently
   abandoned (no success toast, nothing inserted into the now-detached
   editor), rather than landing in a stale instance.

## Notes

- Issue: [#885](https://github.com/gridaco/grida/issues/885). Design FRD:
  `docs/wg/feat-svg-editor/image-insertion.md`.
- The core insertion contract (href authoring, explicit size + default
  fallback, center-on-point vs anchor-at-origin, one history step,
  serialize round-trip with a large `data:` URI, headless/synchronous) is
  fully covered headlessly by `image-insertion.test.ts`; this TC exists
  for the **host-side transport** (file → `data:` URI → decode → insert,
  the drop branch, the active-doc guard, persistence) that is impractical
  to automate.
- The image-only-paste carve-out (editor leaves an `image/*`-only paste
  for the host) is pinned by `clipboard.browser.test.ts`.
- Named deferrals (not part of this TC): an async resolver provider, a
  pointer-driven place tool, and a passive drop-observation channel.

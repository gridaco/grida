---
id: TC-SVGEDITOR-CLIPBOARD-001
title: Copy/cut/paste round-trips through the OS clipboard as plain SVG markup
module: svg-editor
area: clipboard
tags: [clipboard, copy, paste, cut, interop, history, undo]
status: verified
severity: high
date: 2026-06-10
updated: 2026-06-10
automatable: false
covered_by:
  - packages/grida-svg-editor/__tests__/clipboard-extract.test.ts
  - packages/grida-svg-editor/__tests__/clipboard-commands.test.ts
  - packages/grida-svg-editor/__tests__/clipboard.browser.test.ts
---

## Behavior

The clipboard payload is a **standalone SVG document** written to the OS
clipboard as plain text — not a private format (spec:
`docs/wg/feat-svg-editor/clipboard.md`). Consequences a manual pass must
verify that automation cannot (the automated suites use synthetic
events; the OS clipboard and real keystrokes are only exercised here):

- ⌘C over the canvas puts SVG markup on the **system** clipboard —
  pasting into a code editor yields readable source; pasting into
  another SVG consumer (e.g. Figma) creates vectors.
- Copy carries referenced `<defs>` (gradients etc.) so the payload
  renders standalone; ids are never rewritten; pasted content lands at
  its authored coordinates (in-place), appended on top, selected.
- ⌘X is one undoable step; undo restores the document while the
  clipboard keeps the payload (cut → undo → paste = move idiom).
- The editor claims the gesture **only when the canvas has focus** — a
  text selection in the surrounding page, or focus in any text input,
  always wins. Pointer-over alone never claims clipboard.
- Non-SVG clipboard text pasted over the canvas is a silent no-op (no
  error, no mutation, no undo entry).

## Steps

1. Open the SVG editor demo at `http://localhost:3000/svg/`.
2. **Copy → external.** Click a shape (canvas takes focus), press
   `⌘/Ctrl+C`. Paste into a plain-text editor.
   - Expected: a single-line standalone SVG document
     (`<svg xmlns="…">…</svg>`); if the shape used a gradient, its
     `<defs>` ride along.
3. **Copy → paste in place.** Back on the canvas, press `⌘/Ctrl+V`.
   - Expected: the copy lands exactly over the original (same
     coordinates, painted on top) and is selected; one `⌘Z` removes it
     entirely.
4. **Cut as move.** Select a shape, `⌘/Ctrl+X` (it disappears), `⌘Z`
   (it returns), `⌘/Ctrl+V`.
   - Expected: after the paste, both the restored original and the
     pasted copy exist; the cut and the paste were one undo step each.
5. **External → paste.** Copy SVG markup from a code editor (e.g.
   `<circle cx="50" cy="50" r="20" fill="tomato"/>`), focus the canvas
   (click once), `⌘/Ctrl+V`.
   - Expected: the circle appears and is selected.
6. **Figma interop (both directions, if available).** Paste the step-2
   payload into Figma — expected: editable vectors. In Figma, "Copy as
   SVG" a small shape and paste over the canvas — expected: it appears.
7. **The gate: host text wins.** Select some text in the page outside
   the canvas (e.g. in the assistant panel or address bar dropdown),
   with the pointer hovering over the canvas, press `⌘/Ctrl+C`, paste
   into a text editor.
   - Expected: the SELECTED TEXT was copied, not SVG markup.
8. **The gate: text inputs win.** Focus any text input, press
   `⌘/Ctrl+V` with the pointer over the canvas.
   - Expected: the input receives the paste; the canvas does not.
9. **Junk paste is a no-op.** Copy a prose sentence, focus the canvas,
   `⌘/Ctrl+V`.
   - Expected: nothing happens — no error toast, no insertion, and
     `⌘Z` undoes the _previous_ edit, not a phantom paste.

## Notes

- 2026-06-10: manually verified on the v1 implementation —
  cross-window copy-paste (two editor windows) and repeated multi-paste
  both work as specified. Translate-with-clone (Alt+drag) is a separate
  deferred feature (TODO §5), not part of this TC.
- Spec: `docs/wg/feat-svg-editor/clipboard.md`. Same-document paste of
  a defs-referencing shape intentionally duplicates the `<defs>` block
  (documented cost; Tidy is the planned recovery) — not a bug.
- Safari floor: versions before the 2025 WebKit fix (bug 156529) do not
  fire copy/cut events over a selectionless canvas; on such versions
  steps 2–4 are expected to fail on the keystroke path. The menu /
  provider path is the fallback there.
- Step 6 export side: Figma drops `marker`/`pattern` on SVG import —
  losses there are Figma's, not ours.

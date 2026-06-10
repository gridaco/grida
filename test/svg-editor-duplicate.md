---
id: TC-SVGEDITOR-DUPLICATE-001
title: Alt-drag clones and moves the clone; ⌘D duplicates in place; both are one undo step
module: svg-editor
area: duplicate
tags: [duplicate, clone, alt-drag, modifier, history, undo, selection]
status: untested
severity: high
date: 2026-06-11
updated: 2026-06-11
automatable: false
covered_by:
  - packages/grida-svg-editor/__tests__/subtree-clone.test.ts
  - packages/grida-svg-editor/__tests__/commands-duplicate.test.ts
  - packages/grida-svg-editor/__tests__/translate-pipeline/clone-drag.test.ts
  - packages/grida-svg-editor/__tests__/clone-drag.browser.test.ts
---

## Behavior

Duplicate and Alt-drag both consume the **subtree-clone** operation
(spec: `docs/wg/feat-svg-editor/subtree-clone.md`): the clone is a
verbatim copy — no defs are duplicated, authored ids are repeated as-is
— inserted directly after its origin, so it paints right on top of it.

Alt-drag follows the Figma convention: **the clone moves, the origin
stays**. The toggle is live — the clone appears the moment Alt is
observed held during a translate (gesture start or mid-drag, even
between pointer moves), releasing Alt mid-drag removes the clone and
the origin resumes following the cursor, and re-pressing creates a
fresh clone. While cloned, the clone snaps against its own origin like
any neighbor.

History is the part automation can't fully exercise through real input:
clone + move must commit as **one** undo step, and Escape during a
cloned drag must restore the document exactly as it was, with no
history entry. The automated suites drive synthetic orchestrator
frames; real keystroke/pointer interleaving (OS-level Alt, pointer
capture, the measurement overlay sharing the Alt key) is only verified
here.

## Steps

1. Open `/svg` (or any svg-editor example) with a document containing
   at least two shapes; select a rect.
2. **⌘D**: press ⌘D (Ctrl+D elsewhere). Expected: a duplicate appears
   exactly on top of the original (move it to see both); the duplicate
   is now the selection. One ⌘Z removes it and reselects the original.
3. **Alt-drag**: drag the rect with Alt/Option held from the start.
   Expected: the original stays put; a copy follows the cursor; the
   selection chrome follows the copy.
4. **Mid-drag toggle**: start a plain drag, press Alt mid-drag.
   Expected: the dragged shape jumps back to its rest position and the
   copy continues from the cursor. Release Alt (keep dragging): the
   copy vanishes and the original follows the cursor again. Press Alt
   once more: a fresh copy appears.
5. **Commit + undo**: finish an Alt-drag. Expected: copy lands, original
   untouched. ONE ⌘Z removes the copy AND its movement together,
   reselecting the original; ⌘⇧Z restores both.
6. **Escape**: during a cloned drag, press Escape. Expected: copy
   disappears, original back at rest, document identical to before the
   drag (save/serialize byte-equal), nothing on the undo stack.
7. **No defs duplication**: Alt-drag a gradient-filled shape; inspect
   the serialized SVG. Expected: one gradient definition, two elements
   referencing it.
8. **Measurement coexistence**: with nothing dragging, hover with Alt
   held. Expected: the measurement overlay still works; no clone is
   created outside a drag.

## Notes

Shipped with gridaco/grida#817. A cloned drag committed with zero NET
movement (drag out and back, release with Alt held) is a
duplicate-in-place (same outcome as ⌘D); a press-release that never
crosses the drag threshold is a tap — no gesture, no clone. The
committed history label remains "move" (label is fixed at gesture
open) — accepted in the spec.

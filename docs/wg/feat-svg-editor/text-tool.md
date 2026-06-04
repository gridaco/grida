---
title: "Text creation — design"
description: "Why creating text in an SVG editor is click-to-place rather than drag-to-size, and why an empty text element is treated as a deletion."
keywords:
  - svg
  - svg-editor
  - text
  - insertion
  - content-edit
tags:
  - internal
  - svg
  - wg
format: md
---

# Text creation — design

An SVG editor that can create rectangles, ellipses, and lines should also
let the author create text. Text was the one primitive deferred from the
first insertion pass, because it does not share the interaction model the
geometric shapes use. This note states what text creation is and why it
takes the shape it does.

## Why text is not like the other shapes

The geometric primitives have **intrinsic size**: the author presses,
drags, and the drag distance sets the width and height (or the radii, or
the endpoints). The shape exists at whatever size the drag describes.

Text has no intrinsic size in SVG. A text element's extent is a
_consequence_ of its string content, its font, and its font size — not a
quantity the author sets by dragging a box. There is no "empty text of
size 200×80". The press-drag-size gesture is therefore meaningless for
text: there is nothing for the drag distance to set.

## The interaction model: click to place, type immediately

Creating text is a single action. The author indicates **where**, a caret
appears there, and input begins at once. This matches every text tool the
author already knows — point, then type. There is no intermediate "empty
placeholder" the author must then fill; placing and editing are the same
gesture.

1. The author selects the text tool and clicks a point on the canvas.
2. A text element is created at that point with the editor's default text
   appearance, and the inline content editor opens on it immediately with
   the caret active.
3. The author types. Editing ends on exit — clicking away or pressing
   Escape.

### Why there is no drag-to-define-a-box

In other tools, a drag gesture defines a **text box**: a fixed-width
region into which text wraps. The editor's text model is **single-line
positioned text** — a text element anchored at a point, sized only by its
content and font. A single-line element has no width to drag out, so the
drag-to-box gesture has nothing to set; text creation is therefore
**click-only**.

Auto-wrapped text is a genuinely different model. SVG 2 does define
wrapping (the `inline-size` and `shape-inside` properties give a text
element a wrapping width), so a drag-defined text box is _expressible_ in
the format — it is simply a separate creation affordance for a separate
model, with its own caret, selection, and reflow behavior. That model is
deliberately out of scope here; this note is about creating single-line
text. If wrapped text is taken up later, it gets its own gesture (a drag
that sets `inline-size`), orthogonal to this decision.

## Invariant: empty text is not a valid persistent state

A text element with no content renders nothing. It cannot be seen, and it
is effectively impossible to select on the canvas — there is no painted
geometry to aim at. An empty text element is indistinguishable from "no
element" to a viewer, yet it lingers in the file as noise and as an
unselectable trap.

The editor enforces a single, unconditional rule:

> **On exit from text content-editing, a text element whose content is
> empty is removed.** "Empty" means zero-length text content — a typed
> space is authored content and is kept.

This is a general fact about text, not a special case of the creation
tool. It fires the same way regardless of how the element reached empty:

- a freshly created text element the author placed but never typed into,
- a pre-existing text element whose content the author cleared before exiting, and
- a pre-existing element that was already empty when the author entered it and left unchanged.

In every case the empty text is treated as a deletion intent.

The rule is deliberately unconditional rather than firing only on a
_transition_ to empty. Entering content-editing on an element is itself
the author's "I am authoring this" signal; an empty text carries no
visible content for the canvas author to act on, so the editor does not
preserve one on exit. The accepted consequence: a source element that
happened to be empty — even one carrying an `id`, an animation target, or
a script-filled slot — is removed if the author opens it for editing and
exits. This trades a corner of round-trip fidelity for a simpler, more
predictable rule; it is a chosen tradeoff, not an oversight. (Loading a
file never triggers it — the element is removed only if the author
actually enters and exits content-editing on it.)

### Undo contract

What undo restores depends only on **whether the element existed before
the gesture** — not on how it became empty:

- **Freshly placed, never filled.** Creation and the empty exit are one
  abandoned gesture. After exit there is no element and no committed
  history step — undo does not resurrect an empty element, because from
  the document's perspective nothing happened. This mirrors how an
  abandoned drag of any insertion tool leaves no trace.
- **Pre-existing element removed.** The element existed before the gesture
  — whether it held content the author cleared, or was already empty on
  entry. Removing it on exit is a deletion: a single undoable step, and
  undo restores the element exactly as it was before the gesture (with its
  original content, empty or not, and all its attributes).

The throughline: undo returns the document to the state before the
gesture began. For a creation that never produced visible content, that
state is _nothing_. For the removal of a pre-existing element, that state
is the _original element_.

## Default appearance

A newly created text element carries the editor's default text appearance
— a default font family, font size, and fill — so it is visible and
editable the instant it is placed. These are **editor defaults**, the same
class of decision as the default fill of a new rectangle, not parameters
the author supplies through the gesture.

Font _resolution_ — mapping a family name to real metrics and glyphs —
remains a host-provided capability. The defaults here are only the initial
attribute values the new element starts with.

## Rejected alternatives

- **Drag-to-define-a-box.** Out of scope, not impossible — a drag box maps
  to SVG 2 wrapped text (`inline-size` / `shape-inside`), which is a
  separate model from the single-line text this tool creates. It gets its
  own gesture if and when that model is taken up.
- **Placeholder text** (drop the literal word "Text", let the author edit
  it later). Rejected — it writes content the author did not author,
  pollutes the document, and forces a select-then-edit second step that
  click-to-caret avoids.
- **Keep empty text elements.** Rejected — they are invisible, effectively
  unselectable, and accumulate as file noise (see the invariant above).

## Relationship to existing content editing

Editing the content of an existing text element is already part of the
editor. The creation tool does not add a second editing path: it creates
the element and then enters that same content-editing flow. The
empty-equals-delete invariant is shared by both entry points — creating
new text and editing existing text exit through the same rule.

Status: implemented (click-only, single-line). Wrapped/multi-line text and
the tool-axis cleanup remain deferred (see the package `TODO.md`).

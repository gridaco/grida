---
title: Frame Title Labels
description: The on-canvas name labels drawn above root frames and trays — the labeling rule, the badge/plain taxonomy, screen-anchored placement, in-place rename, and the root-frames bar as their aggregate.
tags:
  - internal
  - wg
  - canvas
  - editor
  - tray
format: md
---

A **frame title label** is a small name affordance the surface draws
above a node's box on the canvas: it names the frame, reflects the
node's interaction state, and is itself an interactive target — you can
select the node by its label, extend a selection from it, and rename it
in place. Labels are HUD chrome ([surface.md](./surface.md)): derived
from editor state every frame, holding no authoritative state of their
own. This document fixes **which nodes are labeled**, **how each label
presents**, **where it sits**, **what it affords**, and the aggregate
presentation of the whole set — the **root-frames bar**.

Labels are a naming and navigation aid for the scene's top level, not a
per-node decoration: only nodes that read as top-level frames are
labeled, so a dense scene shows a legible row of frame names rather than
a name over every shape.

## The labeling rule

The label set is generated, not enumerated. Walking the active scene's
root children in document order, each yields at most one label by this
rule:

- A **tray** at the scene root is labeled, and additionally each of its
  **direct container children** is labeled as **root-like** — a tray's
  children read as top-level frames even though they sit one level down.
- A **container-family** node at the scene root is labeled. The
  container family is the set of node types that present as a frame
  (a plain container and its instance/component variants); the rule is
  stated over the family, not a fixed type list.
- Every other root node type (groups, shapes, text, …) is **not**
  labeled.

Inactive (hidden) nodes are skipped, and a hidden tray suppresses its
children's root-like labels along with itself. Descent stops at the
root-like tier: containers nested inside a labeled container are never
labeled, however deep the tree.

### Under isolation

When the surface is **isolated** to one node (a focus context that
scopes the canvas to a subtree — see [hierarchy.md](./hierarchy.md) for
the isolation-root notion), the rule collapses to the isolation root
alone: exactly one label, for the isolated node itself, with **no
children and no siblings** labeled. A tray-focused isolation shows only
the tray's own label; a container-focused isolation shows only that
container's. The slides/single-frame presentation is this same
collapse — one focused frame, its label alone — and, being a
presentation rather than an authoring surface, it does not show the
broader label layer at all.

## Label taxonomy

Every label is one of two variants, fixed by the labeled node's kind:

| Variant   | Applies to                                              | Presentation                                     |
| --------- | ------------------------------------------------------- | ------------------------------------------------ |
| **badge** | a tray                                                  | a boxed bar (filled, outlined) carrying the name |
| **plain** | a container-family node (incl. root-like tray children) | text only, no box                                |

The variant is a property of the node's role, not a user choice: trays
carry the heavier badge because a tray is an explicit organizational
boundary (see [feat-tray/](../feat-tray/) for tray semantics — not
restated here); containers, being the common frame, carry the lighter
text-only label so a wall of frames stays quiet.

## Placement

A label is anchored in **screen space, flush above the top edge of its
node's box** — it hugs the frame's top with no gap, spans no wider than
the box, and truncates its name rather than overflowing. Because the
anchor is the node's on-screen box, the label tracks the node under pan,
zoom, and any transform, and a root-like label tracks its **parent
tray's** movement as well as the node's own. Labels are screen-scale:
they do not grow or shrink with zoom, staying legible at any camera
scale, and they never rotate with a rotated node — the name stays
upright and readable.

## State reflection

A label mirrors the labeled node's interaction state — **idle**,
**hover**, or **active** (selected) — and renders each distinctly.
Hover is bidirectional with the canvas: hovering a label hovers its node
and hovering the node lights its label, sharing the one hover notion the
surface already owns ([surface.md](./surface.md)). Like all chrome, this
is a projection of editor state, not a store the label keeps.

## Interactions

A label is a live target with these affordances:

- **Select** — a plain pointer-down on the label selects its node,
  replacing the current selection.
- **Extend-select** — the same gesture with the selection-toggle
  modifier adds or removes the node from the selection instead of
  replacing. Selection is editor-owned; the label emits a selection
  intent and never mutates a private selection store — the authority and
  intent-up/mirror-down loop are [surface.md](./surface.md)'s (SURF-7),
  and the toggle vs. replace semantics are the selection docs'
  ([ux-surface/](./ux-surface/)); not restated here.
- **Rename in place** — a double-click **with no modifiers held**
  promotes the label to an editable field seeded with the current name
  and selects its text. It has an explicit **commit/cancel** model:
  commit (confirm key, or focus loss) writes a name change **only when
  the trimmed value is non-empty and actually differs** from the current
  name; cancel (escape key) restores the prior name and writes nothing.
  Requiring no modifiers keeps modified double-clicks free for selection
  and other bindings. The history framing of a committed rename — that a
  commit is one undoable entry and a cancel leaves history untouched —
  is the history study's ([feat-history/](../feat-history/)) and the
  hierarchy rename contract's ([hierarchy.md](./hierarchy.md) HIER-8,
  the same rename lifecycle reached from the tree); not restated here.

An editable label is the only part of the label layer that captures
pointer input greedily; idle labels let gestures that miss their text
pass through to the content beneath.

## The root-frames bar

The **root-frames bar** is the aggregate presentation of the whole label
set — the label layer taken as one overlay of every frame title in the
scene, drawn as a group above content and below the interaction handles.
It is a pure function of the label set: it appears, updates, and
disappears as the set does, and it is **toggleable as a unit** — a
single visibility control shows or hides the entire label layer without
touching selection or the document, and the slides/presentation surface
keeps it hidden. Toggling the bar is a view-state change only; it leaves
the labeled nodes and their selection untouched.

## Contracts

- **TITLE-1** Labeling rule: for a scene at rest, the label set is
  exactly the root trays, the root container-family nodes, and the
  direct container-family children of root trays — no other node is
  labeled, and containers nested below the root-like tier are never
  labeled.
- **TITLE-2** Variant assignment: a tray's label is **badge**; every
  container-family label (root or root-like) is **plain**. No node
  carries both.
- **TITLE-3** Active-only: a hidden node contributes no label, and a
  hidden tray also suppresses the root-like labels of its children.
- **TITLE-4** Isolation collapse: under isolation the label set is
  exactly one entry — the isolation root — with no child or sibling
  labels; the single-frame presentation behaves identically.
- **TITLE-5** Screen anchor: each label renders flush above its node's
  on-screen box, at constant screen scale and upright regardless of the
  node's zoom or rotation, and repositions within one update when the
  node — or, for a root-like label, its parent tray — moves.
- **TITLE-6** Select and extend: a plain pointer-down on a label
  replaces selection with its node; with the toggle modifier it
  adds/removes that node, converging on editor selection within the same
  event (binds SURF-7).
- **TITLE-7** Rename commit/cancel: an unmodified double-click enters an
  editable label; confirm or focus-loss commits a name change iff the
  trimmed value is non-empty and differs; escape cancels, leaving name
  and history untouched (binds HIER-8).
- **TITLE-8** Layer toggle: one visibility control shows or hides the
  entire label layer as a unit, changing no selection and no document
  state; the presentation surface keeps the layer hidden.
- **TITLE-9** Stateless chrome: rebuilding the label layer against the
  same editor state reproduces the identical set, variants, positions,
  and per-label idle/hover/active states (binds SURF-5).

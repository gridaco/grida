---
title: Widgets — Inventory
description: The full widget taxonomy behind the properties sheet — value-shape atoms, composites, list sections, and the composition doctrine that closes the set.
tags:
  - internal
  - wg
  - editor
format: md
---

This is the **inventory** behind [widgets.md](./widgets.md): the
closed set of UI primitives, organized so that every row of the
[properties sheet](./properties-sheet.md) is buildable by
composition. The widgets page holds the behavioral contracts
(WID-1..9); this page holds the taxonomy — what exists, what each
primitive is made of, and which sheet rows it serves. A row here is
a claim: _together with the others, this primitive is sufficient
for its sheet rows; nothing in the sheet needs a control outside
this inventory._

## Doctrine

1. **Atoms are keyed by value shape, not by look.** The atom
   vocabulary is closed and determined by the shape of the value
   being edited. Two controls that edit the same shape are the same
   atom; a new atom is justified only by a new value shape (INV-2).

   | value shape                        | atom                          |
   | ---------------------------------- | ----------------------------- |
   | none (display)                     | label                         |
   | action                             | button                        |
   | boolean                            | toggle                        |
   | one-of-N, options visible          | segmented                     |
   | one-of-N, options collapsed        | select (searchable: combobox) |
   | scalar, typed / stepped / scrubbed | number                        |
   | scalar, bounded drag               | slider                        |
   | scalar pair, bounded drag (2D)     | pad                           |
   | string                             | text                          |
   | color (display + entry point)      | swatch                        |

2. **Every bound value is a field: a value, mixed, or empty.** The
   panel resolves which of the three a control receives; the widget
   renders it and never queries the document. Mixed renders distinct
   and broadcasts on first edit (WID-6); empty (`auto`) is distinct
   from zero.

3. **Two rails, no third.** Property-shaped controls emit the
   preview/commit binding phases (UI-4). Verb-shaped controls —
   align/distribute, boolean ops, mask, select-by-color — reference
   the command registry, whose single dispatcher they share with
   keys and menus (MENU-1). A widget never mutates the document
   directly.

4. **Composites adapt values, not events.** A composite exists only
   where a _compound value_ exists. It arranges atoms and owns the
   adapter between its compound value and its children's fields,
   plus its own micro-state (uniform ⇄ split, linked axes, which
   sub-field is hot). Events stay in the atoms; one interaction
   produces exactly one commit (WID-9).

5. **One overlay authority.** Every floating surface — menu, select
   list, picker, detail sheet — is an instance of the one popover
   primitive: identical placement, input grab, and dismissal
   semantics (WID-8).

6. **Looks are fixed; gates are the panel's.** Capability-gated
   visibility and enablement are decided by the panel (SHEET-1);
   widgets render disabled and mixed states but never decide them.
   Icons are render ingredients — shape-only glyph subtrees inside
   buttons and segments — not widgets: they carry no identity,
   state, or binding.

## Tier 0 — structural

| primitive | role                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------- |
| panel     | the strip that hosts sections                                                                      |
| section   | collapsible titled group with a header-actions slot; its _presence_ is a capability gate (SHEET-1) |
| row       | one label + control line; the label may serve as the number atom's scrub surface                   |
| scroll    | clipping scroll container (UI-6)                                                                   |
| popover   | the anchored overlay: placement (flip-then-clamp), input grab, dismissal — the WID-8 authority     |
| tree      | specified in [hierarchy.md](../../../docs/wg/canvas/hierarchy.md)                                  |
| menu      | specified in [menu.md](./menu.md); rides the popover                                               |

## Tier 1 — atoms

| atom      | interaction                                                                             | serves (sheet rows)                                                                                        |
| --------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| label     | display only; participates in identity/rebuild                                          | names, values, section titles                                                                              |
| button    | click → one command dispatch or one commit                                              | align/distribute row, boolean ops, mask remove, select-by-color, list add/remove                           |
| toggle    | one commit per flip; mark and latch are its two fixed looks                             | visible, locked, wrap, clip content, italic, paint/effect active                                           |
| segmented | exactly one active, commit per click; includes grid arrangements                        | text align (h/v), layout mode, positioning mode, stroke align/cap/join, nine-position alignment, image fit |
| select    | popover list; may preview on highlight (dismissal reverts); commit on choice            | blend mode, font style, mask type, marker kind, effect kind, paint kind, export format                     |
| combobox  | select + filter field + scrolling list                                                  | font family                                                                                                |
| number    | typed entry (WID-1), step (WID-2), scrub (WID-3); units, min/max, presets, empty = auto | rotation, count, ratio, arc, size, line height, letter spacing, miter limit, blur, spread, export scale    |
| slider    | drag previews, release commits                                                          | opacity, hue/alpha, variable-font axes                                                                     |
| pad       | the 2D slider; drag previews, release commits                                           | the picker's saturation/value plane                                                                        |
| text      | engine text-editing; IME (WID-5)                                                        | name, hex entry, user data                                                                                 |
| swatch    | displays a paint; activating opens the picker                                           | every color-bearing row                                                                                    |

## Tier 2 — composites

A composite exists only where a compound value exists (doctrine 4).

| composite       | composed of                                                                                                                        | compound value                       | serves                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------- |
| pair            | 2 numbers + link toggle                                                                                                            | linked scalar pair                   | position (x, y); size aspect lock             |
| dimension       | number + mode select                                                                                                               | length in fixed / percent / auto     | width, height                                 |
| quad            | 4 numbers + uniform ⇄ split                                                                                                        | four-sided value                     | corner radius, padding, per-side stroke width |
| gap             | number(s) + presets                                                                                                                | main/cross gap, splitting under wrap | flex gap                                      |
| number-list     | ordered numbers, add/remove                                                                                                        | number sequence                      | dash pattern                                  |
| constraints     | inset proxy (edge toggles) + numbers                                                                                               | positioning insets                   | arrangement insets                            |
| color picker    | popover + pad (SV) + hue/alpha sliders + hex text + preset swatches                                                                | color                                | every solid paint — the WID-4 hot path        |
| gradient editor | stop track + stop list (offset number + color)                                                                                     | gradient stops                       | gradient paints                               |
| paint           | kind select + (swatch/picker \| gradient editor \| image source + fit + transform) + opacity slider + blend select + active toggle | one paint                            | fills / strokes entries                       |
| effect          | kind select + per-kind params (numbers, color) + active toggle                                                                     | one effect                           | effects entries                               |

## Tier 3 — list sections

One generic machinery, instantiated per section: ordered entries
each hosting one composite; add from the header; per-entry remove
and active toggle; reorder by drag. Every operation is one
committed batch (SHEET-3). Entry identity is stable, so retained
widget state survives reorder (UI-2 across lists).

Instances: **fills**, **strokes**, **effects**, **export**.

Derived: **selection colors** is an aggregation, not a stored list —
it reads the distinct paints across the selection; each row edits
every occurrence in one commit; select-by-color is a command.

## Sheet coverage

The closure walk — every [properties-sheet](./properties-sheet.md)
section resolved to this inventory:

| sheet section    | served by                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity         | text (name), toggle ×2                                                                                                                      |
| Arrangement      | button row (align/distribute commands), pair (position), constraints (insets), segmented (mode), number (rotation)                          |
| Size & layout    | dimension ×2 + link (aspect), segmented (layout mode, alignment grid), gap, quad (padding), toggle (wrap, clip)                             |
| Appearance       | slider + number (opacity), select (blend), quad (corner radius), number (count, ratio, arc triple)                                          |
| Fills            | list section of paint composites                                                                                                            |
| Strokes          | list section of paint composites + quad (width), segmented (align/cap/join), number (miter), number-list (dash), select ×2 (markers)        |
| Effects          | list section of effect composites                                                                                                           |
| Text             | combobox (family), select + toggle (style), number (size, line, letter), segmented (h/v align); advanced = a popover hosting the same atoms |
| Image            | source (host-gated), segmented (fit)                                                                                                        |
| Mask             | select (type), button (remove)                                                                                                              |
| Selection colors | derived list of swatch + picker rows, button (select-by-color)                                                                              |
| Export           | list section: select (format), number (scale)                                                                                               |
| Developer        | text (opaque)                                                                                                                               |
| Mode overrides   | no new primitives — the same panel surface and atoms ([vector-edit](../../../docs/wg/feat-vector-network/vector-edit.md), scale tool)       |

## Host-gated

Font family inventories, image sources, and export destinations
require host-provided resource capabilities
([io-external.md](../../../docs/wg/canvas/io-external.md) territory). Their controls are
in the inventory; their _content_ arrives when the capability does.
Named, not silently omitted.

## Contracts

- **INV-1** Closure: every row of the properties sheet is served by
  primitives in this inventory; no bespoke one-off control exists
  outside it.
- **INV-2** Value-shape keying: a property whose value fits an
  existing shape reuses that atom; adding an atom requires a value
  shape no existing atom edits.

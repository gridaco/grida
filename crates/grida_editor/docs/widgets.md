---
title: Widgets
description: The minimal control set of the editor's UI system, with each widget's behavioral contract.
tags:
  - internal
  - wg
  - editor
format: md
---

The widget set is deliberately minimal: exactly what the panels in
this RFC need, each specified by behavior. Looks are unspecified
beyond legibility. All widgets obey the UI-layer contracts
([ui.md](./ui.md)) — identity, focus, and the preview/commit binding.
The full taxonomy — value-shape atoms, composites, list sections,
and which properties-sheet rows each serves — is the inventory
([widgets-inventory.md](./widgets-inventory.md)); this page holds
the behavioral contracts.

## The set

**Structural:** `panel` (titled section, collapsible), `row` (label +
control line), `scroll` (clipping scroll container), `popover` (the
anchored overlay every floating surface rides — menus, select
lists, pickers, detail sheets; placement, input grab, and dismissal
are one implementation, WID-8), `tree` (see
[hierarchy.md](../../../docs/wg/canvas/hierarchy.md) — the tree widget's semantics are
specified there and are the largest single widget contract).

**Value controls:**

- **numeric input** — text-editable number with: typed entry
  (commit on confirm/blur, abort on cancel), step keys (arrow up/down
  commit a delta per press), and label-scrub (dragging the label
  emits delta previews, one commit on release). Supports absolute
  (`set`) and relative (`delta`) change reporting, units, min/max
  clamping, and an empty/`auto` state distinct from zero.
- **slider** — bounded scalar drag: previews during drag, one commit
  on release (UI-4). Keyboard steps commit per press.
- **toggle** — boolean; one commit per flip.
- **segmented** — enum with every option visible (icon group or
  grid, e.g. alignment, stroke caps): exactly one active, commit
  per click.
- **select** — enum dropdown (list may be searchable, e.g. fonts);
  commit on choice, abort on dismiss; highlighting an option may
  emit a preview, which the dismissal then reverts (UI-4).
- **text input** — single-line string editing built on the engine's
  text-editing subsystem (nested-context rules do not apply here:
  a UI text input commits a property patch, it does not open a
  document editing session). IME must work.
- **swatch + color picker** — swatch displays a paint; activating it
  opens the picker (an inline panel while popovers are deferred):
  2D saturation/value area, hue and alpha sliders, hex entry.
  Dragging in the picker previews continuously; release commits
  (the canonical hot path, HISB-2 / PERF budgets in
  [harness.md](./harness.md)).

**Indicator:** `mixed` — every value control must render a distinct
mixed state (see [properties.md](./properties.md)) that displays no
value and, on first edit, broadcasts the entered value.

## Shared behaviors

- **Focus & keys:** click focuses; tab/shift-tab traverse; focused
  control consumes its keys (arrows, confirm, cancel) before
  command routing (UI-3 with the input spec's routing ladder).
- **Disabled state:** any control can be disabled — rendered, not
  interactive, skipped in tab order.
- **Revert:** cancel during any interaction (typed entry, drag)
  restores the pre-interaction value and emits no commit.

## Contracts

- **WID-1** Numeric typed entry: type a value, confirm → one commit
  with `set`; cancel instead → no commit, prior value intact.
- **WID-2** Numeric step: one arrow press → one commit with `delta`
  of one step; on a mixed selection this applies per-node relative
  deltas.
- **WID-3** Label-scrub and slider drags satisfy UI-4 with previews
  at input cadence and exactly one commit on release.
- **WID-4** Color picker drag across N events yields N previews, one
  commit; the committed paint equals the last preview.
- **WID-5** Text input round-trips IME composition: preedit text is
  visible during composition and only the committed string reaches
  the property patch.
- **WID-6** Mixed state: a control bound to differing values renders
  mixed, and its first commit broadcasts one value to all bound
  targets in a single history entry.
- **WID-7** Every widget is fully drivable and assertable headlessly:
  focus, typed entry, scrub, drag, and commit are all reachable via
  synthetic events.
- **WID-8** Popover unity: every floating surface is an instance of
  the one overlay primitive — identical placement, input grab, and
  dismissal semantics; while open, input reaches only the overlay,
  and dismissal restores focus and routing exactly. The dismissal
  rule is single and shared: a press dismisses only when it lands
  **outside the panel and outside the trigger** that opened it.
  Excluding the trigger is what lets a popover open _beside_ its
  opener (a swatch opening the color picker) behave like one opened
  _at_ the cursor (a context menu) — the opening gesture grabs
  capture mid-gesture and its residual press lands on the trigger, so
  a popover that dismissed on any outside press would close itself on
  the very gesture that opened it. No per-widget opening guard is
  permitted; a widget that needs one has diverged from the primitive.
- **WID-9** Composite single-commit: a control assembled from
  several atoms editing one compound value produces exactly one
  commit per interaction; its internal modes (uniform ⇄ split,
  linked axes) are widget state, never document state.

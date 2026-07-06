---
title: Surface
description: The canvas interaction layer — hit tiers, gestures, intents, and the HUD chrome inventory the reference editor must implement.
tags:
  - internal
  - wg
  - editor
format: md
---

The **surface** is where pointer input meets the document: it decides
what a pointer-down means, runs gestures, emits intents, and draws the
canvas chrome (HUD). Its normative core is golden: [selection
behavior](./ux-surface/selection.md) and the
deterministic [selection intent
router](./ux-surface/selection-intent.md). This document
binds those into the system and fixes the scope the reference editor
must implement. The machine that implements this concept — the pure,
intent-emitting chrome-and-interaction state machine — is specified
in [hud.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/hud.md).

## The two-tier hit model

Pointer-down resolves in two tiers, in order: **tier 1** — screen-
space chrome regions (handles, HUD controls), which always beat
content; **tier 2** — the scene pick, with the golden router's
modifier and deferred-selection rules. The UI layer's panels sit above
both (UI-5): panel → chrome → content is the arbitration order for the
window. When a non-cursor [tool](./tool.md) is armed, the tool machine
takes the content rung: panel → chrome → **tool** → content.

## Selection authority

The **editor owns selection** ([editor.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/editor.md)); the surface
holds only a **read-only mirror** the host pushes. Selection changes
flow one way: the surface emits selection _intents_ — `select`,
`deselect_all`, and the marquee's per-move rect — and the host commits
them into the editor **within the same dispatched event**; the host
then pushes the editor's selection back into the mirror at the same
tail where it reconciles everything else (panels, damage —
[frame.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/frame.md)). No path is special-cased: click, shift-click,
every pointer-move of a marquee, undo/redo context restore, panel
clicks, paste, and tool insertion all converge on the same
intents-up / mirror-down loop. A surface that owns its own selection
store — reconciled by adoption or by per-event "selection changed"
flags — re-creates the split-brain failure (chrome shows a selection
that delete and the inspector cannot see); [hud.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/hud.md) HUD-3
forbids it structurally.

## Gestures

A gesture is exclusive (one at a time), framed as a history
transaction (begin/preview/commit/abort per the golden history spec),
and continuously reconfigured by modifiers (per the golden
[input spec](./input.md)). The reference editor
implements this gesture set:

| Gesture       | Trigger                                | Effect                        |
| ------------- | -------------------------------------- | ----------------------------- |
| pan           | space-hold drag / middle drag / scroll | view state only               |
| marquee       | drag from empty space                  | selection by intersection     |
| translate     | drag selected content / tree-initiated | `move`/`patch` transforms     |
| resize        | drag resize handle (8 regions)         | size/position patch           |
| rotate        | drag rotate corner regions             | rotation patch                |
| corner-radius | drag radius knob                       | radius patch                  |
| text-edit     | double-click text node                 | enters nested editing context |

Deferred (specced, not required for the first conformance
milestone): lasso, the vector/path editing gestures
([vector-edit](../feat-vector-network/vector-edit.md)), padding handles. The clone and
re-parenting behaviors of translate are [translate](./translate.md);
the resolution mathematics behind the scene pick and the marquee are
[targeting](./ux-surface/targeting.md); the corner-radius knob's
cardinality, placement, drag mapping, and link/split modifier are
[corner-radius](./corner-radius.md).

## HUD chrome inventory

Chrome the surface draws, painted on the same window canvas between
content and panels: selection outline + transform handles, hover
outline, marquee rectangle, size badge, snapping guides with
measurement labels, frame/node title labels, text-edit caret and
selection rects, and the pixel grid / ruler substrate (toggleable).
Chrome is derived from editor state every frame it changes — chrome
holds no authoritative state of its own. The HUD machine builds it as
data (a draw list plus an independent hit registry — the two-backend
rule) and the host paints; text-edit caret/selection remain
engine-session chrome ([hud.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/hud.md)).

## Snapping

During translate/resize, candidate alignments (node bounds and
centers of visible siblings, plus the parent) snap the gesture within
a screen-space threshold, drawing guide lines and distance labels.
Snapping is gesture-time only: it affects the previewed values, is
disabled by the designated modifier, and leaves no trace in the
document beyond the snapped values themselves. The full system —
pipeline stages, sources, quantization, chrome — is
[snap.md](./snap.md); the persistent guides and the rulers that
author them are [ruler.md](./ruler.md); the alt-held spacing readout
is [measurement.md](./measurement.md); the pixel grid render is
[pixel-grid.md](./pixel-grid.md).

## Contracts

- **SURF-1** Arbitration order holds: a synthetic pointer-down at a
  point covered by panel, chrome, and content activates only the
  panel; covered by chrome and content, only the chrome.
- **SURF-2** Every gesture that mutates content produces exactly one
  history entry on commit and none on abort (binds HISB-2/4 to each
  gesture in the table).
- **SURF-3** The golden selection-intent router's documented cases
  each have a conformance test driving synthetic pointer events and
  asserting selection outcome.
- **SURF-4** Modifier reconfiguration is live: toggling the
  axis-constraint modifier mid-translate changes subsequent previews
  and releasing it reverts, within one event of the change.
- **SURF-5** Chrome is stateless: destroying and recreating the
  surface layer against the same editor state reproduces identical
  chrome (pixel-comparable).
- **SURF-6** With snapping enabled, a translate ending within the
  snap threshold of a sibling edge commits the snapped value; with
  the disable-modifier held, it commits the raw value.
- **SURF-7** Selection authority: by the end of any dispatched surface
  event that expresses a selection change — including every
  pointer-move of a marquee — the editor's selection and the chrome's
  rendered selection agree. Everything that reads selection (delete,
  the inspector, history context) sees a marquee's result without any
  subsequent click. Mechanism: intents up, mirror down, same event
  ([hud.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/hud.md) HUD-3).

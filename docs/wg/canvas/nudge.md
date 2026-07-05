---
title: Nudge
description: The arrow-key family — translate nudge, resize nudge, in-flow reorder, sub-mode nudges, and the empty-selection camera pan.
tags:
  - internal
  - wg
  - editor
format: md
---

The arrow keys are the editor's precision instrument: a keyboard
delta applied to whatever the current state says the arrows mean.
This document specifies the whole family. The masks that keep the
chords unambiguous are in the [keybindings](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/keybindings.md) sheet;
the state arbitration is [routing](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/routing.md); the quantization
behavior nudge shares with gestures is [snap](./snap.md).

## Translate nudge — Arrow / Shift+Arrow

With a node selection, arrows translate it by **1 unit** along the
axis; Shift multiplies by the **big-nudge factor** (default 10; a
configuration value, not a second command).

- The delta is applied **exactly** — nudge is never snapped to
  geometry (SNAP-4/SNAP-6 territory: quantization applies only when
  pixel-grid snapping is on, anchored so repeated sub-unit nudges
  accumulate without drift).
- A **burst frames as one entry**: rapid successive nudges commit as
  one history step; one undo restores the pre-burst position. The
  mechanism is framing, not merging — the gesture frame stays open
  across the burst and closes on a dwell boundary; the stack never
  merges committed entries ([history](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/history.md), HISB-3).
- Locked nodes don't nudge; a mixed selection nudges its unlocked
  members.

## Alignment feedback — the advisory guide

A drag shows [snap guides](./snap.md) live as it moves; a keyboard
nudge has no such in-gesture feedback — the object jumps a unit and
stops. So when a translate nudge *lands* flush with an alignment — an
edge or center level with a sibling or a guide — the editor flashes
the snap guide that would have marked it, briefly, then clears it.

This is **feedback, not snapping**. The nudge delta is still applied
exactly (NUDGE-1 / [SNAP-6](./snap.md)): the guide reveals an
alignment the motion happened to hit; it never corrects the value
toward one. It answers *"did I just line these up?"* for a gesture
that, unlike a drag, gave no running answer.

- **Keyboard-only by nature.** A drag owns its live guides — hidden
  on release, since an aligned drag needs no afterimage. The advisory
  guide exists precisely to give the *guideless* keyboard path the
  confirmation the pointer path already has; it is not a general
  post-translate affordance. (A programmatic translate delta, having
  no live guide either, may ride the same mechanism, but the UX is
  authored for the keyboard.)
- **Shows at once, holds briefly.** It appears the frame the nudge
  lands and clears after a short hold (the reference editor: ~500 ms),
  re-arming on each successive nudge so a burst of arrows keeps it
  alive, then letting it fade once the keys stop.
- **It reveals, it does not correct.** The affordance reuses snap's
  guide chrome and its detection (open a session, test the landed
  position) but drives no delta — snap's guide-*rendering* and
  value-*correction* halves are separable, and this uses only the
  first ([snap.md](./snap.md), SNAP-8).

## In-flow reorder

A child under a layout container's flow (an auto-layout item with no
authored insets) has no free position to translate — for it, the
arrows **reorder**: the arrow pointing along the layout axis moves
the node one slot forward/backward in the flow. A mixed selection
splits: in-flow members reorder, out-of-flow members translate, in
the same command. This is the property panel's computed-vs-authored
rule (properties PROP-5) applied to the keyboard: never author a
value the layout will immediately override.

## Resize nudge — Mod+Arrow / Ctrl+Alt+Arrow

Grows or shrinks the selection: right/left = width ±1, down/up =
height ±1; Shift applies the big-nudge factor. **Two chords bind it**,
either firing the same command — **Mod+Arrow** (the one-hand chord,
Cmd on macOS) and **Ctrl+Alt+Arrow** — so a platform that reserves one
(Cmd+Arrow for caret motion, Ctrl+Alt+Arrow for screen rotate) leaves
the other free. Neither is move: move nudge requires Mod *and* Ctrl
absent ([keybindings](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/keybindings.md), KEY-2). Semantics:

- The **anchor is the node's origin** (top-left): position is fixed,
  the far edge moves — the keyboard twin of dragging the SE handle.
- **Per-element, not a union resize**: a multi-selection grows each
  member about *its own* origin — every node keeps its position and
  takes the delta — rather than scaling the selection bounds as one
  box (the SE-handle drag resizes the union; this does not).
- **All-or-nothing gate**: if any selected member is not resizable
  (auto-sized, or otherwise refusing), the command declines for the
  whole selection rather than resizing a subset.
- Bursts frame exactly as translate nudges do.

## Sub-mode nudges

Inside content-edit modes the same arrows re-target (the routing
capture order, not new bindings):

- **Vector edit**: arrows translate the sub-selected vertices and
  tangents by the same 1/10 deltas ([vector-edit](../feat-vector-network/vector-edit.md)).
- **Gradient edit**: arrows move the selected stop's offset by 1%
  (Shift: 10%), clamped to [0, 1].

## Empty selection — camera pan

With nothing selected and no content-edit mode active, arrows **pan
the camera**: the viewport moves a fixed screen-space step (default
50 px; Shift applies the big-nudge factor) in the arrow's direction.
The step is screen-space — zoom does not change the felt distance.
This is deliberate: arrows always do *something* spatial, and with no
object to move, the camera is the object. Camera panning is view
state — no document mutation, no history entry.

## Contracts

- **NUDGE-1** Exactness: a nudge of (+1, 0) changes the target's
  position by exactly (+1, 0) — no geometry snapping; with pixel
  quantization on, repeated 0.1-unit nudges accumulate on the
  anchored lattice without drift.
- **NUDGE-2** Burst framing: N rapid nudges frame into one history
  entry (the gesture stays open across the burst, closing on dwell);
  one undo restores the pre-burst state. Committed entries are never
  merged (HISB-3).
- **NUDGE-3** Resize nudge anchors the origin: position is unchanged,
  size changes by the delta; if any selected member refuses,
  nothing resizes.
- **NUDGE-4** In-flow reorder: an auto-layout child with no authored
  insets reorders along the layout axis instead of translating; its
  siblings' authored properties are untouched.
- **NUDGE-5** Empty-selection arrows pan the camera by the fixed
  screen-space step regardless of zoom, and record nothing.
- **NUDGE-6** Advisory guide: when a translate nudge lands the
  selection flush with a snap anchor (a sibling edge/center or a
  guide), a snap guide marks the alignment, holds briefly, then
  clears; the applied delta is unchanged (NUDGE-1 / SNAP-6 — feedback,
  never correction). A nudge that lands on no alignment paints
  nothing, and no other translate path (drag, panel entry) raises it.

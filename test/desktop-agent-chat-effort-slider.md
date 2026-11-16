---
id: TC-DESKTOP-AGENT-CHAT-031
title: Effort slider follows dragging and settles on release
module: desktop
area: agent-chat
tags: [chat, effort, slider, keyboard, animation]
status: untested
severity: low
date: 2026-11-15
updated: 2026-11-15
automatable: true
covered_by:
  - editor/scaffolds/desktop/workbench/native-effort-slider.test.tsx
---

## Behavior

The effort thumb and fill follow pointer motion continuously. The selected
effort follows the nearest permitted step throughout the drag. On release,
the thumb settles onto that position with a brief, restrained animation.
Cancelling a drag settles at the current selection. Pressing the track outside
the knob selects the nearest step immediately and animates to it; moving that
same press does not begin a drag. Keyboard interaction selects whole effort
steps. Reduced motion disables the settling animation.

## Steps

1. Open the effort picker with a nonzero selection. Confirm the knob and fill
   appear together at the selected position, without animating from the start.
   Confirm its composer trigger reads **Select effort** while this panel is
   open. Enter the model list and confirm the trigger shows the current model
   and effort again. Confirm the popup height changes smoothly over about
   180 ms without bouncing when moving between panels. Pick a model and confirm
   the same popup returns to the effort panel and stays open, including after the
   model finishes connecting. Confirm any composer draft is preserved.
   Close and reopen it to confirm this remains true on each opening. Slowly
   drag the thumb between two dots without releasing. Confirm the thumb and
   fill follow the pointer without jumping between dots, while the selected
   effort above updates as the pointer crosses between effort steps.
2. Release between dots. Confirm the nearest effort is selected and both thumb
   and fill settle together, without overshoot.
3. Release closer to the original selection. Confirm it settles back there.
4. Focus the slider and use arrow keys, Home, and End. Confirm whole positions
   are selected and the effort label agrees with the thumb.
5. On a connection that cannot use Ultra, release near Ultra. Confirm the
   slider returns to the permitted selection without enabling Ultra.
6. With reduced motion enabled, repeat a drag. Confirm it still follows the
   pointer and snaps on release, without the settling animation.
7. Select the first and last positions, and inspect intermediate positions
   while dragging. Confirm the fill ends beneath the knob's center, with no
   rectangular fill edge visible around either end of the knob.
8. Press the track outside the knob and keep holding. Confirm the nearest
   step is selected immediately and the knob animates from its old position.
   Move the pointer while still holding; confirm the selection and knob stay
   at that step. Release, then start a new press on the knob and confirm
   continuous dragging still works.
9. Hover the knob. Confirm it grows slightly without moving its center or
   changing the track. Start a drag just outside its visible edge, within
   about four pixels; confirm this still drags the knob rather than selecting
   a track position.

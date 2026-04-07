---
id: TC-CANVAS-INPUT-006
title: Rapid Continuous Changes Are Bucketed Into One Undo Step
module: canvas
area: input
tags: [undo, history, time-bucket, slider, color-picker, keyboard, nudge]
status: untested
severity: medium
date: 2026-04-07
updated: 2026-04-07
automatable: false
covered_by:
  - editor/grida-canvas/__tests__/headless/time-bucket.test.ts
---

## Behavior

Rapid dispatches of the same action type within a 300ms window are merged into a single undo step. This covers continuous interactions where the user's intent is ambiguous — they may be dragging a slider smoothly or tapping an arrow key repeatedly. The system groups by time proximity and action type identity.

When the action type string changes (e.g., switching from `"node/change/*"` to `"paste"`), the previous bucket is flushed as one undo step and a new bucket begins. Note that many property changes share the same `"node/change/*"` action type, so consecutive property edits (opacity, rotation, etc.) may merge into one bucket unless separated by a >300ms pause. When the user stops making changes for >300ms, the bucket auto-flushes.

Undo always flushes the pending bucket first, so the user never loses an in-flight change by pressing Cmd+Z.

This applies universally to all dispatches that use the default `"record"` mode — no per-control opt-in required. Color pickers, opacity sliders, font size changes, and keyboard arrow nudges all benefit automatically.

## Steps

### Color picker drag

1. Select a rectangle with a solid fill
2. Open the color picker and drag across the hue slider quickly
3. Release
4. Expected: 1 undo entry for the entire color change
5. Cmd+Z — color reverts to original

### Keyboard arrow nudge (held)

1. Select a rectangle
2. Hold the right arrow key for ~2 seconds (rapid nudge)
3. Release
4. Expected: the entire nudge sequence is 1 undo entry (if no pause >300ms)
5. Cmd+Z — rectangle returns to original position

### Keyboard arrow nudge (slow taps)

1. Select a rectangle
2. Press right arrow, wait 1 second, press right arrow again
3. Expected: 2 separate undo entries (gap > 300ms between presses)
4. Cmd+Z — undoes the second nudge only

### Slider scrub with pause

1. Select a rectangle
2. Drag the opacity slider from 100% to 50%, pause for 500ms, then drag to 20%
3. Release
4. Expected: 2 undo entries (the pause >300ms caused a bucket flush)
5. Cmd+Z — opacity returns to 50%
6. Cmd+Z — opacity returns to 100%

## Notes

The 300ms window is configured as `BUCKET_TIMEOUT_MS` in the `EditorHistoryAdapter`. The bucket groups by `actionType` string equality — `"node/change/*"` is common for property edits, so consecutive property edits may merge unless a timeout or explicit transaction boundary flushes the bucket.

Explicit gesture transactions (`begin-gesture`/`end-gesture`) bypass bucketing entirely — they capture a before/after snapshot. Bucketing is for the ambient case where no explicit transaction boundaries exist.

---
title: Input & Commands
description: The input pipeline — surface events, routing priority, the command vocabulary, the keybinding model, and modifiers as live gesture configuration.
tags:
  - internal
  - wg
  - editor
format: md
---

This document specifies how raw platform input becomes editor
behavior. The pipeline is the same on every host; only the first
translation step (platform event → surface event) is host-specific.

## The pipeline

```
platform input → surface event → routing → command / intent → state transition
```

- **Surface event** — the normalized input vocabulary: pointer events
  carrying both screen-space and canvas-space positions plus button
  and modifier state; key events; text input; IME composition events
  (preedit, commit, cancel). Everything downstream consumes surface
  events, never platform events.
- **Routing** — a fixed priority order decides who consumes an event
  (see below).
- **Command** — a named, parameterless-or-parameterized unit of editor
  behavior. Commands are the _only_ things keybindings bind to.
- **Intent** — a pointer interaction's declared meaning (select,
  translate, resize, rotate, enter content edit, …) with a
  preview/commit phase, produced by the surface's intent router. The
  intent vocabulary is owned by the [UX Surface](./ux-surface/) specs.

## Routing priority

Key input resolves in a fixed ladder; the first consumer wins:

1. **Active nested editing context** (text editing) — captures
   printable input, editing keys, and IME. Escape exits the context
   rather than reaching lower layers.
2. **Active gesture** — modifier changes and cancel keys reconfigure
   or abort the in-flight gesture.
3. **Command bindings** — the keybinding table.

Pointer input resolves through the surface's two-tier hit model:
overlay chrome (handles, HUD regions) first, scene content second —
specified in [Selection Intent](./ux-surface/selection-intent.md).

## The command vocabulary

Every editing capability is a command: enumerable, dispatchable by
name, and independent of any binding. Hotkeys, menus, palettes, agents,
and tests all invoke the same commands — a capability reachable only
through a hardcoded key handler is a spec violation. Commands declare
whether they mutate content (and therefore produce history entries)
or only affect view/interaction state.

## Keybinding model

Bindings are structural, not timing-based:

- A **chord** is a modifier mask plus one or more keys pressed
  together.
- A **binding** is a sequence of chords (multi-stroke bindings are
  permitted by the model even if a host ships only single-chord
  bindings), and a command may carry several alias bindings.
- The **primary modifier** is virtual: it resolves to the platform's
  conventional command modifier. Bindings are authored against the
  virtual modifier, never against a physical one.
- A binding's modifier mask declares which modifiers are _meaningful_;
  unmentioned modifiers default to "must be absent" unless the binding
  explicitly marks them "don't care". Ambiguity between two bindings
  on the same chord is a table error, not a runtime race.

## Momentary and configuring modifiers

Two behaviors are part of the contract, not host sugar:

- **Momentary (hold) bindings** — holding a key activates a mode
  (hand/pan, zoom); releasing restores the prior tool exactly, even if
  the pointer is mid-gesture.
- **Modifiers as live gesture configuration** — during a gesture,
  modifier state continuously reconfigures its semantics
  (duplicate-on-drag, disable snapping, constrain axis or aspect).
  Configuration is evaluated live for the remainder of the gesture,
  not sampled once at gesture start, and releasing the modifier
  mid-gesture reverts the behavior.

## Edge-scrolling

When a pointer-driven gesture reaches for content beyond the visible
viewport, the camera follows the pointer instead of stranding the
gesture at the boundary. This is a surface-owned autopan: the gesture
never ends because the pointer ran out of room.

- **Boundary band** — an inset region a fixed screen-space distance
  from each viewport edge. The band is measured in screen space, so
  its thickness is independent of zoom. A pointer resting in the
  interior arms nothing.
- **Ramp** — while the pointer is inside the band, the camera pans each
  frame by a velocity that grows with how deep into the band (how
  close to the edge) the pointer sits, along each axis independently.
  A pointer parked exactly on the band's inner edge contributes no
  motion; one pinned at or past the viewport edge contributes the
  capped maximum. The velocity is a per-frame quantity, not a
  per-event one — it continues to pan while the pointer is held
  stationary inside the band.
- **Arming** — edge-scrolling is armed only by gestures whose meaning
  is "reach past the current view": pointer-driven translate, marquee,
  and their kin. It is not armed by hover, by a settled selection, or
  while no gesture is active. A host may further scope which tools arm
  it, but the armed set is a subset of the in-flight pointer gestures.
- **Gesture continuity** — the autopan moves the _camera_, never the
  gesture's canvas-space anchors. As the view slides, the gesture
  continues to resolve against the same canvas coordinates it was
  already operating on; the marquee grows to cover newly-revealed
  content, the translated node keeps tracking the pointer's canvas
  position. The camera mechanics of the pan itself are owned by the
  [view/state model](./state.md); edge-scrolling only supplies the
  per-frame pan request.

## Contracts

- **INPUT-1** Autopan is per-frame: while an arming gesture holds the
  pointer inside the boundary band, the camera keeps panning on every
  frame even with no further pointer movement, and stops the frame the
  pointer leaves the band or the gesture ends.
- **INPUT-2** Proximity ramp: pan velocity along each axis rises
  monotonically with the pointer's depth into that edge's band, is
  zero at the band's inner edge, and is clamped to a per-axis maximum
  at or beyond the viewport edge. The band's thickness is fixed in
  screen space and so is invariant under zoom.
- **INPUT-3** Arming is a subset of pointer gestures: edge-scrolling
  arms only for in-flight pointer gestures that reach past the view
  (translate, marquee, kin); it never arms on hover, on a settled
  selection, or with no active gesture.
- **INPUT-4** Gesture continuity under autopan: the autopan alters only
  the camera. The gesture's canvas-space anchors are bit-for-bit what
  they would be if the same pointer path occurred without any pan, so
  the gesture resolves identically against canvas coordinates as the
  view slides.

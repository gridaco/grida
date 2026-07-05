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

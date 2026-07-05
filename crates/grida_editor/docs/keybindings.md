---
title: Keybindings
description: The default keybinding sheet — the normative binding table over the command registry, with the meaningful-modifier mask semantics that make it ambiguity-free.
tags:
  - internal
  - wg
  - editor
format: md
---

This is the **default keybinding sheet**: the concrete table the
shell ships. The _model_ — chords, virtual primary modifier,
momentary holds, modifiers as live gesture configuration — is golden
([input & commands](../../../docs/wg/canvas/input.md)) and is not restated
here. How one key resolves to different meanings across editor states
is [routing](./routing.md). This sheet makes the table itself
normative: [shell](./shell.md) SHELL-1 demands every row dispatch a
registry command; this document says which rows exist.

## Notation and mask semantics

- **Mod** is the virtual primary modifier (resolves to the platform's
  command key). Bindings are authored against Mod, never a physical
  key.
- **(hold)** marks a momentary binding: press activates, release
  restores the prior state exactly.
- Every binding declares its **meaningful modifiers**: the modifiers
  whose state the chord constrains. Meaningful-and-listed must be
  held; meaningful-and-unlisted must be absent; _unmeaningful
  modifiers are don't-care_ — the binding fires regardless of them.
  This is what lets plain-arrow nudge keep working while the
  measurement modifier (Alt) is held, while `Ctrl+Alt+Arrow` (resize
  nudge) stays unambiguous: the nudge row declares Mod and Ctrl
  meaningful-absent and leaves Alt don't-care. Two rows on the same
  chord with overlapping masks are a **table error**, detected by
  enumeration, never resolved at runtime by luck.

## The sheet

### History & clipboard

| Chord                 | Command                                                             |
| --------------------- | ------------------------------------------------------------------- |
| Mod+Z                 | undo                                                                |
| Mod+Shift+Z           | redo                                                                |
| Mod+X / Mod+C / Mod+V | cut / copy / paste ([io](../../../docs/wg/canvas/io.md))            |
| Mod+Shift+C           | copy as PNG ([io-external](../../../docs/wg/canvas/io-external.md)) |
| Mod+D                 | duplicate (repeats the last duplicate's offset)                     |
| Backspace, Delete     | delete                                                              |

### File

| Chord | Command |
| ----- | ------- |
| Mod+S | save    |

### Selection & traversal

| Chord           | Command                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- |
| Mod+A           | select all (scope-relative)                                                                     |
| Escape          | step down one rung (the escape ladder — [routing](./routing.md))                                |
| Enter           | enter: select children / enter content edit ([traversal](../../../docs/wg/canvas/traversal.md)) |
| Shift+Enter, \  | select parent                                                                                   |
| Tab / Shift+Tab | next / previous sibling                                                                         |

### Nudge

| Chord                                 | Command                                                    |
| ------------------------------------- | ---------------------------------------------------------- |
| Arrow                                 | nudge 1 (meaningful: Mod, Ctrl absent; Alt don't-care)     |
| Shift+Arrow                           | nudge 10                                                   |
| Mod+Arrow, Ctrl+Alt+Arrow             | resize nudge 1 ([nudge](../../../docs/wg/canvas/nudge.md)) |
| Mod+Shift+Arrow, Ctrl+Alt+Shift+Arrow | resize nudge 10                                            |

Resize nudge binds **two chords** that fire the same command, so a
platform reserving one still leaves the other: `Mod+Arrow` (Ctrl
meaningful-absent) and `Ctrl+Alt+Arrow` (Meta don't-care). The masks
are disjoint on Ctrl — no combination satisfies both — and move nudge,
which requires Mod _and_ Ctrl absent, catches neither.

With an empty selection, arrows pan the camera instead
([nudge](../../../docs/wg/canvas/nudge.md)).

### Tools

| Chord             | Tool                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| V                 | cursor                                                                                                     |
| A, F              | container                                                                                                  |
| Shift+F           | tray                                                                                                       |
| R / O / Y / T / L | rectangle / ellipse / polygon / text / line                                                                |
| Shift+L           | arrow                                                                                                      |
| P                 | pen ([vector-edit](../../../docs/wg/feat-vector-network/vector-edit.md)); held, it engages keep-projecting |
| Shift+P           | pencil                                                                                                     |
| K                 | scale                                                                                                      |
| Q                 | lasso (legal only in vector edit)                                                                          |
| Shift+W           | width facet of vector edit ([edit-mode](../../../docs/wg/canvas/edit-mode.md))                             |
| H                 | hand                                                                                                       |
| Space (hold)      | hand                                                                                                       |
| Z (hold)          | zoom                                                                                                       |

### Arrange

| Chord                   | Command                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| ] / [                   | bring to front / send to back                                                                               |
| Mod+] / Mod+[           | bring forward / send backward                                                                               |
| Mod+G                   | group                                                                                                       |
| Mod+Shift+G             | ungroup                                                                                                     |
| Mod+Alt+G               | group with container                                                                                        |
| Shift+A                 | auto-layout                                                                                                 |
| Mod+E                   | flatten                                                                                                     |
| Alt+Shift+U / S / I / E | boolean union / subtract / intersect / exclude ([boolean](../../../docs/wg/feat-vector-network/boolean.md)) |

### Align & distribute

| Chord                         | Command                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alt+A / Alt+D / Alt+W / Alt+S | align left / right / top / bottom                                                                                                                                      |
| Alt+H / Alt+V                 | align horizontal / vertical centers                                                                                                                                    |
| Alt+Ctrl+V / Alt+Ctrl+H       | distribute horizontally / vertically (web-editor parity: distribute letter = opposite axis of the same key's align center) ([align](../../../docs/wg/canvas/align.md)) |

### Object & style

| Chord       | Command                         |
| ----------- | ------------------------------- |
| Mod+Shift+H | toggle visible                  |
| Mod+Shift+L | toggle locked                   |
| 1 … 9       | opacity 10% … 90%               |
| 0           | opacity 100%; double-tap 0 → 0% |
| I           | color picker                    |
| Alt+/       | remove fill                     |
| Shift+/     | remove stroke                   |
| Shift+X     | swap fill and stroke            |

### Text (while a text selection is the target)

| Chord                 | Command                               |
| --------------------- | ------------------------------------- |
| Mod+B / Mod+I / Mod+U | bold / italic / underline             |
| Mod+Shift+X           | strikethrough                         |
| Mod+Alt+L / T / R / J | align left / center / right / justify |
| Mod+Shift+> / <       | font size ±                           |
| Mod+Alt+> / <         | font weight ±                         |
| Alt+Shift+> / <       | line height ±                         |
| Alt+> / <             | letter spacing ±                      |

### View

| Chord              | Command                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Mod+= / Mod+-      | zoom in / out                                                                                  |
| Shift+0            | zoom 100%                                                                                      |
| Shift+1            | zoom to fit                                                                                    |
| Shift+2            | zoom to selection                                                                              |
| Shift+R            | toggle ruler visibility                                                                        |
| Mod+\              | toggle UI (chrome) visibility                                                                  |
| Shift+'            | toggle pixel grid                                                                              |
| Mod+'              | toggle pixel-grid snapping ([snap](../../../docs/wg/canvas/snap.md); rides the pixel-grid key) |
| Mod+;              | toggle geometry snapping                                                                       |
| Mod+Shift+O, Mod+Y | toggle outline mode                                                                            |
| PageUp / PageDown  | previous / next scene                                                                          |

### Modifiers as live gesture configuration

These are not chords; they are the held-modifier vocabulary the
golden input spec mandates, listed so the assignment is data:

| Modifier (held) | Meaning during gestures / hover                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Shift           | axis lock (translate), aspect lock (resize), angle quantize (rotate), big nudge                                   |
| Alt             | clone on translate ([translate](../../../docs/wg/canvas/translate.md)), center-origin resize, measurement readout |
| Mod             | deep targeting ([targeting](../../../docs/wg/canvas/ux-surface/targeting.md)); bend (vector edit)                 |
| Ctrl            | snap disable ([snap](../../../docs/wg/canvas/snap.md)), deep targeting                                            |

### Reserved

Bound to no-ops today, reserved so future meaning does not collide:
Shift+H / Shift+V (flip horizontal/vertical), component create/eject
chords.

## Contracts

- **KEY-1** Table–registry equality: every row dispatches a registry
  command by name; enumerating the table against the registry finds
  no unbound row and no inline behavior (refines SHELL-1).
- **KEY-2** Mask honesty: plain-arrow nudge fires with Alt held and
  does not fire with Mod or Ctrl held; resize nudge fires on either
  `Mod+Arrow` (Ctrl meaningful-absent) or `Ctrl+Alt+Arrow` (Meta
  don't-care), and the two masks are disjoint on Ctrl so no chord
  satisfies both. No two rows claim one chord+mask.
- **KEY-3** Virtual modifier: the same table serves every platform;
  Mod rows resolve to the platform's primary modifier without
  re-authoring.
- **KEY-4** Focus guard: while a widget or nested editing session
  holds keyboard focus, sheet bindings are suppressed except rows
  explicitly marked as legal there (UI-3 order is upstream of the
  sheet).
- **KEY-5** Momentary restore: releasing a (hold) binding restores
  the previously active tool exactly, even mid-gesture.
- **KEY-6** Opacity digits: single digits set opacity in tenths; a
  double-tapped 0 within the multi-tap window sets 0%.

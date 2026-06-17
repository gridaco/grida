# @grida/keybinding

Declarative keybinding primitives. **Not** a hotkey manager — building blocks for one.

## What's in the box

- `KeyCode` enum (VS Code shape) and `KeyCodeUtils.toString`.
- `M` modifier bitmask (`Ctrl | Shift | Alt | Meta | CtrlCmd`). `CtrlCmd` resolves to Meta on mac / Ctrl elsewhere.
- Types: `Chunk`, `Sequence`, `Keybinding`, `Keybindings`, `ResolvedChunk`, `ResolvedSequence`.
- Builders: `kb()`, `c()`, `seq()`, `platformKb()`.
- Resolution: `resolveMods`, `resolveChunk`, `resolveSequence`, `keybindingsToKeyCodes`.
- Platform detection: `getKeyboardOS()`.
- UI labels: `keycodeToPlatformUILabel`, `uikbdk`.
- Event matching (new): `match(event, binding)`, `eventToChunk(event)`, `chunkKey(chunk)`.

## Concepts

Four terms that must never be conflated (mirrored in `src/keybinding.ts`):

- **Chunk** — one keypress: modifiers + key pressed together (`Cmd+Z`). The atom.
- **Chord** — a single chunk used as a complete binding. Dispatched today.
- **Chord-sequence** (`Sequence`) — ordered, typically _heterogeneous_ chunks pressed in succession (`Ctrl+K` then `Ctrl+C`). Disambiguated by **structure** — the leader defers. Typed, resolvable, and labelable here, but **not dispatched in V1**.
- **Multi-tap** — the **same** chunk repeated within a time window (`0 0`, double-tap-Shift). Disambiguated by **timing (a clock)**: the single press fires _and_ the double press fires a _different_ action. **Not a `Sequence`**; not modeled here (see [Status](#status--open-multi-tap-representation)).

Load-bearing rule: **structure-disambiguated → belongs in this vocabulary; clock-disambiguated → does not enter these clockless primitives.**

## What's NOT in the box

- No `Keymap` or `CommandRegistry` class.
- No event-listener wiring or dispatch loop.
- No React hooks.
- No `react-hotkeys-hook` bridge — the main editor keeps that locally.
- **No chord-sequence dispatch.** `Sequence` multi-chunk is resolvable and labelable, but nothing here dispatches it — `match()` and the shipped `Keymap`s skip `seq.length !== 1` by design. Dispatch needs a stateful matcher (tracks the leader between events); not in V1.
- **No multi-tap / timed-gesture detection.** Same-key timed repetition (`0 0`, double-tap-Shift) is a clock-driven gesture, not a chord-sequence. These primitives stay clockless; whether/where a stateful dispatch layer is added is under design (see Status).

## Status — open: multi-tap representation

This package is **v0 / experimental**. One contract decision is deliberately
open, pending design review: **how (and whether) multi-tap (`0 0`) is
represented.** Three candidates:

1. **Exclude — it's a gesture.** Keep these primitives clockless (chords +
   chord-sequences only); add a sharp anti-goal; wire `0 0` in the
   dispatcher/surface layer via a keyboard analogue of the HUD's
   `ClickTracker` (`@grida/canvas-hud` `core/click-tracker.ts`). Mirrors VS
   Code, whose only same-key double-tap (modifier-only, 300 ms) lives in its
   stateful service, never the data model.
2. **Type it, clockless.** Add a tagged `tap` descriptor (no timing) so
   `0 0 → X` is declarable in one place; the clock stays external.
3. **SDK owns the timer.** Grow a separate _stateful_ entry (a VS Code
   `AbstractKeybindingService` analogue) that owns chord-sequence state and
   multi-tap timing.

Until this is settled, the vocabulary names multi-tap but does not model it.

## Usage

```ts
import { kb, KeyCode, M, match, getKeyboardOS } from "@grida/keybinding";

const UNDO = kb(KeyCode.KeyZ, M.CtrlCmd);

document.addEventListener("keydown", (e) => {
  if (match(e, UNDO)) {
    e.preventDefault();
    editor.undo();
  }
});
```

A real consumer would normally bundle bindings into its own registry with id-based dispatch. This package just gives you the legos.

## Origin

Copied from `editor/grida-canvas/keybinding.ts` + `editor/grida-canvas/keycode.ts` and stripped of the `react-hotkeys-hook` bridge. The main editor still imports from its local copy; it will be migrated to depend on this package in a follow-up task. Both copies are intentionally kept in sync.

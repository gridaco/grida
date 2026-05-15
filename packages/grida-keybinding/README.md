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

## What's NOT in the box

- No `Keymap` or `CommandRegistry` class.
- No event-listener wiring or dispatch loop.
- No React hooks.
- No `react-hotkeys-hook` bridge — the main editor keeps that locally.

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

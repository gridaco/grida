---
title: Shell
description: The reference editor application — window composition, panel layout, keybinding table, and lifecycle. Assembles capabilities; owns none.
tags:
  - internal
  - wg
  - editor
format: md
---

The shell is the application: one window hosting the canvas view and
the panels, a keybinding table over the command registry, and the
document lifecycle. Per ARCH-4 the shell **owns nothing** — every
capability it exposes exists below it; the shell arranges and binds.

## Composition

One window, one render surface ([ui.md](./ui.md)), three regions:

```
┌───────────┬──────────────────────────┬─────────────┐
│ hierarchy │        canvas view       │ properties  │
│  (left)   │   (surface + HUD chrome) │   (right)   │
└───────────┴──────────────────────────┴─────────────┘
```

The canvas viewport is the window minus the panels; resizing the
window (or collapsing a panel) re-derives the viewport. Input
arbitration follows SURF-1 (panel → chrome → content). A HUD status
line (zoom, selection count, perf readout) may overlay the canvas.

The shell also hosts the **application menu** — the native top-level
menu bar — and the **context menu**, both specified as command-surface
views in [menu.md](./menu.md). The shell owns their placement (native
chrome) and dispatches their chosen commands through its one registry
switch; the inventories and enablement are the menu layer's, adding no
capability (SHELL-3, `MENU-1`).

Dev-mode quality bar: fixed panel widths (user-resizable optional),
hardcoded style, no popovers (the color picker renders inline in the
panel), no in-canvas menus beyond the context menu — the application
menu is native chrome, not painted UI.

## Keybindings

The shell ships a default keybinding table over the command registry,
conforming to the golden [input & commands
spec](../../../docs/wg/canvas/input.md) (virtual primary modifier, structural
chords, momentary holds, live gesture modifiers). The default table
itself is now normative: the [keybindings sheet](./keybindings.md)
enumerates every row, and [routing](./routing.md) specifies how one
chord resolves across editor states. Every row must resolve to a
registry command.

## Lifecycle & instances

Launch → open (path argument or empty document) → edit → save/export
→ close. Unsaved-changes protection is a shell confirmation.
Multiple independent instances of the shell run concurrently on one
machine — this is the substrate for the two-instance sync scenario
([sync.md](../../../docs/wg/feat-crdt/sync.md)) and cross-instance clipboard (IO-5); a sync
session is joined by pointing two instances at the same session
address.

## Contracts

- **SHELL-1** Every keybinding in the shipped table dispatches a
  registry command; the table contains no inline behavior
  (verifiable by enumerating the table against the registry).
- **SHELL-2** Viewport derivation: panel/window geometry changes
  re-derive the canvas viewport such that a canvas point under the
  cursor before a left-panel collapse maps correctly after it.
- **SHELL-3** The shell adds no editing capability: the diff between
  shell-reachable operations and headless-reachable operations is
  empty (ARCH-3 measured at the shell).
- **SHELL-4** Two shell instances run concurrently without shared
  state except through sync and the system clipboard.

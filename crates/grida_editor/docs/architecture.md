---
title: Architecture
description: The editor system's layers — engine, editor core, ui, panels, shell — and the dependency rules that keep each layer testable in isolation.
tags:
  - internal
  - wg
  - editor
format: md
---

The editor system is four layers over the rendering engine. Each layer
is a real boundary: it has its own spec documents, its own conformance
tests, and a dependency rule that keeps it buildable and testable
without the layers above it.

```
┌────────────────────────────────────────────────┐
│ shell        window, panel layout, keybindings │
├────────────────────────────────────────────────┤
│ panels       properties, hierarchy             │
├────────────────────────────────────────────────┤
│ ui           widget system (engine-rendered)   │
├──────────────────────┬─────────────────────────┤
│ editor core          │ surface (HUD)           │
│ document, history,   │ gestures, intents,      │
│ sync, commands,      │ hit tiers, chrome       │
│ selection            │                         │
├──────────────────────┴─────────────────────────┤
│ engine       scene graph, layout, text,        │
│              painting, hit-test, events        │
└────────────────────────────────────────────────┘
```

## Layer contracts

- **Engine** renders documents and routes normalized input events. It
  knows nothing of editing: no history, no sync, no panels. (The
  engine is specified elsewhere; this RFC treats it as a dependency
  with a known surface.)
- **Editor core** owns the document working copy and every state
  domain, and is the **single mutation authority**: all changes —
  gestures, panel edits, commands, remote sync, agents — pass through
  one mutation vocabulary ([document.md](./document.md)). Editor core
  has no UI dependency and no rendering dependency beyond what
  queries require; **all editor-core contracts are verifiable with no
  renderer at all**.
- **Surface** turns pointer input into intents against the document
  (select, translate, resize, …) and draws canvas chrome. It reads
  editor state and emits intents; it never mutates directly. Its
  machine is the HUD ([hud.md](./hud.md)): pure, engine-free,
  intent-emitting; the host commits.
- **UI** is the widget system ([ui.md](./ui.md)). Widgets are engine
  scene nodes; the UI layer adds widget identity, state, focus,
  scrolling, and value binding. It depends on engine and editor core,
  never on specific panels.
- **Panels** (properties, hierarchy) are compositions of widgets
  bound to editor state. Panels contain *no editing logic* — every
  edit a panel performs is a mutation or command any other caller
  could make.
- **Shell** assembles everything into an application: one window, a
  panel layout, a keybinding table over the command registry, and the
  lifecycle (open document → edit → save/close).

## Dependency rules

1. Downward only. A layer may depend on layers below it, never above,
   never sideways into a sibling's internals.
2. Editor core is UI-free. If a type from the ui layer appears in
   editor core, the boundary is broken.
3. Panels speak in mutations and commands. A panel that reaches into
   the engine or the document directly, bypassing editor core, is
   non-conformant — this is what keeps panel behavior replayable and
   testable.
4. The shell owns nothing. Every capability the shell exposes must
   already exist as a command or panel; the shell only arranges and
   binds.

## Concept ≈ module

Each concept in the [concept map](../../../docs/wg/canvas/index.md) should be one module in
the implementation, with the concept's contract section as its test
plan. Where a concept must span modules (surface spans intent routing
and chrome drawing), the spec names the split. The inverse rule also
holds: a module that implements no named concept is either
infrastructure or a smell.

## Contracts

- **ARCH-1** Editor core compiles and passes its full contract suite
  with no UI, panel, or shell code present.
- **ARCH-2** Every document mutation, from any origin, is observable
  at the single mutation choke-point (a test can subscribe there and
  see all changes).
- **ARCH-3** Any edit achievable through a panel is achievable
  headlessly through mutations/commands, with identical resulting
  state.
- **ARCH-4** Removing the shell and panels leaves a linkable editor
  library; removing the ui layer leaves a linkable editor core.

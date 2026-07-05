# grida_editor — implementation-binding specs

These documents are the **reference editor's own** specs: how this
crate realizes the universal [canvas spec](../../../docs/wg/canvas/)
in running Rust. They are deliberately *not* in `docs/wg` — they are
implementation-specific (they name this crate's architecture, its
dev-only widget layer, its damage-ledger frame loop, its conformance
harness), and `docs/wg` stays code-agnostic and universal.

Where a document here binds a universal contract, it references the
canvas spec and specifies only the delta this implementation adds.

## Contents

**System**

- [`architecture.md`](./architecture.md) — the layer decomposition
  (engine → core → ui → panels → shell) and the dependency rules that
  keep each layer testable in isolation.
- [`document.md`](./document.md) — the concrete working copy and the
  mutation vocabulary that binds the canvas state model.
- [`editor.md`](./editor.md) — the editor instance: dispatch,
  observation granularity, the damage ledger, the query surface.
- [`frame.md`](./frame.md) — presentation reconciliation: the damage
  ledger and the single reflect point that turn mutations into pixels.
- [`history.md`](./history.md) — how an entry is realized as an
  inverse mutation pair, with the `HISB-*` conformance contracts
  (the semantic model is [feat-history](../../../docs/wg/feat-history/)).
- [`shell.md`](./shell.md) — the application: window, panel layout,
  lifecycle, the shipped default binding table.
- [`harness.md`](./harness.md) — how every contract is verified
  headlessly, and the hot-path performance budgets.

**Canvas chrome (this editor's machine)**

- [`hud.md`](./hud.md) — the canvas chrome and its pure,
  intent-emitting interaction machine.
- [`routing.md`](./routing.md) — this shell's key-dispatch chain,
  command registry, and the intent matrix.
- [`keybindings.md`](./keybindings.md) — the default binding *table*
  this shell ships (the binding *model* is
  [canvas/input](../../../docs/wg/canvas/input.md)).

**Panels & the widget layer**

- [`ui.md`](./ui.md) — the decision to build a minimal engine-rendered
  widget layer rather than adopt one (see also [`../src/ui/README.md`](../src/ui/README.md)).
- [`widgets.md`](./widgets.md) · [`widgets-inventory.md`](./widgets-inventory.md)
  — the control set and its closed taxonomy.
- [`properties.md`](./properties.md) · [`properties-sheet.md`](./properties-sheet.md)
  — the inspector's semantics and its full property inventory.
- [`context-menu.md`](./context-menu.md) — the right-click command
  surface inventory.
- [`devtools.md`](./devtools.md) — RFD: an inspector over scene
  content and the editor's own UI.

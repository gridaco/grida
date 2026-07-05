# `ui` — editor UI logic (view-agnostic)

> **History:** this module used to host a hand-rolled, dev-only widget
> framework (`UiLayer` + a `widgets/*` set) that painted the properties
> strip, hierarchy, toolbar, and context menu as engine scene subtrees.
> That framework was **retired**: the chrome is now egui-rendered in the
> shell (`src/shell/egui_panels.rs`), on the shared GL context. The
> older `docs/*.md` specs (`ui.md`, `widgets.md`, `widgets-inventory.md`,
> `harness.md`) describe that retired layer and are kept only as
> historical design record.

What remains here is the view-agnostic logic the egui panels sit on top
of, and that the headless contract tests exercise directly:

- [`bind`](./bind.rs) — the widget→document binding vocabulary
  (`Emission`, `BindingProperty`, `apply`). Panel edits become
  preview/commit emissions applied through the editor: previews stay
  silent, each interaction is one history entry (`ARCH-3`).
- [`hierarchy`](./hierarchy.rs) — the layers-tree `flatten` (document →
  visual rows) and the drag→drop geometry (`resolve_drop`,
  `dragged_ids`), pure functions over a `TreeRow` list (`HIER-1/2/3`).

Neither depends on any windowing or rendering; both are feature-free and
tested on the editor/document plane (`tests/hier_contracts.rs` and the
`bind` coverage in the paint/effect/stroke contract suites).

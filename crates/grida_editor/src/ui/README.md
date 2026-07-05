# `ui` — the editor's dev-only widget layer

This module is the editor's own minimal widget system: it builds the
right-side properties strip, the left hierarchy, the top toolbar, the
context menu, and the popovers (select, color picker) that the shell
paints over the canvas.

Read this before you extend it, because the one thing newcomers assume
about it is wrong: **this is not a general-purpose UI toolkit, and it
is not on a path to becoming one.** It is a deliberately small,
dev-only layer with two jobs, and it does exactly those two jobs.

The *why* and the aspirational framing live in this crate's binding
specs — [`ui.md`](../../docs/ui.md), [`widgets.md`](../../docs/widgets.md),
[`harness.md`](../../docs/harness.md). This README is
the honest counterweight: what the code actually is today, and the size
of the gap between it and a real widget system.

## What it is for

1. **Host the editor's panels.** The editor needs settings UI and the
   engine has none. This layer supplies it, cheaply, on the same
   surface as the canvas.
2. **Be an adversarial test of the engine's node schema.** Every widget
   is a question put to `crates/grida`: *can the schema express a
   settings row? a scroll region? a color picker?* The panels are the
   cheapest place to find out. Much of this module's value is the
   evidence it accumulates about what the schema can and cannot express
   — not the widget code itself.

Widget *looks* are explicitly out of scope. Crude is fine. The bar is
"correct, headlessly testable, and honest about engine capability," not
"pretty."

## The charter

The engine already ships the hard parts — layout, text shaping,
painting, hit geometry, and a full text-edit subsystem. This layer adds
**only** the five things the engine genuinely lacks:

- **identity** — a stable key per widget instance (`WidgetId`);
- **retained state** — per-identity state that survives rebuilds
  (`WidgetState`);
- **focus** — one focused widget, a tab ring, keyboard routing;
- **scrolling** — clipped scroll viewports and wheel routing;
- **binding** — the preview/commit value contract linking a widget to a
  document property.

If you find this module reimplementing layout, text, or painting,
something has gone wrong — that work belongs to the engine.

## How it works (the shape, honestly)

- **UI-as-engine-nodes.** A widget's `build()` appends *plain* engine
  nodes (`Container` / `TextSpan` / `Rectangle`). There are no widget
  node kinds. A button is a container with a text span. The engine lays
  them out and paints them; the shell paints the UI scene with the
  identical `Painter` path canvas content uses, on the same surface.
- **Rebuild, don't react.** There is no diff, no observer graph, no
  subscriptions. On any change the panel throws away widget configs and
  rebuilds them; the engine's layout re-run *is* the diff. See
  [`mod.rs`](mod.rs) `rebuild_all` / `rebuild_widget`.
- **Config is stateless; state is retained by identity.** A `Widget`
  ([`widget.rs`](widget.rs)) is a throwaway description. Its memory
  lives in `UiLayer.states`, keyed by a stable `WidgetId`, and survives
  every rebuild. `build()` is pure; `handle()` mutates the retained
  state and returns opaque `Emission`s.
- **Headless-assertable.** Everything except paint is feature-free.
  Tests drive the same normalized event vocabulary as the canvas and
  assert on the UI scene tree and engine-computed geometry — the
  scene-state plane of [`harness.md`](../../docs/harness.md).
  Pixels are a last resort (shell-gated raster probes).

## What it is deliberately NOT — and the redesign gap

A real, general-purpose widget system is a different artifact. Getting
there is a **ground-up redesign of both this layer and the engine's
core** — not an extension of this code. Being honest about that is the
point of this file.

### This layer would be rebuilt, not extended

- **`WidgetState` is a closed enum.** Every widget adds a variant. This
  is intentional ("dumbness doctrine" — no `Any` bags, no reactive
  cells) and it is a hard wall against an open ecosystem of widgets.
- **Emissions don't bubble.** The layer routes each hit to the one
  owning widget; `handle()` only ever sees its own hit. So a
  value-combining composite (the quad, the color picker) cannot be
  assembled from independent child widgets — it must be **monolithic
  with hand-rolled internal sub-region hit-testing**. A real system
  needs event propagation and composition. This is the single most
  surprising constraint here.
- **Identity is a hand-managed `String`,** cloned on every dispatch and
  rebuild. Fine for dozens of widgets; allocation-heavy and error-prone
  (stable ids assigned by hand) at scale. A real system needs
  structural/automatic identity.
- **No theming.** Colors, sizes, radii are hardcoded per widget (e.g.
  the popover panel fill is a literal RGBA). No tokens, no dark mode, no
  density, no DPI story beyond logical px.
- **No hover, no animation, no drag-and-drop as a first-class concept,
  no accessibility/semantics tree.** The event vocabulary is
  down/move/up + key. That is all.

### The engine core (`crates/grida`) would also have to change

This is the part newcomers miss. The limits are not all in this
module — several are in the engine, which this layer only borrows:

- **Layout is whole-scene and canvas-oriented.** `reflow` runs the
  engine's full layout + geometry pass over the *entire* UI scene on
  every rebuild — even the "granular" `rebuild_widget` path re-lays-out
  the whole scene. There is no incremental layout invalidation. A
  widget system at app scale needs partial/incremental layout, which
  does not exist at the engine level.
- **The layout model is a design-tool model,** not a UI one. From this
  layer's vantage there is no robust flex-wrap / grid / constraint /
  intrinsic-sizing / baseline story that a widget toolkit assumes. This
  is a direct cause of the widgets being crude and some compositions
  being awkward.
- **No in-tree stacking / overlay model.** The painter flattens each
  top-level scene root independently, so every floating surface (menu,
  popover, picker) must be its *own* scene root placed in world
  coordinates by hand — see [`popover.rs`](popover.rs). A real UI needs
  stacking contexts / portals / z-layering within one tree.
- **Input is the canvas surface vocabulary.** No hover/enter/leave, no
  per-widget IME routing, no gesture recognizers, no accessibility
  events. This layer bolts focus + a tab ring + pointer capture on top;
  the rest is absent at the engine level.

**Bottom line:** this is a faithful, minimal, well-sealed scaffold that
does its two jobs well. It is not a foundation you grow into a product
UI toolkit. Treat any "let's make this the real widget system" impulse
as a new project that redesigns the engine's layout, overlay, and input
core as much as it redesigns this module.

## The one invariant worth protecting

Even though a real toolkit would be a rewrite, one cheap discipline
keeps that future *reachable* instead of foreclosed: **the widget
kernel must never learn an editor concept.**

- **Kernel** (document-blind, the reusable half): `widget.rs`,
  `mod.rs`, `field.rs`, `focus.rs`, `scroll.rs`, `popover.rs`, and the
  atoms under `widgets/`. A `Widget` emits an *opaque* `Emission`; it
  has never heard of a node, a fill, or a property.
- **Policy** (editor-specific): `properties.rs`, `hierarchy.rs`,
  `toolbar.rs`, `menu.rs`, and `bind.rs`'s `BindingProperty` /
  `BindingValue` vocabulary — pure editor semantics.

Keep `Emission` opaque to the widget. The moment a kernel type
references `PropPatch`, `BindingProperty`, or a document type, the
kernel/policy seam is gone. That seam — not the code — is the asset a
future widget system would inherit.

## File map

| file | role |
| --- | --- |
| `mod.rs` | `UiLayer` — owns the UI scene, caches, layout, registry, focus, capture; input routing; the rebuild engine. |
| `widget.rs` | the `Widget` trait, `WidgetState`, `UiResponse`, `BuildCtx`. |
| `bind.rs` | the binding vocabulary (`BindingProperty` / `BindingValue`) and `apply` — **policy**, editor-specific. |
| `field.rs` | `Field<T>` — the value / mixed / empty display model. |
| `focus.rs`, `scroll.rs` | focus ring; scroll viewport state + wheel routing. |
| `popover.rs` | the one anchored-overlay primitive (placement, panel shell, dismissal). |
| `menu.rs`, `properties.rs`, `hierarchy.rs`, `toolbar.rs` | the editor's panels — **policy**. |
| `widgets/` | the atoms and composites (button, toggle, slider, number, text, select, segmented, swatch, color picker, quad, list section, tree, …). |

## Testing

Two planes, per [`harness.md`](../../docs/harness.md):
contract tests assert on scene-state and document-state (the strong
plane, feature-free); raster probes are shell-gated and reserved for
genuinely visual claims. A contract without a test is unverified;
amending a contract amends its tests in the same change.

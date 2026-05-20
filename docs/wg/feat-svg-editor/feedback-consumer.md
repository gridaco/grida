# SDK-user feedback — `@grida/svg-editor`

Notes accumulated while building the `/svg` and `/svg/examples/slides`
demo pages against `@grida/svg-editor`. Each item is a real friction point
the demo had to work around, written from the consumer's perspective. They
are organized by which file in the demo first surfaces the issue, so back-
references from `// see FEEDBACK.md §N` comments resolve.

## §1. `node_paint` / `node_properties` reference stability

**Where this shows up:** `_components/inspector-panel.tsx` —
`useNodePaint`, `useNodeProperty`.

The package guarantees that `editor.node_paint(id, channel)` and
`editor.node_properties(id, [name])` return reference-stable snapshots
across no-op emits (same id, same channel, no underlying mutation →
same object reference). `useSyncExternalStore` short-circuits on
`Object.is` with no userland diffing.

This guarantee is load-bearing: an earlier iteration of the inspector
diffed snapshots structurally because the docs didn't explicitly call
out the stability, and the diffing was wasted work. **Suggestion:**
mention the ref-stability invariant explicitly in README §Observation —
properties / paint, so the next consumer reaches for `useSyncExternalStore`
straight away instead of building a diff layer.

## §2. Editor emit channels are not interchangeable for inspector reads

**Where this shows up:** `_components/inspector-panel.tsx` — `useNodeBounds`
in `GeometrySection`'s read-only branch.

The editor has multiple subscription channels and they are _not_
interchangeable:

- `editor.subscribe(cb)` — main channel; fires on every state-bumping
  emission (including per-pointermove translate writes during a drag).
- `editor.subscribe_geometry(cb)` — fires on `geometry_version` bumps
  only (drag, resize, text edit, structural insert/remove). Skips
  presentation-only writes (fill, opacity, stroke-color).
- `editor.subscribe_surface_hover(cb)` — HUD effective hover channel;
  does not bump `state.version`.
- `editor.defs.gradients.subscribe(cb)` — defs registry.
- `editor.state.structure_version` — used by the `useTree` snapshot to
  cache through gesture-rate emissions.

Picking the wrong channel either misses updates (read bounds off the
main channel; a fill-color tween would skip bbox updates that don't
exist — fine — but reading bounds off `subscribe_geometry` only is the
correct choice today) or over-renders (drive the layers tree off
`subscribe` and it re-renders 60×/sec during a drag).

The README documents the channels individually, but a worked example
showing "which channel for which inspector use case" would save
consumers from re-deriving the mapping. The demo's `GeometrySection`
read-only branch is now that example, in the host. **Suggestion:**
promote a "channels cheat-sheet" to README's React Patterns section.

## §3. Stabilize `subscribe`/`get` for `useSyncExternalStore`

**Where this shows up:** `_components/use-surface-hover.ts`,
`_components/inspector-panel.tsx` — every `useNode*` hook in the demo.

React's `useSyncExternalStore` calls `subscribe` whenever its identity
changes between renders. Inline lambdas (`(cb) => editor.subscribe(cb)`)
create a fresh function every render, so the store unsubscribes and
resubscribes on every parent re-render. With a per-frame parent
(any ancestor reading `state.version`), that's two map-mutations per
frame for no reason.

Wrapping `subscribe` and `get` in `useCallback` keyed on `editor` (and
the per-hook ids/channels) keeps identities stable across renders. The
demo does this uniformly — it's mechanical, but easy to forget. The
package can't enforce it from inside; the only mitigation is calling
out the pattern in README §Pattern B and/or shipping at least one
fully-formed example consumers can copy verbatim.

The same applies to the **read** side: `editor.node_paint`,
`node_properties`, `defs.gradients.list()` are all reference-stable
across no-op emits (see §1), but the _callback that calls them_ must
also be stable or React diffs the `get` identity and re-reads anyway.

## §4. Per-element geometry primitives leak across the package boundary

**Where this shows up:** `_components/inspector-panel.tsx` —
`GEOMETRY_PROPS` table in `GeometrySection`.

To render editable X/Y/W/H fields, the host has to hard-code the
SVG-attribute table per tag: rect/image/use → `(x, y, width, height)`,
circle → `(cx, cy, r)`, ellipse → `(cx, cy, rx, ry)`, line →
`(x1, y1, x2, y2)`. This is _per-element edit semantics_ leaking into
the host, which README §P3 explicitly designates as **internal
architecture, not extension points** ("The SVG spec is the registry;
we implement against it"). The package's own
[`core/intents.ts:240`](../../../../packages/grida-svg-editor/src/core/intents.ts)
already names this table as the `ResizeAttrs` discriminated union —
it just isn't exported.

Three related shortcomings, in increasing order of design weight:

### 4.1. Export `ResizeAttrs` (or a typed `node_kind(id)` accessor).

The type already exists and is the closed registry the host wants.
A `editor.node_kind(id): ResizeAttrs["kind"]` accessor (or even
`editor.node_geometry_primitives(id): { kind, attrs }`) would
collapse the host-side `GEOMETRY_PROPS` table to a `switch`. Zero
design work, modest API addition. The `kind: "unsupported"` arm
naturally handles g/text/path/poly — exactly the same partition
the demo settled on for the read-only bbox branch.

### 4.2. No `editor.commands.resize_to(id, target: Rect)`.

The current public API can set X/Y/W/H only for tags whose attributes
literally happen to be named `x/y/width/height`. For path / text / g
/ poly / circle (where "width" means `r * 2`?), the host has no
unified way to write a target rect — even though
[`apply_resize` in `core/intents.ts`](../../../../packages/grida-svg-editor/src/core/intents.ts)
already knows how to realize a target rect for every resizable tag.

The shape we want is _not_ a flat `set_bounds({x?, y?, w?, h?})` —
TODO §2 explicitly entertains three semantic interpretations of resize
(transform / surgery / restrict), and a flat setter would force one
answer at the host call site. The right shape is
`editor.commands.resize_to(id, target: Rect)` routed through the
existing `apply_resize` + `capture_resize_baseline` machinery, so
the per-tag policy stays in one place and improves once for every
caller.

### 4.3. Inspector bbox is a recipe, not a hook.

`editor.geometry?.bounds_of(id)` + `subscribe_geometry` is exactly
the right shape for "read the rect the user sees on the rulers."
The demo wrapped them in a 5-line `useNodeBounds` recipe. Per README
§Pattern B + §P6, we are _not_ asking for the package to ship that
hook — the no-shipped-hooks stance is deliberate ("≥2 internal
consumers and a stable contract"). Treat this as a docs gap, not an
API gap: add `useNodeBounds` as a worked example to README's React
patterns section, next to `useNodePaint` and `useGradients`. Then
the next consumer doesn't have to walk the geometry-channel docs to
discover they exist.

---

When 4.1 and 4.2 both land, the host-side `GeometrySection` collapses
to: one read of `node_kind(id)`, a switch over the closed enum, and
either rows of `SubscribedPropertyRow` (typed attribute write) or a
single bbox-edit row routed through `resize_to`. No `GEOMETRY_PROPS`
table on the consumer side.

## §5. Surface container is exclusively owned (silent click breakage)

**Where this shows up:** `slides/page.tsx` — `SlideStage` originally
rendered `<SvgToolbar />` inside the `<div ref={container_ref}>` that
was handed to `keynote.attach(editor, { container })`. Keybindings
switched tools fine; toolbar clicks did nothing.

**Root cause (package-side):** the DOM surface installs `pointerdown`
on the host-provided container and (before the §5 fix) called
`container.setPointerCapture(e.pointerId)` on every primary
pointerdown. When chrome lives inside the container, capture redirects
the subsequent `pointerup` to the container — so the button's `click`
is never synthesized and `onValueChange` never fires.

**Symptom is silent.** No console error, no React warning, no visual
clue. `elementFromPoint` returns the button. The natural first guess
is "the click handler is broken" — but the real cause is 5 layers
deep in `dispatch_pointer`. Easily an hour of debugging for someone
not already familiar with the surface internals.

**Two attach paths in this repo have different ergonomics.**
`SvgEditorCanvas` (the React wrapper) creates its own internal div
and forwards refs, so the consumer can't accidentally put chrome
inside the surface container. `keynote.attach(editor, { container })`
takes a consumer-owned div directly — that's the foot-shootable path,
and the exact path the slides demo uses for the cover-constraint
preset.

**Fix on the consumer side:** hoist `<SvgToolbar />` out of
`container_ref` so it becomes a sibling of the canvas, matching the
pattern `/svg/page.tsx` already follows. The repaired
`SlideStage` returns a fragment with the container div, the toolbar,
and the drag overlay as three siblings of `<main class="relative">`.

**Suggestion (package):** the §Surface paragraph in README now names
the "exclusively owned" rule and the symptom, and the surface emits
a one-shot dev `console.warn` if the container is non-empty at attach
time. Capture is also no longer unconditional — it fires only when
the HUD's gesture state actually leaves `idle`. With those landed,
the consumer mistake becomes "loud warning + still mostly works"
instead of "silent + completely broken."

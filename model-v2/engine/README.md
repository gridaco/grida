# anchor-engine — the phase-4 canvas engine skeleton

The pipeline the `crates/grida` migration will read: `document → resolve →
drawlist → paint`, plus the read tier (`query`), time-as-data
(`journal`/`replay`), and the sockets every future optimization plugs into
(`damage`, `ident`, `oracle`). It consumes [`anchor-lab`](../a/lab) as a
library — the same relationship the migration will have with the model crate.
The contracts it encodes are catalogued in [`../a/ENGINE.md`](../a/ENGINE.md)
(ENG-0…ENG-5, S-1…S-7); each module names the contract it serves.

This is a **day-1 skeleton**: every contract has a code socket and a guarding
test, and the spike ([`../a/spike-canvas`](../a/spike-canvas)) is **re-hosted**
onto it — painting, hit-testing, gestures, and damage all flow through the
engine. Growth (incremental resolve, tiles, a broadphase index, a real shaper)
is deferred to named studies; the sockets are here so that growth is additive.

## Run

```sh
# the engine's own tests (drawlist, query, journal, replay, damage, ident)
cd model-v2/engine && cargo test

# the trace arm must keep compiling
cargo check --features trace

# the legacy re-host gate: replay determinism, differential/cache checks,
# benchmark budgets, and the pre-Draft-0 screenshot oracle
# (needs the spike built first — it owns the legacy golden pixels)
(cd ../a/spike-canvas && cargo build --release)
cargo run --release --bin gate
```

## Draft 0 `.grida.xml` ingestion

This engine consumes the Draft 0 proof through the model crate's public,
pure `anchor_lab::grida_xml::parse(&str)` boundary. There is deliberately no
XML-specific engine API: a host reads the file once, parses it into the same
`Document` value used everywhere else, then passes that value to
`frame::render`. The engine library performs no path I/O and never reparses a
document in the frame loop.

The source boundary materializes the Draft 0 XML-facing property registry:
versioned envelope, direct node taxonomy, responsive bindings and constraints,
free/flex layout, nested primitive-local children, canonical compact and
structured fills, all existing gradient variants, RID-backed image paints,
per-paint visibility/opacity/blend modes, and repeatable authored strokes whose
independent geometries each own ordered `Paints`. Their width projects the
production `StrokeWidth` union: one uniform value or four concrete
top/right/bottom/left values on containers and rectangles. Containers and
rectangles also carry the production-shaped per-corner elliptical radius
record and normalized corner smoothing. Text uses canonical `font-size` plus
flat direct-child `tspan` runs. Those runs materialize as complete UTF-8 byte
ranges with numeric weight, normal/italic style, and optional ordered
`Paints` overrides; omission still means node-fill fallback.

The drawlist and painter execute the same topology: node fill, clipped children,
then repeated parent strokes. Lines have no fill or implicit ink; containers
receive no invented border. Stroke alignment, caps, joins, miter limits,
dashes, rich gradient/image paints, conservative visual bounds, subtree
opacity, and descendant-only container clips all remain explicit model and
display-list state. Per-side box strokes materialize as independently
normalized outer-minus-inner rounded rings; overconsumed inner extents
saturate instead of inverting, and dashed rings keep one continuous contour
phase. Each edge contributes its own conservative visual outset. A rounded or
smoothed container/rectangle projects one shared outline into fill coverage,
descendant clipping, and every repeated stroke while non-solid paint
coordinates retain the full rectangular paint box. Degenerate paint-box axes
use Draft 0's centered one-pixel coordinate fallback. Text measurement and
the drawlist share one run-aware line topology: fragments retain font size,
weight, style, x advance, and effective paints, while every run paint uses the
resolved full text-node box. Variable fonts receive the authored `wght` axis;
single-face hosts use documented synthetic fallbacks only when needed.

This remains a proving engine rather than a claim that every future RFD area is
complete. Current limits are:

- resolution and paint share explicit-line and constrained-wrap topology, but
  the lab still measures with its deterministic `0.6/1.2` metric while Skia
  paints a host typeface; a real shared shaper and glyph-ink bounds remain an
  engine promotion task;
- derived group/lens flex-slot growth still needs an explicit
  slot-versus-geometry model rule;
- image-paint free transforms, tiling, filters, and quarter-turns are outside
  Draft 0 XML; component reuse and durable source identity remain future work;
- the production smooth-corner construction is circular-only; Draft 0 rejects
  smoothed elliptical radii rather than silently changing their authored
  geometry, and defines production's per-corner half-short-side cap separately
  from ordinary rounded-box overlap normalization;
- production's per-side ring path has no corner-smoothing input and does not
  honor non-miter join state; Draft 0 therefore rejects nonuniform widths with
  nonzero smoothing or nondefault join/miter geometry instead of silently
  dropping authored intent;
- `PaintCtx` is an already-resolved executor cache: the low-level infallible
  painter emits no pixels for an unregistered image RID. A host claiming strict
  materialization must preflight resources; `grida_xml_render` does so and
  reports authored plus resolved locations;
- the lab's ordered `Vec<Stroke>` implements the accepted extension, while the
  production scene/archive model still has one stroke geometry per node.

Checked-in files use the canonical grammar. The minimal consumer fixture and
pixel probes live at `rig/fixtures/nested-rects.grida.xml` and
`tests/grida_xml.rs`. `rig/examples/dynamic-slide.grida.xml` demonstrates flex,
a direct ellipse used as a circle, and primitive/text composition.
`rig/examples/rich-fills.grida.xml` demonstrates ordered paint stacks, while
`rig/examples/rich-strokes.grida.xml` demonstrates independent repeated stroke
geometry. `rig/examples/source-becomes-surface.grida.xml` is the complete
editorial showcase: every Draft 0 element and property family, all four
gradient variants, image paints, clipping, responsive bindings, and native
multi-stroke composition in one scene.
`rig/examples/rounded-surfaces.grida.xml` concentrates the rounded-box slice:
asymmetric circular corners, elliptical axes, continuous smoothing, clipped
descendants, rich fills, and repeated strokes.
`rig/examples/per-side-strokes.grida.xml` demonstrates asymmetric and zero
side widths, ordinary elliptical corners, continuous dashes, repeated rings,
and rich paints without duplicating scene geometry.
`rig/examples/rich-text.grida.xml` is the attributed-text specimen: mixed
sizes, weights, italic style, solid and gradient run fills, exact whitespace,
and derived UTF-8 ranges in one inspectable string.

The thin host binary renders a file to PNG. It defaults to a 1280x720 viewport;
pass explicit positive dimensions for responsive inputs:

```sh
cargo run --bin grida_xml_render -- \
  rig/examples/dynamic-slide.grida.xml target/grida-xml-dynamic-slide.png

cargo run --bin grida_xml_render -- \
  rig/examples/rich-fills.grida.xml target/grida-xml-rich-fills.png 720 300

cargo run --bin grida_xml_render -- \
  rig/examples/rich-strokes.grida.xml target/grida-xml-rich-strokes.png 720 320

cargo run --bin grida_xml_render -- \
  rig/examples/source-becomes-surface.grida.xml \
  target/grida-xml-source-becomes-surface.png 1600 1000

cargo run --bin grida_xml_render -- \
  rig/examples/rounded-surfaces.grida.xml \
  target/grida-xml-rounded-surfaces.png 1440 900

cargo run --bin grida_xml_render -- \
  rig/examples/per-side-strokes.grida.xml \
  target/grida-xml-per-side-strokes.png 1200 760

cargo run --bin grida_xml_render -- \
  rig/examples/rich-text.grida.xml \
  target/grida-xml-rich-text.png 1280 800

cargo run --bin grida_xml_render -- \
  rig/fixtures/nested-rects.grida.xml target/grida-xml-nested-rects.png 96 80
```

The CLI owns filesystem access, resource bases, image decoding, a
platform-default typeface, the white raster background, and PNG encoding.
Relative image RIDs resolve against the input file's directory and every
visible image referenced by a node fill, run fill, or stroke is decoded before
the first frame; missing or invalid resources fail with both authored and
resolved locations. The host calls
`grida_xml::parse` exactly once and renders through `frame::render`. It refuses
resolver error/ignored reports instead of writing a fallback image; replay
remains on its existing wire contract.

How the engine proves it is _fast_ (the four measurement axes — automated work
& correctness, the auxiliary human-in-the-loop feel channel, and the
software-unmeasurable input→photon limit) is its own doctrine:
[`MEASURE.md`](./MEASURE.md).

How the engine _stores_ its data — each memory/data-layout detail decided
against verified browser prior art (`cc`/Blink/Stylo/Skia), validity-tagged
ALIGNED / ADOPTED / SOCKET — is [`DATA-MODEL.md`](./DATA-MODEL.md).

How explicit sample time and animated values could enter this pipeline without
mutating authored state is the open engine RFD: [`ANIMATION.md`](./ANIMATION.md).

## Contract → module → guarding test

| concern                              | module           | contract      | guarding test                                                                                                                    |
| ------------------------------------ | ---------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| stage purity + the oracle law        | (whole pipeline) | ENG-0         | the gate's differential + determinism runs                                                                                       |
| Draft 0 source consumer seam         | parse → frame    | ENG-0 / S-2   | `tests/grida_xml.rs`, `tests/paints.rs`, `tests/strokes.rs`, `tests/rectangular_strokes.rs`, `tests/text.rs`, `tests/corners.rs` |
| drawlist (pure, diffable projection) | `drawlist.rs`    | ENG-2.1       | `tests/drawlist.rs` (order · pruning · color · verbatim world · determinism)                                                     |
| paint executor (only skia module)    | `paint.rs`       | ENG-2.1       | `tests/paints.rs`, `tests/strokes.rs`, `tests/rectangular_strokes.rs`, `tests/text.rs`, `tests/corners.rs` (pixel probes)        |
| one frame entry                      | `frame.rs`       | ENG-2.4       | spike live loop + gate                                                                                                           |
| damage as data                       | `damage.rs`      | ENG-2.2       | `tests/damage.rs` (identity empty · single-op locality)                                                                          |
| spatial read tier                    | `query.rs`       | ENG-3         | `tests/query.rs` (`hit_point ≡ pick` over a grid)                                                                                |
| journal (op-log)                     | `journal.rs`     | ENG-5.1       | `tests/journal.rs`                                                                                                               |
| replay (corpus, determinism)         | `replay.rs`      | ENG-5.2/5.3   | `tests/replay.rs` + `rig/corpus/*.replay` via the gate                                                                           |
| cache identity                       | `ident.rs`       | ENG-2.3/1.4   | `tests/ident.rs` (generation-stamped key)                                                                                        |
| oracle version tags                  | `oracle.rs`      | ENG-4.2       | the `.replay` header                                                                                                             |
| gated observability                  | `trace.rs`       | S-6           | `cargo check --features trace`                                                                                                   |
| the rig                              | `bin/gate.rs`    | ENG-0.2 / S-5 | it _is_ the gate                                                                                                                 |

The model-crate side of the setup lives in [`../a/lab`](../a/lab): the typed
`Op` + `apply` dispatcher + `DirtyClass` (`ops.rs`), the per-slot `generations`
column (`model.rs`), the non-panicking `Resolved` opt accessors (`resolve.rs`),
and the optional `serde` feature (the op-log wire) — each additive, with the
full lab suite green throughout.

## The re-host, concretely

The spike's scene painter is deleted; it calls `drawlist::build` +
`paint::execute`. Pick/hover go through `query`. All gesture ops go through
`apply` and are recorded in the `journal` (undo stays document snapshots —
ENG-5.5). `--record` writes `.replay` corpus files; the panel shows the
per-frame damage count.

The gate's replay, differential/cache, and benchmark sections remain green.
Its four legacy screenshots currently report the deliberate Draft 0 semantic
delta: frames no longer receive invented ink, and authored parent strokes paint
after children. Those pre-change goldens have not been blessed or silently
rewritten; they need an explicit oracle rebaseline after the new painter order
is accepted for the spike corpus.

## Scope fence (named, not silent)

Skia stays the rasterizer (the engine is the architecture _above_ it). Not an
ECS — the arena/SOA is a storage layout, not a component model. Deferred to
studies, each behind a socket that is already here: incremental resolve
(OS-1a/1b — `DirtyClass` exists, the engine ignores it and full-resolves) ·
tiles / partial repaint (OS-2a — damage is data only) · layer promotion (OS-2b
— re-measure the legacy finding) · broadphase BVH (OS-3a/3b — behind `query`)
· real shaper (OS-4a / DEC-4) · pathops-in-measure (OS-4b / DEC-6) · CRDT /
cross-session replay (OS-5b/5c — walled on stable ids, a.md §12).

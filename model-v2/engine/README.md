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
engine. Growth (incremental resolve, tiles, a broadphase index, and a pinned
production text oracle) is deferred to named studies; the sockets are here so
that growth is additive.

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

## Versioned `.grida.xml` ingestion

There is deliberately no XML-specific engine API. Draft 0 still has the
model crate's pure `anchor_lab::grida_xml::parse(&str)` boundary. The retained
source-program boundary additionally parses and links Version 1/2/3 source
units, specializes Version 2/3 scalar props, projects Version 3 named render
slots, and materializes the same ordinary `Document` used everywhere else. A
host supplies immutable source snapshots, then passes only that concrete
document to `frame::render`. The engine library performs no filesystem I/O and
never reparses a document in the frame loop.

The local-file host resolves component dependencies from each containing
source's canonical base, retains node/use/specialization/slot-projection
provenance, and preflights an origin-aware resource manifest. Equal relative
image strings from different source units receive different runtime keys
without changing the node, layout, paint, or renderer model.

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

`path` uses the complete SVG path-data grammar in a fixed unit reference box
and retains `nonzero` or `evenodd` fill identity. Resolution maps its analyzed
command stream into the final declared box exactly once. Tight bounds, damage,
drawlist fills, and every repeated stroke share that box-mapped artifact;
gradients and image paints still use the full declared paint box. Path children
remain ordinary box-local content between the parent fill and strokes.

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
use Draft 0's centered one-pixel coordinate fallback. With a host font,
resolution uses Skia Paragraph to produce one immutable `Arc<TextLayout>` after
the text node's final width is known. That artifact records its oracle and
environment, input width constraint, final assigned box, line-break kinds,
UTF-8 cluster starts, semantic font identities, glyph IDs and positions, and
logical and ink bounds. Empty source owns one terminal line with default-font
metrics but no invented source or ink. The drawlist shares the same `Arc` with
the fill and every stroke and owns the exact per-resolution fonts behind the
artifact's local replay keys; paint never reshapes or reconstructs them. Text
world bounds start from glyph ink, and damage compares the complete text
artifact even when its box is unchanged. Every run paint still uses the
resolved full text-node box. Variable fonts receive the authored `wght` axis;
single-face hosts use documented synthetic fallbacks only when needed.

This remains a proving engine rather than a claim that every future RFD area is
complete. Current limits are:

- the host-font path is a Skia Paragraph bridge, not the deterministic oracle
  still open in DEC-4: its font environment identity is process-local, its
  constraint input is width-only, font fallback is deliberately disabled, and
  paragraph direction is fixed to LTR. Unresolved glyphs produce an explicit
  resolver report, but this proving resolver still returns the diagnostic
  artifact rather than the RFD's final typed-failure API. Complete bidi,
  source/cluster/caret mapping, paragraph controls, and cross-platform identity
  remain open. Fontless probes explicitly use `stub@lab-0`; it emits line
  metrics but no glyph runs or text pixels;
- derived group/lens flex-slot growth still needs an explicit
  slot-versus-geometry model rule;
- image-paint free transforms, tiling, filters, and quarter-turns are outside
  Draft 0 XML; default/fallback/required slot policies, durable
  instance/member identity, full-library validation, and canonical multi-file
  writing remain future work;
- the production smooth-corner construction is circular-only; Draft 0 rejects
  smoothed elliptical radii rather than silently changing their authored
  geometry, and defines production's per-corner half-short-side cap separately
  from ordinary rounded-box overlap normalization;
- production's per-side ring path has no corner-smoothing input and does not
  honor non-miter join state; Draft 0 therefore rejects nonuniform widths with
  nonzero smoothing or nondefault join/miter geometry instead of silently
  dropping authored intent;
- `PaintCtx` is the host resource environment for text resolution and image
  paint. The low-level infallible painter emits no pixels for an unregistered
  image RID. A host claiming strict materialization must preflight resources;
  `grida_xml_render` does so and reports authored plus resolved locations;
- the lab's ordered `Vec<Stroke>` implements the accepted extension, while the
  production scene/archive model still has one stroke geometry per node.
- production scene/archive path contracts still expose incompatible raw and
  canonical box-mapped forms, do not uniformly preserve fill rule, and do not
  yet round-trip this Draft 0 path contract.

Checked-in Draft 0 files use the canonical grammar; Version 1–3 fixtures use
the selected proving grammar of their open RFDs. The minimal consumer fixture
and pixel probes live at `rig/fixtures/nested-rects.grida.xml` and
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
`rig/fixtures/unit-path.grida.xml` is the focused path oracle: an even-odd unit
path with ordered fills and repeated strokes. The complete editorial showcase
also includes a nested, rich-painted path specimen.
`rig/fixtures/component-program/entry.grida.xml` and its sibling component
library are the focused Version 2 source-program oracle: one external boxed
component, two independently specialized uses, ordinary-scene lowering, and
component-blind pixel output.
`rig/fixtures/slot-program/entry.grida.xml` and its sibling Version 3 component
library are the focused named-slot oracle: definition-owned header/footer
order, caller-owned projected roots, one empty projection, ordinary-scene
lowering, and component-blind interior pixel probes.
`rig/examples/social-feed/entry.grida.xml` and `post-card.grida.xml` form the
real-world Version 3 showcase: one viewport-spanning, breakpoint-free scene
uses center/end/span bindings for its rail, stories, timeline, suggestions,
and message dock. Reusable stories and suggestions plus two post instances
share one complete fixed-size social-post shell while caller-owned media trees
project original checked-in image paints through the same named slot. Compact
viewports therefore demonstrate continuous anchor response and honest clipping,
not an unimplemented breakpoint system.

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

cargo run --bin grida_xml_render -- \
  rig/fixtures/unit-path.grida.xml target/grida-xml-unit-path.png 96 80

cargo run --bin grida_xml_render -- \
  rig/fixtures/component-program/entry.grida.xml \
  target/grida-xml-component-program.png 96 40

cargo run --bin grida_xml_render -- \
  rig/fixtures/slot-program/entry.grida.xml \
  target/grida-xml-slot-program.png 112 48

cargo run --bin grida_xml_render -- \
  rig/examples/social-feed/entry.grida.xml \
  target/grida-xml-social-feed-desktop.png 1920 1080

# Diagnostic viewport sweep (these renders are not reftest or golden oracles).
mkdir -p target/social-feed-responsive
for size in 1920x1080 1440x900 1280x800 1024x768 768x1024 390x844; do
  width=${size%x*}
  height=${size#*x}
  cargo run --quiet --bin grida_xml_render -- \
    rig/examples/social-feed/entry.grida.xml \
    "target/social-feed-responsive/social-feed@${size}.png" \
    "$width" "$height"
done
```

The CLI owns filesystem access, resource bases, image decoding, a
platform-default typeface, the white raster background, and PNG encoding.
Relative component references and image RIDs resolve against the source unit
that authored them. Every visible image referenced by a node fill, run fill,
or stroke is decoded before the first frame; missing or invalid resources fail
with authored source and resolved location. The host materializes the source
program exactly once and renders its ordinary document through
`frame::render`. It refuses resolver error/ignored reports instead of writing
a fallback image; replay remains on its existing wire contract.

This proving binary is a trusted local-file host, not a sandbox. It follows
absolute paths and `..` segments supplied by the source. Locations are decoded
XML path strings rather than file URIs, so percent escapes are not decoded.
Any application or server host must supply its own capability root, symlink and
network policy, and byte/decode limits.

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

| concern                              | module           | contract      | guarding test                                                                                                                                                                                                                                 |
| ------------------------------------ | ---------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stage purity + the oracle law        | (whole pipeline) | ENG-0         | the gate's differential + determinism runs                                                                                                                                                                                                    |
| versioned source consumer seam       | link → frame     | ENG-0 / S-2   | `tests/grida_xml.rs`, `tests/grida_xml_source.rs`, `tests/grida_xml_slots.rs`, `tests/grida_xml_social_feed.rs`, `tests/paints.rs`, `tests/strokes.rs`, `tests/rectangular_strokes.rs`, `tests/text.rs`, `tests/corners.rs`, `tests/paths.rs` |
| drawlist (pure, diffable projection) | `drawlist.rs`    | ENG-2.1       | `tests/drawlist.rs` (order · pruning · color · verbatim world · determinism)                                                                                                                                                                  |
| text shaping + shared glyph layout   | `text_layout.rs` | ENG-4.1/4.5   | `../a/lab/tests/text_layout.rs`, `tests/text.rs`                                                                                                                                                                                              |
| raster executor                      | `paint.rs`       | ENG-2.1       | `tests/paints.rs`, `tests/strokes.rs`, `tests/rectangular_strokes.rs`, `tests/text.rs`, `tests/corners.rs`, `tests/paths.rs` (pixel probes)                                                                                                   |
| one frame entry                      | `frame.rs`       | ENG-2.4       | spike live loop + gate                                                                                                                                                                                                                        |
| damage as data                       | `damage.rs`      | ENG-2.2       | `tests/damage.rs` (identity empty · single-op locality)                                                                                                                                                                                       |
| spatial read tier                    | `query.rs`       | ENG-3         | `tests/query.rs` (`hit_point ≡ pick` over a grid)                                                                                                                                                                                             |
| journal (op-log)                     | `journal.rs`     | ENG-5.1       | `tests/journal.rs`                                                                                                                                                                                                                            |
| replay (corpus, determinism)         | `replay.rs`      | ENG-5.2/5.3   | `tests/replay.rs` + `rig/corpus/*.replay` via the gate                                                                                                                                                                                        |
| cache identity                       | `ident.rs`       | ENG-2.3/1.4   | `tests/ident.rs` (generation-stamped key)                                                                                                                                                                                                     |
| oracle version tags                  | `oracle.rs`      | ENG-4.2       | the `.replay` header                                                                                                                                                                                                                          |
| gated observability                  | `trace.rs`       | S-6           | `cargo check --features trace`                                                                                                                                                                                                                |
| the rig                              | `bin/gate.rs`    | ENG-0.2 / S-5 | it _is_ the gate                                                                                                                                                                                                                              |

The model-crate side of the setup lives in [`../a/lab`](../a/lab): the typed
`Op` + `apply` dispatcher + `DirtyClass` (`ops.rs`), the per-slot `generations`
column (`model.rs`), the non-panicking `Resolved` opt accessors (`resolve.rs`),
and the optional `serde` feature (the op-log wire) — each additive, with the
full lab suite green throughout.

## The re-host, concretely

The spike's scene painter is deleted; it calls `frame::resolve_and_build` +
`paint::execute`. The lower-level `drawlist::build_glyphless` entry is reserved
for deterministic lab and structural probes. Live pick, hover, handles, and
gestures resolve through the same host-font oracle as paint; spatial queries go
through `query`. All gesture ops go through `apply` and are recorded in the
`journal` (undo stays document snapshots — ENG-5.5). `--record` writes
`.replay` corpus files; the panel shows the per-frame damage count.

The gate's replay, differential/cache, and benchmark sections remain green.
Its four legacy screenshots currently report deliberate semantic deltas:
frames no longer receive invented ink, authored parent strokes paint after
children, and host-font text now uses shaped metrics and positioned-glyph
replay. Those pre-change goldens have not been blessed or silently rewritten;
they need an explicit oracle rebaseline after the new painter and text oracle
are accepted for the spike corpus.

## Scope fence (named, not silent)

Skia stays the rasterizer (the engine is the architecture _above_ it). Not an
ECS — the arena/SOA is a storage layout, not a component model. Deferred to
studies, each behind a socket that is already here: incremental resolve
(OS-1a/1b — `DirtyClass` exists, the engine ignores it and full-resolves) ·
tiles / partial repaint (OS-2a — damage is data only) · layer promotion (OS-2b
— re-measure the legacy finding) · broadphase BVH (OS-3a/3b — behind `query`)
· pinned text oracle and complete fallback/bidi/caret mapping (OS-4a / DEC-4) ·
pathops-in-measure (OS-4b / DEC-6) · CRDT / cross-session replay (OS-5b/5c —
walled on stable ids, a.md §12).

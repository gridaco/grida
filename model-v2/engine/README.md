# anchor-engine — the phase-4 canvas engine skeleton

The pipeline the `crates/grida` migration will read: `(document + immutable
effective values) → resolve → drawlist → paint`, plus the read tier
(`query`), time-as-data (`journal`/`replay`), and the sockets every future
optimization plugs into (`damage`, `ident`, `oracle`). It consumes
[`anchor-lab`](../a/lab) as a library — the same relationship the migration
will have with the model crate.
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

# the re-host gate: replay determinism, differential/cache checks,
# benchmark budgets, and the deterministic screenshot oracle
# (needs the spike built first — it owns the golden pixels)
(cd ../a/spike-canvas && cargo build --release)
cargo run --release --bin gate

# visual proof of the pre-animation effective-value seam
cargo run --bin effective_values_demo -- target/grida-effective-values-demo.png

# Profile 0 source through the latest cumulative renderer
cargo run --release --bin svg_animation_render -- \
  rig/examples/svg-animation-profile0-demo.svg \
  target/svg-animation-profile0 50 4000

# Profile 1 keyframes and easing (100 fps, 4.5 seconds)
cargo run --release --bin svg_animation_render -- \
  rig/examples/svg-animation-profile1-keyframes.svg \
  target/svg-animation-profile1-keyframes 100 4500

# Profile 2 replacement sandwich (50 fps, 6.5 seconds)
cargo run --release --bin svg_animation_render -- \
  rig/examples/svg-animation-profile2-replacement-sandwich.svg \
  target/svg-animation-profile2-replacement-sandwich 50 6500

# Profile 3 additive/accumulative motion mixer (2 fps, 7.5 seconds)
cargo run --release --bin svg_animation_render -- \
  rig/examples/svg-animation-profile3-motion-mixer.svg \
  target/svg-animation-profile3-motion-mixer 2 7500

# Profile 4 live-underlying effects and typed transforms (20 fps, 6 seconds)
cargo run --release --bin svg_animation_render -- \
  rig/examples/svg-animation-profile4-transform-showcase.svg \
  target/svg-animation-profile4-transform-showcase 20 6000

# Profile 5 solid-fill color effects (20 fps, 6 seconds)
cargo run --release --bin svg_animation_render -- \
  rig/examples/svg-animation-profile5-solid-fill-showcase.svg \
  target/svg-animation-profile5-solid-fill-showcase 20 6000

# Profile 6 smooth/discrete path geometry (20 fps, 6 seconds)
cargo run --release --bin svg_animation_render -- \
  rig/examples/svg-animation-profile6-path-morph-showcase.svg \
  target/svg-animation-profile6-path-morph-showcase 20 6000
```

## SVG Animation Profiles 0–6

The first animation reference path is implemented without adding animation
state to the document or painter. A retained SVG source compiles once into an
immutable, document-bound `AnimationProgram`; each explicit `SampleTime`
produces the existing validated `PropertyValues`, then joins the ordinary
resolve, draw-list, query, damage, cache, and checked-paint path. Base and
Sample are explicit `FrameRequest` variants. The cache keys sampled values,
not time.

The dated status matrix, dependency direction, and per-module responsibility
boundaries live in [`ANIMATION.md`](./ANIMATION.md). That document is the
implementation checkpoint; the WG profile pages remain source-language
contracts and intentionally do not describe this crate topology.

Profile 0 is the two-keyframe linear baseline. The cumulative Profile 1 adds
ordered `values`, exact rational `keyTimes`, and per-segment cubic Bézier
`keySplines`. They lower to one format-neutral scalar-curve primitive; the
engine has no SVG-shaped keyframe representation and no parallel endpoint
sampler. Exact keyframe and frozen boundaries preserve authored binary32 bits.
Cubic inversion is a pinned exact-rational operation, so direct seeks do not
depend on playback history or platform easing libraries.

The cumulative Profile 2 admits multiple replacement effects for one target.
The SVG frontend orders them by interval begin and then document order; the
format-neutral program stores target-grouped low-to-high-priority tracks and
samples only the highest active or frozen contributor. `remove` falls through,
`freeze` remains, and the authored base appears when no effect contributes.

Profile 3 adds independent effect and iteration composition. SVG
`additive="sum"` adds an effect over the lower sandwich; `accumulate="sum"`
adds the curve's terminal keyframe once per completed repeat before sandwich
composition. A replacement still cuts lower layers, while higher additions
remain. The kernel reads only compatible authored scalar bases, rounds each
ordered scalar operation once, fails non-finite geometry atomically, and clamps
opacity only after the complete sandwich. It still emits one ordinary
`PropertyValue` per target rather than introducing an animated value model.

Profile 4 expands that kernel with a closed typed effect sum. Scalar lone-`to`
interpolates from the live lower sandwich on every sample and is never a
replacement cutoff. Typed translate, scale, and rotate curves interpolate and
accumulate their parameters before projecting one sampled affine operation.
Transform replacement creates one ordered operation; addition appends to the
existing `LensOps` aggregate. The same effective property then feeds ordinary
resolve, query, damage, cache, and paint.

Profile 5 adds straight legacy-sRGB solid-fill color curves. It targets the
existing complete ordered `Fills: Paints` property: replacement emits one solid
paint, while additive and lone-`to` effects require a compatible singleton
solid lower value. RGBA channels remain exact and unbounded through easing,
repeat accumulation, and the full effect sandwich, then clamp and quantize once
to the existing RGBA8 `Color`. No renderer, draw-list, cache, or document paint
model is duplicated for animation.

Profile 6 adds complete `PathGeometry` replacement without a string mutation
channel or animation-only renderer. Compatible non-arc command topology lowers
to a typed `PathCurve`; explicit `calcMode="discrete"` selects arbitrary valid
path values including arcs; an incompatible non-arc `from`/`to` pair uses one
eased whole-value switch. Source command families remain distinct even after
render normalization (`H` is not `L`, `S` is not `C`, and `T` is not `Q`). The
sampled artifact passes through the existing path property, resolver, tight
bounds, damage, draw-list, cache, and raster path.

### Playback clock harness

`playback_clock` is a compact host-time adapter, not a product player. A
caller-owned `PlaybackClock` maps explicit monotonic `HostTime` values to the
same `SampleTime` accepted by `FrameRequest::Sample`. It uses one stable anchor,
an explicit closed range, exact rational rate, and separate direction; pause,
seek, rate changes, reverse playback, and terminal stopping are deterministic
under irregular frame cadence. Playing again at the active terminal is a
paused no-op rather than an implicit rewind or loop.

The module depends on no source format, animation program, document, frame,
Skia, callback, scheduler, or system clock. A host performs the only
composition:

```rust
let time = playback.sample_time(host_now)?;
let request = FrameRequest::Sample { program, time };
```

Looping, autoplay, UI, media synchronization, and continuous-redraw policy are
outside this harness. `tests/playback_clock.rs` tests its pure state machine;
`tests/animation.rs` proves that its output is identical to a direct seek
through resolved geometry, query, damage, pixels, and effective-value cache
identity.

The native spike supplies one deliberately disposable live host around that
boundary:

```sh
cd ../a/spike-canvas
cargo run --release -- \
  --play-svg ../../engine/rig/examples/svg-animation-profile6-path-morph-showcase.svg
```

Its separate `AnimationApp` owns `Instant`, redraw pacing, controls, resize,
GPU presentation, and terminal quiescence. These remain host policy rather
than an engine runtime abstraction. Because the proving stack has no
compositor yet, its redraw timer temporarily stands in for the display pacing
ENG-2.4 assigns to the eventual compositor; only explicit time mapping and
animation demand are migration-worthy.

The proving static SVG materializer is deliberately narrow: one SVG-namespace
root with positive unitless dimensions, direct rectangles or viewport-bounded
paths, solid hexadecimal fills, shape opacity, rectangle radii, no viewBox, and
a bounded Profiles 4–6 static transform-list seam. This keeps scalar, solid
fill, transform-list, and path-geometry targets identity-mapped into the
current model. Unsupported scene structure
fails instead of being normalized behind the profile's endpoint contract.
Retained dynamic side channels such as `<set>`, `<script>`, `<style>`, and
event attributes may still expose the ordinary Base document, but make Sample
compilation fail. The production SVG importer is unchanged.

`rig/fixtures/svg-animation-profile0-boundaries.svg` is the exact nanosecond
repeat-boundary oracle. `rig/examples/svg-animation-profile0-demo.svg` is the
960×540 visual specimen and exercises every admitted property, delayed begins,
repeats, remove/freeze, parent targeting, and root-level `href` targeting.

`rig/fixtures/svg-animation-profile1-keyframe-boundaries.svg` adds uneven
key-time, repeat, and freeze boundaries. Its visual sibling
`rig/examples/svg-animation-profile1-keyframes.svg` aligns linear, shared
spline, and independently eased segments against the same stations.

`rig/fixtures/svg-animation-profile2-sandwich-boundaries.svg` isolates base,
lower contribution, later-begin replacement, exact-end fallthrough, and frozen
lower state on one target. Its three-rail visual sibling
`rig/examples/svg-animation-profile2-replacement-sandwich.svg` separates the
lower effect, temporary higher effect, and composed result.

`rig/fixtures/svg-animation-profile3-additive-boundaries.svg` isolates typed
addition and accumulation across repeat, replacement, remove, and freeze
boundaries. Its four-lane visual sibling
`rig/examples/svg-animation-profile3-motion-mixer.svg` separates the cumulative
foundation, delayed replacement, persistent/temporary offsets, and result.

`rig/fixtures/svg-animation-profile4-effects-and-transforms.svg` isolates the
live lower-sandwich dependency, typed transform interpolation, parameter-level
accumulation, and ordered postmultiplication. Its visual sibling
`rig/examples/svg-animation-profile4-transform-showcase.svg` presents those
laws as separate lanes through the same latest-profile renderer and player.

`rig/fixtures/svg-animation-profile5-solid-fill-boundaries.svg` isolates
whole-fill replacement, straight alpha/color interpolation, exact additive and
repeat-accumulative channels, and live-underlying color. Its visual sibling
`rig/examples/svg-animation-profile5-solid-fill-showcase.svg` presents uneven
spline color keyframes, an additive RGB mixer, and a live transition.

`rig/fixtures/svg-animation-profile6-path-boundaries.svg` isolates
absolute/relative compatibility inside one command family, structured spline
morphing, explicit discrete arc-bearing geometry, and the `H/V` versus `L`
automatic fallback boundary. Its visual sibling
`rig/examples/svg-animation-profile6-path-morph-showcase.svg` presents a
circle-to-sparkle cubic motion mark, whole-icon state switches, and a
family-mismatch switch through the same latest-profile renderer and player.

The renderer publishes a bounded, zero-padded PNG sequence through a
normal-error transaction, plus `frames/manifest.json` and `frames/frames.csv`.
The JSON records source and compiler identity, viewport, exact cadence, and
every frame's SHA-256. A returned failure preserves the prior complete report;
the two-rename directory swap does not claim process-crash atomicity. Video
assembly stays host tooling:

```sh
ffmpeg -hide_banner -loglevel error -y \
  -framerate 50 -start_number 0 \
  -i 'target/svg-animation-profile0/frames/frame-%04d.png' \
  -map_metadata -1 -an -c:v libx264 -preset slow -crf 18 \
  -pix_fmt yuv420p -movflags +faststart \
  -fflags +bitexact -flags:v +bitexact -threads 1 \
  'target/svg-animation-profile0/svg-animation-profile0.mp4'

ffmpeg -hide_banner -loglevel error -y \
  -framerate 50 -start_number 0 \
  -i 'target/svg-animation-profile0/frames/frame-%04d.png' \
  -filter_complex \
  '[0:v]fps=25,scale=640:-2:flags=lanczos,split[g0][g1];[g0]palettegen=max_colors=256:stats_mode=full[p];[g1][p]paletteuse=dither=bayer:bayer_scale=3' \
  -loop 0 -an \
  'target/svg-animation-profile0/svg-animation-profile0.gif'
```

The PNG sequence is the deterministic sample artifact. MP4/GIF output is a
presentation derivative. Explicit browser seeking and the applicable WPT
differential corpus remain the open half of the visual/conformance chunk.

## Versioned `.grida.xml` ingestion

There is deliberately no XML-specific engine API. Draft 0 still has the
model crate's pure `anchor_lab::grida_xml::parse(&str)` boundary. The retained
source-program boundary additionally parses and links Version 1–4 source
units, specializes Version 2–4 scalar props, projects Version 3/4 named render
slots, retains Version 4 durable occurrence addresses, and materializes the
same ordinary `Document` used everywhere else. A host supplies immutable
source snapshots, then passes only that concrete
document to `frame::render`. The engine library performs no filesystem I/O and
never reparses a document in the frame loop.

The canonical frame seam assumes that a document reached it through source
parsing or the model's shared renderability validation. Its gradient and image
preflights deliberately close later facts—resolved paint boxes, pinned-backend
arithmetic and shader construction, loaded resources, and the final view—but
are not an exhaustive validator for arbitrary hand-built invalid stroke,
corner, path, or image-model state.

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

- SVG Animation Profiles 0–6 currently share only the narrow
  identity-preserving shape materializer described above; Profile 4 adds its
  bounded static-transform owner seam and Profile 6 adds direct viewport-bounded
  paths, but general static SVG import,
  broad browser/WPT differential coverage, product playback and frame
  scheduling, additional SVG animation elements and value families, and
  production migration remain separate work;
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
  Draft 0 XML; default/fallback/required slot policies, durable nested
  paint/stroke/stop/run identity, full-library validation, and canonical
  multi-file writing remain future work;
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
  image RID. Checked frame execution instead rejects missing or unsupported
  image paints and view-dependent noninvertible image sampling matrices before
  touching the destination canvas; a singular geometry transform remains valid
  collapsed coverage. A host claiming strict materialization must also
  preflight filesystem/decode resources; `grida_xml_render` does so and reports
  authored plus resolved locations. Its
  opaque checked `PaintEnvironmentKey` lets damage and cache observe readiness,
  font changes, and same-RID byte replacement;
- the lab's ordered `Vec<Stroke>` implements the accepted extension, while the
  production scene/archive model still has one stroke geometry per node.
- production scene/archive path contracts still expose incompatible raw and
  canonical box-mapped forms, do not uniformly preserve fill rule, and do not
  yet round-trip this Draft 0 path contract.

Checked-in Draft 0 files use the canonical grammar; Version 1–4 fixtures use
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
`rig/fixtures/durable-addressing.grida.xml` is the Version 4 identity oracle:
every authored ordinary node has one owner/member/use-occurrence address, and
the engine integration compiles one occurrence to an arena-scoped typed
property target before evaluating it through the ordinary frame pipeline.
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

The implemented reference sampler contract—explicit time into existing
`PropertyValues` without mutating authored state—is:
[`ANIMATION.md`](./ANIMATION.md).

The implemented, strictly pre-animation identity/value/frame/query/damage/cache
contract is [`EFFECTIVE-VALUES.md`](./EFFECTIVE-VALUES.md).

## Contract → module → guarding test

| concern                              | module                     | contract      | guarding test                                                                                                                                                                                                                                 |
| ------------------------------------ | -------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stage purity + the oracle law        | (whole pipeline)           | ENG-0         | the gate's differential + determinism runs                                                                                                                                                                                                    |
| versioned source consumer seam       | link → frame               | ENG-0 / S-2   | `tests/grida_xml.rs`, `tests/grida_xml_source.rs`, `tests/grida_xml_slots.rs`, `tests/grida_xml_social_feed.rs`, `tests/paints.rs`, `tests/strokes.rs`, `tests/rectangular_strokes.rs`, `tests/text.rs`, `tests/corners.rs`, `tests/paths.rs` |
| effective property values            | model → frame              | ENG-0/2/3     | `tests/values.rs` (empty equivalence · layout/transform · paint · bounds · visibility · query · pixels)                                                                                                                                       |
| explicit-time animation              | SVG → values → frame/cache | ANIMATION     | `../a/lab/tests/animation.rs`, `../a/lab/tests/svg_animation.rs`, `tests/animation.rs` (time · exact interpolation · strict compile · Base/Sample · query · damage · cache · pixels)                                                          |
| host-to-document time mapping        | `playback_clock.rs`        | ANIMATION     | `tests/playback_clock.rs`, `tests/animation.rs` (virtual time · controls · cadence independence · endpoint behavior · direct-seek equality)                                                                                                   |
| drawlist (pure, diffable projection) | `drawlist.rs`              | ENG-2.1       | `tests/drawlist.rs` (order · pruning · color · verbatim world · determinism)                                                                                                                                                                  |
| text shaping + shared glyph layout   | `text_layout.rs`           | ENG-4.1/4.5   | `../a/lab/tests/text_layout.rs`, `tests/text.rs`                                                                                                                                                                                              |
| raster executor                      | `paint.rs`                 | ENG-2.1       | `tests/paints.rs`, `tests/strokes.rs`, `tests/rectangular_strokes.rs`, `tests/text.rs`, `tests/corners.rs`, `tests/paths.rs` (pixel probes)                                                                                                   |
| one frame entry                      | `frame.rs`                 | ENG-2.4       | `tests/frame.rs` (checked paint environment) · spike live loop · gate                                                                                                                                                                         |
| damage as data                       | `damage.rs`                | ENG-2.2       | `tests/damage.rs`, `tests/values.rs`, `tests/cache.rs` (geometry · paint-only · opacity · painter order · environment · covering bounds)                                                                                                      |
| spatial read tier                    | `query.rs`                 | ENG-3         | `tests/query.rs` (`hit_point ≡ pick` · retained traversal/clip snapshot)                                                                                                                                                                      |
| journal (op-log)                     | `journal.rs`               | ENG-5.1       | `tests/journal.rs`                                                                                                                                                                                                                            |
| replay (corpus, determinism)         | `replay.rs`                | ENG-5.2/5.3   | `tests/replay.rs` + `rig/corpus/*.replay` via the gate                                                                                                                                                                                        |
| cache identity                       | `ident.rs`                 | ENG-2.3/1.4   | `tests/ident.rs`, `tests/cache.rs` (arena + slot + generation · exact values · paint environment · document replacement)                                                                                                                      |
| oracle version tags                  | `oracle.rs`                | ENG-4.2       | the `.replay` header                                                                                                                                                                                                                          |
| gated observability                  | `trace.rs`                 | S-6           | `cargo check --features trace`                                                                                                                                                                                                                |
| the rig                              | `bin/gate.rs`              | ENG-0.2 / S-5 | it _is_ the gate                                                                                                                                                                                                                              |

The model-crate side of the setup lives in [`../a/lab`](../a/lab): the typed
`Op` + `apply` dispatcher + `DirtyClass` (`ops.rs`), the arena-scoped per-slot
generation identity (`model.rs`), the closed property registry and immutable
`ValueView` (`properties.rs`), the non-panicking `Resolved` opt accessors
(`resolve.rs`), and the optional `serde` feature (the op-log wire) — each
additive, with the full lab suite green throughout.

## The re-host, concretely

The spike's scene painter is deleted; it calls `frame::resolve_and_build` then
checked `FrameProduct::execute`. The lower-level `drawlist::build_glyphless_unchecked`,
`paint::execute_unchecked`, and `paint::raster_to_bytes_unchecked` entries are
reserved for deterministic structural probes and internal retained-list replay.
Live pick, hover, handles, and gestures read the frame's resolved traversal and
effective clip snapshot; spatial queries cannot accept a second document or
value view. All gesture ops go through `apply` and are recorded in the `journal`
(undo stays document snapshots — ENG-5.5). `--record` writes `.replay` corpus
files; the panel shows the per-frame damage count.

The screenshot oracle was explicitly rebaselined after accepting three
historical semantic corrections: frames no longer receive invented ink,
authored parent strokes paint after children, and text uses shaped metrics and
positioned-glyph replay. The shot paint context now loads the repository's
bundled Inter face, so its four goldens are deterministic across host font
configurations. Replay, differential/cache, screenshot, and benchmark gates
are green together.

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

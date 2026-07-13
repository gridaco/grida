# ANIMATION — explicit time through the anchor engine

**Status:** Accepted engine contract; the bounded reference sampler,
caller-owned playback clock, offline renderer, and native live-host harness are
complete in the model-v2 proving stack. Browser/WPT differential conformance,
animation replay, production-engine migration, and product playback remain
pending.

This document binds authored animation frontends to the current model-v2
engine. The first frontend is the cumulative [SVG Animation Profile
0](https://grida.co/docs/wg/feat-svg/animation) and [Profile
1](https://grida.co/docs/wg/feat-svg/animation-keyframes) family. Native Grida
XML animation is
[deferred](https://grida.co/docs/wg/format/grida-xml-animation).

The binding is subordinate to the [engine contracts](../a/ENGINE.md), the
[measurement doctrine](./MEASURE.md), and the implemented
[effective-values contract](./EFFECTIVE-VALUES.md). It does not define source
syntax.

## Decision

Animation enters the engine as one explicit sample-time input to a pure, typed
sampling stage:

```text
frontend-owned retained source
              |
              | compile and validate outside the frame loop
              v
       immutable AnimationProgram
              |
authored Document + SampleTime
              |
              v
            sample
              |
              v
  immutable typed PropertyValues
              |
              v
 resolve -> drawlist -> checked raster/composite
     |          |
     +----------+----> query / hit test / damage / cache
```

The first format-neutral boundary is the compiled `AnimationProgram`, not the
authored animation tree. Each frontend owns its source representation, target
resolution rules, diagnostics, and source preservation. Compilation lowers
accepted source semantics to the same typed program.

The host owns its monotonic clock, playback controls, and whether animation
demands another frame. It may map explicit `HostTime` values through the
source-neutral `PlaybackClock` harness, but it still supplies exactly one final
`SampleTime` for an animated frame. Final display pacing remains the
compositor's responsibility under ENG-2.4. The engine never reads a wall clock
to choose visual state, never writes sampled values into `Document`, and never
allows resolve, query, or paint to sample independently.

## Checkpoint status — 2026-07-14

This checkpoint proves one deliberately bounded vertical slice. “Implemented”
below means executable in the model-v2 proving stack; it does not mean shipped
in the production engine.

| Area                              | Status                      | Exact boundary                                                                                                                                                                                                                    |
| --------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SVG source contract               | Accepted                    | Cumulative Profiles 0 and 1: finite replacement animation of rectangle `x`, `y`, `width`, `height`, and `opacity`; linear keyframes and per-segment cubic Bézier easing                                                           |
| Semantic sampler                  | Implemented                 | Format-neutral signed sample time, finite scalar tracks, immutable programs, checked timing, exact rational offsets/easing, and atomic `PropertyValues`; no colors, transforms, paints, composition, events, or indefinite timing |
| SVG frontend                      | Implemented                 | Retained source, source-located diagnostics, strict whole-document compilation, and a narrow identity-preserving rectangle materializer; not general SVG import                                                                   |
| Engine frame seam                 | Implemented                 | Explicit Base/Sample requests feed one ordinary resolve, draw-list, query, damage, cache, and checked-paint path                                                                                                                  |
| Playback clock                    | Implemented                 | Pure caller-owned host-time mapping with pause, seek, rate, direction, and deterministic terminal behavior; no clock reads, scheduler, callbacks, or loop policy                                                                  |
| Offline visual host               | Implemented                 | Exact-time PNG sequence plus JSON/CSV manifests; MP4/GIF assembly remains external presentation tooling                                                                                                                           |
| Native live host                  | Implemented proving harness | Play/pause, restart, scrub, time display, resize, GPU presentation, and terminal quiescence; fixed host redraw timer substitutes for a compositor, and event-loop behavior has manual rather than automated UI evidence           |
| Browser/WPT differential          | Pending                     | Internal value, scene, query, damage, cache, and pixel evidence exists; no browser-build-pinned differential result exists yet                                                                                                    |
| Animation replay                  | Pending                     | Existing edit journal/replay does not record an animation program, sample time, or sampled frame request                                                                                                                          |
| Native Grida XML animation        | Deliberately deferred       | `.grida.xml` remains a static source format; this work adds no second animation syntax                                                                                                                                            |
| Production engine/product runtime | Unchanged                   | No production SVG importer, renderer, compositor, scheduler, playback UI, autoplay policy, or media synchronization was modified                                                                                                  |

## Module topology and responsibilities

The dependency direction is one-way:

```text
SVG profile documents
        |
        v
anchor_lab::svg_animation  ---- source ownership / compilation
        |
        v
anchor_lab::animation      ---- format-neutral semantic sampling
        |
        v
PropertyValues
        |
        v
anchor_engine::frame/cache ---- one coherent frame
        ^
        |
host-owned PlaybackClock
        |
        +---- offline renderer
        +---- native proving player
```

| Unit                               | Owns                                                                                                                                                                                       | Must not own                                                                                    | Consumption status                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| SVG profile documents              | Accepted source semantics and conformance laws                                                                                                                                             | Engine types, module layout, or product policy                                                  | Normative source contract                                                                                                              |
| `anchor_lab::svg_animation`        | Retained SVG source, namespace/source inventory, diagnostics, target resolution, profile validation, and lowering; its static-shell adapter materializes only the proving rectangle subset | Playback, wall clocks, frame scheduling, rasterization, or silent general-SVG normalization     | Frontend proving boundary; production reuse requires connection to the real SVG materializer rather than promotion of the narrow shell |
| `anchor_lab::animation`            | Signed semantic time, checked intervals, canonical scalar curves/easing, typed tracks, immutable programs, and atomic projection to the existing property registry                         | SVG grammar, source locations, filesystem/network access, host clocks, scheduling, or rendering | Reusable semantic kernel for the admitted scalar/replacement family                                                                    |
| `anchor_engine::frame` and `cache` | The explicit Base/Sample policy, sample-once frame construction, value-keyed cache identity, transactional execution, and coherence across resolve/query/damage/pixels                     | Source parsing, ambient time, host controls, or source-specific fallback                        | Reusable engine seam                                                                                                                   |
| `anchor_engine::playback_clock`    | Pure mapping from caller-supplied monotonic host time into a closed document-time range                                                                                                    | `Instant`, source/program/document/frame types, redraw requests, callbacks, looping, or UI      | Reusable optional host primitive, not a runtime                                                                                        |
| `svg_animation_render`             | File I/O, cadence selection, exact sample enumeration, PNG/report publication, and host-side transaction boundaries                                                                        | Source semantics, interpolation, or product playback policy                                     | Diagnostic host tool; not an engine library boundary                                                                                   |
| Native spike transport/player      | Host transport policy, `Instant` ownership, controls, redraw demand, resize, GPU presentation, and compositor stand-in pacing                                                              | New animation semantics or an engine-level `Runtime` abstraction                                | Disposable integration harness; only demonstrated laws migrate                                                                         |

Nothing below a host depends on the offline renderer or native player. The two
hosts deliberately exercise the same compiled program, explicit time, and
frame seam through different pacing policies. Future consumers should compose
those narrow pieces rather than inherit either proving host wholesale.

## Implemented reference path

The proving stack now implements the bounded reference path:

- `SampleTime`, checked timing, typed tracks, immutable `AnimationProgram`,
  exact rational keyframe offsets, per-segment easing, and once-rounded
  rational-to-binary32 interpolation live with the model and property registry;
- the retained SVG frontend resolves namespaces, preserves the source snapshot,
  materializes an identity-preserving rectangle scene, and compiles the full
  selected Profile 0 or Profile 1 inventory before sampling;
- `PropertyTarget` combines an arena-scoped generational `NodeKey` with one
  closed `PropertyKey`;
- `PropertyValues` is an immutable, sorted, unique map of exact typed values;
- `ValueView` validates the map and reads an absent entry as the authored base;
- one `ValueView` feeds resolve and draw-list construction;
- query consumes the resulting `Resolved` product, not a separately pairable
  document or value map;
- `FrameProduct` and `damage::diff_frame` carry the visual state needed to
  detect geometry, paint, order, clip, text, and resource changes;
- `SceneCache` already keys the exact `PropertyValues` and paint environment;
- checked frame execution is transactional and rejects a changed resource
  environment before drawing;
- `FrameRequest` exposes explicit Base and Sample policies for the full frame;
- `SceneCache::frame_request` samples before cache comparison and keys the exact
  resulting `PropertyValues`, never time;
- caller-owned `PlaybackClock` state maps explicit monotonic host timestamps to
  document time without depending on source, program, frame, Skia, or scheduler
  types; and
- `svg_animation_render` materializes and compiles once, then writes independent
  exact-time PNG samples for host-side video or GIF assembly.

There is still no ambient engine clock, scheduler, event timing, or optimized
animation execution. A `PlaybackClock` value is state explicitly owned and
called by the host; it never imports or reads `Instant`. Existing `Instant` use
measures stage duration only. Journal time describes edit history, and probe
cases that mutate documents between frames are workloads, not animation.

The proving SVG static materializer is intentionally narrower than general SVG
import: one SVG-namespace root with positive unitless dimensions, direct
rectangle children, solid hexadecimal fills, rectangle opacity/radii, no
viewBox, and no transforms. This is an implementation limit of the first
identity-preserving host, not an expansion or contraction of either profile's
animation semantics. Unsupported static SVG fails explicitly. The retained
source compiler still rejects unsupported animation, script, event-handler,
and CSS animation mechanisms as a whole.

## Engine laws

### 1. Time is declared data

`SampleTime` is a signed 64-bit nanosecond offset from the source profile's
timeline origin. Construction and arithmetic are checked. A source frontend
must either convert its authored clocks exactly or reject them.

No stage may read system, monotonic, audio, display, or request-animation-frame
time. A host may derive `SampleTime` from any of those clocks, but the derived
integer is the complete semantic input for the frame.

### 2. Sampling is pure and seekable

For one document snapshot, animation program, and sample time, sampling always
returns the same `PropertyValues` or the same error. Prior samples, playback
direction, nominal frame rate, and skipped frames cannot affect the result.

Sequential playback to `t` and a direct seek to `t` are equivalent. A sampler
does not retain an active interval cursor as semantic state. It may cache work
only behind a differential test against stateless sampling.

### 3. Authored state is immutable

Compilation and sampling never modify base values, hierarchy, the retained
source snapshot, or the materialized `Document`. Sampled values exist only in
the returned `PropertyValues` and derived immutable frame products.

An editor changes authored source through ordinary editing operations. It does
not promote one sampled frame into source unless an explicit bake operation is
requested.

### 4. The program is typed before sampling

`AnimationProgram` is immutable and contains only validated live property
targets, canonical typed curves, checked timing, and validated per-segment
interpolation. The frame loop does not parse XML, resolve IDs, parse numbers,
perform I/O, discover property types, or choose fallback behavior.

The program records the document/materialization identity against which its
targets were compiled. Sampling against another incarnation, a stale
generation, or an inapplicable property fails the whole sample.

### 5. One sample feeds the whole frame

Sampling completes before resolve. The resulting `PropertyValues` passes
through `PropertyValues::new` and one `ValueView`, then the ordinary full
reference pipeline. Layout, geometry, clips, draw items, query, damage, and
pixels therefore observe the same sampled scene.

No paint-only animation side channel is allowed. A geometry animation cannot
update pixels while leaving hit testing or damage at the base geometry.

### 6. Frame policy is explicit

The frame request is a sum type: `Base` or `Sample(program, time)`. Only an
explicit `Base` request selects `ValueView::base(document)`. A Sample request
with a missing program or time is an error; failed compilation cannot silently
fall back to Base.

Base is distinct from sampling an animation program at time zero. An empty
program sampled at any valid time returns empty `PropertyValues` and is exactly
equivalent to the existing static path.

### 7. Failure is whole-frame and transactional

Compile errors produce no program. Sample errors produce no partial
`PropertyValues`. Frame-build or checked-execution errors produce no partial
canvas output and preserve the prior retained cache entry.

Unsupported animation may still have a declared Base rendering policy at the
frontend. It never becomes a partially sampled frame through the engine.

## Core data boundary

The exact Rust layout is an implementation detail, but the model has these
irreducible facts:

```text
SampleTime
  nanoseconds: i64

AnimationProgram
  document identity
  profile/compiler identity
  sorted unique tracks

Track
  source diagnostic identity
  PropertyTarget
  checked interval and repeat count
  post-interval fill behavior
  canonical typed scalar curve
    exact rational keyframe offsets
    stored binary32 keyframe values
    one easing operation per segment
```

Track order is deterministic. Program construction rejects duplicate targets
whenever the active source profile does not define composition for them. A
program cannot contain a reflective field path, source-language value string,
serialized runtime key, callback, resource loader, or clock handle.

`PropertyValue` remains the only effective-value representation. Animation
does not introduce `AnimatedValue`, a document overlay, or a second property
registry. Profile-specific track value types are allowed internally to make
illegal interpolation unrepresentable, but their sampled output must be one
exact existing `PropertyValue` accepted by the registry.

## SVG Animation Profile 0 binding

Profile 0 admits one `<animate>` per `<rect>` property for `x`, `y`, `width`,
`height`, or `opacity`. Its frontend performs SVG namespace parsing, source
inventory, parent or same-document-fragment targeting, one-to-one
materialization checks, clock parsing, and diagnostics before constructing the
program.

The projection uses existing model values:

| SVG property | Engine target          | Sampled value                                           |
| ------------ | ---------------------- | ------------------------------------------------------- |
| `x`          | `PropertyKey::X`       | `PropertyValue::AxisBinding(AxisBinding::start(value))` |
| `y`          | `PropertyKey::Y`       | `PropertyValue::AxisBinding(AxisBinding::start(value))` |
| `width`      | `PropertyKey::Width`   | `PropertyValue::SizeIntent(SizeIntent::Fixed(value))`   |
| `height`     | `PropertyKey::Height`  | `PropertyValue::SizeIntent(SizeIntent::Fixed(value))`   |
| `opacity`    | `PropertyKey::Opacity` | `PropertyValue::Number(value)`                          |

This is a projection, not a change to the engine model. SVG `x`, `y`, `width`,
and `height` are admitted only where static materialization preserves their
user-coordinate values unchanged in the corresponding start-pinned or fixed
scene property. A target whose animated geometry is scaled, transformed,
converted, expanded through `<use>`, or baked into another field is rejected by
Profile 0. Compilation cannot silently rewrite endpoints because that would
break the profile's bit-exact source endpoint law.

Paint animation is intentionally absent. SVG `fill` would currently replace
the aggregate `PropertyKey::Fills` paint stack, while paint layers and gradient
stops do not have individual durable targets. Inventing a separate color slot
for animation would violate the existing ordered `Paints` model. A later paint
profile must either define whole-stack replacement honestly or first establish
durable paint-member identity.

Likewise, `animateTransform` is not mapped to the existing `Rotation`
property. SVG transform-list order, pivot, and composition do not equal a
box-centered rotation scalar. Supporting it requires a compatible transform
model rather than a convenient lossy mapping.

## Global keyframe and easing kernel

Keyframes and easing are format-neutral engine primitives. A scalar track has
one canonical `ScalarCurve`: a first keyframe followed by ordered segments,
where each segment owns its terminal keyframe and easing. Attaching easing to
the interval removes the possibility of mismatched parallel keyframe and
easing arrays. The old two-endpoint constructors are exact sugar for a
two-keyframe linear curve; there is no second interpolation path.

A multi-keyframe curve begins at exact offset zero, ends at exact offset one,
and has strictly increasing reduced rational offsets. A one-keyframe curve is
the sole constant representation and normalizes its semantically inert offset
to zero. Keyframe values retain their authored binary32 bits. Exact keyframe,
repeat, and frozen boundaries return those bits without interpolation.

Each interval currently supports linear or cubic Bézier easing. The global
cubic primitive requires finite controls and x controls in `[0, 1]`, making
the time function monotonic; finite y controls may overshoot for property
families that can represent it. Track construction validates every keyframe
and the cubic property-space control hull, so sampling cannot escape the
target property's domain.

Cubic sampling is pinned rather than delegated to a platform math library.
Stored binary32 controls become exact rationals. Diagonal curves and exact
inverse hits take exact fast paths; otherwise inversion uses 128 exact dyadic
bisections, then property interpolation rounds once to binary32, ties-to-even.
The result depends only on the program and `SampleTime`, not on a tolerance,
frame history, CPU math library, or source frontend.

## SVG Animation Profile 1 binding

[Profile 1](https://grida.co/docs/wg/feat-svg/animation-keyframes) projects SVG
`values`, `keyTimes`, `calcMode="linear|spline"`, and `keySplines` into that
same curve. `values` follows SVG precedence over `from` and `to`; omitted key
times become exact equal rational intervals. SVG narrows every spline control,
including y, to `[0, 1]` before constructing the more general engine easing.
`calcMode="discrete"` and `paced` remain explicit profile errors.

This is deliberately a frontend projection. It adds no SVG value strings,
list grammar, or XML ownership to the engine kernel, and native Grida XML may
later project a different source spelling into the same curve.

## Sample procedure

For the full reference path, sampling performs these steps in deterministic
order:

1. verify program and document identity;
2. visit tracks in their canonical target order;
3. derive contribution state from checked integer time arithmetic;
4. if inactive with `remove`, emit no entry;
5. if frozen, emit the exact final keyframe;
6. otherwise select the unique keyframe interval, derive exact rational local
   progress, apply its easing, and perform once-rounded binary32 interpolation;
7. construct and validate one `PropertyValues`; and
8. pass one `ValueView` through full resolve, draw-list build, frame preflight,
   checked execution, query, and damage.

For an internal repeat boundary, both profiles begin the next iteration at
progress zero. At the final active end, `remove` emits no entry and `freeze`
emits the exact final keyframe. These cases must not depend on a
floating-point modulus.

The static/base entry points remain exact wrappers around the same pipeline.
They do not compile or sample animation implicitly.

## Host boundary

The host owns:

- the real monotonic clock and its conversion to integer `HostTime`;
- play, pause, seek, direction, rate, and loop UI;
- frame requests, throttling, and visibility policy;
- media synchronization;
- reduced-motion or autoplay policy; and
- export cadence and duration.

The host passes a final `SampleTime`; it does not pass a clock object. The
engine owns:

- validation of the compiled program against the document;
- deterministic sampling;
- typed value construction;
- the full frame and query pipeline; and
- errors that identify the source track and runtime property target.

Playback policy is therefore replaceable without changing sampled semantics.

### Playback-clock harness

`PlaybackClock` is the optional reference mapping between host and document
time. It owns one explicit closed `PlaybackRange`, a positive reduced-rational
`PlaybackRate`, a separate direction, and either a paused position or one
stable playing anchor. It starts paused and accepts the host timestamp on every
sample or control operation.

For a playing anchor, document-time magnitude advances by

```text
floor((host_now - anchor_host) × rate_numerator / rate_denominator)
```

using checked integer domains. Intermediate samples never re-anchor or
accumulate frame deltas. Actual rate or direction changes reconcile under the
old settings and re-anchor at the emitted integer `SampleTime`; seek is the
only discontinuity. Repeated host timestamps are valid, decreasing timestamps
fail transactionally, and reaching either directional endpoint emits that
exact endpoint before pausing. `play` while held at that endpoint is a no-op;
the harness does not infer rewind or loop policy.

The harness deliberately has no inferred duration, loop, ping-pong, autoplay,
event, callback, `Instant`, animation-program, frame-request, renderer, or
scheduler behavior. The caller composes its result explicitly:

```text
host clock -> HostTime -> PlaybackClock -> SampleTime
                                      -> FrameRequest::Sample
```

The native spike's separate `AnimationApp` is the concrete proving caller. It
compiles once, derives an explicit range from the compiled track inventory,
owns the `Instant` epoch and animation-demand policy, presents the zero sample
before starting real time, renders one request per sampled time, and becomes
idle after presenting the terminal sample. The proving stack has no compositor
yet, so this app temporarily supplies the redraw timer and present loop that
ENG-2.4 ultimately assigns to that compositor. This host is integration
evidence, not a generic engine `Runtime` API or migration precedent for display
pacing.

## Damage, cache, query, and replay

Time itself is not a scene-cache key. The sampled `PropertyValues` is the
visual input already present in the cache key. Two times that yield identical
values may correctly reuse the same resolved and raster state; two times with
different values cannot alias.

`damage::diff_frame` compares sampled before/after `FrameProduct`s. It does not
infer damage from elapsed time or animation metadata. Existing property impact
flags may guide a future optimization only after it proves equality with the
complete frame diff.

Query receives the `Resolved` product from the sampled frame. It never samples
again and never combines one frame's geometry with another frame's values.

A future deterministic animation-frame replay must record the document/program
identity, exact `SampleTime`, declared environment, and relevant oracle
versions. It must never record “wait 16 ms.” The current journal/replay path
covers edit history only and has no animation-frame integration.

## Diagnostics

Compile diagnostics belong to the source frontend and carry source locations.
They identify the unsupported element or attribute, target-resolution failure,
invalid timing/value, duplicate effect, and accepted profile form.

Program construction and source compilation reject initially stale targets,
timing overflow, invalid interpolation state, wrong value kinds, inapplicable
properties, and invalid source domains before a program can exist. Sampling
then revalidates document identity and every emitted target against the current
document. The current sample-time error surface therefore reports a
document-identity mismatch or failure to validate the complete effective-value
set, including a target that became stale after compilation. Future
track-level runtime failures, if any are introduced, must carry the source
track and `PropertyTarget`; a document-level identity mismatch has no
applicable track or target.

Errors are data. Rendering logs may add context, but parsing error strings is
never part of control flow.

## Conformance laws

The following tests bind the first implementation:

- no-animation Base, empty-program Sample, and the current static frame are
  equal for values, resolved data, draw list, query, damage, cache, and pixels;
- Base and Sample-at-zero differ when a track begins at zero;
- source and `Document` remain byte/value identical across arbitrary sampling;
- direct seek equals every prior sample sequence at the same time;
- begin, internal-repeat, and final-end boundaries are tested immediately
  before, at, and after the exact integer boundary;
- parsed keyframes, exact key-time hits, repeat boundaries, and frozen final
  keyframes are bit-exact;
- uneven rational offsets use exact segment-local progress, and implicit equal
  offsets agree with their explicit rational spelling;
- linear two-endpoint tracks are bit-identical sugar over the canonical curve;
- each segment owns its easing; diagonal cubic curves equal linear sampling,
  exact inverse hits return exact y, and non-trivial curves have pinned golden
  binary32 results;
- duplicate targets, stale targets, cross-document programs, type/domain
  failures, and unsupported source yield no partial frame;
- layout-affecting tracks change resolved geometry, query, damage, and pixels
  coherently;
- opacity changes draw output and complete frame damage without changing
  authored values.

Before any browser-compatibility claim, relevant explicitly sought browser
frames and web-platform tests must provide tolerance-based differential
evidence for the admitted SVG subset, separate from the selected profile's
bit-exact internal oracle. That differential evidence is not part of this
checkpoint.

The full sample-and-resolve path is permanent. Any incremental sampler, scoped
resolve, partial repaint, scheduling hint, or compositor lowering ships with a
differential test against it.

The reference evidence is split by failure class:

- `../a/lab/tests/animation.rs` covers checked time, timing boundaries, typed
  tracks, keyframes, per-segment easing, document identity, atomic failure, and
  exact once-rounded binary32 interpolation;
- `../a/lab/tests/svg_animation.rs` covers retained source, namespaces,
  parent/fragment targets, strict grammar and side-channel rejection,
  duplicates, exact clocks and key times, direct binary32 source rounding,
  spline grammar, profile inheritance, and the checked fixtures;
- `tests/animation.rs` covers the public Base/Sample frame and cache seams,
  geometry/query/pixel coherence, opacity/damage behavior, empty equivalence,
  playback-clock composition, and transactional failure; and
- `tests/playback_clock.rs` covers dense/sparse equivalence, exact fractional
  rate, pause/resume/seek continuity, direction changes, endpoint stopping,
  extreme integer domains, and atomic refusal without a renderer or source
  frontend; and
- `../a/spike-canvas/src/shell/player_transport.rs` directly covers autoplay,
  exact-present-before-resume, play/pause, terminal replay, restart, seek,
  scrub, and presented-state transitions. Its adjacent `player.rs` tests range
  derivation and display-time formatting; the native event loop itself remains
  manual visual evidence.

The checked-in visual host renders both
`rig/examples/svg-animation-profile0-demo.svg` and
`rig/examples/svg-animation-profile1-keyframes.svg` at exact
integer-nanosecond cadences. The Profile 1 specimen aligns an uneven linear
track, a repeated symmetric spline, and independently eased segments against
the same keyframe stations. PNG sequences and manifests are diagnostic
evidence rather than reftests; browser and WPT oracles remain pending and will
use tolerant, explicitly sought differentials as required by the source
profile.

## Rejected shortcuts

- Mutating `Document` once per frame destroys the base/effective distinction
  and makes seeking, editing, cache identity, and replay ambiguous.
- Reading a wall clock in resolve or paint lets one frame contain several
  times and makes tests nondeterministic.
- Accumulating frame deltas in playback makes output depend on requested frame
  cadence and loses exact fractional-rate progress.
- Giving the playback clock callbacks, rendering, or scheduling would merge a
  replaceable host policy with semantic time mapping.
- Sampling in the painter leaves layout, hit testing, culling, clips, and
  damage stale.
- Keeping only normalized static SVG loses animation syntax, targets, and
  diagnostics; a static normalizer cannot be animation truth.
- Treating all properties as interpolable moves type errors into the frame
  loop and creates renderer-dependent behavior.
- Mapping SVG transform or fill animation to convenient parallel scalars would
  contradict the existing transform and ordered-paint models.
- Starting with incremental or compositor execution removes the independent
  correctness oracle before semantics are stable.

## Deferred engine work

Later source profiles may require discrete and paced interpolation, step or
spring easing, effect stacks, addition and accumulation, transforms, colors
and paint members, motion paths, indefinite and event timing, nested
timelines, or resource-valued effects. Each addition must extend the typed
program and effective-value projection without weakening the laws above.

Production-engine migration and optimized execution are separate decisions.
The model-v2 implementation proves the contract first; it does not silently
alter the current production SVG importer or renderer.

Animation-aware deterministic replay, a compositor-owned scheduler, product
transport/runtime policy, and automated native-player UI coverage are likewise
deferred. The fixed redraw timer and native control surface are proving-host
scaffolding, not implied engine APIs.

# ANIMATION — explicit time through the anchor engine

**Status:** Accepted engine contract; the bounded reference sampler through
typed effect stacks, caller-owned playback clock, offline renderer, and
native live-host harness are complete in the model-v2 proving stack. Local,
one-off explicit-seek Chromium comparisons cover the Profile 3–6 boundary
fixtures; a tracked browser harness, broader browser/WPT conformance,
animation replay, production-engine migration, and product playback remain
pending.

This document binds authored animation frontends to the current model-v2
engine. The first frontend is the cumulative [SVG Animation Profile
0](https://grida.co/docs/wg/feat-svg/animation), [Profile
1](https://grida.co/docs/wg/feat-svg/animation-keyframes), and [Profile
2](https://grida.co/docs/wg/feat-svg/animation-sandwiches), [Profile
3](https://grida.co/docs/wg/feat-svg/animation-composition), and [Profile
4](https://grida.co/docs/wg/feat-svg/animation-effects-and-transforms), and
[Profile 5](https://grida.co/docs/wg/feat-svg/animation-solid-fills).
[Profile 6](https://grida.co/docs/wg/feat-svg/animation-path-geometry) adds
typed path geometry and the first bounded discrete effect family.
Native Grida XML animation is
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

| Area                              | Status                      | Exact boundary                                                                                                                                                                                                                                                                                    |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SVG source contract               | Accepted                    | Cumulative Profiles 0–6: finite scalar/color/transform effects plus smooth compatible `d`, explicit discrete path values, and bounded incompatible-path fallback                                                                                                                                  |
| Semantic sampler                  | Implemented                 | Format-neutral signed sample time, typed scalar/color/transform/path curves, reusable complete-value discrete schedules, target-grouped stacks, exact rational interpolation/easing, final-only normalization, and atomic values                                                                  |
| SVG frontend                      | Implemented                 | Retained source, source-located diagnostics, strict whole-document compilation, a narrow direct rectangle/path materializer, source-family path topology, and synthetic transform owners; not general SVG import                                                                                  |
| Engine frame seam                 | Implemented                 | Explicit Base/Sample requests feed one ordinary resolve, draw-list, query, damage, cache, and checked-paint path                                                                                                                                                                                  |
| Playback clock                    | Implemented                 | Pure caller-owned host-time mapping with pause, seek, rate, direction, and deterministic terminal behavior; no clock reads, scheduler, callbacks, or loop policy                                                                                                                                  |
| Offline visual host               | Implemented                 | Exact-time PNG sequence plus JSON/CSV manifests; MP4/GIF assembly remains external presentation tooling                                                                                                                                                                                           |
| Native live host                  | Implemented proving harness | Play/pause, restart, scrub, time display, resize, GPU presentation, and terminal quiescence; fixed host redraw timer substitutes for a compositor, and event-loop behavior has manual rather than automated UI evidence                                                                           |
| Browser/WPT differential          | Local manual evidence       | One-off runs found Profile 3–5 frames pixel-identical; Profile 6 reported eleven tolerant matches, nine strict matches, and two four-pixel edge differences against Chromium 145.0.7632.6. The tolerant comparator was not retained; a tracked harness and broader WPT integration remain pending |
| Animation replay                  | Pending                     | Existing edit journal/replay does not record an animation program, sample time, or sampled frame request                                                                                                                                                                                          |
| Native Grida XML animation        | Deliberately deferred       | `.grida.xml` remains a static source format; this work adds no second animation syntax                                                                                                                                                                                                            |
| Production engine/product runtime | Unchanged                   | No production SVG importer, renderer, compositor, scheduler, playback UI, autoplay policy, or media synchronization was modified                                                                                                                                                                  |

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

| Unit                               | Owns                                                                                                                                                                                                                         | Must not own                                                                                    | Consumption status                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| SVG profile documents              | Accepted source semantics and conformance laws                                                                                                                                                                               | Engine types, module layout, or product policy                                                  | Normative source contract                                                                                                              |
| `anchor_lab::svg_animation`        | Retained SVG source, namespace/source inventory, diagnostics, target resolution, profile validation, source-family path topology, and lowering; its static-shell adapter materializes only the proving rectangle/path subset | Playback, wall clocks, frame scheduling, rasterization, or silent general-SVG normalization     | Frontend proving boundary; production reuse requires connection to the real SVG materializer rather than promotion of the narrow shell |
| `anchor_lab::animation`            | Signed semantic time, checked intervals, typed scalar/color/transform/path curves, reusable discrete complete-value curves, easing, ordered composition, immutable programs, and atomic property projection                  | SVG grammar, source locations, filesystem/network access, host clocks, scheduling, or rendering | Reusable semantic kernel for the admitted typed-effect family                                                                          |
| `anchor_engine::frame` and `cache` | The explicit Base/Sample policy, sample-once frame construction, value-keyed cache identity, transactional execution, and coherence across resolve/query/damage/pixels                                                       | Source parsing, ambient time, host controls, or source-specific fallback                        | Reusable engine seam                                                                                                                   |
| `anchor_engine::playback_clock`    | Pure mapping from caller-supplied monotonic host time into a closed document-time range                                                                                                                                      | `Instant`, source/program/document/frame types, redraw requests, callbacks, looping, or UI      | Reusable optional host primitive, not a runtime                                                                                        |
| `svg_animation_render`             | File I/O, cadence selection, exact sample enumeration, PNG/report publication, and host-side transaction boundaries                                                                                                          | Source semantics, interpolation, or product playback policy                                     | Diagnostic host tool; not an engine library boundary                                                                                   |
| Native spike transport/player      | Host transport policy, `Instant` ownership, controls, redraw demand, resize, GPU presentation, and compositor stand-in pacing                                                                                                | New animation semantics or an engine-level `Runtime` abstraction                                | Disposable integration harness; only demonstrated laws migrate                                                                         |

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
  materializes an identity-preserving shape scene, and compiles the full
  selected Profile 0, 1, 2, 3, 4, 5, or 6 inventory before sampling;
- `PropertyTarget` combines an arena-scoped generational `NodeKey` with one
  closed `PropertyKey`;
- `PropertyValues` is an immutable, sorted, unique map of exact typed values;
- `ValueView` validates the map and reads an absent entry as the authored base;
- one `ValueView` feeds resolve and draw-list construction;
- query consumes the resulting `Resolved` product, not a separately pairable
  document or value map;
- `FrameProduct` and `damage::diff_frame` carry the visual state needed to
  detect geometry, paint, order, clip, text, and resource changes;
- `SceneCache` keys the exact sparse `PropertyValues` and paint environment;
  authored path spelling is not part of the effective `PathGeometry` value;
- checked frame execution is transactional and rejects a changed resource
  environment before drawing;
- `FrameRequest` exposes explicit Base and Sample policies for the full frame;
- `SceneCache::frame_request` samples before cache comparison and keys the
  resulting sparse values, never time; its equality is sufficient for reuse,
  not a claim of complete scene equivalence;
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
rectangle or viewport-bounded path children, solid hexadecimal fills, shape
opacity, rectangle radii, no viewBox, and a bounded static transform-list
parser used by Profiles 4–6.
This is an implementation limit of the first
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
  target-major tracks
  low-to-high effect priority within each target

Track
  source diagnostic identity
  PropertyTarget
  checked interval and repeat count
  post-interval fill behavior
  replace or add effect composition
  replace or accumulate iteration composition
  closed typed effect
    scalar curve or scalar from live underlying
    solid-fill curve or solid fill from live underlying
    transform curve
    smooth path curve
    complete-value discrete curve
    eased two-value discrete pair
  canonical typed curves
    exact rational keyframe offsets
    typed keyframe values
    one easing operation per segment
```

Track order is deterministic. The format-neutral program groups equal targets
while preserving the frontend-provided low-to-high effect priority.
Profiles that do not admit sandwiches, including Profiles 0 and 1, reject
duplicate targets before program construction. A program cannot contain a
reflective field path, source-language value string, serialized runtime key,
callback, resource loader, or clock handle.

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

Profile 0 intentionally excludes paint animation. SVG `fill` would replace
the aggregate `PropertyKey::Fills` paint stack, while paint layers and gradient
stops do not have individual durable targets. Inventing a separate color slot
for animation would violate the existing ordered `Paints` model. Profile 5
therefore projects solid color to honest whole-`Fills` replacement; durable
paint-member identity remains necessary before nested paint animation.

Profile 0 likewise excludes `animateTransform`; it is not mapped to `Rotation`
property. SVG transform-list order, pivot, and composition do not equal a
box-centered rotation scalar. Profile 4 instead projects typed operations to
the existing ordered `LensOps` value without a lossy scalar shortcut.

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

## SVG Animation Profile 2 binding

[Profile 2](https://grida.co/docs/wg/feat-svg/animation-sandwiches) admits
multiple replacement effects for one target without adding new SVG syntax.
For the profile's deliberately static timing grammar, low-to-high priority is
the stable ordering `(resolved interval begin, XML document order)`: a later
begin wins, and later document order wins an equal-begin tie. The frontend owns
that SVG-specific ordering and gives the format-neutral program already
ordered tracks.

At a sample time, only active or frozen effects contribute. The highest
contributing replacement wins. A higher effect before its begin falls through;
`fill="remove"` falls through at its active end; `fill="freeze"` continues to
mask lower effects; and no contributor reveals the authored base. Repeats do
not reprioritize an effect because they do not begin a new interval.

This static tuple is not presented as general SMIL timing. Begin lists,
syncbase or event timing, restart, and dynamically created intervals remain
rejected; admitting them requires per-sample interval priority. Addition and
accumulation remain rejected by Profiles 0–2.

## SVG Animation Profile 3 binding

[Profile 3](https://grida.co/docs/wg/feat-svg/animation-composition) admits
`additive="sum"` and `accumulate="sum"` for the same five scalar properties.
They lower to two independent format-neutral operations: effect composition is
`Replace` or `Add`, while iteration composition is `Replace` or `Accumulate`.
The existing `PropertyValue` model stays the only effective-value boundary.

For iteration `i`, accumulation first computes the sampled simple value plus
`i` times the curve's final keyframe. It does not add the endpoint delta.
Sandwich composition then finds the highest contributing replacement, discards
lower layers, and folds that replacement plus higher additive contributors in
low-to-high priority order. If every contributor is additive, the fold starts
from the authored base. An internal repeat does not change effect priority.

The typed operation boundary refuses to reinterpret relational authored state.
An additive axis needs a start pin; a fixed-size addition needs a fixed size.
Center/end pins, spans, and auto sizes remain valid document values but have no
scalar underlying value for this profile. No resolved layout coordinate is fed
back into sampling. Each accumulation and each ordered addition uses exact
binary32 operands and rounds once, ties-to-even. Axis and size overflow fail the
whole sample. Opacity may exceed `[0, 1]` while the sandwich is folded and is
clamped once at final projection into the existing normalized opacity property.

## SVG Animation Profile 4 binding

[Profile 4](https://grida.co/docs/wg/feat-svg/animation-effects-and-transforms)
adds two forcing cases for the format-neutral value system: scalar effects
whose start operand is the live lower sandwich, and first-class 2D transform
effects. Profile 4 establishes `ScalarCurve`, `ScalarFromLiveUnderlying`, and
`TransformCurve` as typed runtime effects. Profile 5 extends that same closed
sum with `SolidFillCurve` and `SolidFillFromLiveUnderlying`; source syntax does
not leak into it.

`ScalarFromLiveUnderlying` uses the explicit
`InterpolateLiveUnderlying` composition operation and never becomes a
replacement cutoff. At each explicit sample it interpolates from the scalar
already folded from lower-priority layers to its stored target. SVG's authored
additive and accumulate spellings are normalized by the SVG frontend and
cannot change that effect class. This makes direct seeks correct without
captured interval-begin state and proves that contribution sampling and effect
evaluation are separate operations.

Transform curves retain one typed `Translate`, `Scale`, or `Rotate` operation
through keyframe selection, easing, and parameter-level repeat accumulation.
The sampled operation is converted to one finite affine `LensOp` only after
those semantic operations complete. Replacement creates a singleton ordered
list; addition appends to the lower `LensOps` list. Matrix coefficients are
never interpolated, accumulated, or numerically added.

The ordinary property registry owns the complete ordered `LensOps` aggregate
as a lens-only effective property with `TRANSFORM | BOUNDS | PAINT` impact.
Individual operations still have no durable target identity. Resolve reads the
effective aggregate through `ValueView`, then the existing resolved-world,
query, damage, cache, and paint paths observe the same folded transform.

SVG rectangles targeted by `<animateTransform>` receive one identity wrapper
whose origin is the SVG user-space origin; the geometry node keeps its authored
`x` and `y`. This preserves scalar-property identity while scale and uncentered
rotation remain origin-based. Numeric rotation centers are encoded into the
sampled affine operation. The compiler-only wrapper is point-query transparent:
an ink hit retains the named source rectangle's identity, while raw resolved
AABB/culling candidates intentionally include both wrapper and geometry node.
Ordinary authored groups and lenses still own descendant hits. Durable document
writers reject this compiler-only query topology rather than silently changing
it during a round trip. Box-relative origins, CSS `transform-origin` and
`transform-box`, native lens-transform animation, skew animation, matrix
decomposition, and motion paths remain deferred because they require a
different resolve-time origin contract or another typed operation.

The implementation-owned `rect-transform-static@0` shell named by the Profile
4 compiler ID accepts a case-sensitive SVG transform list containing
`matrix(a b c d e f)`, `translate(tx [ty])`, `scale(sx [sy])`,
`rotate(angle [cx cy])`, `skewX(angle)`, and `skewY(angle)`. Parameters are
finite, unitless SVG numbers; list-number commas and whitespace follow the
`svgtypes` 0.16 transform-list grammar. Omitted `ty` is zero and omitted `sy`
equals `sx`. Empty lists are identity. The shell parses each number as binary64
and then casts once to finite binary32; it immediately projects each operation
to one affine `LensOp`. Pivoted rotation expands in place to translate,
rotation, and inverse-translate operations. Source order is otherwise retained,
and an animated additive operation appends after the complete projected static
list. This deliberately local contract is not the WG profile's general static
SVG grammar; changing it requires a new static-shell revision in the compiler
identity.

## SVG Animation Profile 5 binding

[Profile 5](https://grida.co/docs/wg/feat-svg/animation-solid-fills)
adds one bounded paint-valued effect without adding a parallel color property.
An animated solid `fill` targets the existing complete `Fills: Paints`
property. Replacement emits one active, normal-blend solid paint and therefore
cuts any lower authored paint stack as one aggregate. Additive and live-`to`
effects may read an underlying value only when it is already exactly one
active, normal-blend solid paint; empty, multi-paint, gradient, image, inactive,
and non-normal-blend values fail before sampling.

`SolidFillCurve` and `SolidFillFromLiveUnderlying` retain straight, unpremultiplied
legacy-sRGB red, green, blue, and alpha channels in exact, unbounded rational
byte space. Interpolation, spline easing, repeat accumulation, and every
low-to-high additive fold complete before channels are clamped to `[0, 255]`
and quantized once, with exact halves rounded upward, into the existing RGBA8
`Color`. The final color is then projected as `Paints::solid`; resolve,
draw-list, damage, cache, and paint require no animation-specific paint path.

One solid-fill target accepts at most 256 effects in a compiled program. This
is an explicit exact-arithmetic resource ceiling: additive rational
denominators can otherwise grow without bound across a hostile effect stack.
Exceeding it is a reported program-construction error, never a float fallback
or a partially sampled frame.

The SVG frontend admits only `#RGB`, `#RGBA`, `#RRGGBB`, and `#RRGGBBAA` for
this bounded profile. Named/function colors, `currentColor`, `inherit`, `none`,
paint-server URLs, context paints, `color-interpolation` selection, and
discrete animation remain explicit failures. Gradient animation belongs on
durable gradient and stop targets, while stroke color first needs a truthful
static stroke-geometry seam. Neither is modeled as a nested patch to `Fills`.

## SVG Animation Profile 6 binding

[Profile 6](https://grida.co/docs/wg/feat-svg/animation-path-geometry) adds
geometry without changing the existing path model. `PathGeometry` is a
path-only effective property containing checked canonical commands, bounds, and
contour closure. It deliberately excludes authored `d` spelling and fill rule.
The scene's `PathArtifact` retains those authored concerns plus the explicit
reference box in which `d` is written; resolve combines the effective geometry
with the current authored fill rule and materializes it through the same
unit-reference mapping used by static paths. Tight bounds,
damage, draw-list construction, cache identity, and rasterization therefore
cannot drift onto the authored geometry or resurrect a stale animated fill
rule. Query still follows the engine's current declared-box hit policy;
Profile 6 does not quietly introduce point-in-path narrowphase.

`PathCurve` stores checked path keyframes and interpolates corresponding
absolute engine command parameters with exact rational progress and one final
binary32 rounding. Exact key times return the stored geometry directly. Its
constructor requires one normalized command topology, convex path easing, and
no rational conic commands. The generic `DiscreteCurve`
instead stores complete `PropertyValue` keyframes at exact offsets and selects
the greatest offset not after progress. Its final offset may be below one.
`EasedDiscretePair` represents SVG's two-value structural fallback separately,
switching complete values when eased progress reaches one half. All three path
effect classes are replacement-only and project to the same `PathGeometry`
property.

The SVG frontend retains a separate authored command-family signature before
renderer normalization. Uppercase and lowercase modes inside one family are
compatible, but `H` and `V` do not become `L` for animation compatibility,
`S` does not become `C`, and `T` does not become `Q`. Only after compatibility
is decided does the existing path analyzer expand relative coordinates,
shorthand controls, and line forms into renderer commands. Smooth `A`/`a` is
rejected because the analyzer lowers arcs to rational conics; interpolating
those conics would not implement SVG's arc-parameter and flag rules. Static and
explicitly discrete arc-bearing paths remain valid.

The proving shell uses the positive root viewport as one stable reference box
for the static path and every keyframe. The analyzer lowers in SVG user space,
then normalizes once into the existing unit-reference artifact; resolution maps
back once through the path node's viewport-sized box. Geometry outside that
reference box is rejected. This is an explicit shell limitation and avoids
weakening the engine path invariant or renormalizing each keyframe to a
different box. General SVG materialization may later choose a tighter stable
union box, but that belongs to the production importer rather than animation
sampling.

## Sample procedure

For the full reference path, sampling performs these steps in deterministic
order:

1. verify program and document identity;
2. visit each target stack in canonical target order and revalidate its target
   even when every effect is inactive or masked;
3. determine the contributing active or frozen effects;
4. retain each contributor's exact timing contribution, then evaluate its
   typed effect when its lower sandwich operand is available;
5. find the highest contributing replacement, or select the authored base when
   every contributor is additive;
6. fold the influential effects from low to high with typed replace, add, or
   live-underlying interpolation, then perform final property normalization;
7. emit at most one value for the target, or no value when the whole stack is
   non-contributing so the authored base remains visible;
8. construct and validate one `PropertyValues`; and
9. pass one `ValueView` through full resolve, draw-list build, frame preflight,
   checked execution, query, and damage.

For an internal repeat boundary, all seven profiles begin the next iteration at
progress zero. Profile 3 additionally applies the newly incremented terminal
accumulation. At the final active end, `remove` emits no entry and `freeze`
uses the final iteration's terminal effect. These cases must not depend on a
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
visual input already present in the cache key. Equal sparse values may reuse
the same resolved and raster state. Equivalent path spellings normalize to the
same `PathGeometry` before they reach that key. The predicate may
conservatively miss reuse when omission and an explicit authored base value
render alike, but it must never reuse genuinely different visual values.

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
invalid timing/value, profile-forbidden duplicate effect, and accepted profile
form.

Program construction and source compilation reject initially stale targets,
timing overflow, invalid interpolation state, wrong value kinds, inapplicable
properties, and invalid source domains before a program can exist. Sampling
then revalidates document identity and every target stack against the current
document, including non-contributing stacks. The current sample-time error
surface therefore reports a
document-identity mismatch, typed composition failure, or failure to validate
the complete effective-value set, including a target that became stale after
compilation. Composition failures carry the operation and `PropertyTarget`.
An arithmetic failure implicates the failing effect and its already-applied
prefix, but not later effects that were never evaluated. A stale target
implicates every source in its stack. A document-level identity mismatch has no
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
- Profiles 0 and 1 reject duplicate targets while Profiles 2–6 admit them;
  stale targets, cross-document programs, type/domain failures, and unsupported
  source yield no partial frame;
- a replacement stack emits at most one value; later begin and equal-begin
  document order select priority; pre-begin, remove, and freeze produce the
  specified fallthrough or masking behavior; repeats do not reprioritize;
- all four replace/add and none/accumulate combinations agree with the typed
  operation matrix; accumulation uses the terminal keyframe, replacement cuts
  lower layers, and additions above it remain influential;
- additive stacks read only compatible authored scalar bases, ordered additions
  round independently, overflow fails atomically, and opacity clamps only after
  the complete sandwich;
- lone-`to` effects consume the current lower sandwich at every sample, never
  act as cutoffs, reset to that live value at repeat progress zero, and preserve
  endpoint bits;
- typed transform components interpolate and accumulate before finite affine
  projection; replacement and ordered append preserve noncommutative operation
  order through resolve, query, damage, cache, and pixels;
- compatible path curves preserve exact endpoint artifacts and interpolate
  every admitted command parameter; explicit discrete schedules switch at
  exact offsets, while source-family mismatch fallback switches after easing;
- path animation rejects smooth arcs, mixed smooth topology, non-convex path
  easing, additive/cumulative composition, invalid complete values, and
  viewport-external geometry before a frame exists;
- layout-affecting tracks change resolved geometry, query, damage, and pixels
  coherently;
- opacity changes draw output and complete frame damage without changing
  authored values.

Local one-off comparisons produced two narrow external results. Grida and
Chromium 145.0.7632.6, driven by Playwright 1.58.2 with `pauseAnimations()` and
explicit `setCurrentTime()`, produced the same integer `x` values and
pixel-identical Profile 3 120×40 frames at every half-second from 0 through 7
seconds. The Profile 4 256×224 fixture likewise produced identical decoded
RGBA SHA-256 values for all nine half-second frames from 0 through 4 seconds,
including non-axis-aligned pivot rotation, ordered transforms, accumulation,
and live-underlying lone-`to`. These strict comparisons count antialiasing and
alpha differences and use threshold zero. The Profile 5 256×192 solid-fill
fixture was also pixel-identical at 0, 1, 2, 3, and 4 seconds after both
transparent outputs were composited over the same white background. It covers
multi-keyframe replacement, straight RGBA interpolation, late-clamped
additive/accumulative color, and live-underlying color. These are not durable conformance
gates: the browser producer and reports are not checked in. Broader
browser-compatibility claims still require a tracked harness plus relevant
browser and web-platform-test evidence, kept separate from the profile's
bit-exact internal oracle.

Profile 6 adds one further local result at 512×128 and 100 fps. Eleven exact
probes cover compatible `C`/`c` spline interpolation, both sides and equality
of explicit discrete arc-bearing switches, and both sides and equality of the
`H/V` versus `L` fallback. The local comparator reported tolerant similarity 1
at every probe, but its configuration and report were not retained. Under the
reproducible threshold-zero comparison, nine frames were pixel-identical and
the remaining two differed at four edge pixels each. Computed browser `d` and
`getBBox()` also confirmed the whole-value switches exactly at 0.5, 1.0, and
1.5 seconds.

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
  spline grammar, profile inheritance, sandwich priority/fallthrough, and the
  checked replacement/addition/accumulation fixtures;
- `../a/lab/tests/svg_animation_profile4.rs` covers live-underlying scalar
  effects, typed transform values, parameter accumulation, ordered list
  composition, static-base postmultiplication, and strict transform failures;
- `../a/lab/tests/animation_profile5_paints.rs` and
  `../a/lab/tests/svg_animation_profile5.rs` cover typed solid-fill curves,
  exact late-clamped RGBA sandwiches, lone-`to`, whole-`Paints` projection,
  strict color grammar, profile gating, and incompatible underlying paints;
- `tests/animation_profile5_paints.rs` covers paint-only frame/damage,
  draw-list, query, pixel, and remove-fallthrough coherence;
- `../a/lab/tests/animation_path_curves.rs` and
  `../a/lab/tests/svg_animation_profile6.rs` cover normalized smooth path
  interpolation, exact endpoints, generic discrete schedules, eased fallback,
  source-family topology, arc deferral, viewport normalization, and strict
  diagnostics;
- `tests/animation_profile6_paths.rs` covers effective path tight bounds,
  damage, draw-list, cache, declared-box query policy, and pixels through one
  sampled frame;
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

The checked-in visual host renders
`rig/examples/svg-animation-profile0-demo.svg` and
`rig/examples/svg-animation-profile1-keyframes.svg`, plus
`rig/examples/svg-animation-profile2-replacement-sandwich.svg` and
`rig/examples/svg-animation-profile3-motion-mixer.svg`, plus
`rig/examples/svg-animation-profile4-transform-showcase.svg` and
`rig/examples/svg-animation-profile5-solid-fill-showcase.svg`, plus
`rig/examples/svg-animation-profile6-path-morph-showcase.svg`, at exact
integer-nanosecond cadences. The Profile 1 specimen aligns an uneven linear
track, a repeated symmetric spline, and independently eased segments against
the same keyframe stations. The Profile 2 specimen shows the lower effect, the
temporary higher effect, and their composed replacement result on parallel
rails. PNG sequences and manifests are diagnostic evidence rather than golden
reftests. The Profile 3 specimen separates cumulative foundation, delayed
replacement, persistent and temporary additive offsets, and their complete
composed result. The Profile 4 specimen separates a live lone-`to` scalar
sandwich from typed translation, scale, pivoted rotation, and mixed ordered
transform composition.
The Profile 5 specimen separates uneven spline color keyframes, exact additive
RGB mixing, and a live-underlying color transition.
The Profile 6 specimen separates a compatible circle-to-sparkle cubic morph,
discrete icon states that retain arcs, and source-family mismatch fallback.

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
- Ordering same-target SVG effects by source order alone ignores interval-begin
  priority and produces the wrong effect during overlapping intervals.
- Starting with incremental or compositor execution removes the independent
  correctness oracle before semantics are stable.

## Deferred engine work

Later source profiles may require discrete calculation for more value families,
paced interpolation, smooth SVG arc parameters and flags, automatic path
normalization/matching, step or spring easing, box-relative transform origins,
skew, wider paints, motion paths, indefinite and event timing, nested
timelines, or resource-valued effects. Each addition must extend the typed
program and effective-value projection without weakening the laws above.

Production-engine migration and optimized execution are separate decisions.
The model-v2 implementation proves the contract first; it does not silently
alter the current production SVG importer or renderer.

Animation-aware deterministic replay, a compositor-owned scheduler, product
transport/runtime policy, and automated native-player UI coverage are likewise
deferred. The fixed redraw timer and native control surface are proving-host
scaffolding, not implied engine APIs.

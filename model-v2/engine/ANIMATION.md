# ANIMATION — explicit time through the anchor engine

**Status:** Open animation RFD. No animation syntax, timing model, program,
sampler, interpolation, composition, or playback API is adopted. The
pre-animation identity, typed-property, and immutable effective-value
foundation is specified separately; it contains no time semantics.

This is the engine-side companion to the
[Grida XML animation RFD](https://grida.co/docs/wg/format/grida-xml-animation).
That RFD asks what animation means in authored source. This document asks how
an answer can pass through the engine without breaking its existing purity,
determinism, query, damage, and replay contracts.

The proposal is subordinate to the current [engine contracts](../a/ENGINE.md)
and uses the existing [measurement doctrine](./MEASURE.md). If it conflicts
with either, the conflict must be resolved explicitly rather than hidden in an
animation-specific path.

It is deliberately implementation-facing. It may name the current engine
stages and candidate Rust types; it does not define `.grida.xml` syntax or make
format decisions on the format RFD's behalf.

The implemented input boundary this proposal must reuse is specified in
[`EFFECTIVE-VALUES.md`](./EFFECTIVE-VALUES.md).

## Short answer

Animation should enter the engine as **an explicit sample-time input to a pure,
typed sampling stage**:

```text
authored Document + authored animation model
                         |
                         v
                  compile / validate       (not per frame)
                         |
                         v
Document + AnimationProgram + SampleTime + declared environment
                         |
                         v
                      sample
                         |
                         v
       immutable typed PropertyValues
                         |
                         v
          resolve -> drawlist -> raster / composite
                     |
                     +----> query / hit test / damage
```

The host owns clocks, playback controls, and frame pacing. It maps those facts
to one explicit `SampleTime` for a frame. The engine never reads a wall clock
to determine visual state, never writes sampled values back into the authored
document, and never lets the painter sample animation independently.

The first implementation should run the full reference pipeline after every
sample. Incremental sampling, scoped resolve, partial repaint, and
compositor-only execution are later optimizations, each differential-tested
against that permanent reference path.

## What exists today

The anchor engine remains static, but its pre-animation value boundary now
exists:

- `frame::render` takes a `Document`, resolve options, a view, and paint
  context, then runs `resolve -> build -> execute`;
- `PropertyValues` is the immutable, sorted, unique map from arena-scoped
  generational node-property targets to exact typed effective values;
- `ValueView` validates that map and makes an absent entry read the authored
  base value;
- value-aware resolve, frame, drawlist, and cache entries consume one
  `ValueView`, while their static entries are exact `ValueView::base` wrappers;
- resolution captures the traversal and effective clip state needed by query,
  so the spatial read tier accepts only `Resolved` rather than a separately
  pairable document or value view;
- `damage::diff_frame` compares immutable `FrameProduct`s, so fills, opacity,
  strokes, clips, painter order, text, path, and paint-environment changes
  cannot disappear behind unchanged geometry;
- `PaintEnvironmentKey` identifies one host resource/font context plus its
  checked revision, and each `FrameProduct` carries the key belonging to that
  frame and refuses raster execution under a different key;
- the retained scene cache keys both the runtime document incarnation and the
  exact `PropertyValues` and `PaintEnvironmentKey`;
- its uses of `std::time::Instant` measure stage duration only; there is no
  semantic time input;
- `journal` and `replay` record document operations. ENG-5's “time as data” is
  edit history, not visual animation time;
- the probe's `anim_*` cases mutate the source document between measured
  frames. They are useful workloads, but they are not an animation model or
  sampler;
- `damage::diff` remains the geometry-only compatibility primitive; callers
  that claim visual damage use complete `damage::diff_frame` products.
  Geometry-only tests may continue to exercise `diff` directly.

None of those types sample time or describe animation. There is still no
animation program, sampler, interpolation, composition, or playback runtime.

## Scope

This RFD covers:

- the boundary between authored animation and an executable program;
- deterministic sampling at an arbitrary time;
- how sampled values enter resolve, drawlist, query, and damage;
- host/engine responsibility for clocks and scheduling;
- reference and optimized execution paths;
- replay, oracle versioning, tests, and measurement.

It does not decide:

- XML element or attribute names;
- whether animation is nested under a target or stored in a timeline graph;
- duration, easing, repeat, fill behavior, synchronization, or event syntax;
- which properties are animatable;
- editor timeline UX;
- SVG import/export policy;
- autoplay or trust policy for a host application.

Those are source-language or product questions. The engine architecture must
be able to host their eventual answers without silently inventing its own.

## Vocabulary

The names below separate facts that must not collapse into one value:

- **base value** — the authored value before animation contributes;
- **sample time** — the explicit position on a timeline requested by the host;
- **authored animation** — format-neutral animation intent retained for
  editing and serialization;
- **animation program** — a validated, typed execution form compiled from
  authored animation;
- **track/effect** — one time-varying contribution to one target property;
- **sampled value** — a value produced for one property at one sample time;
- **sample overlay** — the future sampler's sparse `PropertyValues` output for
  a frame;
- **sampled scene** — the resolved scene produced from base values plus the
  overlay;
- **impact class** — the phases a changed sampled value invalidates, such as
  measure, layout, transform, bounds, paint, or resource state.

Names are provisional. The separations are not: authored state, executable
state, sampled state, and resolved state have different lifetimes and owners.

## Proposed engine laws

The labels in this section are proposals, not additions to the accepted
contracts in `ENGINE.md`.

### A-1 · explicit time `[PROPOSED]`

Every visual sample is a function of declared inputs, including time. No
sampler, resolver, drawlist builder, painter, resource resolver, or query reads
an ambient clock. Instrumentation may use `Instant`; semantics may not.

The representation of `SampleTime` is open. It should make boundary decisions
deterministic, which argues against an unqualified `f32` seconds value. Integer
ticks with a declared time scale, integer microseconds, and a rational value
remain candidates.

### A-2 · authored state is immutable while sampling `[PROPOSED]`

Sampling never mutates the source `Document` and never serializes a sampled
frame back as authored truth. Editing a base value or keyframe is an authored
operation; advancing playback is not.

This rules out the probe's current mutation loop as the semantic
implementation. It remains a valid load generator until a real program exists.

### A-3 · sampling is pure and arbitrarily seekable `[PROPOSED]`

For the same document, program, environment, oracle versions, and sample time,
sampling produces bit-identical output. Sampling time `t` directly produces
the same result as playing continuously to `t`.

Stateful playback helpers may cache prior samples, but their output must be
differentially equal to the stateless reference sampler.

### A-4 · animation extends the typed property registry `[PROPOSED]`

The pre-animation foundation already requires registered property keys, exact
value types, applicability, base access, validation, deterministic equality,
and conservative impact classes. An animation program targets that registry;
it does not create reflective string paths or a parallel value model.

Animation must add, for each admitted animatable key:

- interpolation and discrete-fallback rules;
- allowed composition operations; and
- any animation-specific deterministic encoding/oracle version.

The XML vocabulary may map source names to this registry, but must not create a
second set of interpolation semantics.

### A-5 · one sample feeds every downstream consumer `[PROPOSED]`

Resolve, drawlist construction, hit testing, bounds, culling, damage, export,
and inspection observe the same sampled values at the same time. Paint may not
sample a second time, and query may not read only the base document while paint
shows an animated result.

### A-6 · the host owns playback and pacing `[PROPOSED]`

The host owns wall-clock selection, pause/play, playback rate, seek, loop
policy, presentation scheduling, and the decision to request another frame.
The engine evaluates the time it is given. This extends ENG-2.4 rather than
creating a second frame loop inside animation.

The engine may return scheduling facts—whether continuous effects are active
or the next exact time a discrete effect can change—but it does not call a
timer or request animation frames itself.

### A-7 · reference paths remain permanent `[PROPOSED]`

The full sampler, full resolver, full drawlist build, and full raster path are
the correctness oracle. Incremental and compositor paths must prove:

```text
optimized(document, program, time, environment)
    == reference(document, program, time, environment)
```

Equality is evaluated at the strongest applicable tier: sampled values,
resolved columns, drawlist, queries, damage coverage, and pixels.

### A-8 · animation semantics are versioned oracles `[PROPOSED]`

Interpolation, easing, effect composition, property registration, and boundary
rounding are content oracles. Replays and conformance artifacts must identify
the versions under which their expected samples were produced, just as the
engine already versions text and future path/image oracles.

## The data boundary

Animation needs three representations, not one catch-all tree.

### 1. Authored animation

The source/model layer retains editable intent: keyframes, timing, references,
and source ordering. The engine should not receive raw XML nodes and should
never parse `.grida.xml` in a frame.

This representation does not exist in the model today. Adding it is a model
change and must be designed with the format RFD; the engine cannot honestly
implement animation by hiding an XML-shaped side table in `paint.rs`.

### 2. Compiled `AnimationProgram`

A format-neutral compile step resolves and validates what can be decided
without a sample time:

- target identity and property keys;
- keyframe value types;
- normalized offsets and easing functions;
- effect ordering and composition modes;
- static dependency and synchronization graphs;
- property impact classes;
- resource handles that do not require per-frame discovery.

Compilation should happen on load and after relevant authored edits, not on
every frame. Invalid targets, cycles, unsupported composition, incompatible
values, and malformed timing should produce structured diagnostics here rather
than disappear during paint.

Whether compilation belongs to the model crate or an engine module remains
open. Its input and output must be format-neutral either way.

### 3. Existing sparse `PropertyValues`

The pre-animation foundation already supplies the exact data contract a future
reference sampler must produce: immutable `PropertyValues`, keyed by an
arena-scoped generational node identity and typed property key. An absent entry
means “use the authored base value” through `ValueView`. The values are
ephemeral frame input, not a cloned or mutated `Document`.

A sparse overlay makes the null-animation law cheap and explicit:

```text
sample(empty_program, any_time) == PropertyValues::default()
resolve(ValueView::new(document, empty_values)) == resolve(document)
```

The reference storage is a plain deterministic ordered map with duplicate,
type, applicability, value-domain, arena, and generation validation. A future
sampler must produce this contract rather than introduce a parallel
`SampledValues` abstraction. SOA, track-local caches, and change masks remain
measured optimizations behind the same observable values.

## Node identity is decided; subobject identity remains bounded

The Version 4 source contract now separates authored owner/member identity,
ordered component-use occurrence paths, typed property keys, and
arena-incarnation-scoped generational runtime keys. An executable node-property
target can therefore compile without serializing `NodeId` or a runtime key.

Animation still must answer:

- whether nested animation may target only its containing node;
- whether cross-target references exist;
- what source spelling carries a structured target and how copy/paste retargets
  animation; and
- whether a target may be a paint layer, gradient stop, text range, lens
  operation, or only one of the registered node-level aggregate values.

Paint, stroke, stop, run, and lens-operation indexes remain invalid durable
targets. Each needs member identity before animation can target it directly.

## Sampling and resolve order

The general reference order is:

1. sample typed effects at the requested time;
2. compose contributions with the authored base value;
3. expose the resulting overlay to resolve;
4. resolve layout, transforms, bounds, clips, and other derived state;
5. build one drawlist from that sampled resolved state;
6. execute the drawlist;
7. serve queries from that same sampled resolved state.

Sampling must precede resolve for layout-affecting properties. A paint-only or
compositor-eligible property may later skip work, but that is an optimization
selected from its impact class, not a different semantic path.

The effective-value view resolves the prior model incompatibility: layout,
transform, bounds, draw-list projection, and spatial queries can consume one
immutable typed overlay while the authored `Document` remains unchanged.
Animation still owes the pure sampler that produces that overlay at a declared
time.

## A candidate frame seam

The following is an architectural probe, not an accepted Rust API:

```rust
pub struct FrameInput<'a> {
    pub document: &'a Document,
    pub animation: Option<&'a AnimationProgram>,
    pub sample_time: SampleTime,
    pub resolve: &'a ResolveOptions,
    pub view: &'a Affine,
    pub resources: &'a ResourceSnapshot,
}

pub struct FrameOutput {
    pub sampled: SampleSummary,
    pub resolved: Resolved,
    pub drawlist: DrawList,
    pub damage: Damage,
    pub schedule: AnimationSchedule,
    pub stats: FrameStats,
}
```

`frame::render` remains the sole orchestration seam. The important change is
not these field names; it is that one explicit sample and one declared
environment flow through the whole frame.

The static call path should remain an exact special case. A null program must
not subtly alter geometry, ordering, queries, pixels, or performance-sensitive
allocation behavior.

## Property impact and invalidation

Every registered property needs a conservative, testable impact class. A
candidate vocabulary extends the current M/L/T/B dirty vocabulary:

| impact    | examples, subject to the property RFD | required reference work                          |
| --------- | ------------------------------------- | ------------------------------------------------ |
| measure   | font size, text content               | measure and dependent layout                     |
| layout    | width, gap, alignment                 | affected layout scope and downstream transforms  |
| transform | translation, rotation, scale          | world transform and descendant bounds            |
| bounds    | stroke width, blur radius             | visual bounds, culling, and damage               |
| paint     | color, opacity, gradient stop         | drawlist/pixel change even if geometry is stable |
| resource  | image or font reference               | explicit resource state and dependent phases     |

The examples are illustrative; the format RFD decides what is animatable.
Impact may be a bitset because one property can affect several phases.

The sampler should report the exact set of changed `(target, property)` pairs
between two requested samples. Later incremental stages may consume that set.
Day one may ignore it and run the full pipeline, but the data should be visible
to probes and tests.

## Composition belongs in the sampler

Several effects may contribute to one property. Base-value selection,
replacement, addition, accumulation, source/effect order, held values, and
discrete fallback therefore belong to one typed composition step before
resolve.

Even if the first language permits only one replace effect per property, the
program should represent “replace” explicitly. It should not make source order
an accidental composition algorithm that later becomes impossible to change.
Unsupported composition modes should fail compilation with a useful diagnostic.

## Transform and motion

Transform animation must resolve at a declared position relative to layout,
the authored local transform, ancestor transforms, and any future motion path.
The sampler cannot simply hand a final matrix to paint if hit testing and child
geometry are expected to move with it.

Matrix-entry interpolation, transform-list interpolation, decomposed
interpolation, and motion-path orientation are still format/model decisions.
Whichever is selected becomes a versioned typed interpolator and must feed the
same resolved transform used by query and drawlist construction.

## Paint and resource animation

Paint animation must project the engine's typed paint model rather than build a
parallel “animation color” abstraction. A track should target a paint property
through the same property registry used for base values—for example, a solid
paint's color or opacity—if and only if that property is admitted as animatable.

Resource identity and resource readiness are explicit environment inputs.
Sampling must not initiate path I/O, network I/O, image decoding, or font
loading. An animation that changes a resource reference either selects among
already resolved handles under defined semantics or is rejected/deferred until
the resource model specifies it.

Animated image media is a separate problem: choosing a frame inside a GIF or
video resource is not automatically the same mechanism as animating a scene
property. The two may share `SampleTime`, but should not be conflated by this
RFD.

## Damage, caching, and compositor lowering

The reference `damage::diff_frame` already compares complete immutable
`FrameProduct`s. It covers effective paint-only changes and geometry, and
compares the product-owned opaque `PaintEnvironmentKey`; a mismatch
conservatively damages every node owning draw items before or after. This
covers resource readiness, same-RID byte replacement, and font-context
revision without coupling damage to `PaintCtx`. Animation must retain those
contracts and additionally account for:

- before and after visual bounds;
- drawlist item changes and ordering;
- resource readiness changes;
- disappearance and appearance at timing boundaries.

The first animation implementation may still run the full reference pipeline.
Later partial repaint may narrow damage while remaining observationally equal
to `diff_frame`. No painter invents damage after the fact.

Cache keys must depend on the document/program generations, oracle versions,
opaque paint-environment key, and relevant sampled values—not wall-clock time.
Two different times that produce the same sampled value under the same
environment should be able to reuse the same derived result.

Transform and opacity tracks may eventually be lowered to a compositor. That
path is legal only when it is observationally equivalent to the reference
sampled scene for pixels, bounds, query, and export. If the main thread and the
compositor can disagree about the sampled state, lowering has crossed the
engine's semantic boundary.

## Scheduling and frame rate

Source timing describes values as a function of time; it does not prescribe a
fixed frame rate. Interactive hosts sample near presentation opportunities.
Deterministic exporters choose an explicit sequence of times. Both must get the
same value at the same time.

The compiled program may expose:

- whether any effect changes continuously in an interval;
- the next boundary at which a discrete or inactive effect can change;
- whether the program is finished, held, indefinite, or awaiting an external
  timeline input.

Those facts help the host avoid needless frames. They are outputs, not hidden
timers. Event-, scroll-, audio-, or data-driven timelines require additional
declared timeline inputs; none are assumed by the wall-clock design above.

## Queries and inspection

All spatial queries take a sampled `Resolved` tier or a frame snapshot that
owns one. At time `t`, hit testing, marquee, snapping, culling, minimap, and
selection geometry must agree with what is painted at `t`.

Inspection additionally needs both sides of the split:

- authored/base values for editing and serialization;
- sampled values for explaining the visible result.

The read API should make the choice explicit. A generic `get_value` that
sometimes returns base and sometimes sampled state would make editor behavior
dependent on playback state in invisible ways.

## Journal and replay

Document journals and animation playback record different facts:

- a journal records edits to authored state, such as inserting a keyframe or
  changing a duration;
- a playback trace records sample times or external timeline inputs;
- ordinary playback must not emit one document operation per displayed frame.

For a deterministic animation repro, replay needs the initial document,
authored operations, oracle tags, resources/environment, and either:

1. the exact sequence of requested sample times; or
2. playback-control events plus a fully specified clock-to-timeline mapping.

The first is the simpler engine conformance artifact. The second is useful for
host pacing investigations but includes host behavior outside the pure sampler.

The replay format will need animation-program and interpolation oracle tags
before animated fixtures can claim bit-identical results.

## Reference implementation first

The build order should preserve the engine's oracle law.

### Pre-animation foundation — no time semantics

- define durable authored/member/use-occurrence addresses;
- compile node-property targets to arena-scoped generational keys;
- define the closed typed node-property registry;
- pass an immutable empty effective-value set through resolve, drawlist,
  resolved query state, damage, cache, and frame;
- prove static fixtures, drawlists, queries, replays, and pixels are unchanged;
  and
- keep the static API as a thin empty-value call.

This foundation requires no `SampleTime` and invents no XML animation.

### Phase 0 — explicit time and a null animation program

- decide and define `SampleTime` without reading an ambient clock;
- define a format-neutral empty animation program;
- prove that sampling the empty program at every valid time produces the empty
  effective-value set; and
- retain the pre-animation static-equivalence oracle.

### Phase 1 — typed replace-only kernel

- add a format-neutral authored animation model and stable target contract;
- compile to typed tracks outside the frame loop;
- implement a stateless reference sampler;
- start with a deliberately small registered property set whose base access,
  interpolation, and impact are fully defined;
- run full resolve, full drawlist build, and full paint for every sample.

Numbers, colors, opacity, and transforms are plausible candidates, not an
adopted list. Each must survive the registry and resolver design before entry.

### Phase 2 — layout and paint completeness

- validate sampled layout, transform, bounds, paint, and query transitions
  against the existing `PropertyValues`/`ValueView` reference seam;
- define missing-resource and resource-change behavior;
- add deterministic export sampling.

### Phase 3 — richer semantics

- add multiple-effect composition only after ordering is specified;
- add iterations, holds, synchronization, and non-document timelines only as
  their source semantics become normative;
- add motion paths and richer typed interpolation behind versioned oracles.

### Phase 4 — measured optimization

- incremental track sampling and change masks;
- impact-scoped resolve and drawlist updates;
- paint-aware partial damage;
- compositor lowering for proven-eligible effects;
- scheduling hints and cache policies.

Every item in this phase needs a differential test against phases 1–3 and a
measurement that shows why the complexity pays for itself.

## Candidate module ownership

No file layout is adopted, but the current engine suggests these strict seams:

| concern                       | likely owner                          |
| ----------------------------- | ------------------------------------- |
| typed program and sampler     | one initial `animation` module        |
| frame orchestration           | `frame`                               |
| effective-value resolve seam  | existing `PropertyValues`/`ValueView` |
| sampled/resolved change data  | `damage::diff_frame`                  |
| drawlist projection           | `drawlist`                            |
| mechanical raster execution   | `paint`                               |
| sampled spatial reads         | `query`                               |
| conformance playback          | `replay`                              |
| interpolation/version stamps  | `oracle`                              |
| CPU work measurement          | `probe`                               |
| real-window scheduling/pacing | host/compositor and frame log         |

`paint` is intentionally not the owner of animation semantics. The module
boundary should remain small at first: one coherent sampler/registry unit is
easier to specify and test than a directory of abstractions chosen before the
kernel exists.

## Tests required before claiming support

The reference path needs focused laws, not only videos or golden frames:

1. **Null equivalence:** an empty program at any time equals today's static
   pipeline at every observable tier.
2. **Source immutability:** sampling any sequence of times leaves authored
   document bytes and semantic equality unchanged.
3. **Seek equivalence:** direct sample at `t` equals continuous playback to
   `t`.
4. **Frame-rate independence:** different prior sample sequences produce the
   same output at the same `t`.
5. **Boundary exactness:** begin, keyframe, repeat, and end boundaries select
   the specified side exactly.
6. **Typed rejection:** invalid target/property/value combinations fail at
   compile time with structured diagnostics.
7. **Composition order:** each admitted mode has table-driven base/effect
   stack cases.
8. **Phase coherence:** query and paint observe the same sampled transform,
   bounds, visibility, and order.
9. **Damage coverage:** every pixel-changing sample transition is covered,
   including paint-only changes.
10. **Replay determinism:** the same document, program, environment, oracle
    versions, and sample-time trace are bit-identical across runs.
11. **Optimization equivalence:** every incremental or compositor result
    equals the full reference result.

Visual reftests remain valuable for interpolation and composition, but must be
paired with sampled-value and resolved-tier assertions so a failure identifies
the semantic stage that diverged.

## Measurement changes

Once a real program exists, `probe` should stop calling direct document
mutation “animation” and measure the actual sampling seam. Candidate axes are:

- number of authored tracks and number active at the sample time;
- percentage of nodes animated;
- impact class: paint, transform, bounds, layout, and measure;
- keyframe count and easing cost;
- same-time resampling, monotonic playback, and random seeking;
- full reference versus each optimization.

`FrameStats` should expose sampling time separately. Program compilation should
have its own load/edit measurement and must not be folded into per-frame cost.
The existing frame log remains the tool for real-window pacing; a fast sampler
does not prove smooth presentation.

## Open decisions before code

Implementation should not begin until the owning RFD or model contract answers
the decisions needed for the selected first slice:

1. What exact type and unit represents `SampleTime`?
2. What source syntax carries local and cross-node targets?
3. What is the format-neutral authored animation model?
4. Which registered properties form the first **animatable** subset?
5. What interpolation, boundary, easing, and discrete rules apply to them?
6. Is day-one composition replace-only, and how is conflicting source rejected
   or ordered?
7. How are resource availability and resource-valued properties represented?
8. What static sample does a non-playing processor request?
9. Which oracle versions are stamped into animation conformance and replay
   artifacts?

## Rejected shortcuts

- **Mutate `Document` once per frame.** This destroys the base/sample split,
  bloats journals, complicates editing, and makes direct seeking stateful.
- **Sample inside `paint`.** Layout, bounds, query, damage, and export would
  disagree with pixels.
- **Use string property paths throughout the runtime.** Validation becomes
  late and every subsystem can invent different type/interpolation behavior.
- **Read `Instant::now()` in engine semantics.** Tests, seek, export, and replay
  become nondeterministic. `Instant` remains valid for measurement only.
- **Treat the current `anim_*` probe as the implementation.** It measures
  repeated mutation cost and proves neither timing nor sampling semantics.
- **Start with compositor-only animation.** It optimizes one property class
  before a sampled-scene oracle exists and risks visible/query disagreement.
- **Serialize sampled values as source.** It discards authored intent and makes
  round trips depend on the time at which they occurred.
- **Call edit replay an animation timeline.** Operation history and visual
  sampling are complementary inputs with different semantics.

## Relationship to the source-language RFD

The format RFD remains the authority for authored semantics. Its decisions
should eventually fill the open slots here:

| source-language decision     | engine consequence                                      |
| ---------------------------- | ------------------------------------------------------- |
| target identity and nesting  | program target keys and compile invalidation            |
| time representation          | `SampleTime` and boundary arithmetic                    |
| keyframes and easing         | normalized typed tracks and interpolator oracles        |
| property registry            | typed base access, interpolation, impact classification |
| effect ordering/composition  | contribution stack                                      |
| timeline and synchronization | program dependency graph and scheduling facts           |
| processing/static modes      | explicit sample policy and refusal behavior             |
| resources and trust          | declared environment and validation                     |

Conversely, the engine imposes two constraints the source design should treat
as day-one requirements: arbitrary-time deterministic sampling, and a clean
separation between authored base values and ephemeral sampled values.

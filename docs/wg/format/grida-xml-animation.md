---
title: "Grida XML animation — day-one questions"
description: "Open RFD asking whether and how .grida.xml should carry declarative animation from its first stable version, using SVG and Web Animations as problem-shaping references without adopting a syntax or runtime model."
keywords:
  - grida xml
  - animation
  - declarative animation
  - timeline
  - keyframes
  - svg animation
tags:
  - internal
  - wg
  - format-schema
  - canvas
  - authoring
  - rendering
  - svg
format: md
---

# Grida XML animation — day-one questions

**Status:** Open RFD — question framing only. No syntax, timing model, or
runtime behavior in this document is adopted.

Two prerequisites are now decided outside this animation RFD. [Grida XML
durable addressing](./grida-xml-addressing) defines Version 4 authored
owner/member IDs, component occurrence paths, typed property targets, compiled
runtime handles, and an immutable sparse effective-value boundary. The
underlying property registry remains distinct from the future **animatable**
subset. These decisions remove identity and document-mutation as blockers; they
do not choose animation syntax or behavior.

## The question

Should declarative animation be part of the first stable Grida XML language,
and, if so, what is the smallest coherent model that keeps animated documents
inspectable, seekable, editable, and portable?

The question belongs beside the [Grida XML RFD](./grida-xml), because it is
about authored source rather than one renderer or editor. A general animation
runtime may eventually deserve its own canvas-level specification. This RFD
does not define that runtime; it asks what contract the authored language must
leave room for from day one.

“Support from day one” may mean any of the following, and the distinction is
itself open:

1. the first stable language fully parses and plays a minimal animation
   subset;
2. the first stable language defines the source model, even if some processors
   expose only a static frame;
3. the first stable language merely reserves the structural positions and
   names needed for a later compatible addition.

These are materially different commitments. This RFD exists so that the
static scene language does not accidentally choose among them by omission.

## Why ask before the static language hardens?

Animation is not only “values changing over time.” It affects several
foundational contracts:

- how animation populates the accepted authored and effective-value tiers;
- whether animation is nested with its target or stored in a separate
  timeline graph;
- how the accepted structured node target is spelled, owned, and copied;
- whether layout observes animated geometry;
- how multiple animations combine on one property;
- what a static renderer, thumbnailer, exporter, or agent sees;
- whether time- and event-dependent source remains deterministic and safe.

The durable-addressing RFD has closed the property-tier and node-identity
questions. Deferring the remaining distinctions could still require a second
canonical source shape. Raising them now does not require implementing all of
animation now.

## What SVG contributes to the question

SVG is a useful reference because declarative animation is part of its element
tree rather than an unrelated movie format. SVG defines animation elements
such as `animate`, `set`, `animateTransform`, and `animateMotion`; SVG 2 also
recognizes that declarative animation may be enabled or disabled by a
processing mode. The [SVG animation chapter](https://www.w3.org/TR/SVG2/animate.html)
and [SVG 2 conformance processing modes](https://www.w3.org/TR/SVG2/conform.html)
are the primary references.

The strongest lessons are model-level, not spelling-level:

- **Base and animated values are different facts.** Editing the authored value
  must not overwrite it with one sampled frame. Visual output at time `t` may
  legitimately differ from source.
- **Timing and value interpolation are separate problems.** A timeline turns
  time into progress; a value model turns progress into a property value. The
  [Web Animations model](https://www.w3.org/TR/web-animations-1/) makes this
  separation explicit.
- **Discrete change deserves first-class treatment.** SVG's `set` does not
  pretend that every string, boolean, enum, or resource reference can be
  interpolated.
- **Several effects may target the same property.** SVG/SMIL defines ordering,
  replacement, addition, accumulation, and post-interval behavior rather than
  relying on document order alone.
- **Motion is more than x/y interpolation.** A motion path has path geometry,
  progress along the path, and orientation behavior.
- **Synchronization grows quickly.** Offset times, repeats, event starts, and
  one animation beginning relative to another form a dependency graph, not a
  collection of independent timers.

The existing [Chromium SVG animation study](../research/chromium/svg/animation-and-smil.md)
records how those distinctions materialize in a browser. The
[SVG element model](../../reference/svg/element-model.md) records the
round-trip hazard: edit decisions concern the base value while rendering may
show an animated value.

SVG also supplies warnings rather than templates. Its SMIL and CSS animation
systems can target the same element and require precedence rules. Event timing
and animation of reference-valued attributes enlarge the active-content and
security surface; see the [untrusted SVG rendering study](../research/untrusted-svg-rendering.md).
Grida XML should not inherit this complexity merely because the element names
are familiar.

The cross-project
[motion graphics authoring landscape](../research/motion-graphics/index.md)
surveys how Lottie, After Effects, Blender, Rive, dotLottie, Cavalry, Apple
Motion, PowerPoint, and Keynote extend the property-animation kernel through
clips, nested time, procedural value sources, controllers, templates, and
authoring views. It is descriptive prior art, not part of this RFD.

## Illustrative syntax probes, not proposals

An SVG-like child element is one possible shape:

```xml
<rect x="0" width="80" height="80">
  <animate property="x" from="0" to="240" duration="600ms"/>
</rect>
```

A structured keyframe child is another:

```xml
<rect x="0" width="80" height="80">
  <animation property="x" duration="600ms">
    <keyframe offset="0" value="0"/>
    <keyframe offset="1" value="240"/>
  </animation>
</rect>
```

A separate timeline graph is a third:

```xml
<animations>
  <animation target="card" property="x" duration="600ms">
    <keyframe offset="0" value="0"/>
    <keyframe offset="1" value="240"/>
  </animation>
</animations>
```

None of these fragments is valid Grida XML today. They expose different
tradeoffs:

| Shape                     | Attractive property                         | Immediate question                                                          |
| ------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| Animation child of target | Local, readable, SVG-like                   | How are animation property children distinguished from render children?     |
| Structured keyframes      | One grammar for arbitrary ramps             | Is it unnecessarily verbose for the common two-value case?                  |
| Separate timeline graph   | Central sequencing and cross-target editing | How does `target` spell the accepted structured node address?               |
| Named reusable animation  | Reuse across nodes or instances             | Are overrides and instance-local time worth a definition system on day one? |

The RFD should not select a spelling until the value, timing, targeting, and
composition questions below have answers. Syntax chosen first will conceal
rather than resolve those model decisions.

## Open question set

### 1. Base value and sampled value

- Does an active animation always produce an entry in the accepted effective
  value map, even when that entry equals the authored base?
- Is sampling a pure function of `(document, environment, time)`, or may prior
  playback state affect the result?
- When an animation ceases contributing, when is its effective entry removed,
  and may fill behavior keep the last contribution?
- When an editor changes a property during playback, is it editing the base,
  the selected keyframe, an animation-relative offset, or a new override?
- Can a canonical writer ever serialize a sampled frame, or only authored
  animation intent?
- What does inspection show: base, sampled, both, or an explicit mode?

Grida has accepted the same safe separation in its static/effective boundary.
Animation still needs to define contribution lifetime and public vocabulary.

### 2. Timeline ownership

- Is there exactly one document timeline, or can a subtree, component,
  presentation page, or embedded asset own a timeline?
- What establishes time zero?
- Does a document autoplay, open paused at zero, or defer playback policy to
  the host?
- Is document duration explicit, derived from effects, infinite, or absent?
- Are time values integer ticks, decimal seconds, or unit-bearing values such
  as `600ms`?
- What precision and boundary rules make sampling deterministic across
  implementations?
- Must arbitrary seeking produce the same result as continuous playback to
  that time?

### 3. Effect timing

- Which day-one fields are indispensable: delay/begin, duration, iterations,
  direction, easing, end delay, playback rate, and before/after fill behavior?
- Are SVG-like `fill="freeze|remove"` terms desirable, or too easily confused
  with visual fill paints?
- Does an omitted duration mean invalid, instantaneous, inferred, or
  indefinite?
- Are negative delays and fractional iterations allowed?
- What occurs exactly at begin, repeat, and end boundaries?
- Is an always-seekable offset-only model sufficient initially, or is
  interval scheduling part of the minimum coherent kernel?

### 4. Keyframes and value sources

- Is a two-value `from`/`to` form canonical, shorthand, or absent in favor of
  keyframes?
- Can a keyframe omit a value and use the underlying/base value?
- Are offsets required, inferred, or mixed?
- Is easing attached to the whole effect, to each segment, or both?
- Is there a distinct discrete `set` operation for non-interpolable values?
- Can values be relative (`by`, additive delta), or are all keyframes absolute?
- How are animation values typed and validated against their target property?

### 5. Animatable property registry

- Is every authored property animatable unless refused, or only properties
  explicitly registered as animatable?
- Which initial categories are coherent: numbers, positions, sizes, colors,
  opacity, transforms, paint properties, paths, text, and layout controls?
- Are `auto`, intrinsic sizes, spans, and other intent values interpolable,
  discrete, or invalid in animation?
- Does animating layout intent re-run layout at each sample?
- Can hierarchy, node type, child order, component reference, or resource
  identity change over time?
- Should properties that can cause I/O or change trust boundaries be
  categorically non-animatable?

The registry is a language contract. Leaving interpolation behavior to each
renderer would make one source file produce different designs.

### 6. Interpolation semantics

- Which color space and alpha model interpolate colors and gradient stops?
- How do angles choose a direction and handle multiple turns?
- Are transforms interpolated as matrix entries, decomposed components, or
  typed transform operations?
- What happens when two transform lists have different operation shapes?
- What correspondence rules make two paths morphable?
- How do paint stacks or gradients with different layer/stop counts combine?
- For non-interpolable pairs, does the language reject the animation or fall
  back to a defined discrete step?

### 7. Multiple effects on one property

- Does the later animation replace the earlier one, or is priority based on
  begin time, source order, explicit priority, or timeline order?
- Are replace, add, and accumulate separate composition modes?
- Which value is the “underlying” value for each effect in a stack?
- Does repeated additive animation accumulate per iteration?
- How does a frozen/held effect interact with a later active effect?
- Can transitions and authored animations coexist, or should Grida have one
  animation engine and one precedence model?

SVG's animation sandwich and Web Animations' effect stack show that this is a
bedrock question, even if day-one syntax permits only replacement.

### 8. Targeting and identity

- Is an animation always nested under and implicitly targets its parent?
- Can it target another node, paint, gradient stop, text run, component
  parameter, or effect?
- Cross-targeted nodes now have the structured Version 4 address from the
  [durable-addressing RFD](./grida-xml-addressing); what source spelling should
  carry that address remains open.
- Node properties now use typed registry keys rather than reflective runtime
  field paths. Durable addressing for paint, stop, text-run, and other
  subobjects remains deferred.
- What happens when the target is deleted, renamed, moved, or instantiated
  through a component?
- Does copying a subtree copy, retarget, share, or detach its animations?

Avoiding external targeting initially may still simplify source syntax, but it
is no longer required to compensate for missing node identity. The source and
copying tradeoffs remain open.

### 9. Transform and motion-path specialization

- Is transform animation ordinary property animation, or does it need a typed
  `animate-transform` form to preserve operation semantics?
- Is motion along a path representable as x/y/rotation keyframes, or does a
  motion-path effect need its own path, distance, orientation, and anchor
  model?
- Can a motion path reference scene geometry, or must it own immutable path
  data?
- Does motion compose before or after the node's authored transform,
  constraints, native rotation, and layout placement?
- Can layout observe motion, or is it always visual-only?

### 10. Synchronization and triggers

- Is day-one timing limited to absolute offsets from one timeline?
- May one animation begin relative to another animation's begin, repeat, or
  end?
- Are event-triggered begins part of the authored language?
- If events exist, what event vocabulary exists in a non-DOM scene?
- Are scroll-, audio-, presentation-cue-, or data-driven timelines future
  timeline types or day-one requirements?
- Can cyclic synchronization dependencies be represented, and if so how do
  they resolve?
- Does deterministic export refuse event-driven animation, supply an event
  trace, or select a fallback frame?

SVG demonstrates the expressive value of sync-base and event timing, while
also demonstrating their implementation and security cost.

### 11. Layout, rendering, and performance tiers

- Is every animation sampled before measure/layout, between layout and paint,
  or according to the property it targets?
- Which animations require re-measurement, re-layout, repaint, or only
  transform/opacity recomposition?
- Is that classification normative so processors cannot disagree about
  geometry?
- Can a processor lower eligible effects to a compositor without changing the
  sampled result?
- What frame-rate-independent sampling contract applies when frames are
  skipped?
- How are dynamic visual bounds, damage, hit testing, clipping, and culling
  computed over time?

Performance optimization is not a source-language feature, but the language
must not make the correct sampling order ambiguous.

### 12. Resources, safety, and processing modes

- May animation target image source, link destination, component reference,
  font resource, or any other reference-valued property?
- Can a sampled value initiate resource loading or network access?
- Are event-triggered animations declarative-only, or can they invoke actions?
- Does Grida XML define an inert/static processing mode that ignores animation
  elements, a paused mode that samples at a supplied time, and a playback mode?
- What is the required fallback frame when animation is unsupported or
  disabled?
- Should reduced-motion preference be an environment input, authored
  alternative, or both?

SVG shows that “no script” is not by itself a complete safety boundary when
declarative animation can retarget references or react to events.

### 13. Static consumers and export

- What frame does a thumbnailer render when no time is supplied?
- Does static export choose time zero, a poster time, the base scene, or reject
  an animated document without an explicit choice?
- How are finite animations exported to video, animated raster, slides, or a
  frame sequence?
- Is frame rate source intent, export policy, or merely a sampling choice?
- Can an animated embedded document keep its own clock, and does a repeated
  image fill restart or share that clock?

### 14. Canonical source and authorability

- Is there exactly one canonical representation of keyframes and timing?
- Are animation property names the same names used by static source?
- Where may animation property elements appear relative to fills and render
  children?
- Does source order carry semantic priority, or only human-readable order?
- Which defaults can safely be omitted without making timing hard to inspect?
- Can a human or language model predict the state at a named time without
  executing hidden rules?
- How are invalid targets, type mismatches, unsorted offsets, duplicate
  offsets, cycles, and unsupported interpolation reported?

### 15. Import, preservation, and interoperability

- Does importing animated SVG preserve animation as authored intent, translate
  only a supported subset, sample one frame, or refuse animated content?
- Can unsupported timing or composition be preserved losslessly without being
  executed?
- Does exporting Grida animation to SVG target SVG animation elements, CSS
  keyframes, a flattened frame sequence, or a capability-dependent choice?
- How are semantic losses reported rather than silently baked?
- Is “SVG-like” a source-syntax goal, a behavioral compatibility goal, or only
  inspiration for the model split?

### 16. Conformance and testing

- What exact-time samples form a minimal conformance corpus?
- Must sampling a document at time `t` be byte- or value-equivalent whether
  reached by seeking, forward playback, reverse playback, or dropped frames?
- Which boundary times test begin/end inclusion, repeats, easing endpoints,
  discrete changes, and held values?
- How are cross-implementation tolerances defined for interpolated colors,
  transforms, paths, and raster output?
- What test proves that playback never mutates authored base intent?

## Candidate day-one scopes to compare

These are comparison points, not recommendations.

| Candidate               | Stable on day one                                                                                                                         | Deferred                                                                  | Main risk                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Reservation only        | Structural slots/names and a declared static fallback                                                                                     | All executable animation                                                  | The reservation may encode the wrong future model                         |
| Minimal local effects   | Parent-targeted replace animation; absolute begin, duration, finite repeat; numeric/color/opacity/transform values; deterministic seeking | Events, sync-base, motion paths, additive composition, reusable timelines | “Minimal” may still choose irreversible timing and interpolation defaults |
| SVG-shaped subset       | `animate`, `set`, transform, and motion concepts with familiar timing fields                                                              | The long tail of SMIL timing                                              | Familiar syntax may imply compatibility the behavior does not meet        |
| Timeline/keyframe core  | One abstract timeline/effect/keyframe model shared by markup, editor, and runtime                                                         | Specialized sugar and event timelines                                     | More abstract and verbose for simple authored scenes                      |
| Full declarative system | Targeting, synchronization, composition, motion, and processing modes                                                                     | Only scripting/API control                                                | Excessive first-version complexity and a large active-content surface     |

The next RFD step is not to pick a tag name. It is to decide which row is the
smallest scope that preserves the invariants Grida cannot afford to retrofit.

## Decision gates before any normative draft

A normative animation proposal should not begin until it can answer, with
examples and counterexamples:

1. How does animation populate the already-separated base and effective-value
   tiers?
2. What timeline and deterministic-seeking model is canonical?
3. What is the day-one animatable property registry?
4. How do effects on the same property compose?
5. How does animation spell, own, and copy the accepted structured targets?
6. Which animation constructs can affect layout, resources, or trust?
7. What does every static consumer render?
8. Which syntax is canonical, and why is it easier to author and diagnose than
   the alternatives?
9. What is preserved, translated, sampled, or refused when importing SVG?
10. What conformance corpus would let a second implementation produce the same
    sampled scene?

Until those gates close, all animation-like XML fragments remain illustrative
only and a strict Grida XML reader should continue to reject them rather than
guess at semantics.

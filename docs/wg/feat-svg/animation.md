---
title: "SVG Animation Profile 0"
description: "A strict, deterministic first subset of SVG declarative animation for explicit-time rendering."
keywords:
  - svg
  - animation
  - smil
  - animate
  - deterministic rendering
tags:
  - internal
  - wg
  - canvas
  - svg
  - rendering
format: md
---

# SVG Animation Profile 0

**Status:** Accepted source profile.

SVG Animation Profile 0 is the first authored animation contract. It admits a
small, strict subset of SVG's `<animate>` element, sampled at an explicit time.
It is not a claim of complete SVG animation, SMIL, playback, interactive SVG,
or secure animated-SVG support.

The purpose of Profile 0 is to prove the animation kernel with existing SVG
syntax and semantics before another authored animation language is designed.
For a fixed source snapshot, materialization, profile revision, and sample time,
every accepted animation inventory produces one deterministic effective-value
set, which may be empty.
Fonts, images, and other static rendering inputs remain part of the declared
rendering environment.
Anything outside the profile is retained by a source-preserving processor but
is never silently approximated or partially executed.

[SVG Animation Profile 1](./animation-keyframes) is the cumulative extension
for ordered keyframe values, exact key times, and per-segment cubic Bézier
easing. [SVG Animation Profile 2](./animation-sandwiches) adds ordered
replacement sandwiches. [SVG Animation Profile 3](./animation-composition)
adds additive sandwich and repeat-iteration composition. [SVG Animation
Profile 4](./animation-effects-and-transforms) adds live underlying-value
effects and typed transform-list animation. [SVG Animation Profile
5](./animation-solid-fills) adds straight-sRGB solid-fill paint animation.
[SVG Animation Profile 6](./animation-path-geometry) adds compatible path
geometry interpolation and explicit discrete path replacement. This page
remains the normative baseline inherited by all six extensions.

## Standards baseline

The source vocabulary comes from the [SVG Animations Level 2 Editor's Draft of
14 September 2025](https://svgwg.org/specs/animations/). That draft delegates
the animation model, except for SVG-specific rules, to the [SMIL Animation
Recommendation](https://www.w3.org/TR/2001/REC-smil-animation-20010904/).

Profile 0 narrows those standards deliberately. An admitted construct follows
their behavior unless this document states a stricter input domain or numeric
projection. A processor must name this profile, not advertise the broader
standards, when reporting support.

## Processing policies

A processor exposes two distinct policies:

- **Base:** animation contributes no values. The authored base scene is
  rendered. The result reports whether animation markup was present, so the
  ignored behavior is visible to the caller.
- **Sample:** the caller supplies one exact time. The complete animation
  inventory is validated as Profile 0, then sampled. One unsupported or invalid
  animation prevents the animated result; no partial animated frame is
  produced.

Base is not shorthand for sampling at time zero. At time zero, an animation
whose active interval begins at zero contributes its `from` value; under Base,
it contributes nothing.

Playback, pausing, frame pacing, and wall clocks are host behavior: playback is
only repeated calls to Sample. No processor may consult ambient time to decide
the sampled scene.

These policy names are intentionally not SVG's `static`, `animated`, or
`secure` processing-mode names. Those standard modes govern more than the
bounded animation behavior defined here.

## Source preservation

Animation markup is authored source, not a sequence of document mutations.
A source-preserving processor retains an immutable original SVG representation
and source locations stable within that snapshot for all animation elements,
including unsupported ones. Static normalization is not the source of
animation truth, and sampled values are never written back into the retained
source.

A processor that discards animation-bearing source may still produce a Base
render, but it must not claim lossless import or later animation support. A
lossless import request must fail instead of silently stripping the markup.

## Admitted source

Profile 0 admits only `<animate>` in the SVG namespace. `<set>`,
`<animateTransform>`, `<animateMotion>`, CSS animations, CSS transitions, and
script-created animations are outside the profile.

An admitted `<animate>` contains whitespace only. Apart from namespace
declarations and optional `id`, its complete attribute vocabulary is `href`,
`attributeName`, `from`, `to`, `begin`, `dur`, `repeatCount`, `fill`,
`calcMode`, `additive`, and `accumulate`. Any other attribute on the animation
element is rejected, even when it would express a standard SVG/SMIL feature.

Sample also rejects `<script>`, SVG event-handler attributes, CSS keyframes,
and any CSS animation or transition declaration anywhere in the source. This
closes the animation inventory; those mechanisms are not executed on the side
while Profile 0 samples only `<animate>`. General static SVG parsing, external
resource, and sanitization policy remains a separate boundary.

An accepted local-target example is:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180">
  <rect id="card" x="24" y="40" width="96" height="96" opacity="1">
    <animate
      attributeName="x"
      from="24"
      to="240"
      begin="200ms"
      dur="800ms"
      repeatCount="2"
      fill="freeze"
    />
  </rect>
</svg>
```

Moving the same `<animate>` under the root and adding `href="#card"` has the
same targeting semantics when the fragment resolves uniquely.

The exact initial target and property surface is:

| Target   | `attributeName`   | Accepted values                            | Result class        |
| -------- | ----------------- | ------------------------------------------ | ------------------- |
| `<rect>` | `x`, `y`          | finite, unitless SVG numbers               | geometry coordinate |
| `<rect>` | `width`, `height` | finite, non-negative, unitless SVG numbers | geometry extent     |
| `<rect>` | `opacity`         | finite, unitless numbers in `[0, 1]`       | paint opacity       |

Percentages, CSS units, `calc()`, inherited values, and context-dependent
values are rejected. The accepted values are absolute replacements, not
offsets from the base value.

`attributeName` is required and must be one of the five unprefixed names above.
`attributeType` is rejected. SVG Animations Level 2 does not define
`attributeType`; its general resolution rule searches CSS properties before
attributes, but Profile 0's closed property set is already unambiguous.

### Target resolution

If `href` is absent, the target is the animation element's immediate parent.
Otherwise `href` must be a bare same-document fragment, such as `#card`, that
resolves to exactly one element in the same source document.

The target must be one `<rect>` that materializes one-to-one as one ordinary
scene node. Each animated source property must also retain an identity value
projection into the corresponding scene property. A materializer that bakes a
viewBox, ancestor transform, unit conversion, or geometry value into a
different field cannot compile that property in Profile 0. It must reject the
animation rather than transform endpoints behind the source contract.

External URLs, deprecated `xlink:href`, duplicate or missing IDs,
resource-definition targets, `<symbol>` targets, `<use>` shadow instances, and
any normalization that loses the required node or property identity are
rejected.

## Values and interpolation

`from` and `to` are both required. Profile 0 rejects `values`, `by`, a lone
`to`, a lone `from`, `keyTimes`, and `keySplines`.

`calcMode` may be absent or `linear`; its Profile 0 behavior is linear
interpolation between the two absolute values. `discrete`, `paced`, and
`spline` are deferred.

Before floating-point conversion, each authored decimal is checked against the
target property's exact source domain. A negative non-zero size such as
`-1e-100`, or an opacity just above one that would round down to `1.0`, is
therefore rejected rather than admitted through binary32 rounding. Signed
decimal zero remains zero and is admitted.

Endpoints are then parsed once into finite IEEE 754 binary32 values using
round-to-nearest, ties-to-even. At progress `p`, interpolation is the exact
mathematical value

```text
from + (to - from) × p
```

rounded once to binary32 using the same rule. The result at progress `0` is the
exact parsed `from` value, and the terminal frozen result is the exact parsed
`to` value. This pins output independently of floating-point expression
reassociation or fused operations.

## Time

The root SVG document supplies one timeline with origin zero. Nested `<svg>`
elements do not create independent timelines.

Sample time is a signed 64-bit integer count of nanoseconds from that origin.
Negative sample times are a host pre-roll extension and produce no animation
contribution. SVG compatibility claims and browser differential tests cover
only non-negative sample times.

Profile 0 clock syntax is:

```text
clock    ::= wsp* digits ("." digits)? ("s" | "ms") wsp*
digits   ::= [0-9]+
wsp      ::= #x20 | #x9 | #xD | #xA
```

There is no leading sign and no embedded whitespace. The decimal must convert
exactly to nanoseconds without overflow. Exponents, colon-clock forms, other
units, a trailing decimal point, and more than nanosecond precision are
rejected.

The admitted timing attributes are:

| Attribute     | Profile 0 rule                                     |
| ------------- | -------------------------------------------------- |
| `begin`       | optional; one clock value; default `0s`            |
| `dur`         | required; one finite clock value greater than zero |
| `repeatCount` | optional; positive integer; default `1`            |
| `fill`        | optional; `remove` or `freeze`; default `remove`   |

Lists, negative begins, `indefinite`, fractional repeats, `end`, `min`, `max`,
`repeatDur`, `restart`, event timing, sync-base timing, repeat timing,
wallclock timing, access keys, and event-handler attributes are rejected.

Let `B` be begin, `D` duration, and `N` repeat count. The active interval is
`[B, B + D × N)`. Overflow while deriving its end is an error.

- Before `B`, the animation contributes nothing.
- At `B`, progress is exactly `0`.
- Within an iteration, progress is elapsed time in that iteration divided by
  `D`.
- At an exact internal repeat boundary, the next iteration has begun and its
  progress is exactly `0`.
- At the final active end, `remove` contributes nothing and reveals the base
  value; `freeze` contributes the exact `to` value.

Sampling is stateless. Reaching a time by sequential playback or by a direct
seek must produce the same effective scene.

## Composition

Profile 0 has replacement only. `additive` may be absent or `replace`, and
`accumulate` may be absent or `none`.

At most one animation may target a given resolved element and property. A
second animation for the same pair is an error even if their active intervals
would not overlap. This keeps source order, SMIL sandwiches, addition, and
underlying-value composition outside the first profile.

When the animation does not contribute, the authored base value is observed.
When it contributes, its typed sampled value replaces that property for the
whole ordinary layout, paint, query, and damage pipeline.

## Failure and diagnostics

Sample is whole-document strict. Validation completes before an animated frame
is emitted. Errors include:

- an animation element or animation-affecting attribute outside Profile 0;
- an unresolved, ambiguous, unsupported, or non-materialized target;
- a missing, unknown, mistyped, non-finite, out-of-domain, or overflowing
  value;
- unsupported timing, interpolation, or composition syntax;
- two effects targeting the same element and property; or
- a target identity that became stale between compilation and sampling.

Every diagnostic identifies a source location, explains the failed rule, and
names the offending element, attribute, target, or conflicting location when
applicable. Unsupported grammar diagnostics state the accepted Profile 0 form.
Failure produces neither a partial effective-value set nor a partial frame.

Base may render a document containing unsupported animation, but it reports
that animation was ignored. Baking or stripping animation is an explicit host
or export operation at a declared time, never an implicit fallback.

## Resource and trust boundary

Profile 0 cannot initiate I/O. Its only reference is a same-document target
fragment. It does not animate URLs, resources, paint servers, component
references, text, hierarchy, events, or scripts. Source parsing and static SVG
resource policy remain separate security boundaries; this profile must not be
described as sanitizing arbitrary SVG.

## Conformance

Conformance has value-level, scene-level, and pixel-level layers. A test
artifact records the Profile 0 revision, standards baseline, source-number
parser revision, static materializer revision, applicable
[web-platform-tests](https://github.com/web-platform-tests/wpt/tree/master/svg/animations)
revision, and browser build used as an oracle.

Required laws include:

- Base differs from Sample at zero when an effect begins at zero;
- a document without animation is identical under Base and Sample;
- sampling never mutates retained source or authored base values;
- direct seek is independent of prior samples and nominal frame rate;
- begin, internal-repeat, and final-end boundaries are tested at one
  nanosecond before, exactly at, and one nanosecond after the boundary;
- parsed endpoints and frozen endpoints are bit-exact;
- parent targeting and equivalent same-document `href` targeting agree;
- duplicate effects, unsupported syntax, and stale targets fail as a whole;
- query and pixels observe the same sampled scene; and
- unsupported animation remains available to a source-preserving processor
  while Sample refuses it.

Profile bit conformance and browser differential conformance are separate.
Binary32 endpoints, nanosecond boundaries, and exact rational interpolation
are tested against Profile 0's deterministic oracle. Chromium currently exposes
a lower-precision timeline and a different floating-point evaluation path, so
browser comparisons use times representable by both systems plus declared
value and pixel tolerances. They cannot override the Profile 0 bit rules, and
one-nanosecond boundary probes are internal rather than browser-oracle tests.

Browser comparisons set the SVG timeline explicitly; wall-clock screenshots
are not a conformance oracle. Only tests whose source is entirely inside
Profile 0 can support a compatibility claim.

## Deferred families

[Profile 1](./animation-keyframes) adds keyframe lists and linear or spline
easing without changing this baseline. [Profile 2](./animation-sandwiches)
adds replacement sandwiches, and [Profile 3](./animation-composition) adds
addition and accumulation. [Profile
4](./animation-effects-and-transforms) adds scalar lone-`to` effects and a
bounded `translate`, `scale`, and `rotate` transform-animation family.
[Profile 5](./animation-solid-fills) adds a bounded solid-color `fill` family.
[Profile 6](./animation-path-geometry) admits discrete calculation only for
complete path geometry. General discrete calculation, `set`, paced
interpolation, non-solid paints, more SVG elements and properties, wider
transform syntax, motion paths, indefinite timing, event and synchronization
graphs, resource targets, CSS/Web Animations interaction, and optimized or
compositor execution remain deferred. None is implied by Profile 0.

---
title: "SVG Animation Profile 2: Replacement Sandwiches"
description: "A deterministic SVG animation subset for ordered replacement effects targeting the same property."
keywords:
  - svg
  - animation
  - smil
  - animation sandwich
  - composition
  - deterministic rendering
tags:
  - internal
  - wg
  - canvas
  - svg
  - rendering
format: md
---

# SVG Animation Profile 2: Replacement Sandwiches

**Status:** Accepted source profile.

SVG Animation Profile 2 extends [SVG Animation Profile
1](./animation-keyframes) by allowing several admitted `<animate>` elements to
target the same resolved element and property. It is cumulative: every source
accepted by Profile 1 is accepted by Profile 2 and produces the same sampled
values, including the same binary32 bits.

This profile adds no source syntax. It replaces only Profile 0's rule that a
target/property pair may have at most one animation. All inherited timing,
value, interpolation, target, failure, and trust-boundary rules remain in
force. In particular, every admitted effect is still a complete replacement:
`additive` may only be absent or `replace`, and `accumulate` may only be absent
or `none`.

[SVG Animation Profile 3](./animation-composition) keeps this priority model
and adds typed addition and repeat-iteration accumulation.

The model follows the [SMIL animation sandwich
model](https://www.w3.org/TR/2001/REC-smil-animation-20010904/#AnimationSandwichModel)
within Profile 2's deliberately bounded timing grammar.

## Replacement sandwich

For one resolved element/property pair, the authored base value is the bottom
of a sandwich. Every animation that contributes at the requested sample time
is a layer above it. Active and frozen animations both contribute; an
animation before its begin or after a `fill="remove"` active end does not.

Each admitted layer is non-additive. Therefore the highest-priority
contributing layer supplies the presentation value and masks all layers below
it. If no layer contributes, the property has no sampled override and the
authored base value is observed.

Sampling a sandwich still produces at most one effective value for its
target/property pair. The sandwich is composition inside the animation
program, not a relaxation of the effective-value set's unique-target rule.

## Priority

Profile 2 admits one resolved, non-negative `begin` clock per animation and no
restart mechanism. Its priority is consequently fixed for the source
snapshot:

1. the animation whose interval begins later has higher priority; and
2. when interval begin times are equal, the animation element appearing later
   in XML document order has higher priority.

Document order alone is not sufficient: an earlier animation element with a
later `begin` masks a later element whose interval began earlier.

An internal repeat boundary does not begin a new interval and does not change
priority. A frozen effect keeps the priority of the interval that produced it.
Thus a later temporary replacement may mask a frozen layer, and the frozen
layer becomes visible again when the replacement removes.

General SMIL also defines priority for timing dependencies and restarts. Those
cases are unreachable here because Profile 2 continues to reject sync-base,
event, repeat-event, begin-list, script-triggered, and restart timing. The
static pair `(interval begin, document order)` must not be generalized to
those future families; they require priority derived from resolved interval
activation.

## Sampling procedure

For each target/property sandwich, a processor:

1. validates every layer and its live target, including inactive and masked
   layers;
2. determines each layer's contribution at the exact requested sample time;
3. selects the highest-priority contributing layer;
4. samples that layer under the inherited keyframe, easing, repeat, and fill
   rules; and
5. emits its one typed replacement value, or no value when no layer
   contributes.

Program validation and frame construction remain atomic. An invalid or stale
masked layer still rejects Sample; priority cannot hide an invalid program.
Sampling remains stateless, so direct seeking and any prior sample sequence
produce the same sandwich result at the same time.

## Boundaries and fallthrough

The inherited active interval is begin-inclusive and end-exclusive.

- Before a higher layer begins, the next contributing lower layer or base is
  visible.
- At the higher layer's exact begin, its first keyframe replaces lower layers.
- At an internal repeat boundary, that same layer remains in place and samples
  its first keyframe for the new iteration.
- At its final active end, `fill="remove"` stops contributing immediately and
  reveals the next contributing layer or base.
- At that end, `fill="freeze"` contributes the exact final keyframe and keeps
  masking lower layers.

Fallthrough samples a lower animation at the current document time. It does
not resume that animation from the point at which it became hidden.

## Validation and diagnostics

Profiles 0 and 1 continue to reject a second animation for the same
target/property pair. Profile 2 accepts it only when every layer independently
conforms to the cumulative profile.

A source processor preserves document order before any canonical grouping by
runtime target. If an already resolved runtime target later becomes stale or
inapplicable, diagnostics identify every layer in its sandwich because target
validity is contribution-independent. Compile-time target-resolution errors
identify the offending source site. A sampled effective-state failure
identifies the winning contributors that produced the failed value set rather
than unrelated inactive or masked layers.

## Conformance

Profile 2 adds these laws to the inherited conformance contract:

- every Profile 1 source samples bit-identically under Profile 2;
- a later interval begin wins even when its animation element appears earlier
  in document order;
- equal interval begins are resolved by later document order;
- before a higher layer begins, a contributing lower layer remains visible;
- at a higher layer's `remove` end, the lower layer is sampled at the current
  document time and becomes visible again;
- a higher frozen layer continues to mask lower layers;
- when every layer is inactive or removed, the authored base is observed;
- repeat iteration boundaries do not change layer priority;
- each target/property pair emits at most one effective value;
- arbitrary direct-seek order does not change the result; and
- an invalid masked layer rejects the complete sample.

Boundary tests probe one nanosecond before, exactly at, and one nanosecond
after each admitted begin, repeat, and active-end time. Browser differential
tests use only times representable by both systems and explicitly seek the SVG
timeline; their tolerances do not replace the profile's exact internal oracle.

## Deferred families

Profile 2 resolves only replacement sandwiches over the existing scalar
property family. Profile 3 separately resolves addition and accumulation.
`by`, lone-`to` animation, dynamic
interval priority, begin lists, sync-base and event timing, restarts,
indefinite timing, CSS/Web Animations interaction, transforms, motion paths,
colors and paints, more targets and properties, and optimized execution remain
outside this profile.

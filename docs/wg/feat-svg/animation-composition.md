---
title: "SVG Animation Profile 3: Additive Composition"
description: "A deterministic SVG animation subset for typed additive sandwiches and cumulative repeat iterations."
keywords:
  - svg
  - animation
  - smil
  - animation sandwich
  - additive animation
  - cumulative animation
  - deterministic rendering
tags:
  - internal
  - wg
  - canvas
  - svg
  - rendering
format: md
---

# SVG Animation Profile 3: Additive Composition

**Status:** Accepted source profile.

SVG Animation Profile 3 extends [SVG Animation Profile
2](./animation-sandwiches) with typed addition between sandwich layers and
terminal-value accumulation across repeat iterations. It is cumulative: every
source accepted by Profile 2 is accepted by Profile 3 and produces the same
sampled values, including the same binary32 bits.

All inherited source, timing, interpolation, priority, target, failure, and
trust-boundary rules remain normative unless this document replaces them.
Profile 3 replaces only the composition grammar and the replacement-only
sampling procedure. It does not add `by`, lone-`to` animation, another target
element, or another animated property.

The behavior follows SMIL's [additive and cumulative animation
model](https://www.w3.org/TR/2001/REC-smil-animation-20010904/#AnimFuncAdditive)
inside the deliberately bounded source and numeric domains of Profiles 0–2.

## Composition vocabulary

Profile 3 admits these values on every otherwise admitted `<animate>`:

| Attribute    | Absent means | Admitted values  | Operation                                     |
| ------------ | ------------ | ---------------- | --------------------------------------------- |
| `additive`   | `replace`    | `replace`, `sum` | composition against the lower sandwich result |
| `accumulate` | `none`       | `none`, `sum`    | composition across repeat iterations          |

The attributes are orthogonal. All four combinations are admitted for `x`,
`y`, `width`, `height`, and `opacity`. Unknown values are errors; a processor
must not treat them as the absent defaults.

Effect composition and iteration composition have different operands:

- `additive="replace"` makes the effect replace its lower-priority underlying
  sandwich value.
- `additive="sum"` adds the effect to that underlying value.
- `accumulate="none"` uses the effect's simple value for the current
  iteration.
- `accumulate="sum"` first adds a multiple of the effect's terminal value to
  its current simple value. The resulting effect is then replaced or added as
  selected by `additive`.

The operations are typed property operations, not string concatenation and
not a second untyped value channel. Each result projects back into the same
property representation as its target.

## Iteration accumulation

Let:

- `V(p)` be the inherited simple animation value at progress `p`, after
  keyframe selection, easing, and interpolation;
- `T` be the terminal simple value at the end of one simple duration; and
- `k` be the zero-based repeat index.

For `from`/`to`, `T` is `to`. For `values`, `T` is the last list item,
regardless of which keyframe interval contains `p`. For a one-value animation,
that one value is both `V` and `T`.

The effect value is:

```text
E(p, k) = V(p)                         when accumulate = none
E(p, k) = V(p) + k × T                 when accumulate = sum
```

Accumulation uses the terminal value itself, not the change `T - V(0)` and
not the value sampled immediately before a repeat boundary. When `k = 0`, both
accumulation modes are bit-identical.

For an underlying sandwich value `U`, the four combinations are:

| `additive` | `accumulate` | Result for this layer | Cuts off lower layers |
| ---------- | ------------ | --------------------- | --------------------- |
| `replace`  | `none`       | `V(p)`                | yes                   |
| `sum`      | `none`       | `U + V(p)`            | no                    |
| `replace`  | `sum`        | `V(p) + k × T`        | yes                   |
| `sum`      | `sum`        | `U + (V(p) + k × T)`  | no                    |

Iteration accumulation never changes sandwich priority. In particular,
`additive="replace" accumulate="sum"` is still a replacement layer and is a
cutoff; accumulation changes its value, not its relationship to lower layers.

## Repeat and fill boundaries

Profile 0's begin-inclusive, end-exclusive active interval remains in force.
At an exact internal repeat boundary, the next iteration has begun: `k`
increments by one and `p` is exactly zero. An accumulated effect therefore
contributes `V(0) + k × T` at that instant. Sampling just before the boundary
still uses the preceding iteration and its progress.

At the final active end:

- `fill="remove"` contributes nothing and immediately falls through to the
  next contributing layer or the authored base; and
- `fill="freeze"` uses terminal progress with `k = N - 1`, where `N` is
  `repeatCount`.

Consequently a frozen `accumulate="sum"` effect has value `N × T`. A frozen
additive effect continues to add that value at its unchanged sandwich
priority. Direct seeking to the final end and arriving there through playback
must agree.

## Additive sandwich procedure

For each target/property pair, contributing effects are first ordered from
lowest to highest priority by Profile 2. Active and frozen effects contribute;
pre-begin and post-remove effects do not.

The result is then formed as follows:

1. Find the highest-priority contributing effect whose `additive` operation is
   `replace`.
2. Discard every contributing effect below that replacement. If a replacement
   exists, its accumulated effect value is the initial result. Otherwise the
   authored base value is the initial result.
3. Visit each remaining higher-priority effect in ascending priority. Compute
   its iteration-accumulated effect value, then replace or add it according to
   `additive`.
4. Project the final typed value back to the target property and emit at most
   one effective value for that target/property pair.

This is an ordered fold, not an algebraic reduction. Additions must not be
reassociated, regrouped, or evaluated in document order after priority has
been resolved. A replacement masks both the authored base and all lower
effects, while higher additive effects still compose over it.

Every layer and live target is validated before sampling, including inactive
and masked layers. Arithmetic below the highest contributing replacement
cutoff is not evaluated, because it cannot influence the result. Thus a stale
masked target is still an error, but numeric overflow in a masked lower
effect's unused composition is not.

## Typed domains and authored base

The source domains of Profile 0 remain unchanged:

| Property          | Admitted authored/keyframe values    | Additive underlying value |
| ----------------- | ------------------------------------ | ------------------------- |
| `x`, `y`          | finite binary32 SVG number           | start-edge coordinate     |
| `width`, `height` | finite, non-negative binary32 number | fixed extent              |
| `opacity`         | binary32 number in `[0, 1]`          | scalar opacity            |

An animation sandwich containing any `additive="sum"` layer requires the
authored base to retain that exact numeric projection. An `x` or `y` base
represented by a center pin, end pin, or two-edge span is not silently
converted to a start-edge coordinate. An automatic size is not silently
resolved into a fixed extent. The requirement is checked for the compiled
source snapshot and again when sampled, so a later structural change cannot
alter the meaning of addition.

The requirement applies even when the additive layer is inactive or happens
to sit below a contributing replacement at one requested time. This keeps
program validity independent from contribution state and prevents a masked
source error from appearing only after a seek.

A replacement-only sandwich does not need the base as an arithmetic operand,
but it still inherits Profile 0's target-identity and one-to-one
materialization requirements.

## Exact numeric contract

Profile 1's exact keyframe interpolation produces one stored binary32 simple
value. Profile 3 adds two separately rounded operations:

1. **Accumulation:** interpret the stored `V` and `T` bits as exact values,
   evaluate `V + k × T` mathematically, then round once to finite IEEE 754
   binary32 using round-to-nearest, ties-to-even.
2. **Sandwich addition:** interpret the current underlying bits and the
   already accumulated effect bits as exact values, add them mathematically,
   then round once by the same rule.

Every additive layer performs step 2 independently in low-to-high priority
order. Accumulation and sandwich addition are never fused into one rounding,
and several sandwich additions are never collapsed into a total. Replacement
copies the accumulated effect bits without another arithmetic rounding.

An exact zero sum is negative zero only when both addends are negative zero;
otherwise it is positive zero. Any accumulation or influential sandwich
addition whose rounded result is non-finite is an error rather than a
saturated value.

`opacity` is the one final projection clamp. Its composed binary32 values are
not clamped between layers. After the complete sandwich has been folded, a
value below zero projects to zero, a value above one projects to one, and a
value already in `[0, 1]` is unchanged. This does not relax the inherited
`[0, 1]` source-keyframe domain. Coordinates and extents have no corresponding
final clamp.

## Validation and diagnostics

Profile 3 inherits whole-document atomic validation. In addition to inherited
failures, Sample rejects:

- an `additive` value other than `replace` or `sum`;
- an `accumulate` value other than `none` or `sum`;
- an additive sandwich whose authored base lacks the required typed numeric
  projection or violates that property's source domain, at compilation or
  after a later document change; or
- a non-finite result from influential accumulation or sandwich addition.

Diagnostics identify the source-located animation, target/property pair, and
failed operation. An arithmetic failure identifies the failing effect and the
already-applied prefix on which it depends; later effects that were never
evaluated are not implicated. An unsupported authored-base shape names both
the required numeric projection and the observed shape, while an invalid
scalar names the violated domain. A masked or inactive stale target continues
to identify all layers in its target sandwich. Failure produces neither a
partial effective-value set nor a partial frame.

## Conformance

Profile 3 adds these laws to the inherited conformance contract:

- every Profile 2 source samples bit-identically under Profile 3;
- all four `additive`/`accumulate` combinations are tested at the first
  keyframe, an interior sample, every repeat boundary, and the final end;
- `accumulate="sum"` uses the terminal keyframe value, including for a
  non-monotonic `values` list whose terminal differs from an earlier maximum;
- at an internal boundary, the result is the next iteration's first value plus
  its terminal-value accumulation;
- the frozen cumulative effect value is `repeatCount × T`, while remove falls
  through at the same exact end time;
- `replace` remains the sandwich cutoff when paired with `accumulate="sum"`;
- additions above the cutoff run in low-to-high priority order with one
  binary32 rounding per operation;
- the authored base is used only when no contributing replacement cuts it off;
- an additive stack rejects unsupported authored-base projections even when
  the additive layer is currently inactive or masked;
- non-finite influential arithmetic rejects Sample, while unused arithmetic
  below a replacement cutoff is not evaluated;
- `opacity` is clamped once after the final composition rather than after each
  layer; and
- every accepted direct seek is independent of prior sample order.

A canonical scalar matrix uses authored base `10`, `from="20"`, `to="30"`,
`dur="1s"`, `repeatCount="3"`, and `fill="freeze"`. At times `0`, `0.5`, `1`,
`1.5`, `2`, `2.5`, and `3` seconds, the required results are:

| `additive` | `accumulate` | Required sequence             |
| ---------- | ------------ | ----------------------------- |
| `replace`  | `none`       | `20, 25, 20, 25, 20, 25, 30`  |
| `sum`      | `none`       | `30, 35, 30, 35, 30, 35, 40`  |
| `replace`  | `sum`        | `20, 25, 50, 55, 80, 85, 90`  |
| `sum`      | `sum`        | `30, 35, 60, 65, 90, 95, 100` |

These values are semantic vectors. Bit-level conformance additionally uses
non-associative boundary operands that distinguish ordered per-layer rounding
from regrouped arithmetic. Browser differential results remain separate from
the profile's exact oracle because browser arithmetic and the wider SVG source
domain are not this profile's numeric contract.

## Deferred families

Profile 3 resolves addition and terminal-value repeat accumulation only for
the inherited scalar property set. `by`, lone-`to` animation,
`calcMode="discrete"`, `calcMode="paced"`, transforms, motion paths, colors,
paint servers, lists and paths, additional SVG targets and properties, wider
presentation-clamped source domains, begin lists, timing dependencies,
restarts, indefinite timing, CSS/Web Animations interaction, and optimized or
compositor execution remain outside this profile.

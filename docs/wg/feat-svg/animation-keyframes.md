---
title: "SVG Animation Profile 1: Keyframes and Easing"
description: "A deterministic SVG animate subset with value lists, explicit key times, and cubic Bézier easing."
keywords:
  - svg
  - animation
  - keyframes
  - easing
  - smil
  - deterministic rendering
tags:
  - internal
  - wg
  - canvas
  - svg
  - rendering
format: md
---

# SVG Animation Profile 1: Keyframes and Easing

**Status:** Accepted source profile.

SVG Animation Profile 1 extends [SVG Animation Profile 0](./animation) with
ordered keyframe values, authored key times, and cubic Bézier easing. It is a
cumulative profile: every source accepted by Profile 0 is accepted by Profile
1 and must produce the same sampled values, including the same binary32 bits.

All Profile 0 rules remain normative unless this document replaces them. In
particular, Profile 1 inherits its Base and Sample policies, retained-source
contract, targets and properties, exact nanosecond timeline, repeat and fill
behavior, replacement-only composition, whole-document failure, diagnostics,
and trust boundary. This document replaces only Profile 0's animation
attribute vocabulary and its **Values and interpolation** section. Where
Profile 0 says `from`, `to`, or frozen `to`, Profile 1 generalizes those terms
to the first or final effective keyframe.

The vocabulary and broad behavior follow the [SVG animation value
attributes](https://svgwg.org/specs/animations/#ValueAttributes), which in
turn use the [SMIL animation-function
model](https://www.w3.org/TR/2001/REC-smil-animation-20010904/#AnimFuncValues).
Profile 1 deliberately narrows that model where this document says so.

[SVG Animation Profile 2](./animation-sandwiches) is the cumulative extension
for several ordered replacement effects on one target/property pair.

## Scope of the extension

Profile 1 adds `values`, `keyTimes`, and `keySplines` to Profile 0's admitted
`<animate>` attributes. `calcMode` may be absent, `linear`, or `spline`.

The complete value forms are:

| Authored form                    | Profile 1 meaning                                      |
| -------------------------------- | ------------------------------------------------------ |
| `values="v"`                     | one constant keyframe                                  |
| `values="v0;v1;..."`             | an ordered keyframe sequence                           |
| `from="v0" to="v1"`              | the two-keyframe sequence `v0;v1`                      |
| any `values` plus `from` or `to` | `values` selects the form; `from` and `to` are ignored |

Presence of the `values` attribute selects the values form before its contents
are parsed. Consequently, an empty or malformed `values` attribute fails
Profile 1 and never falls back to otherwise valid `from` and `to` attributes.
Conversely, ignored `from` and `to` attributes do not have to be valid target
values. This is SVG's precedence rule, not a conflict-repair rule: the
[`values` definition](https://svgwg.org/specs/animations/#ValuesAttribute)
states that `from`, `to`, and `by` are ignored when a values list is used.

When `values` is absent, both `from` and `to` remain required exactly as in
Profile 0. `by` is outside Profile 1 even when SVG would ignore it beside
`values`; a lone `to` and a lone `from` are outside as well.

`discrete` and `paced` calculation, addition, accumulation, and every other
animation family deferred by Profile 0 remain deferred. In particular,
Profile 1 does not broaden the target element or property set.

## Keyframe values

`values` is a semicolon-separated list. XML whitespace around each value and
separator is ignored. One final semicolon, optionally followed by whitespace,
is ignored; an empty interior item or more than one empty trailing item is an
error. This follows [SVG's values-list parsing](https://svgwg.org/specs/animations/#ValuesAttribute).
The validity of a one-item list is independently exercised by the
[single-value web-platform-test](https://github.com/web-platform-tests/wpt/blob/master/svg/animations/single-values-animation.html).

Each item is parsed once under Profile 0's target-specific value and binary32
rules. Every item must be finite and valid for the animated property: sizes
remain non-negative and opacity remains in `[0, 1]`. The parsed bit pattern is
the keyframe value. Parsing or interpolating another item cannot change it.

A list has either one item or at least two:

- A one-item list is a constant animation. It is admitted only with absent or
  `linear` `calcMode` and without `keyTimes` or `keySplines`. The exact stored
  value contributes throughout every active interval and is the frozen value.
  This is a deliberate Profile 1 restriction: a constant has no interval to
  time or ease.
- A list with at least two items supplies one value for every key time. The
  first value applies at simple progress zero and the final value is the
  terminal frozen value.

## Key times

For `N >= 2` keyframes, omitted `keyTimes` defines the exact offsets

```text
t[i] = i / (N - 1), for i = 0 ... N - 1.
```

Thus both linear and spline modes divide the simple duration into `N - 1`
equal intervals when no key times are authored, matching the [SMIL calculation
mode rules](https://www.w3.org/TR/2001/REC-smil-animation-20010904/#AnimFuncCalcMode).

An explicit `keyTimes` value is a semicolon-separated list of SVG numbers.
Whitespace around items and separators and one final semicolon are accepted;
the trailing-semicolon behavior has dedicated [web-platform-test
coverage](https://github.com/web-platform-tests/wpt/blob/master/svg/animations/scripted/keytimes-attribute-trailing-semi.html).
Each token is interpreted as its exact base-ten rational value, not first
rounded through binary floating point.

For `N >= 2`, an explicit list must satisfy all of these rules:

1. it contains exactly `N` offsets;
2. every offset is in `[0, 1]`;
3. the first offset is exactly `0` and the last is exactly `1`; and
4. each offset is strictly greater than its predecessor.

[SVG permits equal neighboring offsets](https://svgwg.org/specs/animations/#KeyTimesAttribute)
by requiring only a non-decreasing list. Profile 1 deliberately requires
strict increase. This removes zero-duration segments and gives every accepted
simple progress one unambiguous interval while retaining SVG behavior for the
admitted domain.

Let simple progress be the exact rational `p`. For `0 <= p < 1`, interval
selection chooses the unique `i` satisfying

```text
t[i] <= p < t[i + 1].
```

If `p` equals `t[i]`, the sampled result is the exact stored bits of keyframe
`i`; interpolation is not evaluated. At an internal repeat boundary, Profile
0's timing rule starts the next iteration at `p = 0`, so the first keyframe is
selected. At final active end, `remove` contributes nothing and `freeze`
contributes the exact final keyframe bits.

## Linear interpolation

Absent `calcMode` means `linear`. Within the selected interval, segment-local
progress is the exact rational

```text
q = (p - t[i]) / (t[i + 1] - t[i]).
```

For neighboring stored binary32 values `a` and `b`, the sampled value is the
exact mathematical result

```text
a + (b - a) × q
```

rounded once to IEEE 754 binary32 using round-to-nearest, ties-to-even. No
intermediate binary floating-point rounding participates. Exact key times use
the stored keyframe bits directly, including signed-zero bits.

SVG says `keySplines` is ignored unless `calcMode="spline"` ([SVG
`keySplines`](https://svgwg.org/specs/animations/#KeySplinesAttribute)).
Profile 1 follows that rule: a syntactically valid `keySplines` attribute on a
linear animation does not affect timing, interpolation, or list-count
validation. The strict source policy still validates every present tuple and
coordinate; malformed syntax or an out-of-range coordinate remains an error.

## Spline interpolation

`calcMode="spline"` retains the same keyframe values, key times, and interval
selection as linear mode. It replaces the segment-local progress `q` with an
eased progress `e` before the final property interpolation.

For `N >= 2`, `keySplines` is required and contains exactly `N - 1` control
point tuples, one per interval. `keyTimes` remains optional; when it is absent,
the equal offsets above apply. The combination of authored splines and
implicit equal times is part of the [SMIL calculation-mode
model](https://www.w3.org/TR/2001/REC-smil-animation-20010904/#AnimFuncCalcMode).
The [spline-values web-platform-test](https://github.com/web-platform-tests/wpt/blob/master/svg/animations/animate-calcMode-spline-values.html)
provides a reference case with explicit times.

Tuples are separated by semicolons. A tuple has four SVG numbers
`x1 y1 x2 y2`; commas, whitespace, or a mixture of both may separate its
coordinates. XML whitespace around tuples and one final semicolon are
accepted. Empty tuples, the wrong number of coordinates, or the wrong number
of tuples are errors. The [mixed-separator web-platform-test](https://github.com/web-platform-tests/wpt/blob/master/svg/animations/animate-keySplines.html)
is a representative grammar oracle.

Every coordinate, including `y1` and `y2`, must lie in `[0, 1]`. This is SVG's
control-point domain and is intentionally narrower than [CSS
`cubic-bezier()`](https://www.w3.org/TR/css-easing-1/#cubic-bezier-easing-functions),
whose y coordinates may escape the unit interval. SVG's y restriction is
covered directly by [web-platform-tests](https://github.com/web-platform-tests/wpt/blob/master/svg/animations/keysplines-y-limits.html).
The exact authored decimal is checked against `[0, 1]` before numeric storage;
binary32 rounding cannot repair an out-of-domain control. Each admitted
coordinate is then parsed once into finite IEEE 754 binary32 using Profile 0's
round-to-nearest, ties-to-even source-number rule. The exact rational value of
that stored binary32 bit pattern participates in the cubic calculations below;
the authored decimal is not reparsed during sampling. Signed zero is
semantically zero for the control-point domain and diagonal comparison.

For one tuple, define the cubic coordinate function

```text
C(a, b, u) = 3(1-u)^2 u a + 3(1-u) u^2 b + u^3.
Bx(u) = C(x1, x2, u)
By(u) = C(y1, y2, u)
```

The implied endpoints are `(0, 0)` and `(1, 1)`. Eased progress is `By(u)`
where `u` solves `Bx(u) = q`.

Profile 1 fixes inversion rather than leaving a tolerance or machine math
library as hidden input:

1. `q = 0` returns `e = 0`, and `q = 1` returns `e = 1` exactly.
2. If `x1 = y1` and `x2 = y2`, the curve lies on the diagonal and returns
   `e = q` exactly.
3. Otherwise begin with the exact rational bracket `[0, 1]`. At each step,
   evaluate `Bx` at the exact midpoint. Equality returns `By` at that midpoint
   immediately. A result below `q` replaces the lower bound; a result above
   `q` replaces the upper bound.
4. After 128 unequal comparisons, evaluate `By` at the exact midpoint of the
   final bracket. That rational result is `e`.

The final property value is the exact mathematical interpolation
`a + (b - a) × e`, rounded once to binary32 with ties-to-even. The inversion,
cubic evaluation, and property interpolation use the exact rational values of
the already parsed keyframe and control-point bits and perform no intermediate
binary floating-point rounding. These rules make direct seek, sequential
playback, and different conforming implementations agree without sharing a
tolerance, iteration-by-error exit, or platform math library.

## Bounded source domain

Profile 1 places finite limits on the new source vocabulary so validation and
sampling have a portable resource bound:

- a `values` list contains at most 4,096 keyframes;
- a `keySplines` list contains at most 4,095 tuples, including when linear mode
  ignores the tuples semantically;
- each spline-control token is at most 128 bytes after XML-whitespace
  separation;
- a spline-control decimal exponent is in the inclusive range `[-128, 128]`;
- each XML-whitespace-trimmed `keyTimes` token is at most 128 bytes;
- a `keyTimes` decimal exponent is in the inclusive range `[-128, 128]`; and
- after exact decimal reduction, each `keyTimes` numerator and positive
  denominator fits the unsigned 64-bit integer domain.

These are deliberate Profile 1 restrictions, not claims about SVG's general
limits. Exceeding any limit is a source-profile error discovered during atomic
validation, not a sample-time fallback or partial animation.

## Validation and diagnostics

Profile 0's atomic Sample policy applies to the complete Profile 1 inventory.
In addition to inherited failures, Profile 1 rejects:

- a missing value form, or `from` without `to` when `values` is absent;
- an empty, internally empty, mistyped, non-finite, or out-of-domain keyframe;
- interpolation metadata on a one-keyframe constant;
- a malformed, out-of-range, non-endpoint, non-increasing, or wrong-length
  explicit `keyTimes` list;
- `calcMode` other than absent, `linear`, or `spline`;
- a missing or wrong-length spline list in spline mode; or
- a malformed or out-of-range spline control point.

A diagnostic identifies the animation and source location, the attribute and
list index when applicable, the required count or domain, and the observed
value. Value-form selection happens before validation, so diagnostics for a
present malformed `values` attribute must not claim that `from` or `to` was
missing.

## Conformance

Profile 1 adds these laws to Profile 0's conformance contract:

- every Profile 0 source samples bit-identically under Profile 1;
- `values` wins over `from` and `to`, and malformed `values` never falls back;
- a one-value animation is bit-constant across active time and freeze;
- implicit equal times and their explicitly authored equivalents agree;
- every interior key time is probed immediately before, exactly at, and
  immediately after the boundary, with exact keyframe bits at equality;
- equal, descending, non-zero-first, non-one-last, and wrong-count key times
  fail atomically;
- valid spline syntax without authored key times uses equal intervals;
- linear mode is unchanged by a valid `keySplines` attribute;
- diagonal splines and segment endpoints take their exact fast paths;
- non-trivial splines match reference vectors produced by the 128-step exact
  inversion contract;
- each source limit is tested at its admitted edge and immediately beyond it;
  and
- the final frozen value is the last keyframe, not an ignored `to` attribute.

The applicable [web-platform-tests SVG animation
suite](https://github.com/web-platform-tests/wpt/tree/master/svg/animations)
remains a semantic oracle. Profile 1's strict-increase rule, exact rational
boundaries, binary32 bit rules, and fixed spline inversion are profile
conformance requirements, not browser-differential tolerances. Browser and
profile conformance results therefore remain separate, as required by Profile 0.

## Deferred families

Profile 1 resolves only Profile 0's keyframe-list and easing deferral.
Profile 2 separately resolves replacement sandwiches.
Profile 3 separately resolves addition and accumulation.
Profile 4 separately resolves live-underlying scalar effects and a bounded
typed transform family.
Profile 5 separately resolves straight-sRGB solid-fill paints.
`calcMode="discrete"`, `calcMode="paced"`, `by`, lone-`to` animation,
transforms, motion paths, colors and paints,
additional SVG targets and properties, indefinite timing, event timing, CSS
animation, and optimized execution remain outside this profile.

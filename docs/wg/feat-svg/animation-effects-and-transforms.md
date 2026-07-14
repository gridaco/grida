---
title: "SVG Animation Profile 4: Underlying Effects and Transforms"
description: "A deterministic SVG animation subset for live underlying-value effects and typed transform-list animation."
keywords:
  - svg
  - animation
  - smil
  - animateTransform
  - transform animation
  - animation sandwich
  - deterministic rendering
tags:
  - internal
  - wg
  - canvas
  - svg
  - rendering
format: md
---

# SVG Animation Profile 4: Underlying Effects and Transforms

**Status:** Accepted source profile.

SVG Animation Profile 4 extends [SVG Animation Profile
3](./animation-composition) with two typed effect families:

- scalar lone-`to` animation, whose start value is the live lower sandwich
  result; and
- `<animateTransform>` for ordered `translate`, `scale`, and `rotate`
  operations.

It is cumulative: every source accepted by Profile 3 is accepted by Profile 4
and produces the same sampled values, including the same binary32 bits.
All inherited source preservation, timing, interpolation, priority, failure,
diagnostic, and trust-boundary rules remain normative unless this document
replaces them.

This profile extends the typed animation-effect model, not the playback model.
Sampling remains an explicit, stateless query at one exact document time.

[SVG Animation Profile 5](./animation-solid-fills) is the cumulative
extension for straight-sRGB solid-fill paint animation.

The behavior follows SVG's [animation value
attributes](https://svgwg.org/specs/animations/#ValueAttributes), [addition
attributes](https://svgwg.org/specs/animations/#AdditionAttributes), and
[`animateTransform` element](https://svgwg.org/specs/animations/#AnimateTransformElement),
within the deliberately bounded source and numeric domains of Profiles 0–3.
The underlying-value behavior comes from SMIL's [from/to/by and additive
rules](https://www.w3.org/TR/2001/REC-smil-animation-20010904/#FromToByAndAdditive),
and effect order remains the [animation sandwich
model](https://www.w3.org/TR/2001/REC-smil-animation-20010904/#AnimationSandwichModel).

## Scope of the extension

Profile 4 adds one form to the inherited scalar `<animate>` grammar:

```xml
<animate attributeName="x" to="240" dur="1s" />
```

When `values` and `from` are both absent and `to` is present, the element is a
lone-`to` effect. It targets the same `<rect>` properties as Profiles 0–3:
`x`, `y`, `width`, `height`, and `opacity`. A lone `from` remains invalid.
When `values` is present, Profile 1's precedence rule still selects the values
form and ignores `from` and `to`; this does not create a lone-`to` effect.

Profile 4 also admits `<animateTransform>` in the SVG namespace. It targets
the `transform` property of the same `<rect>` target surface, using the same
immediate-parent or bare same-document `href` resolution rules as `<animate>`.
Its admitted animated operation types are `translate`, `scale`, and `rotate`.

```xml
<rect id="tile" x="40" y="30" width="120" height="80">
  <animateTransform
    attributeName="transform"
    type="rotate"
    values="0 100 70; 12 100 70; -8 100 70; 0 100 70"
    dur="1200ms"
    calcMode="spline"
    keySplines="0.2 0.8 0.2 1; 0.4 0 0.6 1; 0.8 0 0.8 0.2"
    repeatCount="2"
    fill="freeze"
  />
</rect>
```

An admitted `<animateTransform>` contains whitespace only. Apart from
namespace declarations and optional `id`, its complete attribute vocabulary
is `href`, `attributeName`, `type`, `from`, `to`, `values`, `begin`, `dur`,
`repeatCount`, `fill`, `calcMode`, `keyTimes`, `keySplines`, `additive`, and
`accumulate`. `attributeName` is required and must be exactly `transform`.
`type` may be absent, which means `translate`, or one of the three admitted
type names. Any other attribute or type is rejected.

The complete `<animateTransform>` value forms are:

| Authored form                    | Profile 4 meaning                            |
| -------------------------------- | -------------------------------------------- |
| `from="v0" to="v1"`              | two typed transform-operation keyframes      |
| `values="v"`                     | one constant typed operation                 |
| `values="v0;v1;..."`             | an ordered typed-operation keyframe sequence |
| any `values` plus `from` or `to` | `values` selects the form                    |

When `values` is absent, both `from` and `to` are required. A lone `to`, lone
`from`, `by`, or `from`/`by` transform form is rejected. SVG leaves lone-`to`
`<animateTransform>` behavior undefined; Profile 4 does not infer a transform
from the lower list.

All inherited linear and spline keyframe rules apply. `discrete` and `paced`
calculation remain deferred.

## Typed effect classes

Each contributing animation layer has one of three composition classes:

1. **replacement** supplies a complete value and cuts off lower layers;
2. **additive** combines its independently sampled value with the lower
   sandwich result; or
3. **underlying-dependent** samples between the live lower result and an
   authored target without cutting off that lower result.

Ordinary scalar animations and `<animateTransform>` select replacement or
additive composition through the inherited `additive` attribute. Scalar
lone-`to` animation is always underlying-dependent. The classes are semantic;
they do not introduce another source attribute.

For each target/property pair, contributing effects retain Profile 2's
low-to-high priority order. A processor may skip every layer below the highest
contributing replacement, because that replacement cuts off the prefix. It
then folds each remaining higher layer in order using that layer's typed
composition rule. A lone-`to` layer consumes the result already produced by
the lower prefix. Two lone-`to` layers therefore compose sequentially rather
than sharing one captured base value.

## Scalar lone-`to` effects

Let:

- `U(t)` be the live, typed result of the already folded lower sandwich at
  document time `t`;
- `T` be the parsed `to` value; and
- `q(t)` be the inherited linear or spline eased simple progress.

While the effect contributes, its result is:

```text
R(t) = U(t) + (T - U(t)) × q(t)
```

This is a live lower-sandwich dependency. `U(t)` is not captured when the
interval begins, when source is compiled, or on the first sample. If a lower
animation changes, direct sampling of the lone-`to` layer at the same time
uses that lower animation's current result.

The effect is forced non-additive and non-cumulative. The inherited admitted
`additive` and `accumulate` spellings are still parsed and validated, but
neither attribute changes this effect class. In particular,
`additive="replace"` does not turn the layer into a replacement cutoff, and
`additive="sum" accumulate="sum"` neither adds nor accumulates. SVG's
lone-`to` form remains underlying-dependent.

The one authored `to` value and the live underlying value act as a virtual
two-keyframe interval for timing. Omitted `keyTimes` therefore means `0;1`.
If present, `keyTimes` must contain exactly `0;1`. Spline mode requires exactly
one `keySplines` tuple. All tuple parsing, exact inversion, and validation
rules are inherited from Profile 1. No more than one interpolation segment is
available in this form.

At eased progress zero, the result is the exact existing bits of `U(t)` and no
arithmetic is evaluated. At eased progress one, the result is the exact stored
bits of `T`. At an interior progress, the exact mathematical expression above
is rounded once to IEEE 754 binary32 using round-to-nearest, ties-to-even.
The lower value is the unprojected typed sandwich result: in particular,
opacity is not clamped before a lone-`to` layer consumes it. Profile 3's single
final opacity clamp still occurs only after the complete sandwich is folded.

Any sandwich containing a scalar lone-`to` layer requires the authored base to
retain the same exact typed numeric projection that Profile 3 requires for an
additive layer. The requirement holds even while the lone-`to` layer is
inactive, masked, or currently above a contributing replacement. Otherwise a
later seek or fallthrough could change whether the source has a defined
underlying operand.

Profile 0 admits only positive integer repeat counts. At an exact internal
repeat boundary, simple progress resets to zero, so the lone-`to` layer is
temporarily bit-identical to its then-current lower result. At the final end,
`fill="remove"` contributes nothing and `fill="freeze"` contributes the exact
target `T`. Repeating never changes the layer's priority.

For example, with base `x="10"`, a lower replacement at `20`, and a higher
lone-`to` target of `50`, both at eased progress `0.5`, the higher result is
`35`: it interpolates from the lower result `20`, not from the authored base
`10`.

## Transform operation values

An `<animateTransform>` keyframe is one operation selected by `type`, not a
general transform list and not a transform-function string. XML whitespace
and commas may separate its finite, unitless SVG numbers. Between adjacent
numbers, a separator is either one or more XML-whitespace characters or one
comma with optional surrounding XML whitespace. Leading and trailing XML
whitespace is ignored; a leading, trailing, or repeated comma is invalid.
Every value is canonicalized to one fixed parameter vector:

| `type`      | Admitted authored parameters | Canonical operation                                   |
| ----------- | ---------------------------- | ----------------------------------------------------- |
| `translate` | `tx` or `tx ty`              | `Translate(tx, ty)`, with omitted `ty = 0`            |
| `scale`     | `sx` or `sx sy`              | `Scale(sx, sy)`, with omitted `sy = sx`               |
| `rotate`    | `angle` or `angle cx cy`     | `Rotate(angle, cx, cy)`, with omitted center `(0, 0)` |

Two-parameter `rotate`, zero-parameter values, extra parameters, units,
percentages, transform-function wrappers, and non-finite parameters are
errors. Angles are raw unitless degrees. They interpolate numerically without
wrapping or shortest-path normalization. A rotation center is expressed in
the target's current SVG user coordinate system. The center coordinates are
animated parameters, not a separately transformed point.

Translation parameters are offsets in SVG user units. Scale is about the user
coordinate origin. `Rotate(angle, cx, cy)` is the typed operation equivalent of
translating the origin to `(cx, cy)`, rotating by `angle`, then translating it
back under the same ordered SVG transform convention. Profile 4 replaces the
target's effective transform before the inherited query, damage, and rendering
pipeline; it does not redefine how the active static SVG profile relates
transforms to geometry or layout.

The selected `type` applies to every `from`, `to`, or `values` item. Different
keyframes cannot change operation type. Changing an animation's `type` changes
the typed interpretation of its complete value list; it does not request
decomposition or conversion from the old type.

For one canonical parameter component with stored endpoints `a` and `b`,
Profile 1's selected and eased progress produces:

```text
a + (b - a) × q
```

The endpoint and one-rounding rules apply independently to every component.
At an exact key time, every component is copied from the corresponding stored
keyframe bits. For rotation, angle and center coordinates use the same
interpolation rule.

## Ordered transform-list composition

The effective `transform` property is an ordered list of typed operations.
An absent authored transform supplies the empty list. Profile 4 does not
standardize or extend a static `transform` attribute grammar. When the active
static SVG source profile accepts an authored transform, its semantic value is
the ordered operation list defined by that profile. Profile 4 composes against
that value without deciding which static transform spellings or operation
types are admitted.

Let `L` be the lower transform list and `X` the sampled typed operation:

```text
replace: [X]
sum:     L ++ [X]
```

Here `++` is ordered list append. Addition does not add two numeric transform
results, merge adjacent operations, decompose an existing operation, or
change operation order. Different animated types may therefore compose in one
sandwich: an additive rotation can append after a lower translation. Ordered
transform operations are not commutative, so implementations and exporters
must preserve this topology.

A replacement transform is a sandwich cutoff exactly like an inherited
scalar replacement. It replaces the complete lower transform list with one
sampled operation. Higher additive transforms append to that singleton in
priority order. When no transform animation contributes, the authored ordered
list remains effective.

The list is the semantic animation result. Its internal storage, evaluation,
and caching are outside this source profile. A later projection cannot change
the effective operation order or resulting queries and pixels.

## Transform iteration accumulation

`accumulate="none"` and `accumulate="sum"` have the Profile 3 meanings.
Accumulation occurs in the selected operation's parameter space before
transform-list composition.

Let `P(q)` be the interpolated canonical parameter vector, `P_terminal` the
final keyframe vector, and `k` the zero-based repeat index:

```text
P_acc(q, k) = P(q) + k × P_terminal
```

The operation type remains unchanged. Addition and multiplication are
componentwise. Each component is evaluated from its stored binary32 operands
and rounded once under Profile 3's accumulation rule. Transform-list append
then introduces no additional numeric rounding.

This rule intentionally follows SVG/SMIL parameter accumulation rather than
geometric repetition. Consequences include:

- `translate` accumulates both offsets;
- `scale` accumulates both scale factors, so `from="2" to="3"` with
  `repeatCount="3"`, `accumulate="sum"`, and freeze ends as `Scale(9, 9)`;
  and
- `rotate` accumulates the angle and both center coordinates.

At an exact internal repeat boundary, `k` increments and interpolation resets
to the first parameter vector before accumulation. At the final frozen end,
`k = repeatCount - 1` and the terminal vector is used, exactly as in Profile 3. `additive` and `accumulate` remain independent: accumulation changes `X`,
while `additive` decides whether `[X]` replaces the lower list or is appended
to it.

## Validation and diagnostics

Profile 4 inherits whole-document atomic validation. In addition to inherited
failures, Sample rejects:

- a lone-`to` effect with more than one keyframe segment;
- a scalar lone-`to` sandwich whose authored base lacks its required typed
  numeric projection;
- an `<animateTransform>` with a missing or non-`transform` `attributeName`;
- an unsupported transform `type`, including `matrix`, `skewX`, or `skewY`;
- a transform value whose parameter count, separator grammar, numeric domain,
  or selected type is invalid;
- a lone-`to`, lone-`from`, `by`, or `from`/`by` transform form;
- a non-finite influential interpolation or accumulation component; or
- a failure to preserve the ordered list required by transform addition.

Validation covers every layer and live target, including inactive and masked
layers. Diagnostics identify the source-located animation, resolved target,
property, effect class, and failed typed operation. A transform-value error
names the selected `type`, expected parameter counts, and offending item. A
static transform that falls outside the active static source profile remains a
static-source error rather than being silently admitted by animation. Failure
produces neither a partial effective-value set nor a partial frame.

Profile 1's keyframe-count and spline limits apply unchanged. A transform
keyframe contains at most three numeric parameters, so admitting transform
animation does not introduce an unbounded nested value grammar.

## Conformance

Profile 4 adds these laws to the inherited conformance contract:

- every Profile 3 source samples bit-identically under Profile 4;
- scalar lone-`to` uses the live lower sandwich at the same sample time, not a
  captured authored or interval-begin value;
- a lone-`to` effect never cuts off lower layers, including when
  `additive="replace"` is explicitly authored;
- `additive="sum"` and `accumulate="sum"` do not change a scalar lone-`to`
  result;
- two lone-`to` layers consume each other sequentially in low-to-high priority
  order;
- lone-`to` progress zero preserves the lower bits, progress one preserves the
  target bits, and an exact internal repeat boundary observes the current
  lower result;
- opacity remains unclamped until the full scalar sandwich has been folded;
- every scalar lone-`to` sandwich has a valid authored-base projection even
  when a replacement currently hides that operand;
- every transform keyframe canonicalizes to exactly one operation of the
  selected type;
- translate, scale, and rotate interpolate each canonical parameter directly,
  with no angle normalization or operation decomposition;
- transform replacement produces one operation, while transform addition
  appends one operation after the lower ordered list;
- different transform types compose by ordered append without conversion;
- transform accumulation adds the terminal parameter vector once per completed
  iteration before list composition;
- a lone-`to` `<animateTransform>` is rejected rather than assigned
  implementation-specific behavior; and
- direct seek, sequential playback, typed query, and pixels agree at every
  admitted begin, keyframe, repeat, and fill boundary.

Canonical transform vectors include:

| Source                                       | Midpoint operation   |
| -------------------------------------------- | -------------------- |
| `type="translate" from="10" to="30 20"`      | `Translate(20, 10)`  |
| `type="scale" from="1" to="3 5"`             | `Scale(2, 3)`        |
| `type="rotate" from="0 10 20" to="90 30 40"` | `Rotate(45, 20, 30)` |

A composition vector uses base list `[Translate(10, 0)]`, a lower replacement
`Scale(2, 2)`, and two higher additive operations `Rotate(45, 0, 0)` then
`Translate(5, 0)`. The required result is exactly
`[Scale(2, 2), Rotate(45, 0, 0), Translate(5, 0)]`. A reordered, merged, or
decomposed result is non-conforming even if one particular geometry happens
to render the same pixels.

Browser differential tests remain separate from the profile's exact oracle.
They cover only the overlap between this profile and the browser's accepted
SVG source, use explicitly sought times, and cannot replace the binary32,
ordered-list, or whole-document validation rules above.

## Deferred families

Profile 4 resolves live scalar lone-`to` effects and a bounded typed transform
animation family. [Profile 5](./animation-solid-fills) separately resolves a
bounded solid-color `fill` family. Profile 4 does not decide the complete
static SVG transform source grammar. Static transform functions beyond the
active static source profile, animated `matrix`, `skewX`, and `skewY`, general
transform-list keyframes, transform lone-`to`, `by` and `from`/`by`, discrete
and paced interpolation, fractional repeats, motion paths, colors and paints,
additional targets and properties, resource targets, begin lists, timing
dependencies, restarts, indefinite timing, CSS/Web Animations interaction,
and optimized or compositor execution remain outside this profile.

---
title: "SVG Animation Profile 5: Solid Fill Paints"
description: "A deterministic SVG animation subset for straight-sRGB solid fills projected through the ordered paint model."
keywords:
  - svg
  - animation
  - smil
  - fill animation
  - color interpolation
  - paint
  - deterministic rendering
tags:
  - internal
  - wg
  - canvas
  - svg
  - rendering
format: md
---

# SVG Animation Profile 5: Solid Fill Paints

**Status:** Accepted source profile.

SVG Animation Profile 5 extends [SVG Animation Profile
4](./animation-effects-and-transforms) with solid-color animation of a
`<rect>` element's `fill` property. It is cumulative: every source accepted by
Profile 4 is accepted by Profile 5 and produces the same sampled values,
including the same binary32 bits and transform-list topology.

All inherited source preservation, timing, interpolation, priority,
composition, failure, diagnostic, and trust-boundary rules remain normative
unless this document replaces them. This profile adds one typed value family;
it does not add another animation element or a parallel color-only scene
property.

The source behavior follows SVG's [paint
properties](https://www.w3.org/TR/SVG2/painting.html#SpecifyingPaint),
[animation value attributes](https://svgwg.org/specs/animations/#ValueAttributes),
and [addition
attributes](https://svgwg.org/specs/animations/#AdditionAttributes), within a
deliberately narrower color grammar and deterministic numeric contract.

## Scope of the extension

Profile 5 adds `fill` to the admitted property set for `<animate>` targeting a
`<rect>`:

```xml
<rect id="tile" x="24" y="24" width="160" height="96" fill="#152238">
  <animate
    attributeName="fill"
    values="#7c3aed;#2563ebcc;#06b6d4"
    keyTimes="0;0.55;1"
    calcMode="spline"
    keySplines="0.2 0.8 0.2 1;0.4 0 0.6 1"
    dur="1200ms"
    repeatCount="2"
    fill="freeze"
  />
</rect>
```

The two uses of `fill` have distinct roles: `attributeName="fill"` selects the
paint property, while the animation element's `fill="freeze"` controls
post-interval timing behavior.

Profile 1's `from`/`to` and `values` forms, key times, linear interpolation,
and spline interpolation apply to solid-fill keyframes. Profile 3's
`additive` and `accumulate` forms apply componentwise. Profile 4's lone-`to`
form is also admitted:

```xml
<animate attributeName="fill" to="#ffffff80" dur="1s" />
```

`calcMode` remains limited to `linear` and `spline`. Discrete and paced
calculation remain deferred. `<animateTransform>` continues to target only
`transform` and cannot target a paint property.

## Admitted color literals

Every `from`, `to`, or `values` item for `fill` must be one hexadecimal sRGB
literal in this closed grammar:

```text
color ::= "#" hex hex hex
        | "#" hex hex hex hex
        | "#" hex hex hex hex hex hex
        | "#" hex hex hex hex hex hex hex hex
hex   ::= [0-9A-Fa-f]
```

After inherited XML-whitespace trimming, no additional characters are
allowed. The forms expand as follows:

| Form        | Red, green, blue               | Alpha                       |
| ----------- | ------------------------------ | --------------------------- |
| `#RGB`      | each nibble duplicated         | `255`                       |
| `#RGBA`     | each color nibble duplicated   | alpha nibble duplicated     |
| `#RRGGBB`   | three eight-bit channel values | `255`                       |
| `#RRGGBBAA` | three eight-bit channel values | final eight-bit alpha value |

The eight-digit form uses CSS/SVG's red-green-blue-alpha order, not an
alpha-red-green-blue storage order. Letter case has no semantic effect.

Named colors, `transparent`, `currentColor`, CSS color functions, system
colors, `none`, context paint, and `url(...)` paint servers are rejected as
animation values. This is a source-profile boundary, not a statement that
those spellings are semantically incapable of producing colors.

Every admitted literal denotes four exact integer channel values in
straight, unpremultiplied sRGB. RGB channels remain meaningful when alpha is
zero. The RGB integers are sRGB-encoded component values and are not
linearized before arithmetic. `color-interpolation`,
`color-interpolation-filters`, and an output surface's color space do not
change the Profile 5 interpolation space.

## Paint-list projection

The semantic target is the existing `Fills` property: an ordered list of
typed paints in painter order, first paint bottommost and last paint topmost.
`fill` animation does not create a second color property beside that list and
does not target a color field nested inside one paint.

One sampled solid-fill value projects to the complete list

```text
[ Solid(active = true, color = RGBA, blend = normal) ]
```

Alpha is carried by the solid color. The animation does not manufacture a
separate opacity layer. Replacing `fill` replaces the complete ordered list,
not only its first or last member. Consequently a contributing replacement
can cover an empty, multi-paint, gradient, or image-backed authored list when
the active static source profile can represent that list; when the effect no
longer contributes, the authored list is observed unchanged.

Addition remains a typed color operation. It adds RGBA channel values and
projects one solid paint; it never concatenates paint lists, adds another
paint layer, or modifies the authored list in place.

## Compatible underlying values

A replacement-only fill sandwich does not use its authored base as a color
operand. It therefore requires the target and complete `Fills` projection,
but it does not require the authored list itself to be a singleton solid.

An `additive="sum"` or lone-`to` fill layer does consume the lower sandwich
result. Every possible base operand for such a sandwich must therefore be
exactly one active, normal-blend solid paint. Its four straight-sRGB channels
are the typed underlying value. An empty list, several paints, a gradient,
image, inactive solid, non-normal blend, or unresolved resource is not
silently flattened or sampled into a color.

As in Profiles 3 and 4, this compatibility requirement is validated for the
authored base even when a replacement currently masks it or the dependent
layer is inactive. Program validity cannot depend on the requested sample
time. Every fill effect produced by Profile 5 is itself a compatible
singleton solid, so higher additive and lone-`to` layers can consume it.

For a lone-`to` fill effect, the live lower RGBA value `U(t)`, authored target
`T`, and inherited eased progress `q(t)` produce, componentwise,

```text
R(t) = U(t) + (T - U(t)) × q(t)
```

`U(t)` is the result already folded at the same sample time, not a color
captured at compilation, interval begin, or first playback. The layer remains
non-additive and non-cumulative exactly as Profile 4 requires. At a frozen
final end it contributes the exact authored target color.

## Straight-RGBA numeric contract

Profile 5 uses one exact channel domain through the complete fill sandwich.
In this section, `q` means the final exact segment progress selected by the
inherited calculation mode: linear segment progress or spline-eased progress.
For each channel `c` in red, green, blue, and alpha:

1. A literal supplies an exact integer `c` in `[0, 255]`.
2. Keyframe interpolation evaluates `a + (b - a) × q` exactly using the
   inherited selected and eased progress `q`.
3. `accumulate="sum"` evaluates `V + k × T` exactly, using the terminal
   keyframe channel `T` and zero-based repeat index `k`.
4. `additive="sum"` adds the effect channel to the exact lower channel.
5. Lone-`to` interpolation consumes the exact lower channel by the formula
   above.

These operations use straight channels independently. RGB is not multiplied
or divided by alpha, and alpha is not a separate post-composition scalar.
There is no channel clamp, eight-bit quantization, or binary floating-point
rounding between keyframes, repeat accumulation, or sandwich layers.

After the complete target/property sandwich has been folded, each channel is
projected exactly once:

```text
bounded   = min(255, max(0, channel))
quantized = floor(bounded + 1/2)
```

The four quantized integers form the final straight RGBA8 solid color. Thus a
half-channel tie rounds upward. Exact keyframe endpoints survive unchanged
when no other layer composes over them. Unbounded intermediate arithmetic is
intentional: a higher lone-`to` layer can consume a lower value above `255`
before the one final clamp.

This color contract replaces Profile 3's per-operation binary32 rounding only
for the `fill` value family. The inherited scalar and transform families keep
their existing numeric contracts.

## Ordering and boundaries

Profile 2's priority and Profile 3's sandwich procedure apply unchanged. A
contributing replacement fill is a cutoff for all lower fill layers and for
the authored paint list. Higher additive and lone-`to` effects fold over its
exact RGBA value in low-to-high priority order.

At an exact internal repeat boundary, simple progress resets to zero and the
repeat index increments before channel accumulation. At the final active end,
`fill="remove"` falls through to the next contributing fill layer or authored
paint list, while `fill="freeze"` retains the terminal effect value with the
final repeat's accumulation. The animation timing attribute does not alter the
paint-list topology described above.

## Validation and diagnostics

Profile 5 inherits whole-document atomic validation. In addition to inherited
failures, compilation or sampling rejects at the applicable boundary:

- a `fill` keyframe outside the four admitted hexadecimal forms;
- `none`, a CSS color function or keyword, context paint, or a paint-server
  reference used as an animated value;
- a `fill` target whose complete ordered-paint projection or one-to-one node
  identity was lost during materialization;
- an additive or lone-`to` fill sandwich whose authored base is not exactly
  one active, normal-blend solid paint; or
- an attempt to treat a gradient stop, stroke member, image source, or other
  nested paint field as this profile's fill target.

A color diagnostic identifies the source-located animation, offending value
item, resolved target, and `fill` property, and lists the four accepted forms.
An underlying-value diagnostic reports the required singleton-solid topology
and the observed paint-list topology. Resource and multi-paint values are
reported as unsupported typed values, not as malformed colors.

All layers and live targets are validated, including inactive and masked
layers. Failure produces neither a partial effective-value set nor a partial
frame. Exact rational channel evaluation has no finite-overflow failure;
implementation resource limits must be reported independently and must not be
misrepresented as a source-profile violation.

## Conformance

Profile 5 adds these laws to the inherited conformance contract:

- every Profile 4 source samples bit-identically under Profile 5;
- all four hexadecimal forms expand to the required RGBA8 endpoints,
  including CSS/SVG alpha-last order;
- red, green, blue, and alpha use the same straight-channel interpolation,
  accumulation, and addition rules;
- an RGB channel paired with zero alpha is preserved through interpolation
  rather than discarded by premultiplication;
- a replacement fill emits exactly one active, normal-blend solid paint and
  replaces the complete lower paint list;
- when no fill effect contributes, the authored ordered paint list is
  revealed without mutation or normalization;
- color addition is componentwise and never appends a paint-list member;
- additive and lone-`to` sandwiches reject every non-singleton-solid authored
  base, even while a replacement masks it;
- lone-`to` consumes the exact live lower RGBA value at the same sample time;
- no intermediate layer clamps or quantizes a channel; each completed
  sandwich clamps and quantizes every channel exactly once;
- an exact half-channel rounds upward, and exact endpoints remain exact; and
- typed query results and pixels agree with the same final singleton-solid
  `Fills` value at every keyframe, repeat, and fill boundary.

A canonical rounding vector interpolates from `#00000000` to `#01010101` at
progress `0.5`; its final color is `#01010101`. A late-clamp vector begins at
`#f00000`, adds the constant color `#20000000`, then applies a higher lone-`to`
effect toward `#000000` at progress `0.5`. The required red result is `136`:
the exact lower value `272` reaches the lone-`to` layer before final
projection. Clamping the lower layer first would incorrectly produce `128`.

Browser differential tests remain separate from this exact oracle. They use
only the source overlap admitted by both systems, seek the SVG timeline
explicitly, and record browser color serialization and pixel tolerances. A
browser's wider CSS color parser, float arithmetic, or intermediate color
projection cannot override this profile's grammar or exact-channel rules.

## Deferred families

Profile 5 resolves one solid-color fill family. It does not define general
interpolation between arbitrary paint lists or paint variants.

`stroke`, `fill-opacity`, `stroke-opacity`, `stop-color`, gradient-stop
animation, gradients, patterns, images, context paint, URL paint servers,
switching to or from `none`, multiple animated fill paints, paint visibility
or blend animation, named and functional color syntax, wider color spaces,
`color-interpolation`, discrete and paced calculation, and CSS/Web Animations
interaction remain outside this profile.

Gradient stops and stroke paints are nested inside resource or stroke
aggregates whose members need durable target identity before independent
animation can be defined. Arbitrary paint-kind and resource switching also
needs a global discrete-animation primitive. Those concerns are not modeled
as color interpolation and are not approximated by Profile 5.

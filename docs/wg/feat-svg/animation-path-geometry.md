---
title: "SVG Animation Profile 6: Path Geometry"
description: "A deterministic SVG animation subset for compatible path morphing and explicit discrete path replacement."
keywords:
  - svg
  - animation
  - path morphing
  - path data
  - discrete animation
  - deterministic rendering
tags:
  - internal
  - wg
  - canvas
  - svg
  - rendering
format: md
---

# SVG Animation Profile 6: Path Geometry

**Status:** Accepted source profile.

SVG Animation Profile 6 extends [SVG Animation Profile
5](./animation-solid-fills) with animation of a `<path>` element's `d`
property. It is cumulative: every source accepted by Profile 5 is accepted by
Profile 6 and produces the same sampled values, including the same scalar,
transform, and color bits.

All inherited source preservation, timing, keyframe, priority, failure,
diagnostic, and trust-boundary rules remain normative unless this document
replaces them. This profile adds one typed geometry value family. It does not
add a string-valued mutation channel, a second path renderer, or automatic
shape matching.

The source behavior follows SVG 2's [`d` property and path interpolation
rules](https://svgwg.org/svg2-draft/paths.html#TheDProperty) and SVG's
[animation value attributes](https://svgwg.org/specs/animations/#ValueAttributes),
within the deliberately bounded compatibility and numeric contract below.

## Scope of the extension

Profile 6 adds `<path>` as an animation target and `d` as its one newly
admitted property:

```xml
<path
  id="mark"
  d="M24 96 C24 40 120 40 120 96 C120 152 24 152 24 96 Z"
  fill="#7c3aed"
>
  <animate
    attributeName="d"
    from="M24 96 C24 40 120 40 120 96 C120 152 24 152 24 96 Z"
    to="M24 48 C72 48 120 48 120 96 C120 144 72 144 24 144 Z"
    dur="1200ms"
    fill="freeze"
  />
</path>
```

The animation may instead be a root-level `<animate href="#mark">` under
the inherited same-document target rules. The resolved target must be one
`<path>` that materializes one-to-one as one ordinary scene node, and its
complete `d` geometry must retain a one-to-one typed property projection.
Source commands are canonicalized for typed compatibility as defined below;
later rendering normalization must not replace that animation contract or
erase the retained authored source.

Because Profile 6 admits `<path>` as an ordinary materialized target, the
inherited `opacity`, solid `fill`, and `animateTransform` effects may also
target it. They retain their existing typed-property semantics and introduce
no further path-specific value family. The rectangle-only `x`, `y`, `width`,
and `height` effects remain inapplicable to `<path>`.

Profile 1's `from`/`to` and `values` forms, key times, linear interpolation,
and spline easing apply as narrowed below. Profile 2's replacement sandwich
ordering applies. Path animation is replacement-only: `additive` may be
absent or `replace`, and `accumulate` may be absent or `none`. Lone-`to`,
`by`, `additive="sum"`, and `accumulate="sum"` are rejected for `d`.

Profile 6 also admits `calcMode="discrete"` for `d`. This admission does not
extend discrete calculation to inherited scalar, transform, or paint
families.

## Admitted path values

Every static `d` value and every `from`, `to`, or `values` item is first
required to be one non-empty path-data string accepted by the complete [SVG
path-data grammar](https://svgwg.org/svg2-draft/paths.html#PathDataBNF). It may
use:

- absolute or relative move, line, horizontal-line, vertical-line, cubic,
  smooth-cubic, quadratic, smooth-quadratic, elliptical-arc, and close
  commands;
- omitted repeated command letters and repeated parameter groups; and
- the separators and numeric spellings admitted by that grammar.

`none`, an empty string, and a command stream with no drawing segment are
outside this profile. Arc flags must be exactly `0` or `1`, and arc radii must
be non-negative. Source recovery or error correction from wider SVG processing
does not repair an animation value.

Profile 6 has one source-number conversion for static and animated path data:

1. Each SVG number is parsed to the nearest finite IEEE 754 binary64 value.
2. Relative-coordinate addition and reflected shorthand controls are evaluated
   in binary64.
3. Each resulting absolute coordinate is rounded to IEEE 754 binary32 using
   round-to-nearest, ties-to-even; either signed zero becomes positive zero.
4. A non-finite result rejects the complete source.

This two-stage conversion is normative; parsing a source decimal directly to
binary32 is not equivalent at every rounding boundary. Animation does not have
a second number parser or recovery path.

The positive root SVG viewport is the fixed reference rectangle for the static
path and every keyframe. After ordinary static arc lowering in SVG user space,
each binary32 x-coordinate is divided once by the binary32 viewport width and
each y-coordinate once by the binary32 viewport height. The resulting tight
geometry must fit inside the closed `0 0 1 1` rectangle. A value outside it is
rejected. This is a bounded source-profile restriction, not a claim that
general SVG clips path geometry to its viewport. A wider profile may select a
different stable reference rectangle, but it must select that rectangle once
for the complete effect rather than renormalizing each keyframe independently.

Smooth calculation has a narrower command domain. Every smooth keyframe must
contain only `M`, `L`, `H`, `V`, `C`, `S`, `Q`, `T`, and `Z`, including their
lowercase relative forms. The presence of any `A` or `a` command rejects a
linear or spline path effect with a diagnostic that identifies the command
and recommends `calcMode="discrete"`. Static and explicitly discrete paths
continue to admit arcs.

The `values` attribute continues to split only on semicolons before each item
is parsed as path data. XML whitespace around each item is ignored, but
whitespace inside an item remains part of the path grammar. One final empty
item has Profile 1's trailing-semicolon behavior.

Every parsed keyframe retains both:

1. its source-located authored spelling, for preservation and diagnostics;
   and
2. an immutable canonical command stream with already parsed parameters, for
   compatibility and sampling.

The retained source is never regenerated from the canonical stream.

## Source topology and canonical geometry

Parsing retains two related structures. The **source topology** makes implicit
command instances explicit while preserving the authored command family:

- additional coordinate pairs after an initial `M` or `m` become line
  instances;
- additional parameter groups become repeated instances of their governing
  command;
- an omitted command letter inherits the preceding command as SVG requires;
- uppercase and lowercase forms retain one shared family identity; and
- `Z` and `z` both become one parameterless close command.

The **canonical geometry** is the typed command stream sampled and rendered.
Each static or keyframe value passes through the same source-number conversion
and fixed-reference projection before curve construction:

- relative coordinates are resolved to absolute coordinates in the keyframe's
  own command stream;
- `H` and `V` become absolute line commands;
- `S` becomes a cubic command with its reflected first control point, and `T`
  becomes a quadratic command with its reflected control point; and
- close remains parameterless.

The resulting smooth command sum is closed:

```text
Move(x, y)
Line(x, y)
Quadratic(cx, cy, x, y)
Cubic(c1x, c1y, c2x, c2y, x, y)
Close
```

Canonicalization removes contours with no drawing segment, but does **not**
reorder drawable contours, insert points, change curve degree, or flatten
curves. Arc commands have no canonical smooth form in Profile 6. Explicitly
discrete arcs use the same complete-value lowering as the identical static
path.

The **topology signature** is the ordered source-family sequence. Absolute and
relative spellings within one family are compatible: `L` with `l`, `H` with
`h`, `S` with `s`, and so on. Families do not collapse merely because the
renderer shares an expanded primitive: `H` is not `L`, `V` is not `L`, `S` is
not `C`, and `T` is not `Q`. This distinction is required by SVG's path-data
interpolation contract and must survive renderer normalization.

Two keyframes are smoothly compatible exactly when their topology signatures
are identical. A smooth `values` animation requires one shared signature
across its complete keyframe list, not merely compatibility around the
currently sampled segment. This makes the effect's typed topology independent
of sample time.

## Smooth path interpolation

Absent `calcMode` means `linear`. `calcMode="linear"` and
`calcMode="spline"` request smooth interpolation. When the keyframe topology
is compatible, Profile 1 selects the interval and produces one exact linear
or spline-eased segment progress `q`.

Each corresponding reference-space canonical numeric parameter is interpolated
independently:

```text
a + (b - a) × q
```

The mathematical interpolation result is rounded once to finite IEEE 754
binary32 using round-to-nearest, ties-to-even. There is no intermediate binary
floating-point rounding inside interpolation. At an exact key time, the
complete stored canonical command stream of that keyframe is used directly;
interpolation is not evaluated. Bounds calculation and raster lowering happen
only after this typed path value has been produced.

The sampled reference-space geometry is mapped through the fixed
viewport-sized box only after interpolation. This projection is geometrically
equivalent to interpolating in SVG user coordinates, but the profile does not
claim binary32 bit identity with an implementation that interpolates before
reference-space projection. Its interpolation bit contract begins with the
canonical geometry defined above. Every exact endpoint must equal the
canonical geometry produced from the same `d` value as static source. Paint,
fill rule, stroke, opacity, and transform remain separate properties and are
unchanged by `d` animation.

## Discrete path effects

Explicit `calcMode="discrete"` selects complete path keyframes without
interpolating commands or parameters. Any collection of individually valid
Profile 6 paths is admitted; their topology signatures may differ and they
may contain arcs. Each selected keyframe uses the same canonical geometry that
the corresponding static path would use.

For `N >= 2` values, omitted `keyTimes` defines the exact offsets

```text
t[i] = i / N, for i = 0 ... N - 1.
```

This gives one equal-duration interval per value, as required by
[SMIL discrete calculation](https://www.w3.org/TR/REC-smil/smil-animation.html#animationNS-OverviewCALCMODE).
An explicit discrete `keyTimes` list must contain exactly `N` exact rational
offsets, begin at `0`, increase strictly, and remain in `[0, 1]`. The
strict-increase rule deliberately retains Profile 1's unambiguous-boundary
discipline even though SVG permits equal neighboring offsets. Unlike smooth
calculation, the final offset need not be `1`.

At simple progress `p`, the selected value is the greatest index `i` for
which `t[i] <= p`. Equality selects the new value. If the final offset is
exactly `1`, the final value is not selected inside the end-exclusive active
interval, but it remains the terminal value used by `fill="freeze"`.

A one-value discrete animation is constant and admits neither `keyTimes` nor
`keySplines`. For all discrete path animations, `keySplines` is rejected
rather than retained as ignored easing metadata. A two-value discrete
`from`/`to` animation without `keyTimes` therefore selects `from` for
`0 <= p < 1/2` and `to` for `1/2 <= p < 1`.

## Automatic two-value fallback

SVG 2 assigns discrete interpolation when two `d` values do not have the same
structure. Profile 6 admits that fallback only for the explicit two-value
`from`/`to` form when both paths are inside Profile 6's non-arc smooth command
domain.

When a `from`/`to` animation requests linear or spline calculation but its
two valid paths have different topology signatures, the complete effect is a
discrete replacement:

```text
result = from, when eased segment progress q < 1/2
result = to,   when eased segment progress q >= 1/2
```

For linear mode, `q` is the segment-local progress. For spline mode, `q` is
the result of Profile 1's exact spline inversion, so easing can move the
document-time switch. Equality selects `to`. Exact progress zero and one use
their stored endpoint streams directly.

No automatic fallback is inferred for the `values` form, including a
two-item `values` list. A linear or spline `values` animation with any
topology mismatch is a whole-document error whose diagnostic recommends
declaring `calcMode="discrete"`. This prevents one mistyped keyframe from
silently changing a multi-stage morph into a different global effect.

An arc in either endpoint is also outside automatic fallback. Its diagnostic
requires explicit `calcMode="discrete"`, making the whole-value switch visible
in authored source rather than accidentally treating a renderer's lowered arc
segments as SVG arc parameters.

## Replacement composition

One sampled `d` value replaces the target's complete path geometry. It does
not merge contours with the lower path, replace only a command range, or
mutate the authored geometry.

Profile 2 orders multiple replacement effects on the same target/property
pair. The highest-priority active or frozen path effect contributes; a
post-interval `remove` falls through to the next contributing effect or the
authored base path, and `freeze` retains that effect's terminal keyframe.
Smooth compatibility is checked within each effect only. A replacement
effect's keyframes do not have to share topology with the authored base or a
lower replacement effect.

The selected geometry is one effective value. Every geometry-aware consumer,
including bounds, clipping where applicable, damage, cache identity, display
construction, and pixels, observes that value rather than the authored base.
A consumer whose declared contract is box-based may continue to consume the
box; this profile does not require point-in-path hit testing.

## Exact endpoints and no shape matching

Path endpoints are typed values, not reconstructed strings. Exactness means
that at an authored key time or terminal freeze:

- the command topology is exactly the stored canonical topology;
- every numeric parameter has exactly the stored binary32 bits produced by
  ordinary static canonicalization of that keyframe; and
- a discrete arc endpoint is exactly the canonical geometry produced by that
  same path as a static value.

The retained source spelling remains independently unchanged. Equivalent
whitespace, comma usage, repeated-command elision, or decimal spelling is not
part of effective geometry identity.

Profile 6 performs no point resampling, contour pairing, contour reordering,
winding reversal, path-length alignment, Bézier degree conversion, or "best"
morph inference. Static and discrete arc lowering is an ordinary rendering
normalization, never an interpolation domain. Other geometry-changing
operations can be useful authoring tools, but they require an explicit export
or normalization step outside animation sampling.

## Validation and diagnostics

Profile 6 inherits whole-document atomic validation. In addition to inherited
failures, compilation or sampling rejects at the applicable boundary:

- a `d` target that is not one identity-preserved `<path>`;
- an empty, `none`, malformed, non-finite, or non-drawing path value;
- an invalid arc flag or negative arc radius;
- any arc command in a linear or spline effect, with guidance to use explicit
  discrete calculation;
- a linear or spline `values` list whose source-family topology is not uniform;
- path `keyTimes` that violate the selected smooth or discrete rules;
- `keySplines` on a discrete path effect;
- a lone-`to`, `by`, additive, or cumulative path effect;
- a failure to preserve exact endpoint parameters or the complete effective
  geometry projection; or
- non-finite geometry produced while interpreting an otherwise finite
  relative command stream.

A path-syntax diagnostic identifies the source-located animation, value item,
and path-data offset when available. A topology diagnostic identifies the
differing keyframe, the first differing source-family command index, and the
expected and observed command kinds. For a mismatched `values` form, it also states
that `calcMode="discrete"` is the admitted explicit alternative. A target
diagnostic distinguishes lost node identity from lost `d` property identity.

All layers and live targets are validated, including inactive and masked
layers. Failure produces neither a partial effective-value set nor a partial
frame. An implementation resource limit is reported as such and must not be
misrepresented as malformed SVG path data.

## Conformance

Profile 6 adds these laws to the inherited conformance contract:

- every Profile 5 source samples bit-identically under Profile 6;
- parent and same-document `href` targeting of the same path agree;
- command elision and repeated groups expand deterministically; absolute and
  relative modes share a family, while shorthand families remain distinct;
- every compatible numeric parameter follows the inherited exact linear or
  spline progress, with exact keyframe streams at equality;
- arcs remain valid static and explicitly discrete values but are rejected
  from smooth effects before conic lowering can affect semantics;
- explicit discrete values use one interval per value and switch exactly at
  their implicit or authored offsets;
- incompatible `from`/`to` paths fall back at eased progress `1/2`, with
  equality selecting `to`;
- an incompatible smooth `values` list fails atomically and recommends
  explicit discrete calculation;
- replacement and freeze preserve complete path topology, while remove
  reveals the lower path without mutation;
- no resampling or contour matching participates in sampling; and
- bounds, damage, cache identity, draw-list construction, and pixels all
  observe the same sampled geometry, while query follows its declared box or
  path-narrowphase policy over that resolved frame.

### Browser-differential vectors

Browser comparison remains separate from the profile's exact-bit oracle.
Every browser vector explicitly seeks the SVG timeline and records the browser
build, source, exact requested time, computed path value when exposed, and
pixels. At minimum, the differential corpus contains:

| Vector                 | Source shape                                                         | Required probes                                                             |
| ---------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| compatible cubic       | identical `M C C Z` topology with moved endpoints and controls       | both endpoints, quarter, midpoint, three-quarter                            |
| normalized coordinates | uppercase/lowercase forms inside one command family, such as `C`/`c` | exact key times and an interior sample                                      |
| family mismatch        | `H`/`V` versus `L`, `S` versus `C`, or `T` versus `Q`                | immediately before, exactly at, and after the fallback switch               |
| discrete arcs          | differing valid `M A Z` values under explicit discrete calculation   | immediately before, exactly at, and after every switch                      |
| two-value mismatch     | `from` uses `M L L Z`, `to` uses `M C C Z`                           | immediately before, exactly at, and after eased `1/2`                       |
| authored discrete      | three different topologies with `keyTimes="0;0.4;0.75"`              | each switch minus epsilon, at equality, and plus epsilon                    |
| smooth-list mismatch   | a `values` list with one differing command kind                      | profile rejection plus browser characterization, never claimed as agreement |
| repeat and fill        | one smooth and one discrete effect with two repeats                  | every repeat boundary and final remove/freeze end                           |
| replacement sandwich   | overlapping lower and later-begin path effects                       | begin, takeover, remove fallthrough, and frozen lower state                 |

Only vectors whose source lies in the shared browser/profile surface support a
compatibility claim. Legacy browser behavior that rejects incompatible path
lists, a browser's serialization choices, and floating-point raster tolerance
are reported as differences; they do not alter Profile 6's source or exact
sampling contract.

## Deferred families

Profile 6 resolves compatible path interpolation and explicit discrete path
replacement only.

Paced path-data interpolation, smooth arc-parameter and arc-flag interpolation,
additive or cumulative path geometry, lone-`to`, `by`, `none` transitions,
automatic point or contour matching, path morphing between basic-shape
elements, motion paths, path-length and trim animation, markers, animated
clipping paths or masks, CSS `d` animation and Web Animations interaction
remain outside this profile.

`<set>` and general `calcMode="discrete"` support for other property families
also remain deferred. Profile 6's discrete path effect establishes a typed
selection rule; it does not silently make arbitrary scene values animatable.

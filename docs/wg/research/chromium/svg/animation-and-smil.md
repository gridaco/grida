---
title: "Chromium SVG Animation and SMIL"
description: "How Blink samples, composes, cascades, invalidates, and schedules SVG/SMIL and CSS/Web Animations."
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
format: md
---

# Chromium SVG Animation and SMIL

How Blink animates SVG. Blink has a dedicated SVG/SMIL timing and composition
engine alongside the standard CSS/Web Animations engine. They share the
document lifecycle but do not collapse into one animation implementation.

Source observations in this note were reverified against Chromium
`aa4c950f52e67f6875cd655c4518b55f06cc2ce6` (2026-07-13).

Empirical observations labeled “Chromium 145” below used Chrome for Testing
145.0.7632.6, driven by Playwright 1.58.2. Each SVG was loaded as a top-level
document; page-evaluated calls first invoked `pauseAnimations()` on the root
and then `setCurrentTime(seconds)` before each observation. Observation
surfaces were animated-value serialization, `getBBox()` where stated, and
decoded RGBA screenshots; transparent pixel comparisons composited both
outputs over the same white background. The probe sources and reports were
local and are not a durable conformance corpus.

## Specification status

The current SVG animation specification is the [SVG Animations Level 2
Editor's Draft of 14 September 2025](https://svgwg.org/specs/animations/).
It identifies itself as work in progress. Except where it supplies SVG-specific
rules, it delegates normative behavior to the 2001 [SMIL Animation
Recommendation](https://www.w3.org/TR/2001/REC-smil-animation-20010904/).

The [SVG Integration Editor's Draft](https://svgwg.org/specs/integration/) is
also work in progress and contains unresolved editorial questions. Chromium
source and web-platform tests are therefore needed to describe implemented
browser behavior; the drafts alone are not implementation evidence.

## Two engines and several result paths

| Animation source                                | Targets                                    | Blink result path                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| SVG/SMIL                                        | Recognized CSS property                    | Sampled value is serialized into `SVGElement::AnimatedSMILStyleProperties`, then consumed by normal style resolution at author origin |
| SVG/SMIL                                        | SVG DOM attribute                          | Typed `SVGAnimatedPropertyBase::animVal` through `SVGElement::SetAnimatedAttribute`, followed by property-specific invalidation       |
| SVG/SMIL                                        | Presentation attribute exposing both paths | CSS-property and SVG DOM `animVal` paths are updated independently                                                                    |
| `<animateMotion>`                               | Motion transform                           | Separate `AnimateMotionTransform`, followed by transform, paint-property, layout, or resource invalidation as needed                  |
| CSS Animations, CSS Transitions, Web Animations | CSS properties                             | Shared `core/animation` interpolations enter `StyleCascade` at animation or transition origin and produce `ComputedStyle`             |

For a property exposed through CSS, the SMIL result is an author-origin
declaration. CSS/Web Animation interpolations are subsequently applied at
animation origin, and transitions at transition origin. An active CSS/Web
Animation therefore composes over the SMIL-derived underlying value. Blink
does not suppress a CSS animation merely because SMIL targets the same CSS
property.

The phrase “SMIL override style” in Blink comments describes its placement
among ordinary author rules. It does not give SMIL a cascade origin above CSS
Animations or CSS Transitions. Non-CSS SVG attributes remain outside the CSS
and Web Animations property path.

Relevant flow:

```text
SVGAnimateElement::ApplyResultsToTarget
  ├── CSS property
  │     └── AnimatedSMILStyleProperties
  │           └── StyleResolver::MatchAllRules (author origin)
  │                 └── ApplyAnimatedStyle
  │                       ├── CSS/Web Animation origin
  │                       └── CSS Transition origin
  └── SVG DOM property
        └── SVGElement::SetAnimatedAttribute
              └── typed animVal + SvgAttributeChanged invalidation
```

### Target-property resolution

`SVGAnimateElement::ResolveTargetProperty` first asks the target for an SVG DOM
property and records any associated CSS property ID. If there is no SVG DOM
property, it tries the CSS-only animated-property path.

SVG Animations Level 2 does not support `attributeType`; its auto-resolution
rule searches CSS properties first, then target attributes. Blink still parses
legacy `attributeType`, but a recognized CSS property takes the CSS path
regardless of the legacy value. `attributeType="CSS"` makes an otherwise
non-CSS target invalid.

## SMIL data model

```text
SVGSVGElement
  └── SMILTimeContainer
        ├── presentation/reference/update times
        ├── scheduling state and wakeup timer
        ├── animated target set
        └── priority queue of timed elements

SVGSMILElement
  ├── sorted begin/end instance-time lists
  ├── current and previous SMILInterval
  ├── parsed sync/event conditions
  ├── active/frozen state and repeat progress
  └── target element and attribute

ElementSMILAnimations                 attached to a target
  └── map<QualifiedName, SMILAnimationSandwich>

SMILAnimationSandwich                one target/attribute pair
  └── priority-sorted contributing SVGSMILElements (active or frozen)
```

Every `SVGSVGElement` constructs an `SMILTimeContainer`, and every connected
`<svg>` registers with `SVGDocumentExtensions`. An `SVGSMILElement` binds to
the container of its nearest `ownerSVGElement`.

These are not independent nested SMIL time spaces. Containers synchronize to
the document timeline through `SMILTimeContainer::SynchronizeToDocumentTimeline`,
consistent with SVG's rule that nested `<svg>` elements do not define a new
document begin.

`SVGSMILElement` does not hold one immutable interval list computed at parse
time. It stores instance times and conditions; `UpdateInterval` resolves and
revalidates intervals as attributes, syncbases, events, or script-created
instance times change.

## Sandwich composition

Several SVG animation elements targeting the same `(element, attribute)` form
a sandwich. The contributing sandwich includes active and frozen effects and
is priority-sorted. Later interval begin time has higher priority; equal begin
time is broken by later document order.

SMIL's normative equal-time rule first places a timing-dependent animation
above its syncbase, then uses document order when neither depends on the other.
Blink's `IsHigherPriorityThan` currently compares interval begin and document
order only; its source carries a FIXME for the missing timing-dependency rule.
Repeating does not create a new interval priority, while restarting does.

`ApplyAnimationValues` scans downward from the highest-priority effect until it
finds an effect that overwrites its underlying value, discards effects below
that point, initializes a typed underlying value, then applies the remaining
effects from lower to higher priority. This supports replacement, addition,
and per-repeat accumulation.

### Underlying-dependent lone-`to` effects

SMIL's lone-`to` form is neither an ordinary replacement nor an ordinary
additive effect. The [SMIL from/to/by
rules](https://www.w3.org/TR/2001/REC-smil-animation-20010904/#FromToByAndAdditive)
define it as interpolation from the current underlying value to the authored
`to` value, and require it to behave as non-additive and non-cumulative.

Blink preserves that distinction through sampling:

- `SVGAnimationElement::UpdateAnimationValues` classifies the source as a
  `to` animation and stores the authored destination without manufacturing a
  static `from` value;
- `ComputeEffectParameters` does not enable additive or cumulative behavior
  for that animation mode;
- `OverwritesUnderlyingAnimationValue` returns false, so sandwich scanning
  cannot use a lone-`to` effect as the lower-layer cutoff; and
- `SVGAnimateElement::CalculateAnimationValue` uses the typed value already
  carried by the sandwich as the interpolation start.

Consequently each sample depends on the lower effects applied earlier in the
same low-to-high sandwich pass. The start is not captured at interval begin.
Two lone-`to` effects fold sequentially because the higher one sees the result
left by the lower one.

The SVG specification gives `calcMode="discrete"` lone-`to` a special
underlying/target switch rule. Linear and spline modes interpolate over the
single virtual segment. The [spline lone-`to`
web-platform-test](https://github.com/web-platform-tests/wpt/blob/master/svg/animations/animate-calcMode-spline-to.html)
exercises the latter form.

### Additive and cumulative numeric effects

Blink represents effect composition and iteration composition as independent
booleans in `SMILAnimationEffectParameters`. `additive="sum"` sets
`is_additive`; `accumulate="sum"` sets `is_cumulative`. For an ordinary
numeric `from`/`to` animation, `ComputeAnimatedNumber` evaluates:

```text
simple       = (to - from) * percentage + from
accumulated  = simple + terminal * repeat_index   when cumulative
result       = underlying + accumulated           when additive
```

For a `values` animation, `SVGAnimateElement::CalculateAnimationValue` passes
the final `values` entry as `terminal`, even when the current keyframe segment
ends elsewhere. Typed property classes perform the last step: `SVGNumber` and
`SVGLength`, for example, add the value already carried by the sandwich only
when the additive flag is set. The four additive/cumulative combinations are
therefore distinct without four separate animation modes.

All operands in this numeric path are `float`. Interpolation, accumulation,
and addition appear as separate float expressions in source; Blink does not
define an exact-rational or one-rounding numeric profile around them.

`SVGAnimationElement::OverwritesUnderlyingAnimationValue` currently returns
false for every cumulative effect, including a cumulative effect that is not
additive. Its source marks that cumulative exception for removal: accumulation
depends on repeat count, not on the underlying value. The consequence is extra
work below such a layer, not additive semantics. The non-additive cumulative
layer's typed calculation still replaces the carried value before any higher
layer consumes it.

### Solid paint-color animation

Blink's SVG/SMIL CSS-property table classifies `fill`, `stroke`, `color`,
`flood-color`, `lighting-color`, and `stop-color` as `kAnimatedColor`. This is
a typed color path, not structural interpolation of the complete SVG paint
grammar.

`SVGColorProperty::SetValueAsString` parses CSS colors and separately admits
`currentColor`. Before arithmetic, `currentColor` is resolved against the
target's unvisited computed `color`, and every resolved endpoint is converted
to sRGB. The source explicitly describes this sRGB conversion as legacy
behavior.

Interpolation then uses a straight `RGBATuple` of four float channels.
`SVGColorProperty::CalculateAnimatedValue` calls the same
`ComputeAnimatedNumber` operation independently for red, green, blue, and
alpha, including terminal-value repeat accumulation. When the effect is
additive, it adds the current typed sandwich color componentwise. It does not
premultiply RGB by alpha before either operation.

Each effect result is converted back through `Color::FromRGBAFloat`, but this
conversion does not clamp. The `Color(SkColor4f)` constructor stores RGB as
float channel values scaled by `255` and stores alpha as a float directly.
Out-of-range components can therefore remain typed color values for a higher
SMIL effect and are clamped only when the completed color is presented.

The CSS/Web Animations path has a separate `CSSPaintInterpolationType`. Its
underlying-value conversion succeeds only when the computed `SVGPaint` is a
color, and applying an interpolated value constructs a color paint. A URL
paint server is not decomposed into gradient stops or another resource graph
by this interpolation type.

An explicit-seek Chromium 145 probe from `#000000` to `#fd0000` over two
seconds produced serialized red channels `63`, `127`, and `190` at `0.5`,
`1`, and `1.5` seconds, then `253` at the endpoint. The midpoint starts from
the mathematical value `126.5` and serializes as `127`. An equivalent
`#00000000` to `#fd0000fd` probe changed alpha independently alongside red,
confirming the straight four-channel path.

An additive/cumulative color probe used base `#100000`, a lower
`#100000`-to-`#120000` effect with two repeats, addition, and accumulation,
plus a higher additive `#00000000`-to-`#01000000` effect. Explicit seeks at
whole seconds `0` through `4` produced serialized red channels
`32, 34, 51, 52, 53`. The `34` sample includes the higher effect's half-channel
contribution rather than quantizing that contribution away before the
completed color is serialized. Decoded pixels from the explicitly sought
frames matched the same sequence exactly.

### Transform-list animation

`SVGAnimateTransformElement` is a typed specialization rather than a generic
string-list animation. Blink accepts the SVG DOM transform-list target, rejects
the CSS-property path for this element, and defaults an absent `type` to
`translate`. Its parser accepts `translate`, `scale`, `rotate`, `skewX`, and
`skewY`; `matrix` is not an admitted animated type. Each authored `from`, `to`,
or `values` item must parse to exactly one operation of the selected type.

`SVGTransformList::CalculateAnimatedValue` keeps composition at transform-list
topology. A non-additive effect clears the carried lower list before adding its
sampled operation. An additive effect retains the lower list and appends the
new operation. It does not decompose or merge the lower operations. This is
why additive animations of different transform types can coexist while each
individual animation still has one fixed `type`.

Interpolation and accumulation occur before list composition.
`SVGTransformDistance` stores parameters for the selected operation and
computes raw component differences and sums:

- translation interpolates and accumulates both offsets;
- scale interpolates and accumulates both factors; and
- rotation interpolates and accumulates the angle and both center coordinates.

Angles are treated as numeric degrees without shortest-path normalization.
The rotate center is part of the animated value rather than immutable metadata.
Repeat accumulation is parameter addition, not repeated application of the
sampled geometric operation. The [transform animation
web-platform-test](https://github.com/web-platform-tests/wpt/blob/master/svg/animations/svgtransform-animation-1.html)
covers representative typed interpolation and addition behavior.

The current SVG Animations Editor's Draft contains two apparent editorial
defects in this area. Its cumulative scale example omits
`accumulate="sum"` even though the accompanying graph and table apply
accumulation. Its optional-component paragraph says an omitted scale `sy` is
`1` and refers to an omitted translate `tx`; ordinary transform parsing and
Blink instead copy `sx` into omitted `sy` and default omitted `ty` to zero.
Those two lines are not reliable implementation instructions in isolation.

SVG declares lone-`to` `<animateTransform>` behavior undefined. Blink still
has a code path for it: when the first lower transform has the same type it is
used as the start; otherwise a type-specific zero operation is used. That is
implemented browser behavior, not a portable SVG contract.

### Observed Chromium 145 matrices

An explicit-seek probe with authored `x="10"`, `from="20"`, `to="30"`,
`dur="1s"`, `repeatCount="3"`, and `fill="freeze"` produced these values at
`0`, `0.5`, `1`, `1.5`, `2`, `2.5`, and `3` seconds:

| `additive` | `accumulate` | Observed sequence             |
| ---------- | ------------ | ----------------------------- |
| `replace`  | `none`       | `20, 25, 20, 25, 20, 25, 30`  |
| `sum`      | `none`       | `30, 35, 30, 35, 30, 35, 40`  |
| `replace`  | `sum`        | `20, 25, 50, 55, 80, 85, 90`  |
| `sum`      | `sum`        | `30, 35, 60, 65, 90, 95, 100` |

The exact repeat boundary starts the next iteration at its first simple value
and adds `repeat_index * terminal`. At the final end, freeze uses the final
iteration's terminal value, yielding `repeatCount * terminal` for cumulative
replacement. The `replace`/`sum` row also confirms that cumulative replacement
does not semantically include the authored base despite the conservative
sandwich cutoff noted above.

A non-monotonic `values="0;15;10"` additive, cumulative animation over base
`10`, with `dur="2s"`, `repeatCount="3"`, and freeze, produced
`10, 25, 20, 35, 30, 45, 40` at whole seconds `0` through `6`. The increments
are ten, proving that accumulation uses the terminal list item rather than the
largest item or the preceding iteration's last sampled interior value.

Opacity composition remains unclamped while the sandwich is being folded. A
base opacity of `0.8` plus a constant additive `0.4` presented as `1`. A base
of `0.8` plus `0.5` and then `-0.4` presented as `0.9`; clamping after the first
addition would instead have produced `0.6`. The CSS result path eventually
calls `ComputedStyle::SetOpacity`, which clamps the completed value to
`[0, 1]`.

```xml
<svg xmlns="http://www.w3.org/2000/svg">
  <rect fill="yellow">
    <set attributeName="fill" to="blue" begin="1s; 3s" dur="1s"/>
    <set attributeName="fill" to="lightblue" begin="1.5s" dur="2s"/>
  </rect>
</svg>
```

At overlapping times, interval priority and composition determine the result;
plain source order alone is not a complete model. The destination of the final
sampled value is one of the CSS, SVG DOM, or motion-transform paths described
above, not invariably an `animVal` slot.

## Frame service and invalidation

During `PageAnimator::ServiceScriptedAnimations`, each unthrottled
`LocalFrameView` services SMIL before CSS/Web Animation event tasks and
`requestAnimationFrame` callbacks. The subsequent document lifecycle consumes
the new values.

```text
Page::Animator().ServiceScriptedAnimations(time)
  └── LocalFrameView::ServiceScrollAnimations(time)
        └── SVGDocumentExtensions::ServiceSmilOnAnimationFrame(document)
              └── SMILTimeContainer::ServiceAnimations()
                    ├── sample elapsed presentation time
                    ├── update intervals and active stacks
                    ├── apply per-target sandwiches
                    └── request another visual frame or arm a future wakeup

CSS/Web Animation event tasks and requestAnimationFrame callbacks

document lifecycle
  └── style -> layout -> prepaint -> paint
```

CSS-property results request local style recalculation. SVG DOM results call
the target property's `SvgAttributeChanged`, which may invalidate style,
geometry/layout, transforms, paint properties, or referenced SVG resources.
Motion animation follows its own transform invalidation path.

`SMILTimeContainer::ServiceAnimations` treats an unexpected continuous-frame
lag above 60 seconds as a scheduling discontinuity and adjusts its presentation
time base. That is lifecycle resilience, not an alternative authored timing
model.

## Timing conditions

Blink's SMIL implementation supports several sources of instance times:

- offset clock values;
- sync-base begin/end conditions;
- repeat conditions; and
- event-base conditions.

Offset values are parsed into sorted instance-time lists. `UpdateInterval`
resolves current intervals during service and revalidates them through
`DiscardOrRevalidateCurrentInterval` when the lists or dependencies change.

For a sync-base such as `begin="a.end+0.5s"`, a condition observes the other
timed element and reschedules the dependent element when its interval changes.

For an event condition, `Condition::ConnectEventBase` resolves the event-base
element and installs a `ConditionEventListener`. When invoked, it adds an
event-origin instance time and reschedules the timed element.
`SVGSMILElement::AddedEventListener` is not this general connection path; it
only maintains bookkeeping for the nonstandard `repeatn` event.

Blink recognizes `accesskey(...)` syntax but does not connect it. The current
implementation has no wallclock timing path. Parsed syntax and executable
timing support therefore must not be conflated.

`restart`, `repeatCount`, `repeatDur`, and `fill` participate in interval and
contribution state. With `fill="freeze"`, the effect remains contributing after
its active interval; with `fill="remove"`, the sandwich falls through to lower
effects or the base value.

## CSS and Web Animations on SVG

CSS Animations, CSS Transitions, and script-created Web Animations use the
shared `core/animation` effect and timeline machinery. Their active
interpolations enter `StyleCascade` at animation or transition origin and
produce the resulting `ComputedStyle`.

The machinery is shared, but the full path is not SVG-blind. SVG has
target-specific handling for transform semantics, `<use>` instances, resource
descendants, and compositor eligibility. Web Animations target CSS properties.
SVG attributes without CSS counterparts, such as `points` and `viewBox`,
remain on SMIL or direct DOM mutation paths. Path data `d` is a CSS property in
current Blink and can participate in CSS/Web Animations.

## Compositor eligibility

SVG SMIL itself is sampled and applied on Blink's main thread. CSS/Web
Animations targeting SVG may run on the compositor when they animate supported
compositable properties and pass paint-property-tree and SVG-specific checks.

The presence of any SMIL animation on the target causes
`CompositorAnimations::CheckCanStartSVGElementOnCompositor` to return
`kTargetHasIncompatibleAnimations`. That prevents a CSS/Web Animation on the
same target from starting on the compositor even though its cascade result is
still valid on the main thread.

General SVG exclusions include `<use>` instances and SVG resource subtrees.
Transform animation has additional exclusions for nested SVG viewport
containers, non-unit effective zoom, additional container translation, and
transforms that affect `vector-effect` behavior.

An accelerated CSS/Web Animation continues to run in Blink on the main thread
so computed style and lifecycle state remain current, while the compositor
produces visual updates. `CompositorAnimationDelegate` reports playback-state
changes and the authoritative start time; the compositor does not send every
interpolated visual value back to Blink.

## Animation inside `SVGImage`

`SVGImage` owns an isolated document and `Page`. When an observer is present
and does not request pausing, `SVGImage::ServiceAnimations` services scripted
animations, updates lifecycle through prepaint while deliberately skipping
paint, and updates main-thread animations directly.

The same image machinery can serve HTML `<img>` and CSS `<image>` contexts.
SVG Integration's animated-image mode covers both when animation is allowed; a
referencing context may instead require static-image mode. SVG image documents
do not execute script and do not have composited animations.

## Source locations

| Path under `third_party/blink/renderer/`                | Role                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `core/svg/animation/svg_smil_element.{h,cc}`            | Instance times, interval state, conditions, priority, contribution state  |
| `core/svg/animation/element_smil_animations.h`          | Per-target sandwich registry                                              |
| `core/svg/animation/smil_animation_sandwich.cc`         | Priority stack and typed composition                                      |
| `core/svg/animation/smil_animation_effect_parameters.h` | Numeric interpolation and cumulative repeat arithmetic                    |
| `core/svg/animation/smil_time_container.{h,cc}`         | Timeline synchronization, service, and scheduling                         |
| `core/svg/animation/smil_animation_value.h`             | Typed sandwich value carrier                                              |
| `core/svg/svg_animation_element.{h,cc}`                 | Keyframes, calc modes, interpolation parameters                           |
| `core/svg/svg_animate_element.{h,cc}`                   | Target resolution, typed parsing, CSS/DOM result application              |
| `core/svg/svg_animated_color.cc`                        | Straight-sRGB SMIL color parsing, interpolation, addition, and projection |
| `core/svg/svg_number.cc`                                | Numeric additive application                                              |
| `core/svg/svg_length.cc`                                | Length interpolation, accumulation, and additive application              |
| `core/svg/svg_animate_transform_element.{h,cc}`         | Transform-list animation                                                  |
| `core/svg/svg_transform_list.{h,cc}`                    | Typed transform interpolation and ordered list composition                |
| `core/svg/svg_transform_distance.{h,cc}`                | Transform parameter distance, addition, and accumulation                  |
| `core/svg/svg_animate_motion_element.{h,cc}`            | Motion-path animation and result application                              |
| `core/svg/svg_element.cc`                               | Animated DOM value and motion-transform application/invalidation          |
| `core/svg/svg_document_extensions.{h,cc}`               | Document-level SMIL registration and service entry                        |
| `core/svg/svg_svg_element.cc`                           | Per-`<svg>` time-container ownership                                      |
| `core/frame/local_frame_view.cc`                        | Frame-level SMIL service call                                             |
| `core/page/page_animator.cc`                            | Top-level scripted-animation ordering                                     |
| `core/css/resolver/style_resolver.cc`                   | SMIL declarations and CSS animation/transition cascade integration        |
| `core/css/resolver/cascade_origin.h`                    | Author, animation, and transition origin ordering                         |
| `core/animation/css_paint_interpolation_type.cc`        | CSS/Web Animations color-only conversion for SVG paint properties         |
| `core/style/computed_style.h`                           | Final computed opacity clamp                                              |
| `platform/graphics/color.h`                             | Float-channel color construction and clamp contract                       |
| `core/animation/compositor_animations.cc`               | SVG compositor eligibility                                                |
| `core/svg/graphics/svg_image.cc`                        | Isolated SVG image animation lifecycle                                    |

## See also

- [animated-properties-idl.md](./animated-properties-idl.md) — `baseVal`,
  `animVal`, and SVG property tear-offs.
- [pipeline.md](./pipeline.md) — the wider document lifecycle around sampling.
- [svg-as-image.md](./svg-as-image.md) — isolated SVG image documents.
- [`../dirty-flag-management.md`](../dirty-flag-management.md) — downstream
  invalidation categories.

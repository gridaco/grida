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

Source observations in this note were verified against Chromium
`7385b4cc05a381629080a2435ce519f673758bf2` (2026-04-27).

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
  └── priority-sorted active SVGSMILElements
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
a sandwich. The active sandwich is priority-sorted. Later interval begin time
has higher priority; equal begin time is broken by later document order.

`ApplyAnimationValues` scans downward from the highest-priority effect until it
finds an effect that overwrites its underlying value, discards effects below
that point, initializes a typed underlying value, then applies the remaining
effects from lower to higher priority. This supports replacement, addition,
and per-repeat accumulation.

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

| Path under `third_party/blink/renderer/`        | Role                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `core/svg/animation/svg_smil_element.{h,cc}`    | Instance times, interval state, conditions, priority, contribution state |
| `core/svg/animation/element_smil_animations.h`  | Per-target sandwich registry                                             |
| `core/svg/animation/smil_animation_sandwich.cc` | Priority stack and typed composition                                     |
| `core/svg/animation/smil_time_container.{h,cc}` | Timeline synchronization, service, and scheduling                        |
| `core/svg/animation/smil_animation_value.h`     | Typed sandwich value carrier                                             |
| `core/svg/svg_animation_element.{h,cc}`         | Keyframes, calc modes, interpolation parameters                          |
| `core/svg/svg_animate_element.{h,cc}`           | Target resolution, typed parsing, CSS/DOM result application             |
| `core/svg/svg_animate_transform_element.{h,cc}` | Transform-list animation                                                 |
| `core/svg/svg_animate_motion_element.{h,cc}`    | Motion-path animation and result application                             |
| `core/svg/svg_element.cc`                       | Animated DOM value and motion-transform application/invalidation         |
| `core/svg/svg_document_extensions.{h,cc}`       | Document-level SMIL registration and service entry                       |
| `core/svg/svg_svg_element.cc`                   | Per-`<svg>` time-container ownership                                     |
| `core/frame/local_frame_view.cc`                | Frame-level SMIL service call                                            |
| `core/page/page_animator.cc`                    | Top-level scripted-animation ordering                                    |
| `core/css/resolver/style_resolver.cc`           | SMIL declarations and CSS animation/transition cascade integration       |
| `core/css/resolver/cascade_origin.h`            | Author, animation, and transition origin ordering                        |
| `core/animation/compositor_animations.cc`       | SVG compositor eligibility                                               |
| `core/svg/graphics/svg_image.cc`                | Isolated SVG image animation lifecycle                                   |

## See also

- [animated-properties-idl.md](./animated-properties-idl.md) — `baseVal`,
  `animVal`, and SVG property tear-offs.
- [pipeline.md](./pipeline.md) — the wider document lifecycle around sampling.
- [svg-as-image.md](./svg-as-image.md) — isolated SVG image documents.
- [`../dirty-flag-management.md`](../dirty-flag-management.md) — downstream
  invalidation categories.

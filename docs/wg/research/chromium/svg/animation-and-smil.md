---
title: "Chromium SVG Animation and SMIL"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Animation and SMIL

How Blink animates SVG. Two engines coexist: SMIL (`<animate>`, `<set>`,
`<animateTransform>`, `<animateMotion>`) and the standard CSS / Web Animations
machinery. Both can target the same element; SMIL takes precedence per spec.

## Two engines, one element

| Engine                          | Targets                                                                  | Output destination                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| SMIL                            | SVG attributes (CSS properties or non-CSS like `points`, `d`, `viewBox`) | `animVal` slot (see [animated-properties-idl.md](./animated-properties-idl.md)), then folded into `ComputedStyle` for presentation attributes |
| CSS animations / Web Animations | CSS properties                                                           | `ComputedStyle` directly via the standard `core/animation/` engine                                                                            |

When both engines target the same property, **SMIL's `animVal` wins** and the
CSS animation effect is suppressed for that property. Implemented by sampling
SMIL first and gating CSS animation effect application on whether SMIL is
contributing for the attribute.

## SMIL data model

```
SMILTimeContainer                    one per outer <svg>
  ├── AnimationClock                 presentation_time
  └── Schedule of timed elements     priority queue keyed by next event time

SVGSMILElement                       base for <animate>, <set>, ...
  ├── interval list                  begin/end pairs derived from begin/end/dur/repeatCount/...
  ├── current state                  active / inactive / frozen
  └── targetElement()                what it animates

ElementSMILAnimations                attached to the target element
  └── HeapHashMap<QualifiedName, SMILAnimationSandwich>

SMILAnimationSandwich                per-(target, attribute)
  └── Vector<SVGSMILElement>          priority-sorted active elements
```

```cpp
// third_party/blink/renderer/core/svg/animation/svg_smil_element.h
class CORE_EXPORT SVGSMILElement : public SVGElement, public SVGTests {
 public:
  SMILTimeContainer* TimeContainer() const { return time_container_.Get(); }
  bool HasValidTarget() const;
  SVGElement* targetElement() const { return target_element_.Get(); }

  enum FillMode { kFillRemove, kFillFreeze };
  FillMode Fill() const { return static_cast<FillMode>(fill_); }

  void UpdateInterval(SMILTime presentation_time);
  EventDispatchMask UpdateActiveState(SMILTime, bool skip_repeat);
  bool IsHigherPriorityThan(const SVGSMILElement* other,
                            SMILTime presentation_time) const;
  bool IsContributing(SMILTime elapsed) const;
  // ...
};
```

```cpp
// third_party/blink/renderer/core/svg/animation/element_smil_animations.h
class ElementSMILAnimations : public GarbageCollected<ElementSMILAnimations> {
 public:
  void AddAnimation(const QualifiedName& attribute, SVGAnimationElement*);
  void RemoveAnimation(const QualifiedName& attribute, SVGAnimationElement*);
  bool HasAnimations() const { return !sandwiches_.empty(); }
  bool Apply(SMILTime elapsed);

 private:
  HeapHashMap<QualifiedName, Member<SMILAnimationSandwich>> sandwiches_;
};
```

## The sandwich model

Per SMIL: when multiple animation elements target the same `(element,
attribute)` pair, they form a _sandwich_ — a priority-ordered stack where
later-started intervals have higher priority. At any given `presentation_time`,
the sandwich's active subset is composed top-down per the additive/accumulate
semantics, and the result is written to `animVal`.

```
<svg>
  <rect id="r" fill="yellow">
    <set attributeName="fill" to="blue"     begin="1s; 3s" dur="1s"/>
    <set attributeName="fill" to="lightblue" begin="1.5s"  dur="2s"/>
  </rect>
</svg>

t=0    →  no active animations          → fill = yellow (baseVal)
t=1    →  set#1 active                  → fill = blue
t=1.5  →  set#1 + set#2, set#2 wins     → fill = lightblue
t=2    →  set#2 active alone            → fill = lightblue
t=3    →  set#1 restarts (higher prio)  → fill = blue
t=4    →  no active animations          → fill = yellow
```

Composition modes:

- `additive="replace"` (default) — top of sandwich wins; lower priorities
  are ignored.
- `additive="sum"` — base value + this element's contribution + lower
  priorities' contributions, summed.
- `accumulate="sum"` — per-iteration accumulation across `repeatCount`
  cycles.

## Per-frame service

SMIL is sampled at the **top** of each `BeginMainFrame`, before rAF callbacks
and before the document lifecycle. The dispatch is a little non-obvious:

```
Page::Animate(monotonic_frame_begin_time)
  └── Page::Animator().ServiceScriptedAnimations(time)
        ├── For each LocalFrameView: ServiceScrollAnimations(time)
        │     └── SVGDocumentExtensions::ServiceSmilOnAnimationFrame(doc)
        │           └── SMILTimeContainer::ServiceAnimations()
        │                 ├── Advance presentation_time
        │                 ├── Update each scheduled timed element's interval
        │                 └── For each sandwich:
        │                       ├── UpdateActiveAnimationStack
        │                       └── ApplyAnimationValues
        │                             → SVGElement::SetAnimatedAttribute
        └── ScriptedAnimationController: run rAF callbacks

Page::UpdateLifecycle           ← style → layout → prepaint → paint
```

`LocalFrameView::ServiceScrollAnimations` does more than its name suggests —
it samples SMIL and scroll-driven animations along with scroll animations.
`SetAnimatedAttribute` writes into the property's `animVal` slot, then queues
style invalidation. The next style recalc folds the sampled value into
`ComputedStyle` for presentation attributes; layout reads it directly for
non-CSS attributes (`points`, `d`, `viewBox`, `transform`, ...).

## Interval timing

A timed element's `begin` and `end` attributes can each be a list of times,
events, sync-base references, or a wallclock — combined into intervals.

### Wallclock and offset values

```
<animate begin="2s; 5s" end="4s; 6s" .../>
```

Two intervals: `[2s, 4s]` and `[5s, 6s]`. Computed once at parse time.

### Sync-base timing

```
<animate id="a" begin="0s" dur="1s"/>
<animate id="b" begin="a.end+0.5s" dur="1s"/>
```

`b` chains off `a.end`. Implemented as a dependency graph: when `a`'s
interval changes, `b`'s `Reschedule` is called to recompute its interval list.

### Event-based timing

```
<animate begin="rect.click" .../>
```

`SVGSMILElement::AddedEventListener` hooks the source during interval
resolution. When the event fires, the timed element's interval list is
extended and `Reschedule` updates the queue.

### `restart` and `repeatCount`

- `restart="always|whenNotActive|never"` — controls whether a new begin time
  can preempt or restart the current run.
- `repeatCount="N|indefinite"` and `repeatDur="..."` — control iteration.

### `fill` (frozen vs removed)

- `fill="freeze"` — last animated value is held after the active interval
  ends (sandwich keeps the element contributing).
- `fill="remove"` — element stops contributing; sandwich drops to the next
  priority or back to `baseVal`.

## CSS animations and Web Animations on SVG

SVG elements participate in the standard CSS animation engine:

- `@keyframes` rules can target SVG elements like any other element.
- `transition: fill 200ms` on an SVG `<rect>` works.
- `Element.animate({ fill: ['red', 'blue'] }, ...)` works via the Web
  Animations API.

These all flow through `core/animation/` (`KeyframeEffect`, `AnimationTimeline`,
`Animation`) and write directly to `ComputedStyle`. There is no SVG-specific
codepath.

**Restriction.** Web Animations only target CSS properties. You cannot animate
`rect.x.baseVal.value` from Web Animations — only via SMIL or by manually
mutating the property in JS.

## Compositor-thread animations

Transform and opacity animations on SVG elements can promote to the
compositor thread (impl-side animation) just like HTML elements, provided the
element has a `cc::Layer`. Most SVG content does not have its own layer (it
paints into the parent's record), so impl-thread animation on inline SVG
content is uncommon — but `<svg>` roots and elements with `will-change:
transform` can be animated impl-side.

When impl-side animation runs, the compositor's interpolated value is sent
back to the main thread (Blink) so `getComputedStyle` and `animationend`
events stay accurate.

## Animations inside `SVGImage`

An `SVGImage` document (SVG used as `<img>`, `background-image`, etc. — see
[svg-as-image.md](./svg-as-image.md)) runs its own mini lifecycle. SMIL inside
runs only when:

1. The host is animating (e.g., on a frame tick), AND
2. The spec allows animation for the image use-case. Per the SVG Integration
   spec, `<img>` plays animations; CSS background images do not by default.

The host triggers SMIL service inside the image via
`Page::Animator().ServiceScriptedAnimations` on the image's isolated `Page`
(see `core/svg/graphics/svg_image.cc`).

## Files

| File                                           | Role                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `core/svg/animation/svg_smil_element.h`        | Base class for `<animate>`, `<set>`, etc. — interval timing model |
| `core/svg/animation/element_smil_animations.h` | Per-target sandwich registry                                      |
| `core/svg/animation/smil_animation_sandwich.h` | The sandwich composition algorithm                                |
| `core/svg/animation/smil_time_container.h`     | Per-`<svg>` timeline; `ServiceAnimations` entry                   |
| `core/svg/svg_document_extensions.h`           | `ServiceSmilOnAnimationFrame` — entry from `LocalFrameView`       |
| `core/page/page_animator.cc`                   | `ServiceScriptedAnimations` — top-of-frame dispatch               |
| `core/animation/`                              | Standard CSS / Web Animations engine (shared with HTML)           |

## See also

- [animated-properties-idl.md](./animated-properties-idl.md) — `baseVal` /
  `animVal`, the slot SMIL writes into.
- [pipeline.md](./pipeline.md) — where SMIL sampling sits in the per-frame
  flow.
- [`../dirty-flag-management.md`](../dirty-flag-management.md) — invalidation
  shape for animation writes.

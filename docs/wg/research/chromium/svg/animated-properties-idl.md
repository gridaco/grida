---
title: "Chromium SVG Animated Properties (baseVal / animVal)"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Animated Properties (`baseVal` / `animVal`)

Every animatable SVG attribute is exposed to JavaScript as an
`SVGAnimatedFoo` object with two slots — `baseVal` (the declared value) and
`animVal` (the currently animated value). This page documents how Blink
implements that dual-value model and how it's wired to layout and paint.

## The IDL surface

```webidl
interface SVGAnimatedLength {
  readonly attribute SVGLength baseVal;   // declared / set by JS
  readonly attribute SVGLength animVal;   // currently animated value
};

interface SVGRectElement : SVGGeometryElement {
  readonly attribute SVGAnimatedLength x;
  readonly attribute SVGAnimatedLength y;
  readonly attribute SVGAnimatedLength width;
  readonly attribute SVGAnimatedLength height;
  // ...
};
```

There is one such IDL type per SVG-typed value: `SVGAnimatedLength`,
`SVGAnimatedNumber`, `SVGAnimatedRect`, `SVGAnimatedTransformList`,
`SVGAnimatedString`, `SVGAnimatedEnumeration<T>`, `SVGAnimatedAngle`,
`SVGAnimatedPreserveAspectRatio`, ...

## Internal representation

```cpp
// third_party/blink/renderer/core/svg/properties/svg_animated_property.h
class SVGAnimatedPropertyBase : public GarbageCollectedMixin {
 public:
  virtual const SVGPropertyBase& BaseValueBase() const = 0;
  virtual bool IsAnimating() const = 0;
  virtual void SetAnimatedValue(SVGPropertyBase*) = 0;

  virtual SVGParsingError AttributeChanged(const String&) = 0;
  virtual const CSSValue* CssValue() const;          // bridge to CSS cascade

  virtual bool NeedsSynchronizeAttribute() const;
  virtual void SynchronizeAttribute();               // lazy content-attr sync

  CSSPropertyID CssPropertyId() const;
  const QualifiedName& AttributeName() const;
  // ...
};

template <typename Property>
class SVGAnimatedPropertyCommon : public SVGAnimatedPropertyBase {
 public:
  Property* BaseValue()          { return base_value_.Get(); }
  Property* CurrentValue()       { return current_value_.Get(); }   // animVal
  bool IsAnimating() const override { return current_value_ != base_value_; }

  void SetAnimatedValue(SVGPropertyBase* value) override {
    current_value_ = value ? static_cast<Property*>(value) : BaseValue();
  }
  // ...
 private:
  Member<Property> base_value_;
  Member<Property> current_value_;
};
```

Two slots per attribute: `base_value_` and `current_value_`. When no animation
is running, `current_value_ == base_value_` (pointer equality, not deep copy).
`SetAnimatedValue(nullptr)` resets the animVal back to the base.

## Read paths

| Reader                              | Reads                                              |
| ----------------------------------- | -------------------------------------------------- |
| Layout, paint, hit-test (rendering) | `CurrentValue()` (i.e., always animVal)            |
| JS via `.baseVal`                   | `BaseValue()`                                      |
| JS via `.animVal`                   | `CurrentValue()` (same as rendering reads)         |
| `Element.getAttribute('r')`         | declared value as a string (lazy-synced from base) |

The renderer never reads baseVal directly. Animations update the animVal
slot and rendering picks it up on the next style recalc / layout / paint
cycle.

## Write paths

### Author setting an attribute or `.baseVal`

```cpp
// SVGElement::AttributeChanged → property->AttributeChanged(value)
SVGParsingError SVGAnimatedNumber::AttributeChanged(const String& value) {
  // parse string → base_value_
  // mark content_attribute_state_ = kHasValue
  // notify SVGElement::BaseValueChanged → invalidate style
}
```

- Parses the new string into `base_value_`.
- Calls `SVGElement::BaseValueChanged(*this, BaseValueChangeType::kUpdated)`
  which queues style invalidation and notifies any active animation that the
  base value moved.
- Does **not** touch `current_value_`. If a SMIL animation is running, it
  will overwrite the animVal again on the next service tick.

### SMIL sample

```cpp
// SVGElement::SetAnimatedAttribute(name, sampled_value)
//   → property->SetAnimatedValue(sampled_value)
//   → current_value_ = sampled_value
```

Writes only to `current_value_`. baseVal is untouched. No string round-trip
through the content attribute.

### JS `.baseVal.value = ...` (tear-off mutation)

JS holds a _tear-off_ (`SVGLengthTearOff`, `SVGTransformTearOff`, ...) that
back-references the owning element. Mutating through the tear-off:

1. Updates the underlying `Property` in place.
2. Marks the content attribute as `kUnsynchronizedValue`.
3. Notifies the element so style invalidation runs.

Same downstream effect as setting the attribute, but skips re-parsing.

## Tear-offs

```
core/svg/properties/
  svg_property_tear_off.h          SVGPropertyTearOff<T>
  svg_list_property_tear_off_helper.h
```

Tear-offs are JS-exposed wrappers around an internal SVG value. They:

- Hold a `Member<SVGElement>` back-pointer to the owner.
- Hold a `Member<Property>` to the underlying value (or a copy if detached).
- Translate JS mutations into element-aware updates so invalidation fires.

Multi-value types (`SVGTransformList`, `SVGPathSegList`, `SVGPointList`,
`SVGNumberList`, `SVGLengthList`, `SVGStringList`) use the list tear-off
helper which exposes `.numberOfItems`, `.getItem(i)`, `.appendItem`, etc.

## Lazy attribute synchronization

When SMIL animates `r="40"` to `r="50"`, the content attribute on the element
still reads `40` until something asks for it as a string:

```cpp
// SVGAnimatedPropertyBase
enum ContentAttributeState : unsigned {
  kNotSet,                     // hasAttribute(...) === false
  kHasValue,                   // synchronized
  kUnsynchronizedValue,        // base_value_ changed via JS, attr stale
  kUnsynchronizedRemoval,      // base_value_ removed via JS, attr stale
};
```

`SynchronizeAttribute` is called lazily from:

- `Element.getAttribute`
- Element serialization (`outerHTML`)
- DOM observers that snapshot attributes
- DevTools attribute inspection

Why lazy? An animated transform attribute updates 60 times per second; we
don't want a string write per frame. SMIL touches only `current_value_`, so
the content attribute never goes stale from animation — only from JS
mutating `.baseVal`.

## Bridging into CSS

For SVG presentation attributes (`fill`, `stroke`, `opacity`, `transform`,
`font-family`, `width`, `height`, `r`, `cx`, `cy`, ...), the
`SVGAnimatedProperty` carries a `CSSPropertyID`:

```cpp
SVGAnimatedLength(SVGElement* context_element,
                  const QualifiedName& attribute_name,
                  SVGLengthMode mode,
                  SVGLength::Initial initial_value,
                  CSSPropertyID css_property_id);

const CSSValue* CssValue() const final;   // produces a CSSValue from the *current* value
```

During style recalc, `SVGElement::CollectStyleForPresentationAttribute`
asks each property for its `CssValue()` and feeds them into the cascade as
the lowest-specificity author rules. Because `CssValue()` reads
`CurrentValue()`, animated values flow into `ComputedStyle` automatically —
no separate "animated style" pipeline.

For SMIL specifically, `SVGElement::AddAnimatedPropertyToPresentationAttributeStyle`
folds animated values into the presentation-attribute style block before the
cascade runs.

## Non-CSS attributes

Some SVG attributes have no CSS equivalent: `points` (polygon/polyline), `d`
(path), `viewBox`, `preserveAspectRatio`, animation timing attributes.
Layout reads these directly from the property's `CurrentValue()` —
ComputedStyle is bypassed.

## Files

| File                                                      | Role                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `core/svg/properties/svg_animated_property.h`             | `SVGAnimatedPropertyBase` + `SVGAnimatedPropertyCommon<T>`                                    |
| `core/svg/properties/svg_property.h`                      | `SVGPropertyBase` value types                                                                 |
| `core/svg/properties/svg_property_tear_off.h`             | JS-exposed tear-off wrappers                                                                  |
| `core/svg/properties/svg_list_property_tear_off_helper.h` | List tear-offs (transforms, points, ...)                                                      |
| `core/svg/svg_animated_length.h`                          | Concrete instance — `SVGLength` with CSS bridge                                               |
| `core/svg/svg_element.h`                                  | `BaseValueChanged`, `SetAnimatedAttribute`, `AddAnimatedPropertyToPresentationAttributeStyle` |

## See also

- [animation-and-smil.md](./animation-and-smil.md) — what writes to animVal,
  and when.
- [pipeline.md](./pipeline.md) — where animVal is read during style and
  layout.

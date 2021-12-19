---
title: "Figma Text Shadow"
version: 0.1.0
revision: 1
---

# Figma text shadow

The text shadow is handled as the shadow of the effect from figma.

![](https://static.figma.com/uploads/9def6cce093b164306328ee228028155d13d72d0)

[figma DropShadowEffect](https://www.figma.com/plugin-docs/api/Effect/#dropshadoweffect)

[W3C](https://www.w3.org/TR/css-text-decor-4/#propdef-text-shadow)

## drop-shadow

**css**

- [`text-shadow`](https://developer.mozilla.org/en-US/docs/Web/CSS/text-shadow)

**syntax**

1. offsetX offsetY blurRadius color
2. color offsetX offsetY blurRadius
3. offsetX offsetY color
4. color offsetX offsetY

```css
text-shadow: 1px 1px 2px #ff2;
text-shadow: 1px 1px 2px red, 0 0 1em blue, 0 0 0.2em blue;
```

**flutter**

- [`Shadow`](https://api.flutter.dev/flutter/dart-ui/Shadow-class.html)

```dart
Shadow(
  offset: Offset(10.0, 10.0),
  blurRadius: 3.0,
  color: Color.fromARGB(255, 0, 0, 0),
)
```

### inner-shadow

It is not currently supported, and it appears to be replaced with drop-shadow.

## Why is there no `spread radius` support for text shadow?

W3 describes why there is not current spread property support for text-shadow, thous we can expect this to be supported in the future. Yet other platform such as Flutter also has no spread support

_from w3's Text Shadows: the text-shadow property_

> Also unlike box-shadow, the spread distance is strictly interpreted as outset distance from any point of the glyph outline, and therefore, similar to the blur radius, creates rounded, rather than sharp, corners.
> Note: The painting order of shadows defined here is the opposite of that defined in the 1998 CSS2 Recommendation.
> The text-shadow property applies to both the ::first-line and ::first-letter pseudo-elements.
> Level 4 adds a spread radius argument to text-shadow, using the same syntax and interpretation as for box-shadow, except that corners are always rounded (since the geometry of a glyph is not so simple as a box).

More about Shadow on text in core CG Level

- [Open question - Stackoverflow: Why TextShadow has no spread signature](https://stackoverflow.com/questions/69809872/why-doesnt-text-shadow-support-spared-radius)
- [SkiaSharp reference](https://docs.microsoft.com/en-us/dotnet/api/skiasharp.skimagefilter.createdropshadow?view=skiasharp-2.80.2)

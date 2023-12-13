---
title: "Figma Box Shadow"
version: 0.1.0
revision: 1
---

# Figma Box Shadow

The box shadow is handled as the shadow of the effect from figma.

![](https://static.figma.com/uploads/9def6cce093b164306328ee228028155d13d72d0)

[figma DropShadowEffect](https://www.figma.com/plugin-docs/api/Effect/#dropshadoweffect)

[W3C](https://drafts.csswg.org/css-backgrounds/#box-shadow)

## drop-shadow

**css**

- [box-shadow](https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow)

**syntax**

offset-x | offset-y | color

offset-x | offset-y | blur-radius | color

offset-x | offset-y | blur-radius | spread-radius | color

inset | offset-x | offset-y | color

Any number of shadows, separated by commas

```css
box-shadow: 12px 12px 2px 1px rgba(0, 0, 255, 0.2);
```

**flutter**

- [BoxShadow](https://api.flutter.dev/flutter/painting/BoxShadow-class.html)

```dart
BoxShadow(
  offset: Offset(10.0, 10.0),
  blurRadius: 3.0,
  color: Color.fromARGB(255, 0, 0, 0),
  spreadRadius: 5.0,
)
```

## multi shadow

**css**

ref: https://drafts.csswg.org/css-backgrounds/#shadow-layers

> The priority in which the layers are expressed is from the one in front. That is, what was written first is expressed at the top of the layer.

css multiple shadows are supported, separated by commas.

ex

```css
box-shadow: 12px 12px 2px 1px rgba(0, 0, 255, 0.2), 5px -1px 2px 1px rgb(59, 0, 19);
```

**flutter**

Unlike css, the priority in which layers are expressed is from the back.

- [Open question - Stackoverflow: What is the docs on layer display order when Flutter supports more than one shadow?](https://stackoverflow.com/questions/69913136/what-is-the-docs-on-layer-display-order-when-flutter-supports-more-than-one-shad?noredirect=1#comment123585258_69913136)

flutter multiple shadows are supported separated by array

```dart
boxShadow: [
  BoxShadow(
    offset: Offset(10.0, 10.0),
    blurRadius: 3.0,
    color: Color.fromARGB(255, 103, 90),
    spreadRadius: 5.0,
  ),
  BoxShadow(
    offset: Offset(9.0, 6.0),
    blurRadius: 8.0,
    color: Color.fromARGB(25, 57, 0),
    spreadRadius: 1.0,
  )
]
```

## inner-shadow

**cs**

using `inset` keyword

```css
box-shadow: inset 10px 10px red;
```

**flutter**

```dart
<!-- WIP -->
```

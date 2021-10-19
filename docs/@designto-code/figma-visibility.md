---
title: "Figma Visibility"
version: 0.1.0
revision: 1
---

# Figma Visibility

> `visible` property is a global property rather defines if the node should be visible or not. By default, setting `visible = false` for figma not will act like the node never existed. I.e. item under autolayout, if the item's visibility is off, than the item will not only invisible, but act like it does not exist, triggering re-arrangement of other items.

**TL;DR**
[`Figma#visible`](https://www.figma.com/plugin-docs/api/properties/nodes-visible/) is not `visible: false` but `gone`.

- https://www.figma.com/plugin-docs/api/properties/nodes-visible/

## Config - `ignore_invisible`

<!-- This feature is not implemented -->

When `ignore_invisible` is set true, design to code will ignore the invisible nodes at the point of initial conversion, even before the tokenization. This is not recommanded on component / instance design tokenization.

## Web - css

**invisible**

```css
.invisible {
  visibility: hidden;
}
```

**gone**

```css
.gone {
  display: none;
}
```

- [css#visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/visibility)
- [css#display](https://developer.mozilla.org/en-US/docs/Web/CSS/display)

## Flutter

**invisible only (no gone)**

```dart
Visibility(
  child: Text("Invisible"),
  maintainSize: true,
  maintainAnimation: true,
  maintainState: true,
  visible: false,
);
```

This will only hide the child, while maintaining its space. - It can be also represented as `Opacity 0`

```dart
Opacity(
    opacity: 0,
    child: Text("Invisible")
);
```

**gone**

```dart
Visibility(
  child: Text("Gone"),
  visible: false,
);
```

- [Flutter#Visibility](https://api.flutter.dev/flutter/widgets/Visibility-class.html)

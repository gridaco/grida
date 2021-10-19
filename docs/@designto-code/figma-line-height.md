---
title: "Figma line-height"
version: 0.1.0
revision: 1
---

# Figma line-height

[figma api docs](https://www.figma.com/developers/api#files-types)

figma line-height is separated into three parts: px, %, and auto. auto is the default set when the user does not set line-height.

**auto**

If it is auto, it is not specified because it is the default.

# css

[`line-height`](https://developer.mozilla.org/en-US/docs/Web/CSS/line-height)

**line-height**

```css
/* px */
line-height: 10px;
/* % */
line-height: 10%;
```

# flutter

[`height`](https://api.flutter.dev/flutter/painting/TextStyle-class.html)

```dart
Text(
  'Hi!\nWe are Grida!',
  style: TextStyle(height: 1),
);

```

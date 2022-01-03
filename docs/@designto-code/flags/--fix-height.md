---
title: Fix Height flag
description: Fixing the height with fix-height flag for statically sized elements.
id: "--fix-height"
locale: en
stage:
  - production
  - staging
  - experimental
---

# `--fix-height` Flag

When applied, this will force dedicated layer's `height` to be ignore responsive `height`, use current `height` as fixed `height` instead.

## Syntax

```ts
`--fix-height${"="typeof boolean}`
```

**Examples**

```
--fix-height

--fix-height=true
--fix-height=false

--fix-height=True
--fix-height=False

--fix-height=yes
--fix-height=no
```

## Behaviour

**Modifying Properties**
For fixing the sizing, we also specify `min` and `max` values as well. Here is the list of properties that will be modified by platforms.

- Web, css based frameworks
  - [`height`](https://developer.mozilla.org/en-US/docs/Web/CSS/height)
  - [`min-height`](https://developer.mozilla.org/en-US/docs/Web/CSS/min-height)
  - [`max-height`](https://developer.mozilla.org/en-US/docs/Web/CSS/max-height)
- Flutter, Using [`ConstrainedBox`](https://api.flutter.dev/flutter/widgets/ConstrainedBox-class.html) Widget
  - `height`
  - `minHeight`
  - `maxHeight`

## See also

- [`--fix-width`](./--fix-width)

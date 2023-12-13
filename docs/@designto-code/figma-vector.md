---
title: "Figma Vectors"
version: 0.1.0
revision: 1
---

# Figma Vectors

## Fills

- solid color
- gradient
  - linear gradient
  - others..

**Injecting linear gradient to existing path only svg.**

```xml
<!-- from -->
<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink">
  <path
    d="M10.59 2L6 6.58L1.41 2L0 3.41L6 9.41L12 3.41L10.59 2Z"
    fill="black"
  />
</svg>

<!-- to -->
<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="myGradient" gradientTransform="rotate(90)">
      <stop offset="5%"  stop-color="gold" />
      <stop offset="95%" stop-color="red" />
    </linearGradient>
  </defs>
  <path
    d="M10.59 2L6 6.58L1.41 2L0 3.41L6 9.41L12 3.41L10.59 2Z"
    fill="url('#myGradient')"
  />
</svg>
```

## Resizing

### Web - css

**Using viewBox**

## Towards clean design / code

**Do not use rectangle shape as a vector. (as background)**

We often see designers using vector path as a rect shape, placing it as a background. This approach is only recommanded when clipping graphics. Having a solid / gradient color rect in a vector node is not recommanded.

**Related Lints**

- Don't set constraint to stretch for vector
  Accepted values are `left` | `right` | `top` | `bottom` | `scale` (with aspect ratio)

**Rect shape vector will automatically interpreted as Simply Rectangle**

WIP - rectangle detection based on svg path data. this algorithm is under development.

---
id: kappa
title: KAPPA Constant
---

`KAPPA` is an approximation constant used to convert a circular arc into a cubic Bézier curve. It is defined as:

```
4 * (\sqrt{2} - 1) / 3
```

This evaluates to approximately `0.5522847498`.

When bending a right angle to approximate a quarter circle, the control points of the Bézier curve are placed at a distance of `KAPPA * radius` from the curve's endpoints, where the radius is half of the reference segment's length. This construction is widely used for drawing circles or rounded corners with cubic Bézier segments.

The constant is available in Grida's core math modules:

- **TypeScript:** `cmath.KAPPA`
- **Rust:** `math2::KAPPA`

For more background on this approximation, see [Spencer Mortensen's article on Bézier circles](https://spencermortensen.com/articles/bezier-circle/).

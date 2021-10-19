---
title: Css When to use css position absolute or fixed
version: 0.1.0
revision: 1
---

# When to use css position:`absolute | fixed`

The difference between absolute and fixed happens when thier is more than 1 dpeth level of hierarchy.

Both are fixed values, but absolute is relative to its container (parent) and fixed is relative to its root (screen / page)

So, to best fit all cases we use `aboslute` in most cases when it's not explicitly specified.

In general, you should be using fixed for global element that is always on top of all layers, for example on Bottom navigation.

## References

- https://developer.mozilla.org/en-US/docs/Web/CSS/position
- https://www.w3schools.com/css/css_positioning.asp

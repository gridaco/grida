---
title: Css mask and why we don't support it
version: 0.1.0
revision: 1
---

# Css masking is not supported due to lack of major browser support.

https://developer.mozilla.org/en-US/docs/Web/CSS/mask

- mask-clip
- mask-composite
- mask-image
- mask-mode
- mask-origin
- mask-position
- mask-repeat
- mask-size

[Supported browsers](https://developer.mozilla.org/en-US/docs/Web/CSS/mask#browser_compatibility)

- [ ] Chrome
- [ ] Edge
- [x] Firefox
- [ ] Opera
- [ ] Safari

## Design masking to css alternative.

**Using Stack, `overflow: hidden`**

Interpreting masking group as a Stack, we use `overflow: hidden` as alternative to using css `mask-clip` + @

**Using css clip-path**

Goto - [css-clip-path docs](./css-clip-path.md)

## Related

- [Figma masking](./figma-mask-layer.md)
- [Css clip-path](./css-clip-path.md)

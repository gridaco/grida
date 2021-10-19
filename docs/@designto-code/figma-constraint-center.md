---
title: "Constraints - CENTER"
version: 0.1.0
revision: 1
---

# Constraints - CENTER

> This document is based on horizontally centered element. (which applies the same to vertically centered.)

Before we start, we recommand you to read [Figma Constraint docs](https://www.figma.com/plugin-docs/api/Constraints/). in this document, we only handle `CENTER`

## The behaviour

![](./assets/constraint-calculation-center.png)

## Web - css

[Example sandbox file](https://codesandbox.io/s/wizardly-robinson-c034i)

```css
.container {
  /* ... */
  position: relative; /* for stacking items */
  /* ... */
}

/* const diff = C1 - c1; this will be a pre calculated static value */
.centered {
  position: absolute;
  left: calc(50% + diff - 100px);
  right: calc(50% + diff + 100px);
  width: 200px;
}
```

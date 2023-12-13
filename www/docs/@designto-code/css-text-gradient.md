---
title: "CSS Gradient on text layer"
version: 0.1.0
revision: 1
---

# CSS - Gradient on Text Layer

Applying a gradient to a text fill is quite different from simply giving a color to a text.
Yet hooray CSS, it is much more simple than other platforms (flutter, android, ...)

**How to**

```css
h1 {
  font-size: 72px;
  background: -webkit-linear-gradient(#eee, #333);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

### References

- https://cssgradient.io/blog/css-gradient-text/
- https://github.com/gridaco/designto-code/issues/84

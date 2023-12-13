---
title: "Break-lines in jsx"
version: 0.1.0
revision: 1
---

## Break lines in jsx.

```tsx
<p>Hello{"\n"}World</p>
```

When `white-space: pre-line` is not specified, the `\n` will be replaced with space ` `. to avoid this, we have to put `white-space: pre-line` or, more simply, use `<br/>` tag for breaking line to make everything work universally across web frameowks.

This option can be toggled via [coli-escape-string#jsx](https://github.com/gridaco/CoLI/tree/main/packages/coli-escape-string)'s config

https://developer.mozilla.org/en-US/docs/Web/CSS/white-space
https://stackoverflow.com/questions/36260013/react-display-line-breaks-from-saved-textarea

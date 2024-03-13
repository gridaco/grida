---
id: intro
title: "Introduction to Flags"
sidebar_position: 1
---

# Flags

Flags are a way to define a set of options that can be used to customize the behavior of a component.

Flags are great way of extending your design as more life-like and responsive.

## How to use flags

**Example case 1. - I want my group to be exported as artwork.**

![artwork-flag-example](./assets/--artwork-flag-example-part-name-editing-only.gif)

Like in the example above, the `--artwork` flag is used to export the group as an artwork.

```tsx
// conceptually, this converts this
<div>
  <img />
  <img />
  <img />
</div>

// to this
<img />
```

Learn more about [--artwork](../@designto-code/flags/--artwork)

<!-- this link is valid on docs site -->

**Example case 2. - I want my text to be rendered as `<h1>`.**

![h1-flag-example](./assets/--h1-flag-example-part-name-editing-only.gif)

---
title: As-H3 flag
id: "--as-h3"
locale: en
locales:
  - en
  - ko
stage:
  - production
  - staging
  - experimental
---

# `--as-h3` As Heading3

**Accepted keys**

- `--as-h3`
- `--as-heading3`
- `--as-headline3`
- `--h3`
- `--heading3`
- `--headline3`

## Syntax

```ts
`--h3${"="typeof boolean}`
```

## Example

```
--h3

--h3=true
--h3=false

--h3=yes
--h3=no

----h3
```

## When to use

<!-- shared content between h1~h6 -->

**SEO**

Explicitly specifying the heading element tag, ofcourse, is essential for SEO.
This does not applies to mobile apps, but for web, you might want to specify headings in a semantic sence.

## Behavior

**Element**
When applied, this will force the node to be rendered as a `<h3>` element.

**Text style**
We don't yet support text style matching with `--h3` flag.

## See Also

- [`--as-h1`](./--as-h1)
- [`--as-h2`](./--as-h2)
- [`--as-h4`](./--as-h4)
- [`--as-h5`](./--as-h5)
- [`--as-h6`](./--as-h6)
- [`--as-p`](./--as-p)
- [`--as-br`](./--as-br)

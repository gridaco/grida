---
title: As-H2 flag
id: "--as-h2"
locale: en
locales:
  - en
  - ko
stage:
  - production
  - staging
  - experimental
---

# `--as-h2` As Heading2

**Accepted keys**

- `--as-h2`
- `--as-heading2`
- `--as-headline2`
- `--h2`
- `--heading2`
- `--headline2`

## Syntax

```ts
`--h2${"="typeof boolean}`
```

## Example

```
--h2

--h2=true
--h2=false

--h2=yes
--h2=no

----h2
```

## When to use

<!-- shared content between h1~h6 -->

**SEO**

Explicitly specifying the heading element tag, ofcourse, is essential for SEO.
This does not applies to mobile apps, but for web, you might want to specify headings in a semantic sence.

## Behavior

**Element**
When applied, this will force the node to be rendered as a `<h2>` element.

**Text style**
We don't yet support text style matching with `--h2` flag.

## See Also

- [`--as-h1`](./--as-h1)
- [`--as-h3`](./--as-h3)
- [`--as-h4`](./--as-h4)
- [`--as-h5`](./--as-h5)
- [`--as-h6`](./--as-h6)
- [`--as-p`](./--as-p)
- [`--as-br`](./--as-br)

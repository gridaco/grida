---
title: As-H1 flag
id: "--as-h1"
locale: en
locales:
  - en
  - ko
stage:
  - production
  - staging
  - experimental
---

# `--as-h1` As Heading1

**Accepted keys**

- `--as-h1`
- `--as-heading1`
- `--as-headline1`
- `--h1`
- `--heading1`
- `--headline1`

## Syntax

```ts
`--h1${"="typeof boolean}`
```

## Examples

```
--h1

--h1=true
--h1=false

--h1=yes
--h1=no

----h1
```

## When to use

<!-- shared content between h1~h6 -->

**SEO**

Explicitly specifying the heading element tag, ofcourse, is essential for SEO.
This does not applies to mobile apps, but for web, you might want to specify headings in a semantic sence.

## Behavior

**Element**
When applied, this will force the node to be rendered as a `<h1>` element.

**Text style**
We don't yet support text style matching with `--h1` flag.

## See Also

- [`--as-h2`](./--as-h2)
- [`--as-h3`](./--as-h3)
- [`--as-h4`](./--as-h4)
- [`--as-h5`](./--as-h5)
- [`--as-h6`](./--as-h6)
- [`--as-p`](./--as-p)
- [`--as-br`](./--as-br)

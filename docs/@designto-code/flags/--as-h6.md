---
title: As-H6 flag
id: "--as-h6"
locale: en
locales:
  - en
  - ko
stage:
  - production
  - staging
  - experimental
---

# `--as-h6` As Heading6

**Accepted keys**

- `--as-h6`
- `--as-heading6`
- `--as-headline6`
- `--h6`
- `--heading6`
- `--headline6`

## Syntax

```ts
`--h6${"="typeof boolean}`
```

## Example

```
--h6

--h6=true
--h6=false

--h6=yes
--h6=no

----h6
```

## When to use

<!-- shared content between h1~h6 -->

**SEO**

Explicitly specifying the heading element tag, ofcourse, is essential for SEO.
This does not applies to mobile apps, but for web, you might want to specify headings in a semantic sence.

## Behavior

**Element**
When applied, this will force the node to be rendered as a `<h6>` element.

**Text style**
We don't yet support text style matching with `--h6` flag.

## See Also

- [`--as-h1`](./--as-h1)
- [`--as-h2`](./--as-h2)
- [`--as-h3`](./--as-h3)
- [`--as-h4`](./--as-h4)
- [`--as-h5`](./--as-h5)
- [`--as-p`](./--as-p)
- [`--as-br`](./--as-br)

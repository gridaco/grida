---
title: As-H4 flag
id: "--as-h4"
locale: en
locales:
  - en
  - ko
stage:
  - production
  - staging
  - experimental
---

# `--as-h4` As Heading4

**Accepted keys**

- `--as-h4`
- `--as-heading4`
- `--as-headline4`
- `--h4`
- `--heading4`
- `--headline4`

## Syntax

```ts
`--h4${"="typeof boolean}`
```

## Example

```
--h4

--h4=true
--h4=false

--h4=yes
--h4=no

----h4
```

## When to use

<!-- shared content between h1~h6 -->

**SEO**

Explicitly specifying the heading element tag, ofcourse, is essential for SEO.
This does not applies to mobile apps, but for web, you might want to specify headings in a semantic sence.

## Behavior

**Element**
When applied, this will force the node to be rendered as a `<h4>` element.

**Text style**
We don't yet support text style matching with `--h4` flag.

## See Also

- [`--as-h1`](./--as-h1)
- [`--as-h2`](./--as-h2)
- [`--as-h3`](./--as-h3)
- [`--as-h5`](./--as-h5)
- [`--as-h6`](./--as-h6)
- [`--as-p`](./--as-p)
- [`--as-br`](./--as-br)

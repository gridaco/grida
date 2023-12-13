---
title: Min Height flag
description: Add min-height property for your responsive design with flags.
id: "--min-height"
locale: en
locales:
  - en
  - ko
stage:
  - production
  - staging
  - experimental
---

# Min height

**Accepted keys**

- `--min-height`
- `--minheight`

## Syntax

```ts
`--min-height=${typeof length}`;
```

## Example

```
--min-height=100

--min-height=100px

--min-height=100vh
```

## Behavior

**Element**
There is no impact on element itself, but it can break relative layouts.

**Style**
When applied, this will force the node to be rendered with a `min-height` style.

## See Also

- [`--max-height`](./--max-height)
- [`--min-width`](./--max-width)
- [`--height`](./--height)

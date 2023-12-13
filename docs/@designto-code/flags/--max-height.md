---
title: Max Height flag
description: Add max-height property for your responsive design with flags.
id: "--max-height"
locale: en
locales:
  - en
  - ko
stage:
  - production
  - staging
  - experimental
---

# Max height

**Accepted keys**

- `--max-height`
- `--maxheight`

## Syntax

```ts
`--max-height=${typeof length}`;
```

## Example

```
--max-height=100

--max-height=100px

--max-height=100vh
```

## Behavior

**Element**
There is no impact on element itself, but it can break relative layouts.

**Style**
When applied, this will force the node to be rendered with a `max-height` style.

## See Also

- [`--max-width`](./--max-width)
- [`--min-height`](./--max-height)
- [`--height`](./--height)

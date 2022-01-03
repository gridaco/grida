---
title: Max Width flag
description: Add max-width property for your responsive design with flags.
id: "--max-width"
locale: en
locales:
  - en
  - ko
stage:
  - production
  - staging
  - experimental
---

# Max width

**Accepted keys**

- `--max-width`
- `--maxwidth`

## Syntax

```ts
`--max-width=${typeof length}`;
```

## Example

```
--max-width=100

--max-width=100px

--max-width=400vw
```

## Behavior

**Element**
There is no impact on element itself, but it can break relative layouts.

**Style**
When applied, this will force the node to be rendered with a max-width style.

## See Also

- [`--max-height`](./--max-height)
- [`--min-width`](./--max-width)
- [`--width`](./--max-width)

---
title: Unwrap flag
id: "--unwrap"
locale: en
locales:
  - en
stage:
  - draft
  - staging
  - proposal
  - experimental
---

# `--unwrap` Flag

The `--unwrap` Flag is used for unwrapping the containing layout. This is used when targetting the root of the interest when utility-layout only required by design tools should be ignored.

**Accepted keys**

- `--unwrap`

## Syntax

```ts
`--unwrap${"="typeof boolean}`
```

**Example**

```
--unwrap

--unwrap=true
--unwrap=false

--unwrap=yes
--unwrap=no

----unwrap
```

## See also

- [`--root`](../--root)

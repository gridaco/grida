---
title: Fix Width flag
description: Fixing the width with fix-width flag for statically sized elements.
id: "--fix-width"
locale: en
stage:
  - production
  - staging
  - experimental
---

# `--fix-width` Flag (Draft)

When applied, this will force dedicated layer's `width` to be ignore responsive width, use current width as fixed width instead.

**Accepted keys**

- `--fix-width`

## Syntax

```ts
`--fix-width${"="typeof boolean}`
```

## Example

```
--fix-width

--fix-width=true
--fix-width=false

--fix-width=True
--fix-width=False

--fix-width=yes
--fix-width=no
```

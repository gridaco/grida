---
title: Root flag
id: "--root"
locale: en
locales:
  - en
stage:
  - draft
  - staging
  - proposal
  - experimental
---

# `--root` Flag (Draft)

This speficies that the node should be interpreted as root of the layout.

## Syntax

```ts
`--root` | `--root=${typeof boolean}` | `--root=<strategy-id>`;
```

## Example

```
--root
--root=true
--root=false
--root=use-static-strategy
```

## See also

- [`--unwrap`](--unwrap)

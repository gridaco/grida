---
stage:
  - production
  - staging
  - experimental
---

# `--as-h3` As Heading3

**Accepted keys**

- `--as-h3`
- `--as-heading3`
- `--as-headline3`
- `--h3`
- `--heading3`
- `--headline3`

## Syntax

```ts
`--h3${"="typeof boolean}`
```

## Example

```
--h3

--h3=true
--h3=false

--h3=yes
--h3=no

----h3
```

## Behavior

**Element**
When applied, this will force the node to be rendered as a `<h3>` element.

**Text style**
We don't yet support text style matching with `--h3` flag.

## See Also

- [`--as-h1`](../--as-h1)
- [`--as-h2`](../--as-h2)
- [`--as-h4`](../--as-h4)
- [`--as-h5`](../--as-h5)
- [`--as-h6`](../--as-h6)
- [`--as-p`](../--as-p)
- [`--as-br`](../--as-br)

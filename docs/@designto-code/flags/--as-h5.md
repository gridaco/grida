---
stage:
  - production
  - staging
  - experimental
---

# `--as-h5` As Heading5

**Accepted keys**

- `--as-h5`
- `--as-heading5`
- `--as-headline5`
- `--h5`
- `--heading5`
- `--headline5`

## Syntax

```ts
`--h5${"="typeof boolean}`
```

## Example

```
--h5

--h5=true
--h5=false

--h5=yes
--h5=no

----h5
```

## Behavior

**Element**
When applied, this will force the node to be rendered as a `<h5>` element.

**Text style**
We don't yet support text style matching with `--h5` flag.

## See Also

- [`--as-h1`](../--as-h1)
- [`--as-h2`](../--as-h2)
- [`--as-h3`](../--as-h3)
- [`--as-h4`](../--as-h4)
- [`--as-h6`](../--as-h6)
- [`--as-p`](../--as-p)
- [`--as-br`](../--as-br)

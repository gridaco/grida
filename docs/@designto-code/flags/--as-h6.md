---
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

## Behavior

**Element**
When applied, this will force the node to be rendered as a `<h6>` element.

**Text style**
We don't yet support text style matching with `--h6` flag.

## See Also

- [`--as-h1`](../--as-h1)
- [`--as-h2`](../--as-h2)
- [`--as-h3`](../--as-h3)
- [`--as-h4`](../--as-h4)
- [`--as-h5`](../--as-h5)
- [`--as-p`](../--as-p)
- [`--as-br`](../--as-br)

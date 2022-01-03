---
stage:
  - production
  - staging
  - experimental
---

# `--as-h2` As Heading2

**Accepted keys**

- `--as-h2`
- `--as-heading2`
- `--as-headline2`
- `--h2`
- `--heading2`
- `--headline2`

## Syntax

```ts
`--h2${"="typeof boolean}`
```

## Example

```
--h2

--h2=true
--h2=false

--h2=yes
--h2=no

----h2
```

## Behavior

**Element**
When applied, this will force the node to be rendered as a `<h2>` element.

**Text style**
We don't yet support text style matching with `--h2` flag.

## See Also

- [`--as-h1`](../--as-h1)
- [`--as-h3`](../--as-h3)
- [`--as-h4`](../--as-h4)
- [`--as-h5`](../--as-h5)
- [`--as-h6`](../--as-h6)
- [`--as-p`](../--as-p)
- [`--as-br`](../--as-br)

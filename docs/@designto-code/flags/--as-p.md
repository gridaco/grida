# `--as-p` As Paragraph (Text)

> This flag is for web platform. Otherwise, it will be ignored, have no impact on the final output.

**Accepted keys**

- `--as-p`
- `--as-paragraph`
- `--paragraph`

## Syntax

```ts
`--as-p${"="typeof boolean}`
```

## Example

```
--paragraph

--paragraph=true
--paragraph=false

--paragraph=yes
--paragraph=no

----paragraph
```

## Behavior

**Element**
When applied, this will force the node to be rendered as a `<p>` element.

**Text style**
We don't yet support text style matching with `--p` flag.

## See Also

- [`--as-h1`](../--as-h1)
- [`--as-h2`](../--as-h2)
- [`--as-h3`](../--as-h3)
- [`--as-h4`](../--as-h4)
- [`--as-h5`](../--as-h5)
- [`--as-h6`](../--as-h6)
- [`--as-p`](../--as-p)
- [`--as-br`](../--as-br)

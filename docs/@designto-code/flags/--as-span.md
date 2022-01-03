# `--as-span` As TextSpan (Text)

> This flag is for web platform. Otherwise, it will be ignored, have no impact on the final output.

**Accepted keys**

- `--as-span`
- `--as-text-span`
- `--as-textspan`
- `--text-span`
- `--textspan`

## Syntax

```ts
`--as-span${"="typeof boolean}`
```

## Example

```
--as-span

--as-span=true
--as-span=false

--as-span=yes
--as-span=no

----as-span
```

## Behavior

**Element**
When applied, this will force the node to be rendered as a `<span>` element.

**Text style**
We don't yet support text style matching with `--as-span` flag.

## Anatomy

```ts
export interface AsSpanFlag {
  flag: "as-span" | "as-text-span" | "as-textspan" | "text-span" | "textspan";

  value?: boolean;
}
```

## See Also

- [`--as-h1`](../--as-h1)
- [`--as-h2`](../--as-h2)
- [`--as-h3`](../--as-h3)
- [`--as-h4`](../--as-h4)
- [`--as-h5`](../--as-h5)
- [`--as-h6`](../--as-h6)
- [`--as-p`](../--as-p)

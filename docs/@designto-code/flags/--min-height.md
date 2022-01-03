# Min height

**Accepted keys**

- `--min-height`
- `--minheight`

## Syntax

```ts
`--min-height=${typeof length}`;
```

## Example

```
--min-height=100

--min-height=100px

--min-height=100vh
```

## Behavior

**Element**
There is no impact on element itself, but it can break relative layouts.

**Style**
When applied, this will force the node to be rendered with a `min-height` style.

## See Also

- [`--max-height`](../--max-height)
- [`--min-width`](../--max-width)
- [`--height`](../--height)

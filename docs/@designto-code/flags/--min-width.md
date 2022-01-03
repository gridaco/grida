# Min width

**Accepted keys**

- `--min-width`
- `--minwidth`

## Syntax

```ts
`--min-width=${typeof length}`;
```

## Example

```
--min-width=100

--min-width=100px

--min-width=100vw
```

## Behavior

**Element**
There is no impact on element itself, but it can break relative layouts.

**Style**
When applied, this will force the node to be rendered with a `min-width` style.

## See Also

- [`--max-width`](../--max-width)
- [`--min-height`](../--min-height)
- [`--width`](../--width)

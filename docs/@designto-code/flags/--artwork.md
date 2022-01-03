## Artwork flag

**Accepted keys**

- `--artwork`

## Syntax

```ts
`--artwork${"="typeof boolean}`
```

## Example

```
--artwork

--artwork=true
--artwork=false

--artwork=yes
--artwork=no

----artwork
```

## Behavior

**Interpreter**

When applied, this will force the node to be exported as an image.

**Render**

- HTML: rendered as an `<img>` element.
- Flutter: rendered as an `Image` widget.

## See Also

- [`--export-as`](../--export-as)

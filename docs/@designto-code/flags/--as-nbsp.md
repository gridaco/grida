# `--as-nbsp` As Non-Breaking Space

**Accepted keys**

- `--as-nbsp`
- `--as-space`
- `--nbsp`

**`--as-nbsp` Extends `--as-char`**

> `--as-nbsp` is equivalent to `--as-char=&nbsp;` or `--as-char=" "`

## Syntax

```ts
`--nbsp${"="typeof number}`
```

## Example

```
--nbsp       // 1 space, with `"&nbsp;"` on html
--as-nbsp    // 1 space, with `"&nbsp;"` on html
--as-space   // 1 space, with `" "` on html, if not available, e.g. on trailing, uses `"&nbsp;"`.


--nbsp=2     // 2 spaces
--nbsp=3     // 3 spaces


----nbsp=2   // commented out
```

## See also

- [`--as-char`](./--as-char)

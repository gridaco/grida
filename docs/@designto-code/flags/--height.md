# `--height` for explicit height

**Accepted keys**

- `--height`
- `--h`

## Syntax

```ts
`--height=${typeof length}`;
```

## Example

```
--height=100
--h=100

--height=100px

--height=100vh
```

## Behavior

**Element**
There is no impact on element itself, but it can break relative layouts.

**Style**
When applied, this will force the node to be rendered with a `height` style.

## (Proposal) (Draft) Advanced use

> This feature is a proposal, won't work on production use.

height and height support specifying min, max, and initial values.

This is how it looks like:

`--height=(initial)` or `--height=(min)-(max)-(initial)`

```
--height=100px                // initial only
--height=100px-1080px-50vh    // min, max, initial
--height=100px-1080px         // min, max
--height=?-1080px             // min (none), max
--height=100px-?              // min , max (none)
--height=100px-?-50vh         // min , max (none), initial
```

you can skip the declaration with `?` keyword. this is a special keyword, interpreted as `undefined`

"`--height=100px-?-50vh`" this will make css for example, as below.

```css
.foo {
  min-height: 100px;
  height: 50vh;
}
```

"`--height=100px-1080px`" this indicates only min and max, yet, still the height will be specified based on current height of the origin design.

```css
.foo {
  min-height: 100px;
  max-height: 1080px;
  height: 400px; /* this is from the design */
}
```

### Ignoring one of the property

**Using explicit `--ignore` flag**
to ignore the height, you can use new flag `--ignore` set to height. like so - `--ignore=height`

```css
.foo {
  min-height: 100px;
  max-height: 1080px;
  /* height: 400px; this is ignored by --ignore flag */
}
```

**Using `?` keyword**
Otherwise, you can simply use silincer keyword `?` to ignore the height, like so - `--height=100px-1080px-?`

This will also generate style like below.

```css
.foo {
  min-height: 100px;
  max-height: 1080px;
  /* height: 400px; this is ignored by "?" keyword */
}
```

### Referencing current value with `.`

Setting max-height to current height (based on design) with - `--height=100px-.-.`

This will generate style like below.

```css
.foo {
  min-height: 100px;
  max-height: 400px; /* the current height from design */
  height: 400px; /* the current height from design */
}
```

## See Also

- [`--max-height`](./--max-height)
- [`--min-height`](./--min-height)
- [`--width`](./--width)

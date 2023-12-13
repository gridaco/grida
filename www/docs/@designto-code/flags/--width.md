---
title: Width flag
id: "--width"
locale: en
stage:
  - production
  - staging
  - experimental
---

# `--width` for explicit width

**Accepted keys**

- `--width`
- `--w`

## Syntax

```ts
`--width=${typeof length}`;
```

## Example

```
--width=100
--w=100

--width=100px

--width=400vw
```

## Behavior

**Element**
There is no impact on element itself, but it can break relative layouts.

**Style**
When applied, this will force the node to be rendered with a `width` style.

## (Proposal) (Draft) Advanced use

> This feature is a proposal, won't work on production use.

width and height support specifying min, max, and initial values.

This is how it looks like:

`--width=(initial)` or `--width=(min)-(max)-(initial)`

```
--width=100px                // initial only
--width=100px-1080px-50vw    // min, max, initial
--width=100px-1080px         // min, max
--width=?-1080px             // min (none), max
--width=100px-?              // min , max (none)
--width=100px-?-50vw         // min , max (none), initial
```

you can skip the declaration with `?` keyword. this is a special keyword, interpreted as `undefined`

"`--width=100px-?-50vw`" this will make css for example, as below.

```css
.foo {
  min-width: 100px;
  width: 50vw;
}
```

"`--width=100px-1080px`" this indicates only min and max, yet, still the width will be specified based on current width of the origin design.

```css
.foo {
  min-width: 100px;
  max-width: 1080px;
  width: 400px; /* this is from the design */
}
```

### Ignoring one of the property

**Using explicit `--ignore` flag**
to ignore the width, you can use new flag `--ignore` set to width. like so - `--ignore=width`

```css
.foo {
  min-width: 100px;
  max-width: 1080px;
  /* width: 400px; this is ignored by --ignore flag */
}
```

**Using `?` keyword**
Otherwise, you can simply use silincer keyword `?` to ignore the width, like so - `--width=100px-1080px-?`

This will also generate style like below.

```css
.foo {
  min-width: 100px;
  max-width: 1080px;
  /* width: 400px; this is ignored by "?" keyword */
}
```

### Referencing current value with `.`

Setting max-width to current width (based on design) with - `--width=100px-.-.`

This will generate style like below.

```css
.foo {
  min-width: 100px;
  max-width: 400px; /* the current width from design */
  width: 400px; /* the current width from design */
}
```

## See Also

- [`--max-width`](./--max-width)
- [`--min-width`](./--min-width)
- [`--height`](./--height)

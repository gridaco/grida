# Flags (Proposal)

> Flag feature is not ready to use

---

> Flag is a strategy for specified extra context, passing arguments based on the node. Just like CLI, the syntax is `--flag-name` / `--flag-name=value` / `--flag-name value` / custom flags

## Syntax

flags shall be specified end of the node name like so - `"Header --fixed-position"`. You can name the layer as `"--fixed-position Header"`, but this will interpret the name of the layer as empty string. and take the "Header" as invalid argument for flag `--fixed-position` for example.

## List of supported flags by `design to code`

### Special

- `//@ignore` - Ignore the flagged node from all process

### Artwork / Graphics

- `--artwork` / `--graphics` - specify that node is a artwork (graphics) and shall not be converted to a code, but a graphic element as png by default.
- `--export`
  - `--export-png`
  - `--export-svg`
- `--video`

### Named Components

- `--is-<component>` - tell the detector engine that this is a kind of a `<component>`
- `--as-<component>` - force make this node as a component of specified, with the risk of fallback & invalud code.
- `--is-button`
- `--is-chip`
- `--is-tabbar`
- `--is-appbar`

### Ignore property

- `--ignore-<property-name>` / `--ignore=[property-accessor]`
- `--ignore-item-spacing`

### Dynamic content / container

- `--dynamic-container`
- `--dynamic-item`

### Animation

- `--animated`
- `--animated-<property>`

---

- `--animated-rotation`

### Position

- `--position-fixed`
- `--position-fixed-override=bottom`

### Dimension

The dimension flags are for specifing the extra context of the layout, which are not supported by the design tools.

- `--max-width`
- `--min-width`
- `--max-height`
- `--min-height`

## Breakpoints

- `@media`

### Embedding

- `--as-media`
- `--image-src` - `--image-src=https://example.com/example.png`
- `--video-src` - `--video-src=https://youtube.com/watch?v=xQGEOsCzFJU`
- `--webview-src` - `--webview-src=https://youtube.com/watch?v=xQGEOsCzFJU` (also knwon as iframe)

### Nested Scenario - on component-instance use

<!-- WIP -->

```
(WIP)
Master - master-component --artwork
Instance - master-component --dynamic-container
```

### Custom flags

1. you can add your custom flag by using `---arg` instead of `--arg`
2. you can add your custom flag by using namespace `--com.domain.pkg/key=value`

- `---custom-flag-name=value`

### Tesging

for testing, you can temporarily disable flag input by changing `--flag` to `----flag`. by this our parser will understand that the `flag` is givven, but temporarily disabled. other than `----` might cause error since changing

1. from `--first-flag=a --second-flag=b`
2. to `--first-flag=a second-flag=b` (Don't)
   will cuase a parsing error & `first-flag`'s value will be interpreted as `"a second-flag=b"`

**Best practice**

1. from `--first-flag=a --second-flag=b`
2. to `--first-flag=a ----second-flag=b` (Do)
3. will cuase a parsing error & `first-flag`'s value will be interpreted as `"a"` as intended.

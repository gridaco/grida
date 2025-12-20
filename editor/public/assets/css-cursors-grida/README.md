# Grida Custom Cursors

License: Public Domain  
Original Author: Grida

## Naming

`[name]-[size]-x[X]y[Y]-[fill].[ext]`

- **name**: cursor name
- **size**: cursor image size (currently always square)
- **xXyY**: hotspot coordinates in the _image_ (x, y)
- **fill**: fill color in hex (without `#`)
- **ext**: file extension

## Cursors

| name                | size | hotspot (image) | fill     | png                                                                                  | svg                                                                                  |
| ------------------- | ---: | --------------: | -------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `default`           | `64` |       `x28 y28` | `000000` | [`default-64-x28y28-000000.png`](./default-64-x28y28-000000.png)                     | [`default-64-x28y28-000000.svg`](./default-64-x28y28-000000.svg)                     |
| `lasso`             | `64` |       `x12 y12` | `000000` | [`lasso-64-x12y12-000000.png`](./lasso-64-x12y12-000000.png)                         | [`lasso-64-x12y12-000000.svg`](./lasso-64-x12y12-000000.svg)                         |
| `ew-resize`         | `64` |       `x32 y32` | `000000` | [`ew-resize-64-x32y32-000000.png`](./ew-resize-64-x32y32-000000.png)                 | [`ew-resize-64-x32y32-000000.svg`](./ew-resize-64-x32y32-000000.svg)                 |
| `ew-resize-scale`   | `64` |       `x32 y32` | `000000` | [`ew-resize-scale-64-x32y32-000000.png`](./ew-resize-scale-64-x32y32-000000.png)     | [`ew-resize-scale-64-x32y32-000000.svg`](./ew-resize-scale-64-x32y32-000000.svg)     |
| `ns-resize`         | `64` |       `x32 y32` | `000000` | [`ns-resize-64-x32y32-000000.png`](./ns-resize-64-x32y32-000000.png)                 | [`ns-resize-64-x32y32-000000.svg`](./ns-resize-64-x32y32-000000.svg)                 |
| `ns-resize-scale`   | `64` |       `x32 y32` | `000000` | [`ns-resize-scale-64-x32y32-000000.png`](./ns-resize-scale-64-x32y32-000000.png)     | [`ns-resize-scale-64-x32y32-000000.svg`](./ns-resize-scale-64-x32y32-000000.svg)     |
| `nesw-resize`       | `64` |       `x32 y32` | `000000` | [`nesw-resize-64-x32y32-000000.png`](./nesw-resize-64-x32y32-000000.png)             | [`nesw-resize-64-x32y32-000000.svg`](./nesw-resize-64-x32y32-000000.svg)             |
| `nesw-resize-scale` | `64` |       `x32 y32` | `000000` | [`nesw-resize-scale-64-x32y32-000000.png`](./nesw-resize-scale-64-x32y32-000000.png) | [`nesw-resize-scale-64-x32y32-000000.svg`](./nesw-resize-scale-64-x32y32-000000.svg) |
| `nwse-resize`       | `64` |       `x32 y32` | `000000` | [`nwse-resize-64-x32y32-000000.png`](./nwse-resize-64-x32y32-000000.png)             | [`nwse-resize-64-x32y32-000000.svg`](./nwse-resize-64-x32y32-000000.svg)             |
| `nwse-resize-scale` | `64` |       `x32 y32` | `000000` | [`nwse-resize-scale-64-x32y32-000000.png`](./nwse-resize-scale-64-x32y32-000000.png) | [`nwse-resize-scale-64-x32y32-000000.svg`](./nwse-resize-scale-64-x32y32-000000.svg) |

## Usage

When using `url-set()` (1x/2x), the hotspot coordinates must match the _rendered_ cursor size. If you provide a `64px` cursor image as `2x`, the CSS hotspot is `(hotspot_in_image / 2)`.

```css
cursor:
  url-set(
      url("/assets/css-cursors-grida/default-64-x28y28-000000.png") 2x,
      url("/assets/css-cursors-grida/default-64-x28y28-000000.png") 1x
    )
    /* (28/2) = 14 */ 14 14,
  default;
```

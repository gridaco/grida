# Grida Custom Cursors

License: Public Domain
Original Author: Grida

Naming:

## [`name`]-[`size`]-[x`X`y`Y`]-[`fill`].[`ext`]

- `name` - the name of the cursor
- `size` - the size of the cursor (always square)
- `xXyY` - the x and y hot spot of the cursor
- `fill` - the fill color of the cursor in hex format (without #)
- `ext` - the extension of the cursor

## Examples

- `default-64-x28y28-000000.png`

## Usage

```css
cursor:
  url-set(
      url("https://grida.co/assets/css-cursors-grida/default-64-x28y28-000000.png")
        2x,
      url("https://grida.co/assets/css-cursors-grida/default-64-x28y28-000000.png")
        1x
    )
    /* (28/2) = (14) */ 14 14,
  default;
```

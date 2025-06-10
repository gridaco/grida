# math2

`math2` is a collection of lightweight geometry and math utilities used across the Grida canvas engine. It includes helpers for working with vectors, rectangles, affine transforms, rasterization and many other 2D operations.

This crate is a direct port of the original TypeScript [`grida-cmath`](../../packages/grida-cmath) library. The APIs mostly follow the functional style of the source project.

## Features

- Vector and rectangle primitives
- Affine transform helpers
- Bézier conversion and bounding box computation
- Rasterization algorithms (bresenham, circle/ellipse, flood fill, Gaussian blur, etc.)
- Snapping, layout and packing utilities
- Color conversions (HEX, RGBA)

## Installation

Add the crate to your `Cargo.toml`:

```toml
[dependencies]
math2 = "0.0.1"
```

## Example

```rust
use math2::{Rectangle, vector2, rect_transform};
use math2::transform::AffineTransform;

let rect = Rectangle { x: 0.0, y: 0.0, width: 100.0, height: 50.0 };
let transform = AffineTransform::translate(10.0, 20.0);
let moved = rect_transform(rect, &transform);
assert_eq!(moved.x, 10.0);
assert_eq!(moved.y, 20.0);
```

## Suggestions for future improvements

The current code mirrors the functional API of the original TypeScript version. Some potential refinements for a more idiomatic Rust API include:

- Exposing common operations as methods on types like `Vector2` and `Rectangle`.
- Implementing standard traits (`Add`, `Sub`, etc.) for math types.
- Splitting optional algorithms (e.g. rasterization) behind crate features for `no_std` builds.

## License

Licensed under the MIT license.

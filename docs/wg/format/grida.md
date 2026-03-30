# Grida IR -- Format Reference

The Grida IR is the in-memory scene graph used by all Grida rendering, layout, and editing pipelines. It is the single representation that CSS, HTML, SVG, and `.grida` files all target.

**Canonical sources:**

- Rust runtime model: `crates/grida-canvas/src/node/schema.rs`
- FlatBuffers schema: `format/grida.fbs`
- TypeScript model: `packages/grida-canvas-schema/grida.ts`

## Node Types

| Node               | Rust Type                     | Description                                                           |
| ------------------ | ----------------------------- | --------------------------------------------------------------------- |
| InitialContainer   | `InitialContainerNodeRec`     | Viewport root (like `<html>`). Structural only, no visual properties. |
| Container          | `ContainerNodeRec`            | Box with children. Supports layout, paint, effects, clip.             |
| Group              | `GroupNodeRec`                | Logical grouping. Blend mode + opacity, no own paint.                 |
| Tray               | `TrayNodeRec`                 | Specialized container (component-like).                               |
| Rectangle          | `RectangleNodeRec`            | Filled/stroked rectangle with corner radius.                          |
| Ellipse            | `EllipseNodeRec`              | Ellipse with arc data (start/end/inner ratio).                        |
| Line               | `LineNodeRec`                 | Straight line segment.                                                |
| Path               | `PathNodeRec`                 | Arbitrary SVG-style path.                                             |
| Polygon            | `PolygonNodeRec`              | Arbitrary polygon vertices.                                           |
| RegularPolygon     | `RegularPolygonNodeRec`       | N-sided regular polygon.                                              |
| RegularStarPolygon | `RegularStarPolygonNodeRec`   | Star with inner/outer radii.                                          |
| Vector             | `VectorNodeRec`               | Vector network (Figma-style).                                         |
| BooleanOperation   | `BooleanPathOperationNodeRec` | Union/subtract/intersect/exclude of child paths.                      |
| TextSpan           | `TextSpanNodeRec`             | Single-style text run.                                                |
| AttributedText     | `AttributedTextNodeRec`       | Rich text (multiple styled runs).                                     |
| Image              | `ImageNodeRec`                | Raster image (embedded or referenced).                                |
| Error              | `ErrorNodeRec`                | Placeholder for failed imports.                                       |

## Common Properties

Fields shared across most node types:

| Field        | Type                    | Description                                |
| ------------ | ----------------------- | ------------------------------------------ |
| `active`     | `bool`                  | Whether node is visible/active             |
| `opacity`    | `f32`                   | 0.0 (transparent) to 1.0 (opaque)          |
| `blend_mode` | `LayerBlendMode`        | PassThrough or Blend(BlendMode)            |
| `transform`  | `AffineTransform`       | 2D affine (3x2 matrix)                     |
| `mask`       | `Option<LayerMaskType>` | Alpha or luminance mask                    |
| `effects`    | `LayerEffects`          | Blur, backdrop blur, shadows, glass, noise |

## Geometry

| Field              | Type                      | Applies to                        |
| ------------------ | ------------------------- | --------------------------------- |
| `size`             | `Size { width, height }`  | Rectangle, Line, Image, etc.      |
| `corner_radius`    | `RectangularCornerRadius` | Rectangle, Container (per-corner) |
| `corner_smoothing` | `CornerSmoothing`         | Rectangle, Container (iOS-style)  |

## Paint

### Fills & Strokes

Both use `Paints` (ordered list of `Paint`):

| Paint Variant    | Description                                |
| ---------------- | ------------------------------------------ |
| `Solid`          | `SolidPaint { color, blend_mode, active }` |
| `LinearGradient` | Start/end points, color stops              |
| `RadialGradient` | Center, radius, color stops                |
| `SweepGradient`  | Center, start/end angle, color stops       |
| `Image`          | `ImagePaint { src, fit, tile }`            |

### Stroke Properties

| Field                             | Type                                                  |
| --------------------------------- | ----------------------------------------------------- |
| `stroke_width`                    | `StrokeWidth` (Uniform `f32` or Rectangular per-side) |
| `stroke_style.stroke_align`       | `StrokeAlign` (Inside, Outside, Center)               |
| `stroke_style.stroke_cap`         | `StrokeCap` (Butt, Round, Square)                     |
| `stroke_style.stroke_join`        | `StrokeJoin` (Miter, Round, Bevel)                    |
| `stroke_style.stroke_miter_limit` | `StrokeMiterLimit`                                    |
| `stroke_style.stroke_dash_array`  | `Option<StrokeDashArray>`                             |

## Layout

### Container Layout (`LayoutContainerStyle`)

| Field                         | Type                         | Description                                                         |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| `layout_mode`                 | `LayoutMode`                 | `Normal` or `Flex`                                                  |
| `layout_direction`            | `Axis`                       | `Horizontal` or `Vertical`                                          |
| `layout_wrap`                 | `Option<LayoutWrap>`         | `NoWrap` or `Wrap`                                                  |
| `layout_main_axis_alignment`  | `Option<MainAxisAlignment>`  | Start, Center, End, SpaceBetween, SpaceAround, SpaceEvenly, Stretch |
| `layout_cross_axis_alignment` | `Option<CrossAxisAlignment>` | Start, Center, End, Stretch                                         |
| `layout_padding`              | `Option<EdgeInsets>`         | top, right, bottom, left                                            |
| `layout_gap`                  | `Option<LayoutGap>`          | main_axis_gap, cross_axis_gap                                       |

### Child Layout (`LayoutChildStyle`)

| Field                | Type                | Description                      |
| -------------------- | ------------------- | -------------------------------- |
| `layout_grow`        | `f32`               | Flex grow factor (0.0 = no grow) |
| `layout_positioning` | `LayoutPositioning` | `Auto` or `Absolute`             |

**Not yet in schema:** flex-shrink, margin, align-self, order.

### Dimensions (`LayoutDimensionStyle`)

| Field                        | Type                 |
| ---------------------------- | -------------------- |
| `layout_target_width`        | `Option<f32>`        |
| `layout_target_height`       | `Option<f32>`        |
| `layout_min_width`           | `Option<f32>`        |
| `layout_max_width`           | `Option<f32>`        |
| `layout_min_height`          | `Option<f32>`        |
| `layout_max_height`          | `Option<f32>`        |
| `layout_target_aspect_ratio` | `Option<(f32, f32)>` |

## Effects (`LayerEffects`)

| Field           | Type                      | Description                          |
| --------------- | ------------------------- | ------------------------------------ |
| `blur`          | `Option<FeLayerBlur>`     | Layer blur (Gaussian or Progressive) |
| `backdrop_blur` | `Option<FeBackdropBlur>`  | Backdrop blur                        |
| `shadows`       | `Vec<FilterShadowEffect>` | DropShadow or InnerShadow            |
| `glass`         | `Option<FeLiquidGlass>`   | Liquid glass effect                  |
| `noises`        | `Vec<FeNoiseEffect>`      | Noise grain effects                  |

### Shadow (`FeShadow`)

```
FeShadow { dx, dy, blur, spread, color, active }
```

Wrapped in `FilterShadowEffect::DropShadow(FeShadow)` or `FilterShadowEffect::InnerShadow(FeShadow)`.

## Blend Modes (`BlendMode`)

Normal, Multiply, Screen, Overlay, Darken, Lighten, ColorDodge, ColorBurn, HardLight, SoftLight, Difference, Exclusion, Hue, Saturation, Color, Luminosity.

`LayerBlendMode::PassThrough` = non-isolated (children blend with backdrop).
`LayerBlendMode::Blend(mode)` = isolated compositing with specified mode.

## Text

### `TextSpanNodeRec`

| Field                 | Type                                                    |
| --------------------- | ------------------------------------------------------- |
| `text`                | `String`                                                |
| `text_style`          | `TextStyleRec`                                          |
| `text_align`          | `TextAlign` (Left, Right, Center, Justify)              |
| `text_align_vertical` | `TextAlignVertical` (Top, Center, Bottom)               |
| `width`               | `Option<f32>` (wrapping width)                          |
| `height`              | `Option<f32>` (container height for vertical alignment) |

### `TextStyleRec`

| Field               | Type                                                     |
| ------------------- | -------------------------------------------------------- |
| `font_size`         | `f32`                                                    |
| `font_weight`       | `FontWeight(u32)`                                        |
| `font_family`       | `String`                                                 |
| `font_style_italic` | `bool`                                                   |
| `line_height`       | `TextLineHeight` (Factor or Fixed)                       |
| `letter_spacing`    | `TextLetterSpacing` (Fixed or Percentage)                |
| `word_spacing`      | `TextWordSpacing` (Fixed or Percentage)                  |
| `text_transform`    | `TextTransform` (None, Uppercase, Lowercase, Capitalize) |
| `text_decoration`   | `Option<TextDecorationRec>`                              |

### `TextDecorationRec`

| Field                       | Type                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| `text_decoration_line`      | `TextDecorationLine` (None, Underline, Overline, LineThrough)       |
| `text_decoration_color`     | `Option<CGColor>`                                                   |
| `text_decoration_style`     | `Option<TextDecorationStyle>` (Solid, Double, Dotted, Dashed, Wavy) |
| `text_decoration_skip_ink`  | `Option<bool>`                                                      |
| `text_decoration_thickness` | `Option<f32>`                                                       |

## Clip / Overflow

`ContainerNodeRec.clip: bool` -- when true, children are clipped to the container's rounded-rect bounds. The container's own stroke and outer effects are not clipped.

## Transform (`AffineTransform`)

2D affine transform as a 3x2 matrix:

```
| m00  m01  m02 |     | scaleX  skewX   translateX |
| m10  m11  m12 |  =  | skewY   scaleY  translateY |
| 0    0    1   |     | 0       0       1          |
```

Identity = `[[1,0,0],[0,1,0]]`. Every node with geometry has a transform field.

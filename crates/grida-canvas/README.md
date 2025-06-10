# grida-canvas (`cg`)

<img src="./cover.png" alt="Grida Canvas Rendering Backend Example" width="100%" />

## Build

```bash
make build
make build_release
```

### Scene Cache

`Renderer` can record a scene into an off‑screen [`Picture`](https://rust-skia.github.io/doc/skia_safe/struct.Picture.html) and reuse it while the camera moves. This dramatically reduces draw calls when the scene is static.

```rust
// Cache the scene after loading resources
renderer.cache_scene(&scene);

// Later, call `render_scene` normally
renderer.render_scene(&scene);
```

## Rendering

**2D Nodes**

- [ ] TextSpan
- [ ] Text (Text with mixed styles)
- [ ] Image
- [ ] Bitmap (for bitmap drawing)
- [ ] Group
- [ ] Container (Frame)
- [ ] Rectangle
- [ ] Ellipse
- [ ] Polygon
- [ ] RegularPolygon
- [ ] RegularStarPolygon
- [ ] Path (SVG Path)
- [ ] Vector (Vector Network)
- [ ] Line

**Meta**

- [ ] Mask
- [ ] Clip

**Styles & Effects**

- [ ] SolidPaint
- [ ] LinearGradientPaint
- [ ] RadialGradientPaint
- [ ] DropShadow
- [ ] BoxShadow
- [ ] BlendMode

## API

**Camera**

- [ ] 2D Camera

**Pipeline & API**

- [ ] load font
- [ ] load image

## Interactivity

- [ ] Hit testing

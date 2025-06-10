# grida-canvas (`cg`)

<img src="./cover.png" alt="Grida Canvas Rendering Backend Example" width="100%" />

## Build

```bash
make build
make build_release
```

### Scene Cache

`Renderer` can record a scene into off‑screen [`Picture`](https://rust-skia.github.io/doc/skia_safe/struct.Picture.html)s and reuse them while the camera moves. The behaviour is controlled by `SceneCacheStrategy`.

```rust
use cg::scene_cache::SceneCacheStrategy;

// Use depth 0 to cache the entire scene as one picture
renderer.set_cache_strategy(SceneCacheStrategy { depth: 0 });
```

Caching is opt‑in; call `cache_scene` whenever the scene content changes. The default strategy caches top‑level nodes (`depth: 1`).

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

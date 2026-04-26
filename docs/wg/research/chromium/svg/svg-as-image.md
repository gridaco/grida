---
title: "Chromium SVG as Image"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG as Image

Three deployment modes for SVG content, with differing pipelines:

1. **Inline** — `<svg>` inside an HTML document.
2. **Image** — `<img src="foo.svg">`, `background-image: url(foo.svg)`,
   `<input type="image">`, CSS `content: url(…)`.
3. **Document** — `.svg` loaded as the top-level URL, or via `<iframe>` /
   `<object>`.

This doc focuses on the image mode — everything else in this subdirectory
describes the inline mode, which is the richest pipeline.

## `SVGImage`

`SVGImage` is the `Image` subclass used when SVG content is treated as a
raster image (modes 2 above).

```cpp
// third_party/blink/renderer/core/svg/graphics/svg_image.h
class SVGImage final : public Image {
 public:
  static scoped_refptr<SVGImage> Create(ImageObserver*,
                                        bool is_multipart = false);
  static bool IsInSVGImage(const Node*);
  bool IsSVGImage() const override { return true; }
  gfx::Size SizeWithConfig(SizeConfig) const override;
};
```

Design points:

- An `SVGImage` does **not** cache a rasterized bitmap. It holds the
  parsed SVG content plus a sandboxed `Page`/`Document`/`LocalFrame`
  triple that owns the `LayoutSVGRoot` and the rest of the LayoutSVG\*
  tree.
- Drawing an `SVGImage` runs the standard paint path against the
  sandboxed document and emits a `PaintRecord`. That record is then
  rasterized by the normal compositor path.
- Because there's no bitmap cache, zooming in / scaling up does not
  pixelate — the SVG is re-painted at the target resolution.

## `IsolatedSVGDocumentHost`

The sandboxed environment for `SVGImage`:

- Its own `Page` with JavaScript disabled. Script elements are parsed but
  not executed.
- Its own `Document` that holds the SVG tree.
- Its own `LocalFrame`, its own event loop — but no user interaction
  (no pointer events, no focus).
- CORS applied to external resource loads (fonts, other images, etc.).
  Tainting is tracked so that a CORS-tainted `SVGImage` can't be used in
  contexts that require a clean origin (e.g., canvas `drawImage` taints
  the canvas).

## Sizing — `SVGImageForContainer`

SVG has an intrinsic size from its `<svg width height>` / `viewBox`, but
it can render at any container size. `SVGImageForContainer` wraps an
`SVGImage` plus a specific container size + zoom, caching the painted
output for that size:

```cpp
// third_party/blink/renderer/core/svg/graphics/svg_image_for_container.h
class SVGImageForContainer final : public Image {
 public:
  static scoped_refptr<SVGImageForContainer> Create(
      scoped_refptr<SVGImage> image,
      const gfx::SizeF& container_size,
      float zoom,
      const KURL&);
  void Draw(cc::PaintCanvas*, const cc::PaintFlags&, …) override;
};
```

For a `<img src="foo.svg" width="200" height="100">`, CSS computes the
container size, Blink creates a `SVGImageForContainer` for that size, and
the `<img>`'s paint code calls `Draw` with the container rect.

Re-paints happen only when:

- The container size changes (→ Blink creates a new
  `SVGImageForContainer`).
- An animation or external resource load invalidates the SVG.

## Standalone SVG documents

When a URL serves `Content-Type: image/svg+xml` at the top level:

- The loaded document is a full Blink `Document` (like an HTML document),
  not a sandboxed `SVGImage` host.
- Script **can** run (unless CSP blocks it).
- The document is rendered via `LayoutSVGRoot` at the viewport size.
- User interaction works normally.

This is the "open an .svg file in the browser" experience.

## `<iframe>` / `<object>` embedding

An `.svg` file loaded into an iframe or object element is also a full
`Document`, not an `SVGImage`. It has its own event loop, JavaScript can
run, and DOM events work within the frame. From outside, it's opaque like
any other frame.

## Recap: which mode creates which objects

| Embedding mode                      | Document   | LayoutSVGRoot        | Script         | Can animate     | Sandboxed |
| ----------------------------------- | ---------- | -------------------- | -------------- | --------------- | --------- |
| Inline `<svg>` in HTML              | parent's   | one per `<svg>` root | yes (parent's) | yes             | no        |
| `<img src="*.svg">`                 | isolated   | yes                  | no             | yes (SMIL, CSS) | yes       |
| `background-image: url(*.svg)`      | isolated   | yes                  | no             | yes             | yes       |
| `<iframe src="*.svg">` / `<object>` | full frame | yes                  | yes            | yes             | no        |
| Top-level navigation to `*.svg`     | full       | yes                  | yes            | yes             | no        |

## Source files

| File                                             | Role                                         |
| ------------------------------------------------ | -------------------------------------------- |
| `core/svg/graphics/svg_image.h`                  | `SVGImage` — SVG-as-image wrapper            |
| `core/svg/graphics/svg_image_for_container.h`    | Per-container-size wrapper around `SVGImage` |
| `core/svg/graphics/isolated_svg_document_host.h` | Sandbox for image-mode SVG                   |
| `core/loader/resource/image_resource.cc`         | Decides `SVGImage` vs bitmap decoder         |

---
title: "Chromium External Resource Loading — Lifecycle & Architecture"
description: "How Chromium fetches, caches, and integrates external resources (images, stylesheets, fonts) into the rendering pipeline."
keywords: [chromium, resource-loading, images, css, blink, fetch]
tags: [research, chromium, resource-loading, images, css]
format: md
---

# Chromium External Resource Loading

How Chromium fetches, caches, and integrates external resources (images,
stylesheets, fonts) into the rendering pipeline. Focused on the
architecture patterns relevant to our htmlcss module's image support.

---

## Resource Type Taxonomy

Chromium classifies external resources by type, each with its own loader
and caching behavior:

```text
Resource (abstract base)
  ├── ImageResource          <img src>, CSS background-image, border-image
  ├── CSSStyleSheetResource  <link rel="stylesheet">, @import
  ├── ScriptResource         <script src>
  ├── FontResource           @font-face src
  ├── RawResource            XHR / fetch()
  └── ...
```

Source: `third_party/blink/renderer/platform/loader/fetch/resource.h`

Each Resource subclass knows how to decode its specific format (e.g.
ImageResource decodes to `blink::Image`, FontResource to font data).

---

## The Resource Lifecycle

### States

```
kNotStarted → kPending → kCached | kLoadError | kDecodeError
```

| State          | Meaning                                  |
| -------------- | ---------------------------------------- |
| `kNotStarted`  | Resource created but fetch not initiated |
| `kPending`     | Fetch in progress (network or cache)     |
| `kCached`      | Successfully loaded and decoded          |
| `kLoadError`   | Network error (404, timeout, CORS)       |
| `kDecodeError` | Data arrived but decode failed           |

Additional transitions exist for multipart images (progressive JPEG,
animated GIF) and cache revalidation (304 responses).

Source: `third_party/blink/renderer/core/loader/resource/image_resource_content.h`

### Key Principle: Render Before Load

Chromium **does not block rendering** on image loads. The pipeline
proceeds through Style → Layout → Paint with placeholder slots for
pending images. When the image arrives, it triggers an
**invalidation** that re-paints only the affected region.

---

## The Fetch Pipeline

### 1. URL Resolution

CSS `url()` values and HTML `src` attributes are resolved against the
document's base URL during style resolution. The resolved URL becomes
the resource key.

```text
CSS:     background-image: url("logo.png")
Resolve: https://example.com/css/../logo.png → https://example.com/logo.png
```

### 2. Resource Request

`ResourceFetcher` is the central coordinator. Each Document owns one.

```text
Document
  └── ResourceFetcher
        ├── MemoryCache lookup (content-addressed)
        ├── HTTP cache lookup (via browser process)
        └── Network fetch (via browser process IPC)
```

Flow:

1. Consumer calls `ResourceFetcher::RequestResource(FetchParams)`
2. Fetcher checks MemoryCache (keyed by URL + request headers)
3. Cache hit → return existing Resource (may still be loading)
4. Cache miss → create Resource, start network fetch
5. Resource dispatches data to registered clients/observers

Source: `third_party/blink/renderer/platform/loader/fetch/resource_fetcher.cc`

### 3. Prioritization

Resources are prioritized by type and document position:

| Priority | Resource Types                      |
| -------- | ----------------------------------- |
| Highest  | Main document, critical CSS         |
| High     | Visible images, preloaded resources |
| Medium   | Scripts, fonts                      |
| Low      | Below-fold images, prefetch         |
| Lowest   | Speculative preload, favicon        |

`ResourceLoadScheduler` enforces per-host connection limits and
priority queuing.

Source: `third_party/blink/renderer/platform/loader/fetch/resource_load_scheduler.cc`

---

## Image-Specific Loading

### ImageResource → ImageResourceContent → Image

```text
ImageResource (platform fetch layer)
    │ owns
    ▼
ImageResourceContent (content + observer management)
    │ decodes to
    ▼
blink::Image (decoded bitmap / vector)
    ├── BitmapImage (raster: PNG, JPEG, WebP, GIF)
    └── SVGImage   (vector: SVG rendered to Picture)
```

### Observer Pattern

Consumers implement `ImageResourceObserver`:

```cpp
class ImageResourceObserver {
  virtual void ImageChanged(ImageResourceContent*, CanDeferInvalidation) = 0;
  virtual void ImageNotifyFinished(ImageResourceContent*) = 0;
};
```

- `ImageChanged()` — called on each progressive decode chunk, size
  change, or animation frame. Triggers paint invalidation.
- `ImageNotifyFinished()` — called once when loading completes
  (success or failure). Used for layout invalidation if intrinsic
  size was unknown.

Source: `third_party/blink/renderer/core/loader/resource/image_resource_observer.h`

### Who Observes Images?

| Observer            | Trigger Source                | Action on Notify               |
| ------------------- | ----------------------------- | ------------------------------ |
| `ImageLoader`       | `<img>` element               | Invalidate layout + paint      |
| `StyleFetchedImage` | CSS `background-image: url()` | Invalidate paint (no relayout) |
| `CSSImageValue`     | CSS `border-image-source`     | Invalidate paint               |
| `LayoutImage`       | `<img>` layout object         | Invalidate intrinsic size      |

### CSS background-image Flow

```text
CSS Parser
  ↓ url("bg.png")
CSSImageValue
  ↓ StyleBuilderConverter
StyleFetchedImage (wraps pending ImageResourceContent)
  ↓ stored in
FillLayer (ComputedStyle::background)
  ↓ at paint time
BoxPainterBase::PaintFillLayer()
  ↓ calls
StyleImage::GetImage() → returns Image* or nullptr if pending
  ↓ if available
canvas->drawImageRect(image, src_rect, dest_rect)
```

Key insight: `FillLayer` in `ComputedStyle` stores a `StyleImage*`
which may be a `StylePendingImage` (not yet fetched), a
`StyleFetchedImage` (fetch initiated), or a `StyleGeneratedImage`
(gradient — no fetch needed).

### `<img>` Element Flow

```text
HTML Parser
  ↓ <img src="photo.jpg">
HTMLImageElement
  ↓ UpdateImageLoader()
ImageLoader::UpdateFromElement()
  ↓ ResourceFetcher::RequestResource()
ImageResource (kPending)
  ↓ network response arrives
ImageResourceContent::NotifyObservers()
  ↓
ImageLoader::ImageNotifyFinished()
  ↓
LayoutImage::ImageChanged() → invalidate layout (intrinsic size)
  ↓
Paint invalidation → re-paint with decoded image
```

### Replaced Element Sizing

`<img>` is a **replaced element** — its intrinsic size comes from the
image data, not from CSS content. Before the image loads:

1. If `width`/`height` attributes are set → use those as intrinsic size
2. If `aspect-ratio` from attributes → use that with available width
3. Otherwise → fallback to 300×150 (or 0×0 depending on context)

After image loads, intrinsic size updates trigger relayout only if
the actual dimensions differ from the placeholder.

Source: `third_party/blink/renderer/core/layout/layout_replaced.cc`

---

## Caching Architecture

### Memory Cache (in-process)

```text
MemoryCache (singleton per renderer process)
  ├── keyed by (URL, request mode, credentials mode)
  ├── strong refs for in-use resources (have observers)
  ├── weak/purgeable refs for idle resources
  └── eviction: LRU within size budget
```

### Decoded Image Cache

Decoded bitmaps are cached separately from encoded data:

- Encoded data: kept in `SharedBuffer` (may be purgeable)
- Decoded bitmap: GPU texture or CPU bitmap, evicted under memory pressure
- Skia manages GPU texture cache internally

### HTTP Cache (browser process)

The browser process owns the HTTP cache (disk-backed). Renderer
requests go through IPC → browser checks cache headers (ETag,
Last-Modified, Cache-Control) → returns cached response or fetches
from network.

---

## Key Design Patterns to Adopt

### 1. Placeholder-then-Replace (Non-blocking)

Chromium never blocks the pipeline on image loads. The render proceeds
with a placeholder (empty rect or broken-image icon), and paint
invalidation fires when the image arrives.

**Implication for us:** `htmlcss::render()` should produce a Picture
even when images are pending. Missing images get placeholder rects.
When the host provides the image data later, re-render with images
populated.

### 2. Observer/Notify Pattern

Resources notify their consumers via observer callbacks, not polling.
Each consumer registers interest and gets exactly one
`NotifyFinished()` plus zero-or-more `ImageChanged()` calls.

**Implication for us:** Our existing `ImageRepository.drain_missing()`
pattern already implements a polling variant. For htmlcss, we need to
surface which image URLs are referenced so the host can fetch them.

### 3. StyleImage Abstraction

CSS images are polymorphic — `url()` and `linear-gradient()` share
the same slot in `FillLayer`. Gradients are always synchronous
(generated at paint time). URL images are async. The abstraction
hides this from the paint code.

**Implication for us:** Our `BackgroundLayer` enum already has this
shape (`Solid`, `LinearGradient`, `RadialGradient`, `ConicGradient`).
Adding `Image(ImageRef)` to this enum follows the same pattern.

### 4. Content-Addressed Dedup

`MemoryCache` deduplicates by URL — multiple `<img>` elements pointing
to the same URL share one `ImageResource`. Decoded images are shared
across the entire renderer process.

**Implication for us:** `ImageRepository` already does this (keyed by
src string). The htmlcss module should look up images from the same
repository used by the canvas node image fills.

### 5. Intrinsic Size Before Decode

For layout, Chromium only needs the image dimensions, not the full
decoded bitmap. HTTP responses with `Content-Length` and image headers
(IHDR for PNG, SOF for JPEG) provide dimensions before the full body
arrives.

**Implication for us:** In our synchronous pipeline, if an image is
in `ImageRepository` we have its decoded `skia::Image` and can query
`width()`/`height()`. If missing, we need a fallback intrinsic size
(HTML `width`/`height` attributes, or a default).

---

## Source Files

| File                                               | Role                       |
| -------------------------------------------------- | -------------------------- |
| `platform/loader/fetch/resource.h`                 | Abstract Resource base     |
| `platform/loader/fetch/resource_fetcher.cc`        | Central fetch coordinator  |
| `platform/loader/fetch/resource_load_scheduler.cc` | Priority queuing           |
| `core/loader/resource/image_resource.h`            | Image resource subclass    |
| `core/loader/resource/image_resource_content.h`    | Content + observer mgmt    |
| `core/loader/resource/image_resource_observer.h`   | Observer interface         |
| `core/loader/image_loader.cc`                      | `<img>` element loader     |
| `core/style/style_image.h`                         | CSS image abstraction      |
| `core/style/style_fetched_image.h`                 | URL-referenced CSS image   |
| `core/style/fill_layer.h`                          | CSS background layer stack |
| `core/paint/box_painter_base.cc`                   | Background/border painting |
| `core/layout/layout_replaced.cc`                   | Replaced element sizing    |

All paths relative to `third_party/blink/renderer/`.

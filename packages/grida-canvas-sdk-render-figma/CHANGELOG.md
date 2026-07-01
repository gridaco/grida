# @grida/refig

## 0.0.7

### Patch Changes

- 3490792: Repin `@grida/canvas-wasm` → `0.91.0-canary.22`, delivering the remaining #867 Rust-painter render-fidelity fixes to `@grida/refig` (the ones 0.0.6 deferred to "a future `canvas-wasm` canary bump"):
  - **Layer opacity** — per-fill SOLID opacity was squared (`color.a * opacity`); it now uses the color alpha directly. Server-side Figma renders that manually pre-baked `color.a *= opacity` can drop that workaround. (#867)
  - **Text line-height** — switched to half-leading (the CSS/Figma model). (#867)

  The canary also introduces the render-client image-sampling seam (#900), but it is a **no-op for refig** — headless rendering uses `render` intent, which samples with the high-quality cubic (Mitchell), exactly the previous behavior.

## 0.0.6

### Patch Changes

- 5697a29: Fix Figma REST API render fidelity for the converter-side (TypeScript) paint mapping:
  - **Crop image fills** — fills using Figma's editor Crop mode (REST `scaleMode: "STRETCH"` with an `imageTransform`) were non-uniformly stretched to fill the layer box, ignoring the crop. They now honor the crop transform — the image is scaled and clipped to the box. (#897)
  - **Gradient / crop-image transform flip** — a node's baked flip/skew is now applied to gradient and crop-image fills, so e.g. a vertically-flipped scrim gradient no longer renders upside-down. (#867)

  The remaining #867 fixes — layer opacity, image sampling quality, and text line-height — live in the Rust painter and reach `@grida/refig` only through a rebuilt `@grida/canvas-wasm`. They are **not** included in this release; they ship with a future `canvas-wasm` canary bump.

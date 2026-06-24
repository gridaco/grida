# @grida/refig

## 0.0.6

### Patch Changes

- 5697a29: Fix Figma REST API render fidelity for the converter-side (TypeScript) paint mapping:
  - **Crop image fills** — fills using Figma's editor Crop mode (REST `scaleMode: "STRETCH"` with an `imageTransform`) were non-uniformly stretched to fill the layer box, ignoring the crop. They now honor the crop transform — the image is scaled and clipped to the box. (#897)
  - **Gradient / crop-image transform flip** — a node's baked flip/skew is now applied to gradient and crop-image fills, so e.g. a vertically-flipped scrim gradient no longer renders upside-down. (#867)

  The remaining #867 fixes — layer opacity, image sampling quality, and text line-height — live in the Rust painter and reach `@grida/refig` only through a rebuilt `@grida/canvas-wasm`. They are **not** included in this release; they ship with a future `canvas-wasm` canary bump.

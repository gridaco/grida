---
"@grida/refig": patch
---

Repin `@grida/canvas-wasm` → `0.91.0-canary.22`, delivering the remaining #867 Rust-painter render-fidelity fixes to refig (the ones the 0.0.6 notes deferred to "a future `canvas-wasm` canary bump"):

- **Layer opacity** — per-fill SOLID opacity was squared (`color.a * opacity`); now uses the color alpha directly. Server-side Figma renders that manually pre-baked `color.a *= opacity` can drop that workaround. (#867)
- **Text line-height** — switched to half-leading (the CSS/Figma model). (#867)

The canary also introduces the render-client image-sampling seam (#900), but it is a **no-op for refig**: headless rendering is `render` intent, which samples with the high-quality cubic (Mitchell) — exactly the previous behavior.

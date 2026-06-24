---
"@grida/refig": patch
---

Fix Figma REST API render fidelity: layer opacity, image `CROP` scale mode,
gradient transform flip, image sampling quality, and text line-height (#867).

The opacity / sampling / line-height fixes live in the Rust painter
(`crates/grida`) and reach `@grida/refig` only through a rebuilt
`@grida/canvas-wasm`. `0.91.0-canary.21` and earlier predate #867 and do **not**
contain them — this release must be paired with a `canvas-wasm` canary built
_after_ #867. See the PR for the required release order.

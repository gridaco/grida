# Image Filters - `image-filters`

| feature id      | status | description                                              |
| --------------- | ------ | -------------------------------------------------------- |
| `image-filters` | draft  | standard image filters modeling & implementation details |

## Master Comparison Table

| Name (UI)          | Technical term | Math backend (per pixel)    | Grida   | CSS                  | Figma | Apple Photos | Photoshop / Resolve | Skia impl            | Order sensitive | Priority | Difficulty | Notes / Usage                      |
| ------------------ | -------------- | --------------------------- | ------- | -------------------- | ----- | ------------ | ------------------- | -------------------- | --------------- | -------- | ---------- | ---------------------------------- |
| Exposure           | Exposure       | linear multiply (C \* 2^E)  | planned | filter: brightness() | ✓     | ✓            | ✓                   | color matrix         | No              | High     | Low        | Basic linear brightness adjustment |
| Contrast           | Contrast       | linear scale around 0.5     | planned | filter: contrast()   | ✓     | ✓            | ✓                   | color matrix         | No              | High     | Low        | Linear contrast scaling            |
| Saturation         | Saturation     | linear interpolation        | planned | filter: saturate()   | ✓     | ✓            | ✓                   | color matrix         | No              | High     | Low        | Adjusts color intensity            |
| Temperature        | Temperature    | color temperature shift     | planned | no direct CSS        | ✓     | ✓            | ✓                   | color matrix         | No              | Medium   | Medium     | White balance adjustment           |
| Tint               | Tint           | color tint shift            | planned | no direct CSS        | ✓     | ✓            | ✓                   | color matrix         | No              | Medium   | Medium     | Color cast adjustment              |
| Hue                | Hue rotation   | hue rotation matrix         | -       | filter: hue-rotate() | ✗     | ✗            | ✓                   | color matrix         | No              | High     | Low        | Hue rotation                       |
| Grayscale          | Grayscale      | desaturation matrix         | -       | filter: grayscale()  | ✗     | ✓            | ✓                   | color matrix         | No              | Medium   | Low        | Converts to grayscale              |
| Sepia              | Sepia          | sepia color matrix          | -       | filter: sepia()      | ✗     | ✗            | ✓                   | color matrix         | No              | Medium   | Low        | Sepia tone effect                  |
| Invert             | Invert         | invert colors               | -       | filter: invert()     | ✗     | ✗            | ✓                   | color matrix         | No              | Medium   | Low        | Inverts colors                     |
| Highlights         | Highlights     | non-linear curve/LUT        | -       | no direct CSS        | ✗     | ✓            | ✓                   | LUT / runtime shader | Yes             | Medium   | High       | Adjusts bright areas               |
| Shadows            | Shadows        | non-linear curve/LUT        | -       | no direct CSS        | ✗     | ✓            | ✓                   | LUT / runtime shader | Yes             | Medium   | High       | Adjusts dark areas                 |
| Brightness (Apple) | Brightness     | linear add                  | -       | filter: brightness() | ✗     | ✓            | ✓                   | color matrix         | No              | Medium   | Low        | Apple-specific brightness          |
| Black Point        | Black Point    | non-linear curve/LUT        | -       | no direct CSS        | ✗     | ✓            | ✓                   | LUT / runtime shader | Yes             | Low      | High       | Adjusts black level                |
| Vibrance           | Vibrance       | non-linear saturation curve | -       | no direct CSS        | ✗     | ✓            | ✓                   | LUT / runtime shader | Yes             | Medium   | High       | Selective saturation boost         |
| Brilliance         | Brilliance     | non-linear curve/LUT        | -       | no direct CSS        | ✗     | ✓            | ✓                   | LUT / runtime shader | Yes             | Low      | High       | Midtone brightness enhancement     |

## Purpose

Our objective is to define a consistent, performant, and portable **color adjustments** model that feels familiar to designers (Figma/Apple/Adobe semantics) while being technically simple enough to run **in real‑time** via Skia. This document establishes shared terminology, a master comparison across platforms, and a minimal, high‑impact set of adjustments we will standardize first.

Scope (for this spec): **color/tone adjustments only** (a.k.a. “color filters” / _adjustments_). Spatial effects (blur, sharpen, shadows) are out of scope except where noted in comparisons.

## Challenges

- **Cross‑app inconsistency:** The same slider name (e.g., “Contrast”) can use different math (pivot, gamma, space), leading to visually different outcomes across CSS, Figma, Apple Photos, Photoshop, and Resolve.
- **Color space & gamma:** Linear‑light vs sRGB operations change results. Web/CSS typically operates in sRGB for compatibility; pro tools often prefer linear/log spaces for accuracy.
- **Order sensitivity:** Linear/affine ops commute, but **non‑linear** (Shadows/Highlights, Vibrance) and **spatial** (Blur/Sharpen) do not. A fixed pipeline avoids user confusion.
- **Performance & fusion:** Multiple passes cost GPU time. We should **fuse all linear ops into a single color matrix** and apply non‑linear curves only once.
- **Naming vs math:** UX names (Exposure, Temperature, Tint) must map cleanly to stable math so results are predictable and testable.

## Focus & Priorities

We will prioritize **straightforward, non‑conflicting, commonly available** controls that designers expect and that map 1:1 to a **single Skia color matrix** (order‑insensitive):

1. **Exposure** — linear brightness (scalar gain)
2. **Contrast** — linear scale around mid‑gray pivot
3. **Saturation** — chroma scale preserving luma
4. **Temperature** — R/B channel ratio (warm ↔ cool)
5. **Tint** — G ↔ magenta balance

These five cover the majority of day‑to‑day needs in a Figma‑like workflow and are easy to combine/fuse. Non‑linear adjustments (Highlights/Shadows, Vibrance, Black Point, Brilliance) are **phase‑two** items due to order sensitivity and implementation complexity (curves/LUTs).

### Pipeline Order (static)

For determinism and performance:

`Linear group (fused matrix) → Non‑linear curves (optional) → Spatial effects (optional)`  
i.e., **Exposure → Contrast → Temperature → Tint → Saturation → (Highlights/Shadows) → (Blur)**

## Top 5 Filters

Below are the top five we will implement first. Each is widely exposed as a **top‑level adjustment** in other apps (not buried as a sub‑control), useful, and mathematically simple.

### 1) Exposure

- **Why**: Universal “make brighter/darker” control; first stop for quick fixes.
- **Math**: `RGB' = RGB * k` (often parameterized as `k = 2^E`, where `E` is EV‑like). Clamp to [0,1].
- **Skia**: Single **color matrix** multiply with uniform scale; can be fused with others.
- **UX**: Default `k = 1`. Suggested range: `0.5…1.5` (or EV `-1…+1`). Slider shows percentage or EV.
- **Cross‑app**: CSS `brightness()`, Figma Exposure, Apple Exposure, Photoshop/Resolve global exposure.

### 2) Contrast

- **Why**: Controls overall “pop”; improves readability/perceived sharpness.
- **Math**: `c' = (c − p) * k + p` with pivot `p = 0.5` (sRGB). Clamp.
- **Skia**: Implement via **color matrix** with bias term; fuses with Exposure.
- **UX**: Default `k = 1`. Range `0…2` (0 = flat gray, 1 = neutral, 2 = strong). Consider gentle curve for >1 to avoid clipping.
- **Cross‑app**: CSS `contrast()`, Figma Contrast, Apple Contrast, Photoshop/Resolve Contrast.

### 3) Saturation

- **Why**: Brand alignment and visual punch; desaturate for disabled states or muted looks.
- **Math**: `color' = lerp(luma, color, k)`, `luma = dot(RGB, [0.2126, 0.7152, 0.0722])`.
- **Skia**: **Color matrix** based on luma coefficients; fuses with other linear ops.
- **UX**: Default `k = 1`. Range `0…2` (0 = grayscale, 2 = vivid). Provide preview safe‑guards to avoid clipping.
- **Cross‑app**: CSS `saturate()`, Figma Saturation, Apple Saturation, Photoshop/Resolve Saturation.

### 4) Temperature

- **Why**: Quick white‑balance fix (cool daylight ↔ warm tungsten) for consistency across assets.
- **Math**: Scale R vs B channels: `R' = R * rK`, `B' = B * bK`, typically `rK = 1 + t`, `bK = 1 − t` (small `t`). Keep luma roughly stable.
- **Skia**: **Color matrix** scaling on R/B with optional normalization to preserve luma.
- **UX**: Default `t = 0`. Range `−1…+1` (or UI label “Cool ↔ Warm”). Show neutral midpoint.
- **Cross‑app**: Figma Temperature, Apple _Warmth_, Photoshop/Resolve Temperature. (No direct CSS filter.)

### 5) Tint

- **Why**: Complements Temperature to fix green/magenta casts (fluorescent, mixed lighting).
- **Math**: Adjust G relative to R+B: `G' = G * gK` (or add small bias) with luma preservation.
- **Skia**: **Color matrix** scaling for G with optional normalization.
- **UX**: Default `gK = 1`. Range `~0.9…1.1` (or slider `−100…+100`). Label “Green ↔ Magenta”.
- **Cross‑app**: Figma Tint, Apple Tint, Photoshop/Resolve Tint. (No direct CSS filter.)

### 6) Highlights

- **Why**: Allows fine control over bright areas, recovering detail or boosting brightness selectively without affecting midtones or shadows.
- **Math**: Non-linear curve or LUT applied to pixels above a brightness threshold; adjusts luminance with smooth falloff.
- **Skia**: Implemented via LUT or runtime shader applying a non-linear curve; order sensitive.
- **UX**: Default neutral (no change). Range typically from reducing highlights (negative values) to enhancing them (positive values). Useful for preventing highlight clipping or artistic effects.
- **Cross‑app**: Apple Photos Highlights, Photoshop Highlights, Resolve Highlights. No direct CSS equivalent.

### 7) Shadows

- **Why**: Enables selective adjustment of dark areas to recover shadow detail or deepen shadows for contrast.
- **Math**: Non-linear curve or LUT applied to pixels below a brightness threshold; modifies luminance with smooth transition.
- **Skia**: Implemented via LUT or runtime shader applying a non-linear curve; order sensitive.
- **UX**: Default neutral. Range from lightening shadows (positive values) to darkening (negative values). Helps balance image contrast and reveal shadow detail.
- **Cross‑app**: Apple Photos Shadows, Photoshop Shadows, Resolve Shadows. No direct CSS equivalent.

## References

- **CSS Filter Effects (MDN):** [filter](https://developer.mozilla.org/en-US/docs/Web/CSS/filter) — includes `brightness()`, `contrast()`, `saturate()`, `grayscale()`, `sepia()`, `hue-rotate()`, `invert()`
- **Figma**
  - Help Center: [Adjust image settings in Figma](https://help.figma.com/hc/en-us/articles/360041098433-Adjust-the-properties-of-an-image)
  - Plugin Docs: [Figma Plugin API (root)](https://www.figma.com/plugin-docs/)
- **Apple Photos**
  - iPhone User Guide: [Edit photos and videos](https://support.apple.com/guide/iphone/edit-photos-and-videos-iphb08064d57/ios)
  - macOS Photos User Guide: [Adjust light and color](https://support.apple.com/guide/photos/adjust-light-exposure-and-color-pht806aea6a6/mac)
- **Adobe Photoshop (Adjustments)**
  - Overview: [Adjustment basics](https://helpx.adobe.com/photoshop/using/adjustment-fill-layers.html)
  - Hue/Saturation & Vibrance: [Hue/Saturation adjustment](https://helpx.adobe.com/photoshop-elements/using/adjusting-color-saturation-hue-vibrance.html), [Vibrance adjustment](https://helpx.adobe.com/photoshop/using/adjust-vibrance.html)
- **DaVinci Resolve (Color)**
  - Product page: [DaVinci Resolve](https://www.blackmagicdesign.com/products/davinciresolve)
- **Skia Graphics Library**
  - API: [`SkColorFilter`](https://api.skia.org/classSkColorFilter.html), [`SkImageFilter`](https://api.skia.org/classSkImageFilter.html)

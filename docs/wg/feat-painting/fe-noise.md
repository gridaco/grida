# Noise Effects - `fe-noise`

> Procedural fractal Perlin noise effects with SVG filter semantics

| feature id | status      | description                                               | PR                                                |
| ---------- | ----------- | --------------------------------------------------------- | ------------------------------------------------- |
| `fe-noise` | implemented | Fractal noise effects (Mono, Duo, Multi) with blend modes | [#446](https://github.com/gridaco/grida/pull/446) |

---

## Abstract

Noise effects apply procedural fractal Perlin noise patterns to filled shapes, providing three distinct coloring strategies: Mono (single-color), Duo (two-color separated patterns), and Multi (RGB chromatic). The implementation follows SVG filter specifications (`feTurbulence`, `feColorMatrix`, `feComponentTransfer`) for cross-platform compatibility.

---

## Variants

- **Mono**: Single-color noise pattern
- **Duo**: Two-color separated noise patterns with background transparency
- **Multi**: RGB chromatic noise with contrast enhancement

---

## Mathematical Foundation

### Core Parameters

| Parameter  | Symbol | Range        | Description                               |
| ---------- | ------ | ------------ | ----------------------------------------- |
| Noise Size | $s$    | $(0, ∞)$     | Grain size (smaller = finer)              |
| Density    | $d$    | $[0, 1]$     | Pattern coverage (0 = sparse, 1 = dense)  |
| Octaves    | $n$    | $[1, ∞)$     | Fractal detail levels                     |
| Seed       | $σ$    | $\mathbb{R}$ | Random seed for reproducibility           |
| Blend Mode | $m$    | enum         | Compositing mode (Normal, Multiply, etc.) |

### Base Frequency Calculation

Noise size $s$ maps to SVG `baseFrequency`:

$$
f_{base} = \frac{1}{s \times 8} \quad \text{clamped to } [0.005, 2.0]
$$

**Example**: $s = 2.0 \Rightarrow f_{base} = \frac{1}{16} = 0.0625$

### Fractal Perlin Noise Generation

Using Skia's `fractal_perlin_noise`:

$$
P(x, y) = \sum_{i=0}^{n-1} \frac{1}{2^i} \cdot \text{perlin}(2^i \cdot f_{base} \cdot x, 2^i \cdot f_{base} \cdot y, σ)
$$

Where:

- $P(x, y)$ outputs RGB values in $[0, 1]$ range
- Each octave adds detail at double the frequency
- Amplitude halves per octave (standard fractal noise)

---

## Mono Noise

### Algorithm

Single-color pattern created by thresholding noise luminance.

#### Step 1: Luminance to Alpha

Convert RGB noise to alpha channel using standard luminance weights:

$$
A(x, y) = 0.2126 \cdot R + 0.7152 \cdot G + 0.0722 \cdot B
$$

ColorMatrix representation:

$$
\begin{bmatrix}
0 & 0 & 0 & 0 & 0 \\\\
0 & 0 & 0 & 0 & 0 \\\\
0 & 0 & 0 & 0 & 0 \\\\
0.2126 & 0.7152 & 0.0722 & 0 & 0
\end{bmatrix}
$$

#### Step 2: Density Threshold

Apply binary threshold to alpha:

$$
\theta = (1 - d) \times 255
$$

$$
A'(x, y) = \begin{cases}
255 & \text{if } A(x, y) \geq \theta \\\\
0 & \text{otherwise}
\end{cases}
$$

**Golden Values**:

- $d = 0.5 \Rightarrow \theta = 127$ (half coverage)
- $d = 0.8 \Rightarrow \theta = 51$ (dense, 80% coverage)
- $d = 0.2 \Rightarrow \theta = 204$ (sparse, 20% coverage)

#### Step 3: Apply Solid Color

$$
\text{Output}(x, y) = C_{\text{mono}} \times \frac{A'(x, y)}{255}
$$

Where $C_{\text{mono}} = (R, G, B, \alpha)$ is the user-specified color.

### SVG Reference (Mono)

```xml
<svg width="45" height="45" viewBox="0 0 45 45" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#filter0_n_3372_53)">
<rect width="45" height="45" fill="white"/>
</g>
<defs>
<filter id="filter0_n_3372_53" x="0" y="0" width="45" height="45" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feTurbulence type="fractalNoise" baseFrequency="0.357 0.357" stitchTiles="stitch" numOctaves="3" result="noise" seed="8539" />
<feColorMatrix in="noise" type="luminanceToAlpha" result="alphaNoise" />
<feComponentTransfer in="alphaNoise" result="coloredNoise1">
  <feFuncA type="discrete" tableValues="1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 "/>
</feComponentTransfer>
<feComposite operator="in" in2="shape" in="coloredNoise1" result="noise1Clipped" />
<feFlood flood-color="rgba(0, 0, 0, 0.25)" result="color1Flood" />
<feComposite operator="in" in2="noise1Clipped" in="color1Flood" result="color1" />
<feMerge result="effect1_noise_3372_53">
  <feMergeNode in="shape" />
  <feMergeNode in="color1" />
</feMerge>
</filter>
</defs>
</svg>
```

**Analysis**:

- `tableValues`: 51 ones, 49 zeros → density ≈ 0.51
- Pattern visible where alpha ≥ 51% of range

---

## Duo Noise

### Algorithm

Two distinct, non-overlapping patterns with background transparency.

#### Critical Insight

Duo uses **TWO SEPARATED patterns**, NOT complementary binary splits:

- Pattern 1 occupies lower alpha range
- Pattern 2 occupies upper alpha range
- Background shows through at edges and (at low density) middle gap

#### Universal Density Formula

Patterns centered around midpoint $\mu = 127.5$:

$$
\text{Pattern 1 range}: \left[ \frac{(1 - d)}{2} \times 255, 127 \right]
$$

$$
\text{Pattern 2 range}: \left[ 128, 127.5 + \frac{d}{2} \times 255 \right]
$$

#### LUT Generation

For each alpha index $i \in [0, 255]$:

$$
\text{LUT}_1(i) = \begin{cases}
255 & \text{if } \frac{(1-d)}{2} \times 255 \leq i \leq 127 \\\\
0 & \text{otherwise}
\end{cases}
$$

$$
\text{LUT}_2(i) = \begin{cases}
255 & \text{if } 128 \leq i \leq 127.5 + \frac{d}{2} \times 255 \\\\
0 & \text{otherwise}
\end{cases}
$$

#### Golden Values

| Density $d$ | Pattern 1 Range | Pattern 2 Range | Background Coverage |
| ----------- | --------------- | --------------- | ------------------- |
| 0.4         | $[76, 127]$     | $[128, 178]$    | 60%                 |
| 0.5         | $[63, 127]$     | $[128, 191]$    | 50%                 |
| 0.8         | $[25, 127]$     | $[128, 229]$    | 20%                 |
| 1.0         | $[0, 127]$      | $[128, 255]$    | 0% (full)           |

#### Properties

1. **Symmetry**: Patterns grow equally from midpoint
2. **Non-overlapping**: Pattern 1 ends at 127, Pattern 2 starts at 128
3. **Gaps**:
   - Low alpha: $[0, \text{start}_1)$ → background visible
   - High alpha: $(\text{end}_2, 255]$ → background visible
   - Middle (low density): $(127, 128)$ virtual gap (minimal at high density)

### SVG Reference (Duo, Standard Density ~0.5)

```xml
<svg width="45" height="45" viewBox="0 0 45 45" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#filter0_n_3395_61)">
<rect width="45" height="45" fill="white"/>
</g>
<defs>
<filter id="filter0_n_3395_61" x="0" y="0" width="45" height="45" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feTurbulence type="fractalNoise" baseFrequency="0.357 0.357" stitchTiles="stitch" numOctaves="3" result="noise" seed="8539" />
<feColorMatrix in="noise" type="luminanceToAlpha" result="alphaNoise" />
<feComponentTransfer in="alphaNoise" result="coloredNoise1">
  <feFuncA type="discrete" tableValues="1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 "/>
</feComponentTransfer>
<feComposite operator="in" in2="shape" in="coloredNoise1" result="noise1Clipped" />
<feComponentTransfer in="alphaNoise" result="coloredNoise2">
  <feFuncA type="discrete" tableValues="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 "/>
</feComponentTransfer>
<feComposite operator="in" in2="shape" in="coloredNoise2" result="noise2Clipped" />
<feFlood flood-color="rgba(255, 0, 4, 0.25)" result="color1Flood" />
<feComposite operator="in" in2="noise1Clipped" in="color1Flood" result="color1" />
<feFlood flood-color="rgba(255, 255, 255, 0.25)" result="color2Flood" />
<feComposite operator="in" in2="noise2Clipped" in="color2Flood" result="color2" />
<feMerge result="effect1_noise_3395_61">
  <feMergeNode in="shape" />
  <feMergeNode in="color1" />
  <feMergeNode in="color2" />
</feMerge>
</filter>
</defs>
</svg>
```

**Analysis**:

- Pattern 1: 51 ones (indices 0-50) = lower 51%
- Pattern 2: 51 ones (indices 49-99) = upper 51%
- Slight overlap at midpoint (indices 49-50 both have ones)
- Effective density ≈ 0.51 per pattern

### SVG Reference (Duo, Low Density ~0.4)

```xml
<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#filter0_n_3413_115)">
<rect width="100" height="100" fill="black"/>
</g>
<defs>
<filter id="filter0_n_3413_115" x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feTurbulence type="fractalNoise" baseFrequency="0.074 0.074" stitchTiles="stitch" numOctaves="3" result="noise" seed="6125" />
<feColorMatrix in="noise" type="luminanceToAlpha" result="alphaNoise" />
<feComponentTransfer in="alphaNoise" result="coloredNoise1">
  <feFuncA type="discrete" tableValues="0 0 0 0 0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 "/>
</feComponentTransfer>
<feComposite operator="in" in2="shape" in="coloredNoise1" result="noise1Clipped" />
<feComponentTransfer in="alphaNoise" result="coloredNoise2">
  <feFuncA type="discrete" tableValues="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 0 0 0 0 0 "/>
</feComponentTransfer>
<feComposite operator="in" in2="shape" in="coloredNoise2" result="noise2Clipped" />
<feFlood flood-color="#FF0000" result="color1Flood" />
<feComposite operator="in" in2="noise1Clipped" in="color1Flood" result="color1" />
<feFlood flood-color="#FFFFFF" result="color2Flood" />
<feComposite operator="in" in2="noise2Clipped" in="color2Flood" result="color2" />
<feMerge result="effect1_noise_3413_115">
  <feMergeNode in="shape" />
  <feMergeNode in="color1" />
  <feMergeNode in="color2" />
</feMerge>
</filter>
</defs>
</svg>
```

**Analysis** (Low Density Reference):

- Pattern 1: 40 ones (indices 5-44) = 40% coverage
- Pattern 2: 40 ones (indices 55-94) = 40% coverage
- Gap at start: 5 indices (5%)
- Gap in middle: 10 indices (10%)
- Gap at end: 5 indices (5%)
- Total background: 20% → density ≈ 0.40

**Visual Result**:

- Fill: Black
- Color1 (Red): Large blobs in pattern 1 range
- Color2 (White): Large blobs in pattern 2 range
- Black background visible at edges and between patterns

---

## Multi Noise

### Algorithm

RGB chromatic noise with contrast enhancement.

#### Key Difference

Multi noise **does NOT use luminanceToAlpha**:

- Keeps original RGB values from Perlin noise
- Applies contrast enhancement to RGB channels
- Only thresholds alpha channel for density control

#### Step 1: RGB Contrast Enhancement

Linear transfer function applied to each RGB channel:

$$
C'_{\text{RGB}} = 2 \times C_{\text{RGB}} - 0.5
$$

ColorMatrix (normalized 0-1 range):

$$
\begin{bmatrix}
2 & 0 & 0 & 0 & -0.5 \\\\
0 & 2 & 0 & 0 & -0.5 \\\\
0 & 0 & 2 & 0 & -0.5 \\\\
0 & 0 & 0 & 1 & 0
\end{bmatrix}
$$

**Effect**:

- Midpoint (0.5) remains unchanged
- Values < 0.5 darken (shift toward 0)
- Values > 0.5 brighten (shift toward 1)
- Doubles contrast, increases color saturation

#### Step 2: Alpha Threshold

Apply density threshold to alpha only (same as Mono):

$$
\theta = (1 - d) \times 255
$$

$$
A'(x, y) = \begin{cases}
255 & \text{if } A(x, y) \geq \theta \\\\
0 & \text{otherwise}
\end{cases}
$$

RGB channels pass through unchanged.

#### Step 3: Apply Opacity

$$
\text{Output}(x, y) = (R', G', B', A' \times \text{opacity})
$$

### SVG Reference (Multi)

```xml
<svg width="45" height="45" viewBox="0 0 45 45" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#filter0_n_3395_62)">
<rect width="45" height="45" fill="white"/>
</g>
<defs>
<filter id="filter0_n_3395_62" x="0" y="0" width="45" height="45" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feTurbulence type="fractalNoise" baseFrequency="0.357 0.357" stitchTiles="stitch" numOctaves="3" result="noise" seed="8539" />
<feComponentTransfer in="noise" result="coloredNoise1">
  <feFuncR type="linear" slope="2" intercept="-0.5" />
  <feFuncG type="linear" slope="2" intercept="-0.5" />
  <feFuncB type="linear" slope="2" intercept="-0.5" />
  <feFuncA type="discrete" tableValues="1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 "/>
</feComponentTransfer>
<feComposite operator="in" in2="shape" in="coloredNoise1" result="noise1Clipped" />
<feMerge result="effect1_noise_3395_62">
  <feMergeNode in="shape" />
  <feMergeNode in="noise1Clipped" />
</feMerge>
</filter>
</defs>
</svg>
```

**Analysis**:

- RGB: `slope="2" intercept="-0.5"` → contrast enhancement
- Alpha: Same discrete threshold as Mono/Duo (51% density)
- NO luminanceToAlpha step!

**Visual Result**:

- Vibrant rainbow/chroma colors (red, green, blue, purple, yellow)
- Enhanced contrast makes colors more saturated
- 51% coverage with pattern threshold

---

## Blend Modes

All noise variants support blend modes applied at the **paint level**, not as wrapping layers.

### Compositing Semantics

Noise blends with the fill using Skia's blend modes:

$$
\text{Result}(x, y) = \text{blend}(\text{Fill}(x, y), \text{Noise}(x, y), \text{mode})
$$

**Supported modes**:

- Normal (SrcOver)
- Multiply
- Screen
- Overlay
- Darken
- Lighten
- ColorDodge
- ColorBurn
- HardLight
- SoftLight
- Difference
- Exclusion
- Hue
- Saturation
- Color
- Luminosity

### Blend Mode Application

From SVG filter semantics, the blend is applied via `feMerge`:

```xml
<feMerge>
  <feMergeNode in="shape" />      <!-- Fill (destination) -->
  <feMergeNode in="color1" />     <!-- Noise (source) -->
</feMerge>
```

Implementation:

```rust
paint.set_blend_mode(blend_mode);  // Applied to noise paint
canvas.draw_path(&path, &paint);   // Blends with fill below
```

**NOT**:

```rust
// WRONG - don't wrap in save_layer
canvas.save_layer(&SaveLayerRec::default().paint(&layer_paint));
```

The blend mode must be on the paint itself to match SVG `feMerge` semantics, allowing proper interaction with fill opacity.

---

## Implementation Notes

### Critical Implementation Details

#### 1. ColorMatrix Normalization

Skia's `ColorMatrix` uses **normalized 0-1 range**, NOT 0-255!

**WRONG**:

```rust
ColorMatrix::new(
    2.0, 0.0, 0.0, 0.0, -127.5,  // ❌ Zeros out all colors!
    ...
)
```

**CORRECT**:

```rust
ColorMatrix::new(
    2.0, 0.0, 0.0, 0.0, -0.5,  // ✅ Proper contrast enhancement
    ...
)
```

#### 2. Duo Pattern Distribution

**WRONG** (Binary complementary split):

```rust
// Covers 100% of alpha range, no background shows
lut1[i] = if i >= threshold { 255 } else { 0 };
lut2[i] = if i < threshold { 255 } else { 0 };
```

**CORRECT** (Separated patterns):

```rust
// Patterns centered around midpoint with density-based widths
lut_duo_pattern1(density);  // [(1-d)/2 × 255, 127]
lut_duo_pattern2(density);  // [128, 127.5 + d/2 × 255]
```

#### 3. Shader Composition Order

**WRONG** (Double masking):

```rust
let colored_noise = apply_color_to_alpha(noise_alpha, color);
let shader = blend(DstIn, mask, colored_noise);  // Double masking!
```

**CORRECT** (Single compositing):

```rust
let solid_color = shaders::color(color);
let shader = blend(DstIn, solid_color, thresholded_alpha);  // One step
```

### Golden Test Values

#### Mono Test

- Fill: Gray (#808080)
- Color: Black (#000000, α=1.0)
- Density: 0.5
- Expected: 50% coverage with black noise

#### Duo Test (Low Density)

- Fill: Black (#000000)
- Color1: Red (#FF0000)
- Color2: White (#FFFFFF)
- Density: 0.4
- Expected: Red and white patterns with 60% black background visible

#### Multi Test

- Fill: Gray (#808080)
- Opacity: 1.0
- Density: 0.5
- Expected: Vibrant rainbow/chroma colors with 50% coverage

---

## Appendix A: LUT Table Format

SVG discrete transfer functions use 100 evenly-spaced samples over $[0, 1]$:

$$
\text{LUT}[i] = f\left(\frac{i}{99}\right), \quad i \in [0, 99]
$$

Where $f(x)$ is the transfer function.

**Example** (threshold at 51%):

```
tableValues="1 1 1 1 1 ... (51 ones) ... 0 0 0 0 ... (49 zeros)"
```

Maps to:

$$
f(x) = \begin{cases}
1 & \text{if } x < 0.51 \\\\
0 & \text{otherwise}
\end{cases}
$$

In our implementation, we use 256 samples (0-255) for 8-bit precision.

---

## Appendix B: Implementation Pipeline

### Mono Pipeline

```
feTurbulence (generate noise)
  ↓
feColorMatrix type="luminanceToAlpha" (RGB → Alpha)
  ↓
feComponentTransfer (density threshold)
  ↓
feFlood (solid color)
  ↓
feComposite operator="in" (mask color with alpha)
  ↓
feMerge (blend with fill using blend_mode)
```

### Duo Pipeline

```
feTurbulence (generate noise)
  ↓
feColorMatrix type="luminanceToAlpha" (RGB → Alpha)
  ↓
feComponentTransfer (split into pattern1 and pattern2)
  ├─ pattern1: lower alpha range [(1-d)/2×255, 127]
  └─ pattern2: upper alpha range [128, 127.5+d/2×255]
  ↓
feFlood (solid colors for each pattern)
  ↓
feComposite operator="in" (mask each color)
  ↓
feMerge (fill + pattern1 + pattern2)
```

### Multi Pipeline

```
feTurbulence (generate RGB noise)
  ↓
feComponentTransfer (contrast boost + alpha threshold)
  ├─ RGB: slope=2, intercept=-0.5 (contrast enhancement)
  └─ Alpha: discrete threshold (density control)
  ↓
feMerge (blend enhanced RGB noise with fill)
```

---

## References

- **SVG Filter Effects Specification**: https://www.w3.org/TR/SVG11/filters.html

  - `feTurbulence`: Fractal noise generation
  - `feColorMatrix`: Color transformations
  - `feComponentTransfer`: Per-channel transfer functions
  - `feComposite`: Porter-Duff compositing operations
  - `feMerge`: Layer stacking

- **Perlin Noise**: Ken Perlin, "Improving Noise" (2002)

  - Original procedural noise algorithm
  - Fractal Brownian Motion (fBm) for multi-octave detail

- **Skia Graphics Library**: https://skia.org

  - `fractal_perlin_noise`: Native Perlin noise shader
  - `ColorMatrix`: 4×5 color transformation matrix (normalized 0-1 range)
  - Blend modes: Porter-Duff compositing operations

- **Reference Implementations**:
  - SVG filter examples inline in this document
  - All reference SVG exports are included above for validation

---

## Appendix C: Troubleshooting & Common Pitfalls

### Symptom: Mono/Duo shows no color (appears transparent or black)

**Cause**: Double-masking in shader composition

**Wrong approach**:

```rust
let noise_alpha = noise.with_color_filter(luminance_to_alpha_cf());
let colored_noise = apply_color(noise_alpha);  // noise_alpha has no RGB!
let shader = blend(DstIn, mask, colored_noise); // Double masking
```

**Fix**: Create solid color shader separately, composite once

```rust
let thresholded_alpha = noise_alpha.with_color_filter(alpha_cf);
let solid_color = shaders::color(color_sk);
let shader = blend(DstIn, solid_color, thresholded_alpha);
```

### Symptom: Multi noise outputs black instead of colors

**Cause**: ColorMatrix using wrong offset range (0-255 instead of 0-1)

**Wrong**:

```rust
ColorMatrix::new(2.0, 0.0, 0.0, 0.0, -127.5, ...)  // ❌
// Result: 2 * 0.5 - 127.5 = -126.5 → clamped to 0
```

**Fix**: Use normalized range

```rust
ColorMatrix::new(2.0, 0.0, 0.0, 0.0, -0.5, ...)  // ✅
// Result: 2 * 0.5 - 0.5 = 0.5 (correct contrast)
```

### Symptom: Duo patterns overlap, no background visible

**Cause**: Binary complementary split covers 100% of alpha range

**Wrong**:

```rust
lut1[i] = if i >= threshold { 255 } else { 0 };  // Upper half
lut2[i] = if i < threshold { 255 } else { 0 };   // Lower half
// Result: lut1 + lut2 = full coverage, no gaps
```

**Fix**: Use separated pattern ranges

```rust
lut_duo_pattern1(density);  // [(1-d)/2 × 255, 127]
lut_duo_pattern2(density);  // [128, 127.5 + d/2 × 255]
// Result: Gaps at edges and middle (at low density)
```

### Symptom: Noise doesn't respect fill opacity

**Cause**: Blend mode applied as wrapping layer instead of paint-level

**Wrong**:

```rust
canvas.save_layer(&SaveLayerRec::default().paint(&layer_paint));
// ... draw noise ...
canvas.restore();
```

**Fix**: Apply blend mode on paint directly

```rust
paint.set_blend_mode(blend_mode);
canvas.draw_path(&path, &paint);
```

---

## See Also

- [Image Filters](../feat-image-filters/index.md) - Color adjustments and filters
- [Masks](../feat-masks/index.md) - Layer masking operations
- [Vector Network](../feat-vector-network/index.md) - Vector path rendering

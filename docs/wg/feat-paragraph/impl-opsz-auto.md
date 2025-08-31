# Paragraph - `opsz: auto`

| feature id  | status        | description                                       |
| ----------- | ------------- | ------------------------------------------------- |
| `opsz-auto` | not supported | support optical size auto like major browser does |

---

## What is optical size (`opsz`)?

**Optical size** is a type design concept: at small sizes, glyphs need more weight/contrast and looser spacing to remain legible; at large sizes, they can be finer and tighter. In modern OpenType variable fonts this is encoded as the **`opsz` variation axis**. When `opsz` changes, the _design of the outline itself_ changes (different curves/ink traps/joins), not just the scale.

Key points:

- `opsz` exists only if the font provides it (in `fvar`/`STAT`). Otherwise there is no true optical sizing.
- Each axis has **min / default / max**. If we don't set `opsz`, renderers use the **default** master (often tuned for “text” size).
- Browsers expose **automatic** optical sizing via `font-optical-sizing: auto`, which ties `opsz` ≈ current `font-size`. Authors can disable it with `font-optical-sizing: none` or override with `font-variation-settings: "opsz" <value>`.

## Target UX (Grida Paragraph)

We aim to match browser expectations:

- **Auto (default)**: If the chosen font supports `opsz`, keep `opsz` synchronized with the paragraph’s computed `font_size` (in logical px). Changing font size live updates `opsz`.
- **Manual**: Authors can set a concrete `opsz` value (disables Auto for that run).
- **None / No-op**: If the font has no `opsz`, Auto does nothing (no visual change). Optional fallback heuristics can improve small sizes (see “Contrast fallback”).

### Proposed API additions

Rust model (author intent):

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum OpticalSizing {
    Auto,           // link opsz to font_size (if axis exists)
    None,           // disable automatic mapping (do not set opsz)
    Manual(f32),    // explicit opsz value; disables Auto
}
```

Add to `TextStyleRec`:

```rust
pub struct TextStyleRec {
    // ...
    pub optical_sizing: OpticalSizing, // default: Auto
    // ...
}
```

### Resolved state (engine side)

```rust
pub struct OpticalSizingResolved {
    pub has_opsz_axis: bool,
    pub opsz_value: Option<f32>, // None => we did not set opsz (either no axis or None mode)
    pub source: OpticalSizingSource, // Auto | Manual | None | FallbackContrast
}

pub enum OpticalSizingSource { Auto, Manual, None, FallbackContrast }
```

## Engine design & mapping

1. **Axis discovery**  
   When a font family/style is chosen, query capabilities:

   - `opsz_min`, `opsz_def`, `opsz_max` from `fvar` (if present).
   - `avar` mapping (normalize → design space). Keep a helper to convert user value → normalized coordinate.

2. **Value selection**

   - `Auto` → `target = font_size` (logical px). Then **clamp** to `[min, max]`. Apply `avar` if necessary when creating the typeface.
   - `Manual(v)` → `target = clamp(v, min, max)`.
   - `None` or **no axis** → don’t set `opsz` (renderer uses font default).

3. **Skia integration**

   - At typeface creation (or via `SkFontArguments::VariationPosition`), include `"opsz" = target`.
   - Skia/FreeType/HarfBuzz honor `avar`/normalization internally when variations are passed; otherwise normalize before passing.
   - Important: **optical size is a property of the typeface/font**, not of the canvas transform. If the canvas is scaled (zoom), keep `opsz` tied to the style’s `font_size`, not the device-space size.

4. **Caching strategy**

   - Cache typefaces per `(family, weight, width, slant, opsz_bucket, other_axes…)`.
   - Bucketize `opsz` to avoid cache explosion, e.g. **nearest integer px** for sizes ≤ 48, **step=2px** for 49–96, **step=4px** above.
   - Invalidate cache on font-size changes that cross a bucket threshold.

5. **Consistency with italic & variation axes**

   - If author explicitly sets `"opsz"` via `font_variations`, treat that as **Manual** and ensure a single source of truth:
     - Strip any user-provided `"opsz"` from `font_variations` when `optical_sizing` is `Auto`.
     - When `Manual`, enforce that `"opsz"` in `font_variations` equals the resolved value.

6. **Round‑trip with CSS**
   - `Auto` → `font-optical-sizing: auto;` (and **do NOT** emit `"opsz"` in `font-variation-settings`).
   - `None` → `font-optical-sizing: none;`
   - `Manual(v)` → `font-optical-sizing: none; font-variation-settings: "opsz" <v>;`

## Runtime algorithm (per style run)

```rust
fn resolve_opsz(style: &TextStyleRec, caps: &FontCapabilities) -> OpticalSizingResolved {
    if !caps.has_opsz_axis {
        return OpticalSizingResolved { has_opsz_axis: false, opsz_value: None, source: OpticalSizingSource::None };
    }
    let (min, def, max) = caps.opsz_range; // from fvar
    match style.optical_sizing {
        OpticalSizing::Auto => {
            let mut v = style.font_size;        // logical px
            v = v.clamp(min, max);
            OpticalSizingResolved { has_opsz_axis: true, opsz_value: Some(v), source: OpticalSizingSource::Auto }
        }
        OpticalSizing::Manual(v0) => {
            let v = v0.clamp(min, max);
            OpticalSizingResolved { has_opsz_axis: true, opsz_value: Some(v), source: OpticalSizingSource::Manual }
        }
        OpticalSizing::None => {
            OpticalSizingResolved { has_opsz_axis: true, opsz_value: None, source: OpticalSizingSource::None }
        }
    }
}
```

When building the `SkTypeface`, inject the resolved value:

```rust
if let Some(v) = resolved.opsz_value {
    variations.push(FontVariation { tag: "opsz".into(), value: v });
}
// pass variations to Skia font arguments
```

## Fallback when `opsz` is missing (optional)

If the font lacks `opsz`, we can _optionally_ offer a display-dependent fallback to aid legibility at very small sizes:

- **Contrast tweak**: Slightly increase AA coverage at small sizes (Skia “contrast hack”) to compensate for washed-out stems.
- **Micro-embolden**: Add a tiny uniform embolden to outlines below a threshold (e.g., < 12px), kept well below the lightest true bold weight.

These are opt-in renderer policies, not part of the `opsz` axis. They should be disabled for “art” text or when precise typography is required.

## Edge cases & notes

- **Zoom vs size**: Canvas/device zoom must not affect `opsz`. Only the style’s `font_size` should.
- **Animation**: Animating font size smoothly animates `opsz`. Use caching buckets to avoid thrashing.
- **Interaction with hinting**: Manual/auto `opsz` comes _before_ hinting; hinting may still modify rasterization.
- **Script direction**: RTL/LTR does not affect `opsz`; treat independently.
- **Testing on static optical masters**: For families shipping _Text_/_Display_ without a variable axis, consider STAT-based face selection heuristics in the future.

## Test plan

1. **Axis presence**

   - Font with `opsz` axis: Auto clamps to min/max; Manual respected; None uses default.
   - Font without `opsz`: Auto/Manual do nothing (no set value); rendering equals default.

2. **Round‑trip CSS**

   - Auto ↔ `font-optical-sizing:auto`
   - None ↔ `font-optical-sizing:none`
   - Manual(12) ↔ `font-optical-sizing:none; font-variation-settings:"opsz" 12;`

3. **Rendering diffs**

   - Snapshot tests across sizes (8–72px) confirming outline design changes when `opsz` exists.
   - Verify no change when `opsz` absent (unless optional contrast fallback enabled).

4. **Performance**
   - Typeface cache hit rate with bucketization on animated size.
   - Ensure no jank when typing (per-run opsz calculation is O(1)).

---

## See Also

- Skia does not support variable axes (including `opsz`) with `opsz: auto` or dynamic font size. [Skia Discuss - `opsz: auto`](https://groups.google.com/g/skia-discuss/c/eFFDObvJyQ8/m/Q4Yq8sJKAwAJ)
- [Microsoft OpenType Specification - Design Variation Axis Tag Registry - `opsz`](https://learn.microsoft.com/en-us/typography/opentype/spec/dvaraxistag_opsz)
- [font-variation-settings - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variation-settings)
- [font-optical-sizing - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-optical-sizing)
- [font-size - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-size)

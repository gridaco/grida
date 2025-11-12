---
title: Optical Size Automation (opsz-auto)
---

# Paragraph - `opsz: auto`

| feature id  | status    | description                                       | PRs                                               |
| ----------- | --------- | ------------------------------------------------- | ------------------------------------------------- |
| `opsz-auto` | supported | support optical size auto like major browser does | [#415](https://github.com/gridaco/grida/pull/415) |

---

## What is optical size (`opsz`)?

**Optical size** is a type design concept: at small sizes, glyphs need more weight/contrast and looser spacing to remain legible; at large sizes, they can be finer and tighter. In modern OpenType variable fonts this is encoded as the **`opsz` variation axis**. When `opsz` changes, the _design of the outline itself_ changes (different curves/ink traps/joins), not just the scale.

Key points:

- `opsz` is available only if the font provides the axis.
- It controls the design of glyphs for legibility at different sizes.
- Browsers support automatic optical sizing via `font-optical-sizing: auto`.
- Authors can disable or override optical sizing manually.

---

## How we implement

- If font has `opsz` axis and mode is Auto → set `opsz` = `font_size`, clamped to min/max.
- If Fixed(v) → set `opsz` = v clamped to min/max.
- If None or no axis → don’t set `opsz` (use default).

Rust model (author intent):

```rust
pub enum OpticalSizing {
    Auto,           // link opsz to font_size (if axis exists)
    None,           // uses the default `opsz` value if one.
    Fixed(f32),     // explicit opsz value; disables Auto
}
```

---

## Notes

- `opsz` only works if the font provides it.
- Designers usually align `opsz` values with point sizes, but clamp to [min, max] to be safe.
- Auto links to logical `font_size`, not device zoom.
- No faux optical sizing is applied if no `opsz` axis (optional contrast hacks possible).

---

## See Also

- Skia does not support variable axes (including `opsz`) with `opsz: auto` or dynamic font size. [Skia Discuss - `opsz: auto`](https://groups.google.com/g/skia-discuss/c/eFFDObvJyQ8/m/Q4Yq8sJKAwAJ)
- [Microsoft OpenType Specification - Design Variation Axis Tag Registry - `opsz`](https://learn.microsoft.com/en-us/typography/opentype/spec/dvaraxistag_opsz)
- [font-variation-settings - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variation-settings)
- [font-optical-sizing - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-optical-sizing)
- [font-size - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-size)
- [Google Fonts - Optical Size Axis](https://fonts.google.com/knowledge/glossary/optical_size_axis)

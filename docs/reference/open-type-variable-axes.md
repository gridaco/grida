# Open Type Variable Axes Reference

## Overview

Open Type variable fonts use axes to control different aspects of the font's appearance. These axes allow for smooth interpolation between different styles, enabling responsive typography and dynamic font adjustments.

## References

- [Microsoft OpenType Specification - Design Variation Axis Tag Registry](https://learn.microsoft.com/en-us/typography/opentype/spec/dvaraxisreg)
- [W3C CSS Fonts Module Level 4 - font-variation-settings](https://www.w3.org/TR/css-fonts-4/#font-variation-settings-def)

## Standard Axes

These axes are widely supported and standardized across browsers and font implementations.

| Axis Tag | Name         | Description                                    | Typical Range | Usage                                            | Category | Google Fonts                                                                  | Examples                                                                                                                                                       |
| -------- | ------------ | ---------------------------------------------- | ------------- | ------------------------------------------------ | -------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wght`   | Weight       | Controls the thickness of characters           | 1-999         | `font-weight`, `font-variation-settings`         | Standard | -                                                                             | [Inter](https://fonts.google.com/specimen/Inter), [Roboto](https://fonts.google.com/specimen/Roboto), [Open Sans](https://fonts.google.com/specimen/Open+Sans) |
| `wdth`   | Width        | Controls the horizontal scaling of characters  | 75-125        | `font-stretch`, `font-variation-settings`        | Standard | -                                                                             | [Inter](https://fonts.google.com/specimen/Inter), [Roboto](https://fonts.google.com/specimen/Roboto)                                                           |
| `slnt`   | Slant        | Controls the angle of characters (oblique)     | -15 to 0      | `font-style: oblique`, `font-variation-settings` | Standard | -                                                                             | [Inter](https://fonts.google.com/specimen/Inter)                                                                                                               |
| `ital`   | Italic       | Controls italic style interpolation            | 0-1           | `font-style: italic`, `font-variation-settings`  | Standard | -                                                                             | [Inter](https://fonts.google.com/specimen/Inter), [Roboto](https://fonts.google.com/specimen/Roboto)                                                           |
| `opsz`   | Optical Size | Optimizes character shapes for different sizes | 8-144         | `font-optical-sizing`, `font-variation-settings` | Standard | [Optical Size](https://fonts.google.com/knowledge/glossary/optical_size_axis) | [Inter](https://fonts.google.com/specimen/Inter), [Source Serif](https://fonts.google.com/specimen/Source+Serif)                                               |

## Known (Custom) Axes

These axes are experimental, font-specific, or custom implementations with varying browser support.

### Typography & Style

| Axis Tag | Name                        | Description                                     | Typical Range | Usage                     | Category                 | Google Fonts                                                                         | Examples                                                 |
| -------- | --------------------------- | ----------------------------------------------- | ------------- | ------------------------- | ------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `GRAD`   | Grade                       | Adjusts stroke weight without affecting spacing | -200 to 200   | `font-variation-settings` | Typography & Style       | [Grade](https://fonts.google.com/knowledge/glossary/grade_axis)                      | [Inter](https://fonts.google.com/specimen/Inter)         |
| `CASL`   | Casual                      | Controls formality from formal to casual        | 0-1           | `font-variation-settings` | Typography & Style       | [Casual](https://fonts.google.com/knowledge/glossary/casual_axis)                    | [Recursive](https://fonts.google.com/specimen/Recursive) |
| `CRSV`   | Cursive                     | Controls cursive characteristics                | 0-1           | `font-variation-settings` | Typography & Style       | [Cursive](https://fonts.google.com/knowledge/glossary/cursive_axis)                  | [Recursive](https://fonts.google.com/specimen/Recursive) |
| `MONO`   | Monospace                   | Controls monospace characteristics              | 0-1           | `font-variation-settings` | Typography & Style       | [Monospace](https://fonts.google.com/knowledge/glossary/monospace_axis)              | [Recursive](https://fonts.google.com/specimen/Recursive) |
| `ROND`   | Roundness                   | Controls corner roundness                       | 0-1           | `font-variation-settings` | Typography & Style       | [Roundness](https://fonts.google.com/knowledge/glossary/rond_axis)                   | [Recursive](https://fonts.google.com/specimen/Recursive) |
| `SOFT`   | Softness                    | Controls stroke softness                        | 0-1           | `font-variation-settings` | Typography & Style       | [Softness](https://fonts.google.com/knowledge/glossary/softness_axis)                | [Recursive](https://fonts.google.com/specimen/Recursive) |
| `WONK`   | Wonky                       | Controls irregular/quirky characteristics       | 0-1           | `font-variation-settings` | Typography & Style       | [Wonky](https://fonts.google.com/knowledge/glossary/wonky_axis)                      | [Recursive](https://fonts.google.com/specimen/Recursive) |
| `BLED`   | Bleed                       | Controls ink bleed effect                       | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Bleed](https://fonts.google.com/knowledge/glossary/bled_axis)                       |                                                          |
| `BNCE`   | Bounce                      | Controls bounce/spring effect                   | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Bounce](https://fonts.google.com/knowledge/glossary/bnce_axis)                      |                                                          |
| `EHLT`   | Edge Highlight              | Controls edge highlighting                      | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Edge Highlight](https://fonts.google.com/knowledge/glossary/ehlt_axis)              |                                                          |
| `ELGR`   | Element Grid                | Controls element grid characteristics           | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Element Grid](https://fonts.google.com/knowledge/glossary/elgr_axis)                |                                                          |
| `ELSH`   | Element Shape               | Controls element shape characteristics          | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Element Shape](https://fonts.google.com/knowledge/glossary/elsh_axis)               |                                                          |
| `EDPT`   | Extrusion Depth             | Controls extrusion depth characteristics        | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Extrusion Depth](https://fonts.google.com/knowledge/glossary/edpt_axis)             |                                                          |
| `FILL`   | Fill                        | Controls fill characteristics                   | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Fill](https://fonts.google.com/knowledge/glossary/fill_axis)                        |                                                          |
| `FLAR`   | Flare                       | Controls flare characteristics                  | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Flare](https://fonts.google.com/knowledge/glossary/flar_axis)                       |                                                          |
| `HEXP`   | Hyper Expansion             | Controls hyper expansion characteristics        | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Hyper Expansion](https://fonts.google.com/knowledge/glossary/hexp_axis)             |                                                          |
| `MORF`   | Morph                       | Controls morphing characteristics               | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Morph](https://fonts.google.com/knowledge/glossary/morf_axis)                       |                                                          |
| `YTAS`   | Parametric Ascender Height  | Controls ascender height                        | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Parametric Ascender Height](https://fonts.google.com/knowledge/glossary/ytas_axis)  |                                                          |
| `XTRA`   | Parametric Counter Width    | Controls counter width in characters            | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Parametric Counter Width](https://fonts.google.com/knowledge/glossary/xtra_axis)    |                                                          |
| `YTDE`   | Parametric Descender Depth  | Controls descender depth                        | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Parametric Descender Depth](https://fonts.google.com/knowledge/glossary/ytde_axis)  |                                                          |
| `YTFI`   | Parametric Figure Height    | Controls figure height                          | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Parametric Figure Height](https://fonts.google.com/knowledge/glossary/ytfi_axis)    |                                                          |
| `YTLC`   | Parametric Lowercase Height | Controls lowercase height                       | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Parametric Lowercase Height](https://fonts.google.com/knowledge/glossary/ytlc_axis) |                                                          |
| `YTUC`   | Parametric Uppercase Height | Controls uppercase height                       | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Parametric Uppercase Height](https://fonts.google.com/knowledge/glossary/ytuc_axis) |                                                          |
| `YELA`   | Vertical Element Alignment  | Controls vertical element alignment             | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Vertical Element Alignment](https://fonts.google.com/knowledge/glossary/yela_axis)  |                                                          |
| `VOLM`   | Volume                      | Controls volume/weight                          | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Volume](https://fonts.google.com/knowledge/glossary/volm_axis)                      |                                                          |
| `YEAR`   | Year                        | Controls year-based variations                  | 0-1           | `font-variation-settings` | Optical & Visual Effects | [Year](https://fonts.google.com/knowledge/glossary/year_axis)                        |                                                          |
| `ARRO`   | AR Retinal Resolution       | Controls AR retinal resolution                  | 0-1           | `font-variation-settings` | Specialized Effects      | [AR Retinal Resolution](https://fonts.google.com/knowledge/glossary/arrr_axis)       |                                                          |
| `INFM`   | Informality                 | Controls informality characteristics            | 0-1           | `font-variation-settings` | Specialized Effects      | [Informality](https://fonts.google.com/knowledge/glossary/infm_axis)                 |                                                          |
| `SCAN`   | Scanlines                   | Controls scanline effect                        | 0-1           | `font-variation-settings` | Specialized Effects      | [Scanlines](https://fonts.google.com/knowledge/glossary/scan_axis)                   |                                                          |
| `SHRP`   | Sharpness                   | Controls sharpness characteristics              | 0-1           | `font-variation-settings` | Specialized Effects      | [Sharpness](https://fonts.google.com/knowledge/glossary/shrp_axis)                   |                                                          |

## Usage Examples

### CSS

```css
/* Standard axes */
.font-weight {
  font-weight: 700;
}
.font-stretch {
  font-stretch: condensed;
}
.font-style {
  font-style: italic;
}
.font-optical-sizing {
  font-optical-sizing: auto;
}

/* Custom axes */
.custom-axis {
  font-variation-settings:
    "GRAD" 150,
    "CASL" 0.5;
}
```

### JavaScript

```javascript
// Set variation settings
element.style.fontVariationSettings = "'wght' 700, 'wdth' 125";

// Get computed variation settings
const settings = getComputedStyle(element).fontVariationSettings;
```

## Browser Support

- **Standard axes** (`wght`, `wdth`, `slnt`, `ital`, `opsz`): Excellent support across all modern browsers
- **Custom axes**: Varies by browser and font implementation
- **CSS properties**: `font-weight`, `font-stretch`, `font-style`, `font-optical-sizing` have good support
- **font-variation-settings**: Supported in all modern browsers for custom axes

## Notes

- Standard axes can be controlled via dedicated CSS properties or `font-variation-settings`
- Custom axes require the `font-variation-settings` property
- Axis values are typically normalized between 0-1 or have specific ranges
- Custom axes provide creative typography possibilities but may have limited browser support

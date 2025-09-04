# Paragraph - `italic`

| feature id | status | description                                               | PRs                                               |
| ---------- | ------ | --------------------------------------------------------- | ------------------------------------------------- |
| `italic`   | draft  | implementation details for italic/oblique and faux italic | [#415](https://github.com/gridaco/grida/pull/415) |

## Implementation Challenges

Key challenges in implementing italic styles:

- **Real vs Faux Italic**: Distinguishing between true italics (dedicated glyph sets) and synthetic slanting affects readability and quality
- **Font Fallback**: Ensuring proper italic variants across multilingual and mixed-script contexts
- **Mixed Scripts**: Handling Latin + CJK combinations requires careful fallback strategies for visual consistency
- **Font Variants**: Some fonts provide only oblique variants, complicating style selection decisions

## When Fake Italic Can Be Beneficial

As a professional-grade design tool, Grida's default philosophy is to be explicit for everything and not assume anything. However, there are specific scenarios where fake italic can actually be useful:

### Legitimate Use Cases

- **Emoji Italicization**: Users might want to italicize emoji for design consistency, but since emoji fonts almost never have italic variants, fake italic provides the only way to achieve this visual effect
- **Mixed Script Fallback**: When using mixed scripts (languages) where the fallback font for a specific script doesn't have italic variants, but the user has explicitly chosen a main paragraph font with italic - in this scenario, applying fake italic to the fallback text could maintain visual consistency (though Grida won't implement this approach)
- **Variable Font Limitations**: Some variable fonts may have limited italic axis support, where fake italic could provide additional styling options
- **Legacy Font Support**: When working with older fonts that lack proper italic variants but users need italic styling for design consistency

### Design Tool Considerations

- **User Intent vs. Technical Reality**: Professional designers often need visual consistency even when technical limitations exist
- **Explicit Control**: Fake italic should only be applied when explicitly requested by the user, not as an automatic fallback
- **Visual Feedback**: Users should be clearly informed when fake italic is being applied vs. real italic fonts

## Supported CSS Properties (or equivalent)

| property                  | ready   | implementation        | description                            | notes |
| ------------------------- | ------- | --------------------- | -------------------------------------- | ----- |
| `font-family`             | yes     | fully compatible, 1:1 | used as-is                             |       |
| `font-style`              | planned | depends on config     | only when synthesis explicitly enabled |       |
| `font-synthesis`          | planned | by engine level flag  |                                        |       |
| `font-variation-settings` | yes     | fully compatible, 1:1 | used as-is                             |       |

## Are you Really Italic?

When dealing with italic styles in font families, there are four common scenarios to consider, each with different implications for how italic styles are handled and synthesized:

### Scenarios in Font Families

| scenario                  | description                                                                      | non-italic examples                                                                                                                                                                                      | italic examples                                                                                                                                                                                                        | notes                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. One static font**    | Single static font file without variable axes. Italic may or may not be present. | `Allerta-Regular.ttf` ([Google Fonts](https://fonts.google.com/specimen/Allerta))                                                                                                                        | `Molle-Italic.ttf` ([Google Fonts](https://fonts.google.com/specimen/Molle))                                                                                                                                           | Only 1 font (Molle) with italic-only scenario out of 1,885 fonts (2025 Google Fonts registry)                                                 |
| **2. Many static fonts**  | Multiple static font files, some designated as italic/oblique variants.          | `PTSerif-Regular.ttf`, `PTSerif-Bold.ttf` ([Google Fonts](https://fonts.google.com/specimen/PT+Serif))                                                                                                   | `PTSerif-Italic.ttf`, `PTSerif-BoldItalic.ttf` ([Google Fonts](https://fonts.google.com/specimen/PT+Serif))                                                                                                            | Most common scenario for traditional font families                                                                                            |
| **3. One variable font**  | Single variable font with `ital` or `slnt` axes for smooth italic interpolation. | `Geist-VariableFont_wght.ttf` ([Google Fonts](https://fonts.google.com/specimen/Geist))                                                                                                                  | None found                                                                                                                                                                                                             | No examples found in 2025 Google Fonts registry                                                                                               |
| **4. Two variable fonts** | Separate Roman VF + Italic VF, switching between them based on style.            | `Inter-VariableFont_opsz,wght.ttf` ([Google Fonts](https://fonts.google.com/specimen/Inter))<br>`NotoSans-VariableFont_wdth,wght.ttf` ([Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans)) | `Inter-Italic-VariableFont_opsz,wght.ttf` ([Google Fonts](https://fonts.google.com/specimen/Inter))<br>`NotoSans-Italic-VariableFont_wdth,wght.ttf` ([Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans)) | ~160 variable fonts with exactly 2 variants (2025 Google Fonts registry). When 2 VF variants exist, they are explicitly ["regular", "italic"] |

These scenarios form the foundation for how italic styles are parsed and applied within the system, guiding decisions on when to use real italic fonts, variable font axes, or synthetic italicization. The examples above serve as test cases for development and validation.

## See also

- [Italic (and Oblique Model Design)](../../reference/italic.md)

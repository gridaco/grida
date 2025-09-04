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

**See [Italic Fonts](../../reference/italic-fonts.md)** for comprehensive examples with real-world test cases from the Google Fonts registry.

1. **One family, one static (non-variable) font**  
   In this simplest case, the font family consists of a single static font file without any variable axes. This includes both non-italic fonts (like Allerta) and rare italic-only fonts (like Molle). If the font does not include an italic variant, fake italic might be considered if explicitly requested.

2. **One family, many static fonts (some may be italic)**  
   Here, the font family includes multiple static font files, some of which are designated as italic or oblique variants (like PT Serif with Regular, Bold, Italic, and BoldItalic). The system can select the appropriate font file based on the requested style, reducing the need for synthetic italicization.

3. **One family, one variable font (theoretical ital axis or slnt axis)**  
   This scenario involves a single variable font file that could theoretically support axes such as 'ital' (italic) or 'slnt' (slant) for smooth interpolation between upright and italic styles. However, no examples of this scenario were found in the 2025 Google Fonts registry.

   - 3-1. **One family, one variable font with italic instances (exceptional case)**  
      This is an exceptional scenario where a single variable font supports the `slnt` axis and has explicit italic instances defined in `fvar.instances` (like Recursive and Roboto Flex). These fonts are not flagged as "italic" by OS/2 flags, but they support `slnt` axis with explicit italic instances. Detection relies on PostScript names in `fvar.instances` rather than reliable table sources, making this a unique case that requires special handling in font parsing logic.

4. **One family, two variable fonts (Roman VF + Italic VF)**  
   Some font families provide two separate variable fonts: one for the Roman (upright) style and another for the Italic style (like Inter and Noto Sans). This setup allows switching between these variable fonts depending on the style requested, combining the benefits of variable fonts with distinct design differences between Roman and Italic.

### OS/2 Flag Combinations (Designer Intent Ambiguity)

The OS/2 `fsSelection` field provides separate bits for ITALIC (bit 0) and OBLIQUE (bit 9), creating potential ambiguity in interpretation depending on designer intent and font vendor practices:

| ITALIC | OBLIQUE | Common Interpretation               | Notes                                                           |
| ------ | ------- | ----------------------------------- | --------------------------------------------------------------- |
| 0      | 0       | Upright roman                       | Standard upright font                                           |
| 1      | 0       | True italic face                    | Dedicated italic design with custom letterforms                 |
| 0      | 1       | Oblique face                        | Mechanical slant of roman design                                |
| 1      | 1       | Italic (treating oblique as italic) | Many fonts set both flags, treating oblique as a kind of italic |

### Grida Policy on OS/2 Flags

Historically, many fonts used the OBLIQUE bit to indicate a mechanically slanted style rather than a true italic. However, this flag does not encode an actual slant angle, nor does it guarantee a distinct design — often it is mathematically equivalent to applying a shear transform to the roman.

For this reason, our system will **only use the ITALIC bit (bit 0)** as a signal for true italic capability. The OBLIQUE bit (bit 9) is not considered part of the default UX or style resolution pipeline. In future or advanced configurations, OBLIQUE may be surfaced as an optional toggle for power users, but it is not part of our intended default workflow.

This design choice follows our discussion: oblique faces are genuine style files, but usually just pre-slanted romans. Since oblique is already well-represented in variable fonts via the `slnt` axis, we treat OBLIQUE as legacy metadata rather than a primary signal.

---

These scenarios form the foundation for how italic styles are parsed and applied within the system, guiding decisions on when to use real italic fonts, variable font axes, or synthetic italicization. The examples above serve as test cases for development and validation.

## Oblique (Fake Italic)

This section proposes how Grida will support **fake italic** (synthetic oblique), but only when explicitly requested.

### Concept

Fake italic is always oblique-based: it is a shear transform applied to the upright roman face. There are three possible sources for oblique style:

1. **Static oblique face** — A separate file flagged OBLIQUE in OS/2, representing a mechanically slanted variant.
2. **Variable font `slnt` axis** — A registered axis that parameterizes slant angle in degrees.
3. **Synthetic oblique** — A runtime shear transform when no real oblique face or axis exists.

### Resolution Pipeline

When _oblique_ is requested:

1. **Static oblique face**: If available, use it directly.
2. **`slnt` axis**: If present, use the requested angle if given, or a default value (e.g. −12°). Clamp to the font’s supported range.
3. **Synthetic oblique**: Apply a shear transform to the roman face.

**Angle behavior**:

- If a user requests a specific angle and `slnt` exists → honor that value.
- If only a static oblique exists → do not double-slant; either accept the static oblique as-is or fall back to synthetic from roman to honor the angle.
- If synthetic is used → apply the requested angle; otherwise default to −12°.

### Policy Control

Introduce an explicit control knob for synthesis behavior:

- `font-synthesis-oblique: auto | none | synthetic-only | prefer-axis`

Definitions:

- **auto (default)**: static oblique → `slnt` → synthetic.
- **none**: only static oblique or `slnt` accepted; otherwise remain upright.
- **synthetic-only**: always use shear, ignoring static oblique or `slnt`.
- **prefer-axis**: if `slnt` exists, prefer it over static oblique.

### Notes

- Never apply a shear on top of a static oblique (no double slant).
- This design mirrors CSS behavior (`font-style: italic` → oblique fallback, `font-synthesis: style`) but makes oblique synthesis explicit.
- In UI, italic requests may still be labeled “Italic,” but internally they may be satisfied by oblique, `slnt`, or synthetic depending on availability.

---

## See also

- [Italic (and Oblique Model Design)](../../reference/italic.md)

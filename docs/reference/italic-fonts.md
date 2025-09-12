# Italic Fonts

This document provides a comprehensive reference table of real-world font examples organized by italic detection scenarios. Each scenario represents a different way that font families can implement italic styles, from traditional static fonts to modern variable fonts with complex axis configurations.

The table serves as a practical testing and validation resource for developers implementing italic detection logic, offering concrete examples from the Google Fonts registry (2025) with direct links to font specimens. Understanding these scenarios is crucial for building robust font parsing systems that can handle the full spectrum of italic implementations found in production fonts.

| scenario                                     | description                                                                              | non-italic examples                                                                                                                                                                                                                                                                    | italic examples                                                                                                                                                                                                         | method         | notes                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. One static font**                       | Single static font file without variable axes. Italic may or may not be present.         | `Allerta-Regular.ttf` ([Google Fonts](https://fonts.google.com/specimen/Allerta))                                                                                                                                                                                                      | `Molle-Italic.ttf` ([Google Fonts](https://fonts.google.com/specimen/Molle))                                                                                                                                            | OS/2           | Only 1 font (Molle) with italic-only scenario out of 1,885 fonts (2025 Google Fonts registry)                                                                                                                                                                                                                                                          |
| **2. Many static fonts**                     | Multiple static font files, some designated as italic/oblique variants.                  | `PTSerif-Regular.ttf`, `PTSerif-Bold.ttf` ([Google Fonts](https://fonts.google.com/specimen/PT+Serif))                                                                                                                                                                                 | `PTSerif-Italic.ttf`, `PTSerif-BoldItalic.ttf` ([Google Fonts](https://fonts.google.com/specimen/PT+Serif))                                                                                                             | OS/2           | Most common scenario for traditional font families                                                                                                                                                                                                                                                                                                     |
| **3. One variable font**                     | Single variable font with `ital` or `slnt` axes for smooth italic interpolation.         | `Geist-VariableFont_wght.ttf` ([Google Fonts](https://fonts.google.com/specimen/Geist))                                                                                                                                                                                                | `EB Garamond` (legacy) ([Google Fonts Knowledge](https://fonts.google.com/knowledge/glossary/italic_axis))                                                                                                              | `ital` axis    | Google Fonts claims "EB Garamond" as VF font with [supports `ital` (0)](https://gist.github.com/softmarshmallow/5e89a878092af47c750a0a297a814b29) axis support, but Google Fonts has dropped the `ital` axis and none are found in current registry. This may still exist on non-Google Fonts; we will support and treat `ital` axis when encountered. |
| **3-1. Variable font with italic instances** | Single variable font with `slnt` axis and explicit italic instances in `fvar.instances`. | `Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf` ([Google Fonts](https://fonts.google.com/specimen/Recursive))<br/>`RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf` ([Google Fonts](https://fonts.google.com/specimen/Roboto+Flex)) | Same files with italic instances via `slnt` axis and `fvar.instances`                                                                                                                                                   | fvar.instances | Exceptional case: Not "italic" by OS/2 flags, but [supports `slnt` (~15)](https://gist.github.com/softmarshmallow/5e89a878092af47c750a0a297a814b29) axis with explicit italic instances. Detection relies on PostScript names in `fvar.instances` rather than reliable table sources.                                                                  |
| **4. Two variable fonts**                    | Separate Roman VF + Italic VF, switching between them based on style.                    | `Inter-VariableFont_opsz,wght.ttf` ([Google Fonts](https://fonts.google.com/specimen/Inter))<br/>`NotoSans-VariableFont_wdth,wght.ttf` ([Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans))                                                                              | `Inter-Italic-VariableFont_opsz,wght.ttf` ([Google Fonts](https://fonts.google.com/specimen/Inter))<br/>`NotoSans-Italic-VariableFont_wdth,wght.ttf` ([Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans)) | OS/2           | [~160 variable fonts](https://gist.github.com/softmarshmallow/02982976f1f72dba5aaad4dc80befbfb) with exactly 2 variants (2025 Google Fonts registry). When 2 VF variants exist, they are explicitly `["regular", "italic"]`.                                                                                                                           |

**1. One static font**

| font  | TTF              | Font Subfamily (nameID 2) | PostScript Name (nameID 6) | fsSelection         | ital | slnt | italic        |
| ----- | ---------------- | ------------------------- | -------------------------- | ------------------- | ---- | ---- | ------------- |
| Molle | Molle-Italic.ttf | Regular                   | Molle-Regular              | `00000000 00000001` | -    | -    | ✓ (bit 0 set) |

**2. Many static fonts**

| font    | TTF                    | Font Subfamily (nameID 2) | PostScript Name (nameID 6) | fsSelection         | ital | slnt | italic  |
| ------- | ---------------------- | ------------------------- | -------------------------- | ------------------- | ---- | ---- | ------- |
| PTSerif | PTSerif-Regular.ttf    | "Regular"                 | "PTSerif-Regular"          | `00000000 01000000` | -    | -    | `false` |
| PTSerif | PTSerif-Bold.ttf       | "Bold"                    | "PTSerif-Bold"             | `00000000 00100000` | -    | -    | `false` |
| PTSerif | PTSerif-Italic.ttf     | "Italic"                  | "PTSerif-Italic"           | `00000000 00000001` | -    | -    | `true`  |
| PTSerif | PTSerif-BoldItalic.ttf | "Bold Italic"             | "PTSerif-BoldItalic"       | `00000000 00100001` | -    | -    | `true`  |

**3. One variable font**

N/A

**3-1. Variable font with italic instances**

| font        | TTF                                                                                          | Font Subfamily (nameID 2) | PostScript Name (nameID 6) | fsSelection         | ital | slnt | italic            |
| ----------- | -------------------------------------------------------------------------------------------- | ------------------------- | -------------------------- | ------------------- | ---- | ---- | ----------------- |
| Roboto Flex | RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf | Regular                   | RobotoFlex-Regular         | `00000000 11000000` | -    | yes  | ✗ (bit 0 not set) |

| Instance Name     | nameID | Weight (wght) | Slant (slnt) | ✅ Name-based Detection | ✅ Slant-based Detection |
| ----------------- | ------ | ------------- | ------------ | ----------------------- | ------------------------ |
| Thin Italic       | 279    | 100.0         | -10.0        | ✅ Contains "Italic"    | ✅ slnt < 0              |
| ExtraLight Italic | 280    | 200.0         | -10.0        | ✅ Contains "Italic"    | ✅ slnt < 0              |
| Light Italic      | 281    | 300.0         | -10.0        | ✅ Contains "Italic"    | ✅ slnt < 0              |
| Italic            | 282    | 400.0         | -10.0        | ✅ Contains "Italic"    | ✅ slnt < 0              |
| Medium Italic     | 283    | 500.0         | -10.0        | ✅ Contains "Italic"    | ✅ slnt < 0              |
| SemiBold Italic   | 284    | 600.0         | -10.0        | ✅ Contains "Italic"    | ✅ slnt < 0              |
| Bold Italic       | 285    | 700.0         | -10.0        | ✅ Contains "Italic"    | ✅ slnt < 0              |
| ExtraBold Italic  | 286    | 800.0         | -10.0        | ✅ Contains "Italic"    | ✅ slnt < 0              |
| Black Italic      | 287    | 900.0         | -10.0        | ✅ Contains "Italic"    | ✅ slnt < 0              |
| ExtraBlack Italic | 288    | 1000.0        | -10.0        | ✅ Contains "Italic"    | ✅ slnt < 0              |

**4. Two variable fonts**

| font  | TTF                                     | Font Subfamily (nameID 2) | PostScript Name (nameID 6) | fsSelection         | fvar.instances | italic            |
| ----- | --------------------------------------- | ------------------------- | -------------------------- | ------------------- | -------------- | ----------------- |
| Inter | Inter-VariableFont_opsz,wght.ttf        | Regular                   | Inter-Regular              | `00000000 11000000` | no slnt/ital   | ✗ (bit 0 not set) |
| Inter | Inter-Italic-VariableFont_opsz,wght.ttf | Italic                    | Inter-Italic               | `00000000 10000001` | no slnt/ital   | ✓ (bit 0 set)     |

**Note**: Inter is exceptionally unusual in that its variable font instances lack PostScript names in the `fvar` table, unlike most other variable fonts (e.g., Recursive, Noto Sans) which include comprehensive PostScript names for all instances.

## See also

- [Italic](./italic.md) for more details.
- [wg - impl-italic](../wg/feat-paragraph/impl-italic.md) for more details.

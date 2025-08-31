# Paragraph (Text / Font)

**Core / Modeling**

- [ ] FontDescription
- [ ] `italic` model
  - [ ] faux italic
    - [ ] DOM `font-synthesis: none;`

**Core / Painting**

- [x] linemetrics overlay
- [x] max_lines
- [x] width `<length>` | `auto`
- [ ] vertical_align
- [ ] line height
- [ ] height mode
- [ ] height
- [ ] fill
  - [x] solid paint
  - [x] gradient paint
  - [ ] gradient paint with decoration - see limitation https://github.com/gridaco/grida/issues/416
  - [ ] multiple fills
- [ ] strokes
- [ ] RTL
- [ ] decoration
  - [x] text-decoration-style
  - [x] text-decoration-color color
  - [x] text-decoration-color auto / solid
  - [ ] text-decoration-color auto
  - [ ] text-decoration-color non-solid
  - [x] text-decoration-thickness (only supports %)
  - [ ] text-decoration-skip-ink - https://github.com/rust-skia/rust-skia/issues/1187
  - [ ] known limitations https://github.com/gridaco/grida/issues/416
- [x] [Variable axes](https://github.com/gridaco/grida/blob/canary/docs/reference/open-type-variable-axes.md)
  - [x] `wght`
  - [x] `wdth`
  - [x] `slnt`
  - [ ] `ital`
  - [x] `opsz`
    - [ ] `opsz: auto`
  - [x] `casl`
  - [x] [`crsv`](https://fonts.google.com/knowledge/glossary/cursive_axis)
  - [x] [`MONO`](https://fonts.google.com/knowledge/glossary/monospace_axis) Monospace axis
  - [x] [`GRAD`](https://fonts.google.com/knowledge/glossary/grade_axis) Grade axis
  - [x] [`XOPQ`](https://fonts.google.com/knowledge/glossary/xopq_axis) Parametric Thick Stroke axis
  - [x] [`XTRA`](https://fonts.google.com/knowledge/glossary/xtra_axis) Parametric Counter Width axis
  - [x] [`YOPQ`](https://fonts.google.com/knowledge/glossary/yopq_axis) Parametric Thin Stroke axis
  - [x] `YTUC`
  - [x] `YTLC`
  - [x] `YTAS`
  - [x] `YTDE`
  - [x] `YTFI`
- [x] [open type featuers](https://github.com/gridaco/grida/blob/canary/docs/reference/open-type-features.md)

**Text Editor**

- [ ] native text editor
- [ ] selection range
- [ ] selection range background
- [ ] mixed style LUT

**Fallback Model**

- [ ] CJK Fallback
  - [ ] Korean - Noto Sans KR
  - [ ] Japanese - Noto Sans JP
  - [ ] Chinese (bit complicated..) maybe we won't support
- [ ] Fallback model
  - [ ] Per-glyph fallback
  - [ ] Per-run fallback

**Ecosystem**

- [ ] Emoji
  - [ ] Apple Color Emoji (as png for license reasons)
- [ ] Link annotations
  - [ ] pdf export
- [x] update google fonts index. https://fonts.grida.co

**Editor**

- [ ] flatten -> text -> path (vector network)
- [ ] link annotation editor preview
- [x] `fvar` / `STAT` table parsing - FontStyle picker
- [x] variable axes controls
- [x] font feature controls
- [x] font style picker
  - [x] `fvar.instances`
  - [ ] PostScriptNames
  - [ ] multi typeface (multiple ttf for family)
- [ ] a11y/toggleItalic

**`@grida/fonts`**

- [x] typr open type table parsing module
  - [x] support `STAT` table

## References

- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_fonts/Variable_fonts_guide
- https://developer.mozilla.org/en-US/docs/Web/CSS/font-variation-settings
- https://marussy.com/variable-css-font-features/
- https://pomax.github.io/CFF-glyphlet-fonts/
- https://learn.microsoft.com/en-us/typography/opentype/spec/featurelist
- https://unicode.org/iso15924/iso15924-codes.html

## Impls

**`cg272` width layout**

https://github.com/user-attachments/assets/bad52f9b-f328-4562-b860-11ecf133ce1d

**`cg273` Variable axes / `wght`**

https://github.com/user-attachments/assets/73afc137-c6e9-48c4-ab60-39bf208695ae

**`cg274` Text Decorations**

https://github.com/user-attachments/assets/ba9faf94-846c-42df-8958-86932f90cf1d

**`cg275` fvar**

https://github.com/user-attachments/assets/3b7846b7-ddba-4ed2-9174-9892c104cc82

**`cg276` OpenType features - `GSUB`**

https://github.com/user-attachments/assets/c1b1ecfa-671e-456a-b9ab-74986725be7f

**`cg277` OpenType features - `fvar.instances` / text style picker**

https://github.com/user-attachments/assets/afdcd445-4bf1-4910-bb71-48deb8cc4210

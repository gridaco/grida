---
title: Paragraph Feature Roadmap
---

# Paragraph Feature Roadmap

**Core / Modeling**

- [ ] FontDescription
- [ ] `italic` model
  - [ ] faux italic
    - [ ] DOM `font-synthesis: none;`
- [x] font-weight
- [x] font-optical-sizing
- [x] font-kerning - flag `kern`
- [x] font-width (font-stretch) - var `wdth`
- [ ] list elements `<ol>`, `<ul>`

**Core / Painting**

- [x] linemetrics overlay
- [x] max_lines
- [x] textlayout width `<length>` | `auto`
- [x] textlayout vertical_align
- [x] textlayout height
- [x] `line-height`
- [x] `letter-spacing`
- [x] `word-spacing`
- [ ] `text-indent`
- [ ] fill
  - [x] solid paint
  - [x] gradient paint
  - [ ] shader (gradient/image) paint with decoration - see limitation https://github.com/gridaco/grida/issues/416
  - [ ] image paint
  - [ ] multiple fills
- [x] effects
  - [x] drop shadow
  - [x] inner shadow
  - [x] blur
  - [x] backdrop blur
- [ ] strokes
  - [ ] align
    - [ ] outside (union)
      - [x] fast pre-paint (only valid when the fill is non-opaque), but fast
      - [ ] paint with clip (split the stroke / fill geometry layer)
    - [ ] center (?)
    - [ ] inside (?)
  - [ ] Issues
    - [ ] https://github.com/gridaco/grida/issues/423
  - [x] color
  - [x] linear gradient
  - [x] radial gradient
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
    - [x] `opsz: auto`
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
  - [x] implicit fallback (user fallback list)
  - [x] Korean - Noto Sans KR
  - [x] Japanese - Noto Sans JP
  - [x] Chinese SC - Noto Sans SC
    - [ ] TC / HK - won't support (till level 2)
- [ ] Fallback model
  - [x] soft fallback. level 1
  - [ ] `unicode-range` fallback with range control - level 2
  - [ ] explicit fallback. fallback spec level 3 (not planned)
    - [ ] Per-glyph fallback
    - [ ] Per-run fallback

**ICU**

- [ ] RTL

**Ecosystem**

- [ ] Emoji
  - [ ] Apple Color Emoji (as png for license reasons)
- [ ] Link annotations
  - [ ] pdf export
- [x] update google fonts index. https://fonts.grida.co

**Editor**

- [ ] flatten -> text -> path (vector network)
- [ ] link annotation editor preview
- [ ] textlayout height mode
- [x] `fvar` / `STAT` table parsing - FontStyle picker
- [x] variable axes controls
- [x] font feature controls
- [x] font style picker
  - [x] `fvar.instances`
  - [x] PostScriptNames
  - [x] multi typeface (multiple ttf for family)
- [x] a11y/toggleItalic
- [x] a11y/togglebold

**`@grida/fonts` / `fonts (rs)`**

- [x] typr open type table parsing module
  - [ ] support `STAT` table
  - [ ] `fvar`
  - [ ] `GSUB`
  - [ ] `GPOS`

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

**`cg278` OpenType features - `opsz` - Optical sizing, opsz-auto**

https://github.com/user-attachments/assets/dd49666f-d840-4f60-a112-b53600dceb20

**`cg279` Font fallback CJK (KR/JP/SC)**

https://github.com/user-attachments/assets/c39d8a91-0a82-4bee-a150-c5a3e0cba23e

**`cg280` PNG Export**
https://github.com/gridaco/grida/pull/420

**`cg281` Text Stroke**

https://github.com/user-attachments/assets/a137349a-be11-4f65-8682-06a3dd92f712

**`cg282` fonts.grida.co**

https://github.com/user-attachments/assets/9bcc2e13-91cb-4e5a-9603-473a9acf5ef7

**`cg283` text spacing - line-height / letter-spacing / word-spacing**

https://github.com/user-attachments/assets/f89afb4c-07ac-4817-b5a0-d8c4fc5f10ac

**`cg284` text effects - drop shadow / inner shadow / layer blur / backdrop blur**

https://github.com/user-attachments/assets/8ce395bb-8095-4885-b312-961a6f9cca2b

---
title: Font Generation (fontgen)
---

# Font Generation - `fontgen`

| feature id | status | description                                      |
| ---------- | ------ | ------------------------------------------------ |
| `fontgen`  | draft  | generate custom fonts with embedded emoji/glyphs |

---

## Overview

The `fontgen` feature generates custom font files (TTF/OTF) with embedded emoji images and custom glyphs, providing an alternative to image placeholders.

## Expanded Scope

While the initial intent of `fontgen` was to enable runtime dynamic generation of PNG-emoji fonts, its scope is broader and designed as a general-purpose font generation and manipulation system. This includes embedding arbitrary images and glyphs into fonts, supporting a wide range of use cases beyond emoji.

### Example Use Cases

- **User-uploaded emoji sets:** Allow users to upload their own emoji collections and generate fonts embedding these images for consistent rendering across platforms.
- **Cross-platform Apple Color Emoji support:** Generate fonts that embed Apple Color Emoji images (sbix or CBDT/CBLC tables) to enable consistent emoji rendering on non-Apple platforms.
- **User-defined custom fonts:** Enable users to create fonts with custom glyphs or icons, embedding bitmap or vector images directly into font files.
- **Design and export workflows:** Integrate with design tools like Glyphs app or similar, allowing font designers to export fonts with embedded images or color glyphs for downstream use.

### Goals

- **Loading and exporting fonts:** Support loading existing fonts and exporting new or modified fonts with embedded images.
- **Partial loading and streaming of PNG glyphs:** Enable partial font loading and streaming of bitmap glyphs to optimize memory and performance.
- **Embedding images in fonts:** Support embedding images using standard tables such as `sbix` (Apple Color Emoji) and `CBDT/CBLC` (Google's color bitmap glyphs).
- **Exporting TTF/OTF:** Generate standard TTF or OTF font files that include embedded images and custom glyph data, suitable for use in text rendering engines.

### Technical Details

- **Runtime font baking:** The system can generate font shards dynamically at runtime, composing embedded images and glyphs into font tables.
- **Supported tables:** Full support for color bitmap tables like `sbix` and `CBDT/CBLC` to embed PNG or other bitmap formats.
- **Partial glyph updates:** Allows updating or streaming individual glyph images without rebuilding the entire font file.
- **Integration with SkParagraph/Skia:** Designed to work seamlessly with Skia's text rendering stack, including SkParagraph, enabling proper text layout, cursor positioning, and font fallback semantics.

### Pros and Cons Compared to Placeholder Approach

- **Pros:**
  - Provides true font fallback semantics and text engine integration.
  - Enables proper cursor positioning and text selection.
  - Supports complex text shaping and layout with embedded images.
- **Cons:**
  - More complex to implement and maintain.
  - Font file sizes can increase due to embedded images.
  - Potentially slower font loading compared to simple placeholders.

## Notes for Grida

This feature is currently exploratory within Grida. It is undecided whether `fontgen` will become the primary method for emoji and glyph rendering, but it provides a powerful and flexible capability for general-purpose font generation and embedding images within fonts. It complements the existing placeholder-based approaches by offering an alternative path with richer integration and semantic fidelity.

## See Also

- [emoji-placeholder](../feat-paragraph/impl-emoji-placeholder.md) - Alternative placeholder approach for emoji rendering

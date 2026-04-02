---
title: "Markdown Rendering Support"
format: md
tags:
  - internal
  - wg
  - format
  - markdown
---

# Markdown Rendering Support

The `MarkdownNode` renders GFM (GitHub Flavored Markdown) directly to a Skia Picture using pulldown-cmark's event stream and Skia's `textlayout::Paragraph` API. No HTML/CSS pipeline is involved — the markdown source is walked and drawn in a single pass.

- **Parser**: `pulldown-cmark` 0.13 with `ENABLE_STRIKETHROUGH | ENABLE_TABLES | ENABLE_TASKLISTS | ENABLE_MATH`
- **Renderer**: `crates/grida-canvas/src/painter/markdown.rs`
- **Node schema**: `MarkdownNodeRec` in `crates/grida-canvas/src/node/schema.rs`
- **Theme**: GitHub markdown light (hardcoded colors from `fixtures/css/github-markdown-light.css`)

## Block Elements

| Element           | Status | Notes                                                         |
| ----------------- | ------ | ------------------------------------------------------------- |
| Heading h1        | ✅     | 32px semi-bold, bottom border                                 |
| Heading h2        | ✅     | 24px semi-bold, bottom border                                 |
| Heading h3        | ✅     | 20px semi-bold                                                |
| Heading h4        | ✅     | 16px semi-bold                                                |
| Heading h5        | ✅     | 14px semi-bold                                                |
| Heading h6        | ✅     | 13.5px semi-bold                                              |
| Paragraph         | ✅     | Word-wrapped to content width                                 |
| Code block        | ✅     | Monospace, rounded background rect + border                   |
| Code block (lang) | ⚠️     | Language tag parsed but no syntax highlighting                |
| Blockquote        | ✅     | Left border + indented text                                   |
| Horizontal rule   | ✅     | 2px stroke line                                               |
| Unordered list    | ✅     | Bullet prefix, nested depth tracked                           |
| Ordered list      | ✅     | Numbered prefix, auto-incrementing                            |
| Task list         | ✅     | Checkbox character prefix (☐/☑)                               |
| Display math `$$` | ⚠️     | Rendered as centered monospace italic text (raw LaTeX source) |

## Inline Elements

| Element           | Status | Notes                                         |
| ----------------- | ------ | --------------------------------------------- |
| **Bold**          | ✅     | Font weight BOLD                              |
| _Italic_          | ✅     | Font slant Italic                             |
| ~~Strikethrough~~ | ✅     | LINE_THROUGH decoration                       |
| `Inline code`     | ✅     | Monospace font, 0.85x font size               |
| [Link](url)       | ✅     | Blue color + underline decoration             |
| Inline math `$`   | ⚠️     | Rendered as monospace italic text (raw LaTeX) |
| Soft break        | ✅     | Collapsed to space                            |
| Hard break        | ✅     | Newline character                             |

## Tables

| Feature          | Status | Notes                                    |
| ---------------- | ------ | ---------------------------------------- |
| Basic table      | ✅     | Equal-width columns, cell padding        |
| Header row       | ✅     | Semi-bold text, light background         |
| Column alignment | ✅     | Left / Center / Right from `:---` syntax |
| Grid borders     | ✅     | Full horizontal + vertical border grid   |
| Multi-line cells | ✅     | Row height adapts to tallest cell        |

## Images

| Feature           | Status | Notes                                           |
| ----------------- | ------ | ----------------------------------------------- |
| Image placeholder | ✅     | Rounded rect with alt text label (🖼 prefix)    |
| Image loading     | ❌     | No actual image fetch/display; placeholder only |

## Known Limitations

| Feature                    | Status | Effort | Notes                                                                                                                                                      |
| -------------------------- | ------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LaTeX math rendering       | ❌     | High   | Requires TeX math layout engine (e.g. KaTeX/MathJax binding or OpenType MATH table consumer). Current fallback shows raw LaTeX source in monospace italic. |
| Syntax highlighting        | ❌     | Medium | Code block language tag is parsed but ignored. Would need a tokenizer (e.g. `syntect` or `tree-sitter`) to map tokens to colored text styles.              |
| Inline HTML (`<sup>`, etc) | ❌     | Medium | pulldown-cmark emits `Event::Html` for inline HTML. Would need mini HTML parser for supported tags.                                                        |
| `<details><summary>`       | ❌     | High   | Requires interactive expand/collapse state.                                                                                                                |
| Dark theme                 | ❌     | Low    | Theme colors are hardcoded light. `fixtures/css/github-markdown-dark.css` exists for reference.                                                            |
| Footnotes                  | ❌     | Medium | Parser flag exists (`ENABLE_FOOTNOTES`) but events not handled.                                                                                            |
| Nested blockquotes         | ❌     | Low    | Only one level of blockquote indentation rendered.                                                                                                         |
| Image loading              | ❌     | Medium | Requires async fetch + resource registration into the renderer.                                                                                            |
| Picture caching            | ❌     | Low    | Currently re-renders every frame. Should cache keyed on `(markdown hash, width)`.                                                                          |

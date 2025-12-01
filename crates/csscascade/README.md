# csscascade

A modern, Rust-native **CSS Cascade & Style Resolution Engine** designed for building browser‑like rendering pipelines. `csscascade` takes an HTML (and later SVG) DOM tree and produces a **style-resolved static tree** ready for layout and painting.

Today the crate is powered by [**Stylo**](https://github.com/servo/stylo) — Servo’s production CSS engine. Stylo handles parsing, selectors, specificity, and computed values (and compiles cleanly for `wasm32-unknown-emscripten`), while `csscascade` focuses on DOM adapters, HTML/SVG attribute normalization, font parsing/selection, layout hand-off, and everything else outside the CSS engine’s scope.

This crate implements the hardest and most fundamental part of a rendering engine: the transformation from loosely-typed DOM nodes + CSS rules into a **fully computed, normalized, strongly-typed tree**.

Future support for SVG is planned (HTML + SVG share >90% of style logic).

---

### “Isn’t a full CSS engine overkill?”

Not really. Stylo stays surprisingly lean—our builds land around ~1.5 MB when compiled with `wasm-unknwon-unknown` and roughly ~2.5 MB when targeting `wasm32-unknown-emscripten`. More importantly, reproducing the entirety of CSS3 (selectors, cascade rules, media queries, shorthand expansion, inheritance, etc.) is phenomenally difficult; sooner or later any serious renderer ends up needing a browser-grade engine. Stylo already solves that problem with production-ready accuracy, so we embrace it and focus on the rest of the pipeline.

---

## What this crate does

### ✔ 1. Parse and walk an HTML/XML tree

Accepts a DOM-like tree (any structure implementing the crate's DOM traits).

### ✔ 2. Perform full CSS cascade

Backed by Stylo’s battle-tested cascade implementation:

- Selector matching
- Specificity and importance resolution
- Inheritance
- Initial values
- Presentation attribute mapping (SVG-ready)
- Shorthand expansion

### ✔ 3. Produce a Style‑Resolved Tree

A new tree where **every node has its final computed style** attached.
This tree contains:

- resolved display modes
- resolved text properties
- resolved sizing/box model values
- resolved transforms & opacity
- fully computed inline and block styles

### ✔ 4. Ready for layout engine consumption

`csscascade` does **not** perform layout.
It outputs a static, fully resolved element tree specifically designed to be fed into your layout engine (block/inline/flex/grid/etc.).

### ✔ 5. Ready for painting after layout

Since the style is computed and normalized, the next stages can be:

- layout engine
- display list generation
- painting/rendering

---

## Why this crate exists

Rendering HTML and SVG is deceptively hard. Even before layout and paint, a renderer must:

- parse the DOM
- run the CSS cascade
- normalize presentation attributes
- compute final styles
- build a static, render‑ready tree

None of these steps are specific to a browser — they are fundamental requirements for **any** engine that wants to render HTML or SVG, whether for graphics, documents, UI, or design tools.

The goal of `csscascade` is **not** to help you build a browser. Instead, it’s designed for developers building:

- static HTML/SVG renderers
- document processors
- canvas-based UI engines
- PDF or image generators
- design tools (like Figma‑style or illustration tools)
- “bring your own renderer” pipelines

It handles the universally hard parts (CSS cascade, style normalization, static tree production) by delegating the CSS engine to Stylo and layering our own DOM/font/layout glue on top, so your engine can focus on **layout and painting**, not CSS correctness.

---

## Intended Audience

### ✔ 1. Engine and renderer authors (non‑browser)

This crate is specifically for people building a **static** renderer — not a real DOM, not a browser, not an interactive layout engine.

If you:

- want to parse HTML/SVG once
- resolve styles correctly
- produce a clean, immutable tree
- feed it to your own layout + painting pipeline

…then `csscascade` is designed for you.

### ✔ 2. Tools that need correct CSS without a browser

For example:

- SVG → PNG converters
- HTML → PDF generators
- print engines
- design tools
- WASM/canvas engines

### ✖ Not for browser makers

If you need:

- live DOM mutation
- dynamic style recalculation
- reflow/repaint cycles
- incremental layout
- event-driven DOM

…this crate intentionally does **not** target that use case.

---

## What this crate produces

`csscascade` outputs a **style‑resolved static tree** — every node has fully computed CSS (straight from Stylo) applied, ready for layout.

### (planned) Optional layout integration

A future feature flag will allow the crate to output a **layout‑computed, render‑ready tree**, so you can plug it directly into your painter.

---

```
Input DOM Tree (HTML / XML / SVG)
              ↓
   csscascade front-end (DOM adapters, CSS collection)
              ↓
           Stylo engine
              ↓
   Style‑Resolved Static Tree
              ↓
        Layout Engine (e.g. taffy)
              ↓
           Painting
```

### Style‑Resolved Tree

Each node in the output tree includes:

- tag name
- attributes
- fully computed CSS style
- resolved defaults
- resolved inheritance
- normalized values

This tree is static and does not update unless the DOM or styles change.

---

## Goals

### Primary Goals

- Accurate CSS cascade implementation powered by Stylo
- Browser-inspired computed style model
- Shared resolution logic for HTML and SVG
- Zero heap allocations in hot paths where possible
- Fast traversal + predictable output

### Future Goals

- SVG presentation attribute mapping
- CSS variables (`var()`) resolution (via Stylo custom property support)
- Support for user-agent stylesheets / UA defaults
- Inline style parsing & extraction from DOM trees
- @media evaluation hooks that inform downstream layout engines

---

## Non‑Goals (for now)

- Layout algorithms (block, inline, flex, grid) — use `taffy` or your own engine
- Painting or rasterization
- Re‑implementing Stylo’s internals (parser, selector engine, cascade)
- JavaScript‑style dynamic live updates

These are intentionally separate stages.

---

## Example Usage

```rust
use csscascade::{Cascade, StyledTree};
use your_dom_library::Document;

let dom: Document = parse_html("<div class=\"title\">Hello</div>");
let css = "
  .title {
    font-size: 24px;
    font-weight: bold;
  }
";

let cascade = Cascade::new(css);
let styled: StyledTree = cascade.apply(&dom);

// Pass styled to your layout engine
layout_engine.layout(&styled);
```

---

## Powered by Stylo

- **Why Stylo?** It is the most complete, accurate, lightweight CSS engine available in Rust, already proven inside Servo and compatible with `wasm32-unknown-emscripten`.
- **What csscascade adds:** DOM traversal traits, HTML/SVG attribute normalization, stylesheet collection from `<style>`/external sources, font parsing and selection, and integration points for layout engines such as `taffy`.
- **What Stylo omits (and we provide):** HTML parsing/processing, DOM ownership, font backends, layout, and painting. This separation lets us reuse Stylo wholesale while still solving the remaining renderer problems.

---

## Philosophy & Design Principles

- **Engine‑agnostic:** DOM input is not tied to any specific parser.
- **Format‑agnostic:** HTML and SVG share a unified style pipeline.
- **Separation of concerns:** Stylo handles CSS internals; csscascade handles DOM plumbing, fonts, and layout hand-off.
- **Deterministic:** Same input always yields the same resolved tree.
- **Modern CSS:** Built on Stylo’s constantly updated property set (variables, calc, etc.).

---

## Roadmap

- [ ] SVG presentation attributes → CSS mapping
- [ ] CSS variable resolution
- [ ] Custom property support
- [ ] UA stylesheet injection
- [ ] Integration examples (HTML, SVG, Grida Canvas)
- [ ] Full W3C cascade compliance test suite

---

## License

MIT or Apache-2.0

---

## Contributing

Contributions are welcome!  
If you're building a rendering engine, layout system, or visualization tool, this crate aims to be the foundational CSS cascade layer you can rely on.

---

## Status

⚠️ **Early development** — API may change as SVG support and additional CSS features are added.

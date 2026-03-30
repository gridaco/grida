# csscascade

A Rust CSS cascade & style resolution engine for building non-browser rendering pipelines.

Given an HTML DOM tree and CSS, `csscascade` produces a **style-resolved static tree** — every node carrying its fully computed CSS — ready for layout and painting.

Powered by [Stylo](https://github.com/servo/stylo) (Servo/Firefox's CSS engine). Stylo is the only production-grade, embeddable CSS engine available in Rust; reimplementing the cascade (selectors, specificity, inheritance, shorthand expansion, `!important`, `var()`, `@media`, ...) from scratch is not viable.

## Pipeline

```
HTML string
    │
    ▼
html5ever ─── parse ──► RcDom (reference-counted DOM)
    │
    ▼
csscascade ── cascade ─► StyledTree (computed styles per node)
    │
    ▼
taffy ─────── layout ──► positioned boxes
    │
    ▼
grida-canvas ─ convert ► IR nodes (rectangles, text, etc.)
```

This mirrors the SVG import path (`usvg` → `from_usvg` → IR), but for HTML/CSS each stage is a separate crate because no single library (like `usvg` for SVG) handles the full pipeline.

## Current State

**Working:**

- HTML parsing via html5ever into `RcDom`
- DOM tree representation (`rcdom` module)
- `Tree` / `StyledNode` abstractions for style-resolved output
- Stylo infrastructure wired up (`Device`, `Stylist`, `SharedRwLock`)
- Serialization — re-emit HTML, optionally with computed styles inlined
- Builder pattern for programmatic tree construction
- Working examples: `print_tree`, `print_rcdom`, `html2html`

**Proof-of-concept (not yet integrated):**

- `examples/exp_impl_telement.rs` — demonstrates full per-element cascade via Stylo's `TElement` trait. This works but has not been promoted to the main crate API.

**Stubbed / not yet functional:**

- `StyleRuntime::compute_for()` returns default `ComputedValues` instead of actually resolving per-element styles
- `SimpleFontProvider` returns hardcoded metrics, not real font data

## Roadmap

### Phase 1 — Cascade Resolution

Wire up actual per-element style resolution so `compute_for()` returns real computed values.

- [ ] Promote `TElement` implementation from `exp_impl_telement.rs` into the crate
- [ ] Collect CSS from `<style>` elements and inline `style` attributes
- [ ] Inject a user-agent stylesheet (default HTML element styles)
- [ ] Validate against HTML fixture files in `/fixtures/test-html/L0/`

### Phase 2 — Font & Media Integration

Replace stubs with real providers so computed values reflect the runtime environment.

- [ ] Integrate font metrics with the Skia backend (or system fonts)
- [ ] Plumb viewport size, DPR, and `prefers-color-scheme` from the host

### Phase 3 — IR Conversion

Bridge the gap between style-resolved tree and grida-canvas, analogous to `from_usvg.rs`.

- [ ] Map block/flex containers → rectangle IR nodes
- [ ] Map text nodes → text IR nodes with font/color properties
- [ ] Map background, border, opacity → visual properties on IR nodes
- [ ] Handle `display: none` (exclusion) and `visibility: hidden`
- [ ] Layout pass via `taffy` to compute geometry before IR emission

### Phase 4 — Completeness

- [ ] SVG presentation attribute → CSS mapping (HTML + SVG share >90% of style logic)
- [ ] CSS custom properties / `var()` (Stylo supports these; needs plumbing)
- [ ] `@media` evaluation hooks
- [ ] External stylesheet loading (`<link rel="stylesheet">`)

## Architecture

The crate has two modules:

| Module | Purpose |
|--------|---------|
| `rcdom` | Reference-counted DOM (from html5ever). Parses HTML into a tree of `Node` handles. |
| `tree` | Style-resolved tree. Wraps `RcDom` nodes with Stylo `ComputedValues`. Contains `StyleRuntime` (Stylo orchestration) and `StyledNode` (output). |

The planned module structure (from ARCHITECTURE.md) fans this out into `dom/`, `stylesheets/`, `stylo_bridge/`, `cascade/`, `fonts/`, `tree/`, and `layout_hooks/`. The current proof-of-concept keeps everything in `tree/mod.rs` intentionally; it will be split once the API stabilizes.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design document (note: aspirational, may be ahead of implementation).

## Why Stylo

| Engine | Language | Embeddable? |
|--------|----------|-------------|
| Blink (Chrome) | C++ | No — deeply coupled to Blink internals |
| WebKit | C++ | No — same problem |
| Stylo (Servo/Firefox) | Rust | **Yes** — designed as a standalone crate |

There is no alternative. Any Rust project that needs correct CSS cascade either uses Stylo or builds an incomplete reimplementation.

## Examples

```sh
# Parse HTML and re-serialize
cargo run --example html2html

# Print DOM tree structure
cargo run --example print_rcdom

# Parse HTML and print with computed styles
cargo run --example print_tree

# Experimental: full cascade with TElement (proof of concept)
cargo run --example exp_impl_telement
```

## Non-Goals

- Layout algorithms — use `taffy` or equivalent
- Painting / rasterization — downstream concern
- Live DOM mutation or incremental reflow — this is a static, single-pass engine
- Replacing Stylo internals — we embed it, not reimplement it

## License

MIT or Apache-2.0

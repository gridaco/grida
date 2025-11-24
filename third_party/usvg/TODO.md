# TODO: usvg Fork Development Plan

This document outlines the reasons for maintaining a fork of `usvg` and the planned modifications to align it with Grida's architecture and requirements.

## Goals

### Bundle Size Reduction

**Current**: usvg introduces up to **3MB** in WASM bundle size  
**Target**: Reduce to **< 1MB**

This is a critical goal for Grida's web deployment. The planned dependency replacements and optimizations are specifically aimed at achieving this significant bundle size reduction.

## Why Fork Instead of Using crates.io?

We maintain a fork of `usvg` rather than using the upstream version from crates.io for several strategic reasons:

1. **Bundle Downsizing**: Reduce the final bundle size by replacing heavy dependencies with lighter alternatives or our own implementations
2. **Dependency Unification**: Align dependencies with Grida's broader web technology stack for consistency and maintainability
3. **Custom Font Processing**: Replace external font libraries with our own `fonts` crate for better integration with Grida's font system
4. **Enhanced CSS Processing**: Upgrade to a full, browser-grade CSS parser for better compatibility and feature support
5. **Preserve Original Data**: Retain more original SVG element information during tree processing (see [GitHub issues](#related-issues))

## Planned Changes

### Font Processing

**Current**: Uses `fontdb` crate  
**Target**: Replace with Grida's own `fonts` crate

This will provide:

- Better integration with Grida's font management system
- Unified font loading and caching across the codebase
- Custom font fallback strategies optimized for Grida's use cases

### CSS Processing

**Current**: Uses `simplecss`  
**Target**: Replace with `cssparser` (used by Servo)

Benefits:

- Full, browser-grade CSS parser
- Better compatibility with modern CSS features
- Consistent with other Grida components that use `cssparser`
- Improved support for complex selectors and media queries

### Hashing

**Status**: Not decided  
**Consideration**: Replace `siphasher` with `seahash` (Grida's main hasher)

This would:

- Unify hashing algorithms across the codebase
- Potentially improve performance (seahash is optimized for our use cases)
- Reduce dependency count

### Text/Font Handling

**Current**: Uses `rustybuzz`, `unicode-bidi`, `unicode-script`, `unicode-vo`  
**Target**: Replace with Grida's own fonts handling (future work)

These will be replaced as part of the broader font system refactoring:

- `rustybuzz` → Custom text shaping
- `unicode-bidi` → Integrated bidirectional text support
- `unicode-script` → Script detection in font system
- `unicode-vo` → Vertical orientation handling

### Tree Processing Enhancements

**Goal**: Retain more original SVG element data during processing

Currently, `usvg` converts primitive shapes (rect, ellipse, polygon) to paths and resolves opacity/blend modes into fill/stroke properties. We plan to preserve this original information to support:

- Better round-trip conversion
- More accurate SVG editing workflows
- Preservation of semantic meaning of elements

Related GitHub issues:

- [#974](https://github.com/linebender/resvg/issues/974): Option to preserve primitive shapes (rect, ellipse, polygon)
- [#975](https://github.com/linebender/resvg/issues/975): Preserve Node level `opacity`, `blend_mode`

Potential approaches:

- Extend `Node::Path` with auxiliary properties for original element information
- Introduce separate node types (`Node::Rect`, `Node::Ellipse`, etc.)
- Wrap converted elements in `Group` nodes that preserve original attributes

## Implementation Status

- [ ] Replace `fontdb` with Grida `fonts` crate
- [ ] Replace `simplecss` with `cssparser`
- [ ] Evaluate and potentially replace `siphasher` with `seahash`
- [ ] Replace text/font handling libraries with Grida's implementation
- [ ] Implement tree processing enhancements to preserve original element data
- [ ] Update tests and documentation

## Notes

This is a living document and will be updated as implementation progresses. Some items may be re-evaluated based on:

- Performance benchmarks
- Bundle size impact
- Development effort required
- Upstream changes in the original `usvg` repository

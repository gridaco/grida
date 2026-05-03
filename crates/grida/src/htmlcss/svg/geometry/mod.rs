//! Geometry primitives — shape parsing and `SkPath` construction.
//!
//! Phase-neutral: consumed by `layout/`, `resources/`, and `paint/`. May
//! produce Skia value types (`SkPath`, `SkMatrix`, `SkRect`) but no
//! Skia operation types (no canvases, shaders, image filters, pictures,
//! or paints). Architectural test in `tests/htmlcss_svg_architecture.rs`
//! enforces this.
//!
//! Today this module only owns CSS basic-shape parsing
//! (`circle()`/`ellipse()`/`inset()`/`polygon()`/`path()`). Future
//! consolidation will pull shared shape→`SkPath` builders here so SVG
//! `<rect>`/`<circle>`/etc. and CSS `clip-path` go through one path.
//!
//! Blink anchors:
//! - CSS basic shapes: `core/css/basic_shape_functions.{h,cc}` and
//!   `core/style/basic_shapes.{h,cc}`.
//! - Shape → path builders: scattered across
//!   `core/layout/svg/layout_svg_{rect,circle,ellipse,…}.cc::UpdateShape`.

pub mod basic_shape;

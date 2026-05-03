//! Painters — `LayoutSvg*` tree → Skia `Canvas`.
//!
//! Mirrors Blink's `core/paint/svg_*_painter.cc`. One painter per layout
//! node kind; per-node setup runs through `ScopedSvgTransformState` and
//! `ScopedSvgPaintState`, which mirror Blink's classes of the same name.
//!
//! The walk is one DFS pass; isolation (`save_layer`) is the resvg
//! simplification of Blink's `PaintLayer` rules: isolate only when the
//! group has opacity < 1, a non-default blend mode, a filter, a mask, or
//! a non-trivial clip.
//!
//! Blink anchor: `core/paint/svg_*_painter.{h,cc}`.

pub mod clip_path_clipper;
pub mod effects;
pub mod scoped_svg_paint_state;
pub mod svg_container_painter;
pub mod svg_image_painter;
pub mod svg_marker_painter;
pub mod svg_object_painter;
pub mod svg_painter;
pub mod svg_root_painter;
pub mod svg_shape_painter;
pub mod svg_text_painter;
pub mod svg_use_painter;
pub mod visibility;

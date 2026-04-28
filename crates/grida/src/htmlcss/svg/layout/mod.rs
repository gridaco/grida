//! Geometry/layout helpers for the current direct SVG renderer.
//!
//! These modules are called by the paint/resource path today. Do not add
//! doc-only `LayoutSvg*` placeholders here; keep future render-tree shape
//! in the README until it has executable code.

pub mod bbox;
pub mod layout_svg_element;
pub mod transform;
pub mod viewport;

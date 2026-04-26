//! SVG format-internal toolings: parse, sanitize, optimize.
//!
//! Pure SVG-string-in / (SVG-string | usvg::Tree)-out. No Grida types.

pub mod optimize;
pub mod parse;
pub mod sanitize;

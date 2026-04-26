//! External-format import: convert third-party formats into Grida nodes/bytes.
//!
//! Each importer here produces or consumes Grida types (`SceneGraph`, `Scene`,
//! `IRSVG*`, `.grida` FBS bytes). For pure format-internal tooling that does
//! not touch Grida types, see [`crate::formats`]. For runtime rendering of
//! HTML/CSS/SVG to a Skia picture, see [`crate::htmlcss`].
//!
//! `.grida` itself is the primary format and is decoded via [`crate::io`],
//! not here.

pub mod html;
pub mod svg;

//! SVG → Grida import pipeline.
//!
//! Produces Grida types (`SceneGraph`, `IRSVG*` IR, `.grida` FBS bytes).
//! Pure SVG-string transformations (sanitize, optimize, parse) live in
//! [`crate::formats::svg`].

pub mod from_usvg;
pub mod grida;
pub mod pack;
pub mod packed_scene;

pub use packed_scene::SVGPackedScene;

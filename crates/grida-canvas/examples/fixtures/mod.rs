//! L0 fixture scene builders.
//!
//! Re-exports shared helpers from `fixture_helpers` so that
//! `use super::*;` in each L0 module resolves correctly.
//!
//! Multiple example binaries share this module but each only uses a subset of
//! the sub-modules, so unused warnings are expected and suppressed here.

#![allow(dead_code)]

pub use crate::fixture_helpers::*;

pub mod cover;
pub mod l0_boolean_operation;
pub mod l0_container;
pub mod l0_effects;
pub mod l0_effects_glass;
pub mod l0_effects_progressive_blur;
pub mod l0_group;
pub mod l0_image;
pub mod l0_image_filters;
pub mod l0_layout_flex;
pub mod l0_layout_position;
pub mod l0_layout_transform;
pub mod l0_masks;
pub mod l0_paints;
pub mod l0_paints_stack;
pub mod l0_shape_arc;
pub mod l0_shape_polygon;
pub mod l0_shapes;
pub mod l0_strokes;
pub mod l0_strokes_rect;
pub mod l0_strokes_varwidth;
pub mod l0_tray;
pub mod l0_type;
pub mod l0_type_attributed;
pub mod l0_type_features;
pub mod l0_type_fvar;
pub mod l0_vector;

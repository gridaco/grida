//! L0 fixture scene builders.
//!
//! Re-exports shared helpers from `fixture_helpers` so that
//! `use super::*;` in each L0 module resolves correctly.
//!
//! Multiple example binaries share this module but each only uses a subset of
//! the sub-modules, so unused warnings are expected and suppressed here.

#![allow(dead_code)]

pub(crate) use crate::fixture_helpers::*;

pub(crate) mod cover;
pub(crate) mod l0_boolean_operation;
pub(crate) mod l0_container;
pub(crate) mod l0_effects;
pub(crate) mod l0_effects_glass;
pub(crate) mod l0_effects_progressive_blur;
pub(crate) mod l0_group;
pub(crate) mod l0_image;
pub(crate) mod l0_image_filters;
pub(crate) mod l0_layout_flex;
pub(crate) mod l0_layout_position;
pub(crate) mod l0_layout_transform;
pub(crate) mod l0_masks;
pub(crate) mod l0_paints;
pub(crate) mod l0_paints_stack;
pub(crate) mod l0_shape_arc;
pub(crate) mod l0_shape_polygon;
pub(crate) mod l0_shapes;
pub(crate) mod l0_strokes;
pub(crate) mod l0_strokes_rect;
pub(crate) mod l0_strokes_varwidth;
pub(crate) mod l0_tray;
pub(crate) mod l0_type;
pub(crate) mod l0_type_attributed;
pub(crate) mod l0_type_features;
pub(crate) mod l0_type_fvar;
pub(crate) mod l0_vector;

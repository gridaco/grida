//! Fixture Generator Tool
//!
//! Packs all L0 scene builders into a single `L0.grida` file and writes it to
//! `fixtures/test-grida/`.
//!
//! ## Usage
//!
//! ```bash
//! cargo run --package cg --example tool_gen_fixtures
//! ```
//!
//! ## Output
//!
//! On success the tool prints the byte count, scene count, and output path.

mod fixture_helpers;
mod fixtures;

fn main() {
    let scenes: Vec<(&str, _)> = vec![
        ("L0-shapes", fixtures::l0_shapes::build()),
        ("L0-shape-arc", fixtures::l0_shape_arc::build()),
        ("L0-shape-polygon", fixtures::l0_shape_polygon::build()),
        ("L0-vector", fixtures::l0_vector::build()),
        ("L0-paints", fixtures::l0_paints::build()),
        ("L0-paints-stack", fixtures::l0_paints_stack::build()),
        ("L0-strokes", fixtures::l0_strokes::build()),
        ("L0-strokes-rect", fixtures::l0_strokes_rect::build()),
        (
            "L0-strokes-varwidth",
            fixtures::l0_strokes_varwidth::build(),
        ),
        ("L0-image", fixtures::l0_image::build()),
        ("L0-image-filters", fixtures::l0_image_filters::build()),
        ("L0-effects", fixtures::l0_effects::build()),
        ("L0-effects-glass", fixtures::l0_effects_glass::build()),
        (
            "L0-effects-progressive-blur",
            fixtures::l0_effects_progressive_blur::build(),
        ),
        ("L0-type", fixtures::l0_type::build()),
        ("L0-type-attributed", fixtures::l0_type_attributed::build()),
        ("L0-type-fvar", fixtures::l0_type_fvar::build()),
        ("L0-type-features", fixtures::l0_type_features::build()),
        ("L0-masks", fixtures::l0_masks::build()),
        (
            "L0-boolean-operation",
            fixtures::l0_boolean_operation::build(),
        ),
        ("L0-container", fixtures::l0_container::build()),
        ("L0-group", fixtures::l0_group::build()),
        ("L0-tray", fixtures::l0_tray::build()),
        ("L0-layout-position", fixtures::l0_layout_position::build()),
        ("L0-layout-flex", fixtures::l0_layout_flex::build()),
        (
            "L0-layout-transform",
            fixtures::l0_layout_transform::build(),
        ),
    ];
    fixtures::write_multi_fixture(&scenes, "L0");
}

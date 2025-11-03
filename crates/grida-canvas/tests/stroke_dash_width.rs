use cg::cg::prelude::*;
use cg::shape::stroke::stroke_geometry;

/// Helper to create a horizontal line path
fn create_horizontal_line(x1: f32, y1: f32, x2: f32, y2: f32) -> skia_safe::Path {
    let mut path = skia_safe::Path::new();
    path.move_to((x1, y1));
    path.line_to((x2, y2));
    path
}

/// Helper to create a vertical line path
fn create_vertical_line(x1: f32, y1: f32, x2: f32, y2: f32) -> skia_safe::Path {
    let mut path = skia_safe::Path::new();
    path.move_to((x1, y1));
    path.line_to((x2, y2));
    path
}

#[test]
fn test_horizontal_line_dashed_vs_solid_stroke_width() {
    let path = create_horizontal_line(0.0, 0.0, 100.0, 0.0);
    let stroke_width = 5.0;

    let solid = stroke_geometry(
        &path,
        stroke_width,
        StrokeAlign::Center,
        StrokeCap::default(),
        StrokeJoin::default(),
        StrokeMiterLimit::default(),
        None,
    );
    let solid_bounds = solid.compute_tight_bounds();

    let dashed = stroke_geometry(
        &path,
        stroke_width,
        StrokeAlign::Center,
        StrokeCap::default(),
        StrokeJoin::default(),
        StrokeMiterLimit::default(),
        Some(&StrokeDashArray::from(vec![10.0, 5.0])),
    );
    let dashed_bounds = dashed.compute_tight_bounds();

    // For a horizontal line, the HEIGHT represents the stroke width
    let height_diff = (dashed_bounds.height() - solid_bounds.height()).abs();
    assert!(
        height_diff < 0.01,
        "Dashed stroke height {} differs from solid stroke height {} by {} px",
        dashed_bounds.height(),
        solid_bounds.height(),
        height_diff
    );
}

#[test]
fn test_vertical_line_dashed_vs_solid_stroke_width() {
    let path = create_vertical_line(50.0, 0.0, 50.0, 100.0);
    let stroke_width = 5.0;

    let solid = stroke_geometry(
        &path,
        stroke_width,
        StrokeAlign::Center,
        StrokeCap::default(),
        StrokeJoin::default(),
        StrokeMiterLimit::default(),
        None,
    );
    let solid_bounds = solid.compute_tight_bounds();

    let dashed = stroke_geometry(
        &path,
        stroke_width,
        StrokeAlign::Center,
        StrokeCap::default(),
        StrokeJoin::default(),
        StrokeMiterLimit::default(),
        Some(&StrokeDashArray::from(vec![10.0, 5.0])),
    );
    let dashed_bounds = dashed.compute_tight_bounds();

    // For a vertical line, the WIDTH represents the stroke width
    let width_diff = (dashed_bounds.width() - solid_bounds.width()).abs();
    assert!(
        width_diff < 0.01,
        "Dashed stroke width {} differs from solid stroke width {} by {} px",
        dashed_bounds.width(),
        solid_bounds.width(),
        width_diff
    );
}

#[test]
fn test_multiple_stroke_widths() {
    let widths = vec![2.0, 5.0, 10.0, 20.0];

    for width in widths {
        let path = create_horizontal_line(0.0, 0.0, 100.0, 0.0);

        let solid = stroke_geometry(
            &path,
            width,
            StrokeAlign::Center,
            StrokeCap::default(),
            StrokeJoin::default(),
            StrokeMiterLimit::default(),
            None,
        );
        let solid_height = solid.compute_tight_bounds().height();

        let dashed = stroke_geometry(
            &path,
            width,
            StrokeAlign::Center,
            StrokeCap::default(),
            StrokeJoin::default(),
            StrokeMiterLimit::default(),
            Some(&StrokeDashArray::from(vec![10.0, 5.0])),
        );
        let dashed_height = dashed.compute_tight_bounds().height();

        let diff = (dashed_height - solid_height).abs();
        assert!(
            diff < 0.01,
            "Width {} px: dashed height {:.2} differs from solid {:.2} by {:.2} px",
            width,
            dashed_height,
            solid_height,
            diff
        );
    }
}

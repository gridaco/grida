use cg::cg::prelude::*;
use cg::shape::*;
use skia_safe::PathBuilder;

#[test]
fn dashed_stroke_has_more_segments() {
    let mut builder = PathBuilder::new();
    builder.move_to((0.0, 0.0));
    builder.line_to((100.0, 0.0));
    let path = builder.detach();

    let solid = stroke_geometry(
        &path,
        10.0,
        StrokeAlign::Center,
        StrokeCap::default(),
        StrokeJoin::default(),
        StrokeMiterLimit::default(),
        None,
    );
    let dashed = stroke_geometry(
        &path,
        10.0,
        StrokeAlign::Center,
        StrokeCap::default(),
        StrokeJoin::default(),
        StrokeMiterLimit::default(),
        Some(&[10.0, 10.0].into()),
    );

    assert!(dashed.count_verbs() > solid.count_verbs());
}

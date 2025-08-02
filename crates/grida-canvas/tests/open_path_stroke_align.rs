use cg::cg::types::StrokeAlign;
use cg::shape::stroke_geometry;
use skia_safe::Path;

#[test]
fn open_path_uses_center_alignment_for_inside_outside() {
    let mut path = Path::new();
    path.move_to((0.0, 0.0));
    path.line_to((100.0, 0.0));

    let center = stroke_geometry(&path, 10.0, StrokeAlign::Center, None);
    let inside = stroke_geometry(&path, 10.0, StrokeAlign::Inside, None);
    let outside = stroke_geometry(&path, 10.0, StrokeAlign::Outside, None);

    assert!(!inside.is_empty());
    assert!(!outside.is_empty());
    assert_eq!(center.bounds(), inside.bounds());
    assert_eq!(center.bounds(), outside.bounds());
}

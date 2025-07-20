use crate::cg::CGPoint;
use skia_safe;
/// A simple (non-self-intersecting) closed polygon shape with optional corner radius.
pub struct SimplePolygonShape {
    pub points: Vec<CGPoint>,
    /// Corner radius in logical pixels.
    /// If <= 0, corner radius is not applied.
    pub corner_radius: f32,
}

/// Returns a polygin path from only points.
pub fn build_path_from_points(points: &[CGPoint]) -> skia_safe::Path {
    let mut path = skia_safe::Path::new();
    let skia_points: Vec<skia_safe::Point> = points.iter().map(|&p| p.into()).collect();
    path.add_poly(&skia_points, true);

    path
}

/// Given:
///   - `pts`: Vec<Point> with your polygon's vertices in order
///   - `r`: the corner‐radius
///
/// Build a Path that walks each edge but rounds each "sharp" corner:
pub fn build_simple_polygon_path(shape: &SimplePolygonShape) -> skia_safe::Path {
    let n = shape.points.len();
    assert!(n >= 3);

    let pts = &shape.points;
    let r = shape.corner_radius;

    let path = build_path_from_points(pts);

    if r <= 0.0 {
        return path;
    }

    let mut paint = skia_safe::Paint::default();
    paint.set_path_effect(skia_safe::PathEffect::corner_path(r));
    let mut dst = skia_safe::Path::new();
    skia_safe::path_utils::fill_path_with_paint(&path, &paint, &mut dst, None, None);

    dst
}

use super::vn::{VectorNetwork, VectorNetworkSegment};
use super::*;
use crate::cg::CGPoint;
use skia_safe;
/// A simple (non-self-intersecting) closed polygon shape with optional corner radius.
pub struct SimplePolygonShape {
    pub points: Vec<CGPoint>,
    /// Corner radius effect to be applied to the path.
    /// If <= 0, corner radius is not applied.
    pub corner_radius: f32,
}

/// Returns a polygon path from only points.
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

    build_corner_radius_path(&path, r)
}

/// Build a [`VectorNetwork`] from the polygon points. Corner radius is ignored
/// in this conversion; resulting network represents the sharp-corner polygon.
#[deprecated(note = "use VectorGeometryShape instead")]
pub fn build_simple_polygon_vector_network(shape: &SimplePolygonShape) -> VectorNetwork {
    let n = shape.points.len();
    assert!(n >= 3);
    let vertices: Vec<(f32, f32)> = shape.points.iter().map(|p| (p.x, p.y)).collect();
    let mut segments: Vec<VectorNetworkSegment> = Vec::with_capacity(n);
    for i in 0..n {
        let a = i;
        let b = (i + 1) % n;
        segments.push(VectorNetworkSegment {
            a,
            b,
            ta: None,
            tb: None,
        });
    }
    VectorNetwork {
        vertices,
        segments,
        regions: vec![],
    }
}

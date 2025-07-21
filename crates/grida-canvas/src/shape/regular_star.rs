use super::*;
use crate::cg::*;
use skia_safe;

/// A Regular Star Polygon shape (that can have irregular / elliptical dimensions)
pub struct RegularStarShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
    /// inner radius in 0..1
    pub inner_radius_ratio: f32,
    /// number of points >= 3
    pub point_count: usize,
    /// Corner radius effect to be applied to the path.
    /// If <= 0, corner radius is not applied.
    pub corner_radius: f32,
}

pub fn build_star_points(shape: &RegularStarShape) -> Vec<CGPoint> {
    let center_x = shape.width / 2.0;
    let center_y = shape.height / 2.0;

    let outer_rx = shape.width / 2.0 * 0.9;
    let outer_ry = shape.height / 2.0 * 0.9;

    let inner_rx = outer_rx * shape.inner_radius_ratio;
    let inner_ry = outer_ry * shape.inner_radius_ratio;

    let mut points: Vec<CGPoint> = Vec::with_capacity(shape.point_count * 2);
    let step = std::f32::consts::PI / shape.point_count as f32;

    for i in 0..(shape.point_count * 2) {
        let angle = i as f32 * step - std::f32::consts::PI / 2.0;
        let (rx, ry) = if i % 2 == 0 {
            (outer_rx, outer_ry)
        } else {
            (inner_rx, inner_ry)
        };
        let x = center_x + rx * angle.cos();
        let y = center_y + ry * angle.sin();
        points.push(CGPoint { x, y });
    }

    points
}

pub fn build_star_path(shape: &RegularStarShape) -> skia_safe::Path {
    let points = build_star_points(shape);

    if points.is_empty() {
        return skia_safe::Path::new();
    }

    build_simple_polygon_path(&SimplePolygonShape {
        points,
        corner_radius: shape.corner_radius,
    })
}

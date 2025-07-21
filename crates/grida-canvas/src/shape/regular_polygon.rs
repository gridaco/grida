use super::*;
use crate::{cg::*, shape::build_simple_polygon_path};

pub struct RegularPolygonShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
    /// Number of points
    pub point_count: usize,
    /// Corner radius effect to be applied to the path.
    /// If <= 0, corner radius is not applied.
    pub corner_radius: f32,
}

pub fn build_regular_polygon_points(shape: &RegularPolygonShape) -> Vec<CGPoint> {
    let center_x = shape.width / 2.0;
    let center_y = shape.height / 2.0;

    let rx = shape.width / 2.0 * 0.9;
    let ry = shape.height / 2.0 * 0.9;

    let mut points: Vec<CGPoint> = Vec::with_capacity(shape.point_count);
    let step = 2.0 * std::f32::consts::PI / shape.point_count as f32;

    for i in 0..shape.point_count {
        let angle = i as f32 * step - std::f32::consts::PI / 2.0;
        let x = center_x + rx * angle.cos();
        let y = center_y + ry * angle.sin();
        points.push(CGPoint { x, y });
    }

    points
}

pub fn build_regular_polygon_path(shape: &RegularPolygonShape) -> skia_safe::Path {
    build_simple_polygon_path(&SimplePolygonShape {
        points: build_regular_polygon_points(shape),
        corner_radius: shape.corner_radius,
    })
}

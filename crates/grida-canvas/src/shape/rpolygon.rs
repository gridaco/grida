use crate::cg::*;

pub struct EllipticalRegularPolygonShape {
    pub width: f32,
    pub height: f32,
    pub point_count: usize,
}

pub fn build_regular_polygon_points(shape: &EllipticalRegularPolygonShape) -> Vec<CGPoint> {
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

use skia_safe;

/// A Regular Star Polygon shape (that can have irregular / elliptical dimensions)
pub struct RectangularStarShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
    /// inner radius in 0..1
    pub inner_radius_ratio: f32,
    /// number of points >= 3
    pub point_count: usize,
}

pub fn build_star_points(shape: &RectangularStarShape) -> Vec<skia_safe::Point> {
    let center_x = shape.width / 2.0;
    let center_y = shape.height / 2.0;

    let outer_rx = shape.width / 2.0 * 0.9;
    let outer_ry = shape.height / 2.0 * 0.9;

    let inner_rx = outer_rx * shape.inner_radius_ratio;
    let inner_ry = outer_ry * shape.inner_radius_ratio;

    let mut points = Vec::with_capacity(shape.point_count * 2);
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
        points.push(skia_safe::Point::new(x, y));
    }

    points
}

pub fn build_star_path(shape: &RectangularStarShape) -> skia_safe::Path {
    let points = build_star_points(shape);

    if points.is_empty() {
        return skia_safe::Path::new();
    }

    let mut path = skia_safe::Path::new();
    path.move_to(points[0]);
    for i in 1..points.len() {
        path.line_to(points[i]);
    }
    path.close();
    path
}

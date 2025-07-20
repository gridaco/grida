use super::*;
use skia_safe::{Path, Rect};

/// A Circular Arc shape (that can have irregular / elliptical dimensions)
pub struct EllipticalArcShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
    /// inner radius in 0..1
    pub inner_radius_ratio: f32,
    /// start angle in degrees
    pub start_angle: f32,
    /// angle in degrees
    pub angle: f32,
    /// Corner radius effect to be applied to the path.
    /// If <= 0, corner radius is not applied.
    pub corner_radius: f32,
}

/// Build a closed arc path for [`EllipticalArcShape`].
pub fn build_arc_path(shape: &EllipticalArcShape) -> Path {
    let mut path = Path::new();

    let cx = shape.width / 2.0;
    let cy = shape.height / 2.0;
    let rx = shape.width / 2.0;
    let ry = shape.height / 2.0;
    let inner_rx = rx * shape.inner_radius_ratio;
    let inner_ry = ry * shape.inner_radius_ratio;

    let start_deg = shape.start_angle;
    let sweep_deg = shape.angle;
    let end_deg = start_deg + sweep_deg;

    let start_rad = start_deg.to_radians();
    let end_rad = end_deg.to_radians();

    let start_point = (cx + rx * start_rad.cos(), cy + ry * start_rad.sin());
    path.move_to(start_point);

    let outer_rect = Rect::from_xywh(cx - rx, cy - ry, rx * 2.0, ry * 2.0);
    path.arc_to(outer_rect, start_deg, sweep_deg, false);

    if shape.inner_radius_ratio > 0.0 {
        let end_inner = (cx + inner_rx * end_rad.cos(), cy + inner_ry * end_rad.sin());
        path.line_to(end_inner);

        let inner_rect =
            Rect::from_xywh(cx - inner_rx, cy - inner_ry, inner_rx * 2.0, inner_ry * 2.0);
        path.arc_to(inner_rect, end_deg, -sweep_deg, false);
    } else {
        path.line_to((cx, cy));
    }

    path.close();

    if shape.corner_radius <= 0.0 {
        return path;
    }

    // FIXME: the corner on arc is not working as expected. - we need to update the path building to align
    build_corner_radius_path(&path, shape.corner_radius)
}

use skia_safe::{Path, PathBuilder, Rect};

/// A Pie / Sector shape
///
/// See:
/// - https://mathworld.wolfram.com/CircularSector.html
pub struct EllipticalSectorShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
    /// start angle in degrees
    pub start_angle: f32,
    /// angle in degrees
    pub angle: f32,
}

pub fn build_sector_path(shape: &EllipticalSectorShape) -> Path {
    let mut builder = PathBuilder::new();

    let cx = shape.width / 2.0;
    let cy = shape.height / 2.0;
    let rx = shape.width / 2.0;
    let ry = shape.height / 2.0;

    let start_deg = shape.start_angle;
    let sweep_deg = shape.angle;

    let start_rad = start_deg.to_radians();

    // Start at the center
    builder.move_to((cx, cy));

    // Draw line to the start point on the outer edge
    let start_point = (cx + rx * start_rad.cos(), cy + ry * start_rad.sin());
    builder.line_to(start_point);

    // Draw the outer arc
    let outer_rect = Rect::from_xywh(cx - rx, cy - ry, rx * 2.0, ry * 2.0);
    builder.arc_to(outer_rect, start_deg, sweep_deg, false);

    // Close the path by drawing a line back to the center
    builder.line_to((cx, cy));

    builder.close();

    builder.detach()
}

use super::*;
use math2::bezier_a2c;
use skia_safe::{Path, Rect};

/// A Elliptical Arc shape (that can have irregular / elliptical dimensions)
pub struct EllipticalRingSectorShape {
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

impl EllipticalRingSectorShape {
    fn _cx(&self) -> f32 {
        self.width / 2.0
    }

    fn _cy(&self) -> f32 {
        self.height / 2.0
    }

    fn _rx(&self) -> f32 {
        self.width / 2.0
    }

    fn _ry(&self) -> f32 {
        self.height / 2.0
    }

    fn _inner_rx(&self) -> f32 {
        self.width / 2.0 * self.inner_radius_ratio
    }

    fn _inner_ry(&self) -> f32 {
        self.height / 2.0 * self.inner_radius_ratio
    }
}

/// Build a closed arc path for [`EllipticalArcShape`].
pub fn build_ring_sector_path(shape: &EllipticalRingSectorShape) -> Path {
    if shape.corner_radius <= 0.0 {
        __build_ring_sector_path_no_corner_with_arc_to(&shape)
    } else {
        // TODO: this is a trick for implementing the corner to a ring sector.
        // do it the right way later.
        #[allow(deprecated)]
        __build_ring_sector_path_with_corner_6subpath(&shape)
    }
}

/// Build a closed arc path for [`EllipticalArcShape`] without corner radius.
/// This uses `arc_to` to build the path.
fn __build_ring_sector_path_no_corner_with_arc_to(shape: &EllipticalRingSectorShape) -> Path {
    let mut path = Path::new();

    let cx = shape._cx();
    let cy = shape._cy();
    let rx = shape._rx();
    let ry = shape._ry();
    let inner_rx = shape._inner_rx();
    let inner_ry = shape._inner_ry();

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

    path
}

/// Build a closed arc path for [`EllipticalRingSectorShape`] with corner radius.
/// This draws arcs for the corners instead of relying on the `corner_path` effect.
///
/// **Limitations**
/// The path will overlap
///
/// See:
/// - https://stackoverflow.com/a/57921952
#[deprecated]
fn __build_ring_sector_path_with_corner_6subpath(shape: &EllipticalRingSectorShape) -> Path {
    let mut path = Path::new();

    let cx = shape._cx();
    let cy = shape._cy();
    let rx = shape._rx();
    let ry = shape._ry();
    let inner_rx = shape._inner_rx();
    let inner_ry = shape._inner_ry();
    let r = shape.corner_radius;

    let start_deg = shape.start_angle;
    let sweep_deg = shape.angle;
    let end_deg = start_deg + sweep_deg;

    let start_rad = start_deg.to_radians();
    let end_rad = end_deg.to_radians();

    // Start point on outer arc
    let start_x = cx + rx * start_rad.cos();
    let start_y = cy + ry * start_rad.sin();
    path.move_to((start_x, start_y));

    // Outer arc
    let outer_rect = Rect::from_xywh(cx - rx, cy - ry, rx * 2.0, ry * 2.0);
    path.arc_to(outer_rect, start_deg, sweep_deg, false);

    // Determine sweep direction sign
    let dir = if sweep_deg >= 0.0 { 1.0 } else { -1.0 };

    // Outer finish corner
    let ofc_x = cx + (rx - r) * end_rad.cos();
    let ofc_y = cy + (ry - r) * end_rad.sin();
    let ofc_rect = Rect::from_xywh(ofc_x - r, ofc_y - r, r * 2.0, r * 2.0);
    path.arc_to(ofc_rect, end_deg, 90.0 * dir, false);

    // Inner finish corner
    let ifc_x = cx + (inner_rx + r) * end_rad.cos();
    let ifc_y = cy + (inner_ry + r) * end_rad.sin();
    let ifc_rect = Rect::from_xywh(ifc_x - r, ifc_y - r, r * 2.0, r * 2.0);
    path.arc_to(ifc_rect, end_deg + 90.0 * dir, 90.0 * dir, false);

    // Inner arc
    let inner_rect = Rect::from_xywh(cx - inner_rx, cy - inner_ry, inner_rx * 2.0, inner_ry * 2.0);
    path.arc_to(inner_rect, end_deg, -sweep_deg, false);

    // Inner start corner
    let isc_x = cx + (inner_rx + r) * start_rad.cos();
    let isc_y = cy + (inner_ry + r) * start_rad.sin();
    let isc_rect = Rect::from_xywh(isc_x - r, isc_y - r, r * 2.0, r * 2.0);
    path.arc_to(isc_rect, start_deg + 180.0 * dir, 90.0 * dir, false);

    // Outer start corner
    let osc_x = cx + (rx - r) * start_rad.cos();
    let osc_y = cy + (ry - r) * start_rad.sin();
    let osc_rect = Rect::from_xywh(osc_x - r, osc_y - r, r * 2.0, r * 2.0);
    path.arc_to(osc_rect, start_deg + 270.0 * dir, 90.0 * dir, false);

    path.close();

    path
}

/// Build a closed arc path for [`EllipticalArcShape`] without corner radius.
/// This uses 8 cubic bezier curves (total of 16) to build the path.
/// This method is recommended for after applying corner.
///
/// for inner / outer arc, it uses 8 each points (16 in total)
///     => "MCCCCCCCCLCCCCCCCCLZ"
/// if the sweep < 180, it uses 4 points (8 in total)
///
/// FIXME: this needs to be revised, the path building does not aligns with the corner radius handling.
fn __build_ring_sector_path_no_corner_with_cubic_to(shape: &EllipticalRingSectorShape) -> Path {
    let mut path = Path::new();

    let cx = shape._cx();
    let cy = shape._cy();
    let rx = shape._rx();
    let ry = shape._ry();
    let inner_rx = shape._inner_rx();
    let inner_ry = shape._inner_ry();

    let start_deg = shape.start_angle;
    let sweep_deg = shape.angle;
    let end_deg = start_deg + sweep_deg;

    let start_rad = start_deg.to_radians();
    let end_rad = end_deg.to_radians();

    // Calculate start and end points for outer arc
    let start_x = cx + rx * start_rad.cos();
    let start_y = cy + ry * start_rad.sin();
    let end_x = cx + rx * end_rad.cos();
    let end_y = cy + ry * end_rad.sin();

    // Move to start point
    path.move_to((start_x, start_y));

    // Draw outer arc using cubic bezier curves
    let outer_bezier_points = bezier_a2c(
        start_x,
        start_y,
        rx,
        ry,
        0.0,                     // angle (no rotation)
        sweep_deg.abs() > 180.0, // large_arc_flag
        sweep_deg > 0.0,         // sweep_flag
        end_x,
        end_y,
        None,
    );

    // Add cubic bezier curves for outer arc
    for chunk in outer_bezier_points.chunks(6) {
        if let [c1x, c1y, c2x, c2y, x, y] = chunk {
            path.cubic_to((*c1x, *c1y), (*c2x, *c2y), (*x, *y));
        }
    }

    // Draw line to inner arc end point (if inner radius exists)
    if shape.inner_radius_ratio > 0.0 {
        let end_inner_x = cx + inner_rx * end_rad.cos();
        let end_inner_y = cy + inner_ry * end_rad.sin();
        path.line_to((end_inner_x, end_inner_y));

        // Calculate start point for inner arc
        let start_inner_x = cx + inner_rx * start_rad.cos();
        let start_inner_y = cy + inner_ry * start_rad.sin();

        // Draw inner arc using cubic bezier curves (in reverse direction)
        let inner_bezier_points = bezier_a2c(
            end_inner_x,
            end_inner_y,
            inner_rx,
            inner_ry,
            0.0,                     // angle (no rotation)
            sweep_deg.abs() > 180.0, // large_arc_flag
            false,                   // sweep_flag (reverse direction)
            start_inner_x,
            start_inner_y,
            None,
        );

        // Add cubic bezier curves for inner arc
        for chunk in inner_bezier_points.chunks(6) {
            if let [c1x, c1y, c2x, c2y, x, y] = chunk {
                path.cubic_to((*c1x, *c1y), (*c2x, *c2y), (*x, *y));
            }
        }

        // explicit closing line back to the outer start point helps
        // [`build_corner_radius_path`] apply the corner effect correctly.
        path.line_to((start_x, start_y));
    } else {
        // If no inner radius, draw line to center
        path.line_to((cx, cy));
    }

    path.close();
    path
}

use super::*;
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
        return __build_ring_sector_path_no_corner_with_arc_to(&shape);
    } else {
        // FIXME: the corner on arc is not working as expected. - we need to update the path building to align
        let path = __build_ring_sector_path_no_corner_with_cubic_to(&shape);
        return build_corner_radius_path(&path, shape.corner_radius);
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

/// Build a closed arc path for [`EllipticalArcShape`] without corner radius.
/// This uses 8 cubic bezier curves (total of 16) to build the path.
/// This method is recommended for after applying corner.
///
/// for inner / outer arc, it uses 8 each points (16 in total)
///     => "MCCCCCCCCLCCCCCCCCLZ"
/// if the sweep < 180, it uses 4 points (8 in total)
///
fn __build_ring_sector_path_no_corner_with_cubic_to(shape: &EllipticalRingSectorShape) -> Path {
    // TODO:
    let mut path = Path::new();
    path.close();
    path
}

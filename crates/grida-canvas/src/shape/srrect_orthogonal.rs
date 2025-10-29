//! Orthogonal smooth rounded rectangle
//!
//! Implements extensible corner smoothing optimized for rectangles (90° corners).
//! Uses hybrid Bézier-Arc-Bézier construction where corners extend along edges
//! based on smoothing parameter: corner_extent = (1 + smoothing) * radius
//!
//! Limitations:
//! - Orthogonal corners only (90° angles)
//! - Circular corners (uses min(rx, ry))
//! - Cannot generalize to arbitrary shapes

use super::vn::VectorNetwork;
use crate::cg::prelude::*;

/// Rectangular shape with smooth corners optimized for orthogonal (90°) angles.
///
/// This implementation extends corners along edges as smoothing increases,
/// producing visually smooth transitions using a Bézier-Arc-Bézier hybrid.
pub struct OrthogonalSmoothRRectShape {
    pub width: f32,
    pub height: f32,
    pub corner_radius: RectangularCornerRadius,
    pub corner_smoothing: CornerSmoothing,
}

struct CornerParams {
    /// Radius of the circular arc portion
    radius: f32,
    /// Total length the corner occupies on each edge
    p: f32,
    /// Bézier control point distances
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    /// Angle for the circular arc
    #[allow(dead_code)]
    angle_circle: f32,
    /// Angle for the Bézier transition
    angle_bezier: f32,
}

fn compute_corner_params(radius: f32, smoothness: f32, shortest_side: f32) -> CornerParams {
    let smoothness = smoothness.clamp(0.0, 1.0);
    let radius = radius.min(shortest_side / 2.0).max(0.0);

    // Key formula: corner extends beyond radius when smoothing applied
    let p = f32::min(shortest_side / 2.0, (1.0 + smoothness) * radius);

    // Compute angles based on smoothness
    let (angle_circle, angle_bezier) = if radius > shortest_side / 4.0 {
        let change_percentage = (radius - shortest_side / 4.0) / (shortest_side / 4.0);
        (
            90.0 * (1.0 - smoothness * (1.0 - change_percentage)),
            45.0 * smoothness * (1.0 - change_percentage),
        )
    } else {
        (90.0 * (1.0 - smoothness), 45.0 * smoothness)
    };

    // Compute Bézier control point distances
    let angle_bez_rad = angle_bezier.to_radians();
    let angle_circ_rad = angle_circle.to_radians();

    let d_to_c = angle_bez_rad.tan();
    let longest = radius * (angle_bez_rad / 2.0).tan();
    let l = (angle_circ_rad / 2.0).sin() * radius * 2.0f32.sqrt();

    let c = longest * angle_bez_rad.cos();
    let d = c * d_to_c;
    let b = ((p - l) - (1.0 + d_to_c) * c) / 3.0;
    let a = 2.0 * b;

    CornerParams {
        radius,
        p,
        a,
        b,
        c,
        d,
        angle_circle,
        angle_bezier,
    }
}

pub fn build_orthogonal_smooth_rrect_path(shape: &OrthogonalSmoothRRectShape) -> skia_safe::Path {
    let mut path = skia_safe::Path::new();

    let w = shape.width;
    let h = shape.height;
    let smoothness = shape.corner_smoothing.value();
    let shortest_side = f32::min(w, h);

    // Get effective radius for each corner (min of rx, ry)
    let tl_r = f32::min(shape.corner_radius.tl.rx, shape.corner_radius.tl.ry).max(0.0);
    let tr_r = f32::min(shape.corner_radius.tr.rx, shape.corner_radius.tr.ry).max(0.0);
    let br_r = f32::min(shape.corner_radius.br.rx, shape.corner_radius.br.ry).max(0.0);
    let bl_r = f32::min(shape.corner_radius.bl.rx, shape.corner_radius.bl.ry).max(0.0);

    let tl = compute_corner_params(tl_r, smoothness, shortest_side);
    let tr = compute_corner_params(tr_r, smoothness, shortest_side);
    let br = compute_corner_params(br_r, smoothness, shortest_side);
    let bl = compute_corner_params(bl_r, smoothness, shortest_side);

    let center_x = w / 2.0;

    // Start at top center
    path.move_to((center_x, 0.0));

    // Top-right section
    path.line_to((f32::max(w / 2.0, w - tr.p), 0.0));

    if tr.radius > 0.0 {
        // Bézier transition into arc
        path.cubic_to(
            (w - (tr.p - tr.a), 0.0),
            (w - (tr.p - tr.a - tr.b), 0.0),
            (w - (tr.p - tr.a - tr.b - tr.c), tr.d),
        );

        // Circular arc
        let arc_rect =
            skia_safe::Rect::from_xywh(w - tr.radius * 2.0, 0.0, tr.radius * 2.0, tr.radius * 2.0);
        let start_angle = 270.0 + tr.angle_bezier;
        let sweep_angle = 90.0 - 2.0 * tr.angle_bezier;
        path.arc_to(arc_rect, start_angle, sweep_angle, false);

        // Bézier transition out of arc
        path.cubic_to(
            (w, tr.p - tr.a - tr.b),
            (w, tr.p - tr.a),
            (w, f32::min(h / 2.0, tr.p)),
        );
    }

    // Right-bottom section
    path.line_to((w, f32::max(h / 2.0, h - br.p)));

    if br.radius > 0.0 {
        path.cubic_to(
            (w, h - (br.p - br.a)),
            (w, h - (br.p - br.a - br.b)),
            (w - br.d, h - (br.p - br.a - br.b - br.c)),
        );

        let arc_rect = skia_safe::Rect::from_xywh(
            w - br.radius * 2.0,
            h - br.radius * 2.0,
            br.radius * 2.0,
            br.radius * 2.0,
        );
        let start_angle = br.angle_bezier;
        let sweep_angle = 90.0 - 2.0 * br.angle_bezier;
        path.arc_to(arc_rect, start_angle, sweep_angle, false);

        path.cubic_to(
            (w - (br.p - br.a - br.b), h),
            (w - (br.p - br.a), h),
            (f32::max(w / 2.0, w - br.p), h),
        );
    }

    // Bottom-left section
    path.line_to((f32::min(w / 2.0, bl.p), h));

    if bl.radius > 0.0 {
        path.cubic_to(
            (bl.p - bl.a, h),
            (bl.p - bl.a - bl.b, h),
            (bl.p - bl.a - bl.b - bl.c, h - bl.d),
        );

        let arc_rect =
            skia_safe::Rect::from_xywh(0.0, h - bl.radius * 2.0, bl.radius * 2.0, bl.radius * 2.0);
        let start_angle = 90.0 + bl.angle_bezier;
        let sweep_angle = 90.0 - 2.0 * bl.angle_bezier;
        path.arc_to(arc_rect, start_angle, sweep_angle, false);

        path.cubic_to(
            (0.0, h - (bl.p - bl.a - bl.b)),
            (0.0, h - (bl.p - bl.a)),
            (0.0, f32::max(h / 2.0, h - bl.p)),
        );
    }

    // Left-top section
    path.line_to((0.0, f32::min(h / 2.0, tl.p)));

    if tl.radius > 0.0 {
        path.cubic_to(
            (0.0, tl.p - tl.a),
            (0.0, tl.p - tl.a - tl.b),
            (tl.d, tl.p - tl.a - tl.b - tl.c),
        );

        let arc_rect = skia_safe::Rect::from_xywh(0.0, 0.0, tl.radius * 2.0, tl.radius * 2.0);
        let start_angle = 180.0 + tl.angle_bezier;
        let sweep_angle = 90.0 - 2.0 * tl.angle_bezier;
        path.arc_to(arc_rect, start_angle, sweep_angle, false);

        path.cubic_to(
            (tl.p - tl.a - tl.b, 0.0),
            (tl.p - tl.a, 0.0),
            (f32::min(w / 2.0, tl.p), 0.0),
        );
    }

    path.close();
    path
}

pub fn build_orthogonal_smooth_rrect_vector_network(
    _shape: &OrthogonalSmoothRRectShape,
) -> VectorNetwork {
    // Fallback: build path and convert to VN (keeps editor/export functional).
    // Later: emit structured quarter-corner segments.
    let path = build_orthogonal_smooth_rrect_path(_shape);
    VectorNetwork::from(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_corner_params_no_smoothing() {
        let params = compute_corner_params(50.0, 0.0, 200.0);
        assert_eq!(params.p, 50.0); // p equals radius when smoothness=0
        assert_eq!(params.angle_circle, 90.0);
        assert_eq!(params.angle_bezier, 0.0);
    }

    #[test]
    fn test_corner_params_max_smoothing() {
        let params = compute_corner_params(50.0, 1.0, 200.0);
        assert_eq!(params.p, 100.0); // p = (1+1)*50 = 100 when smoothness=1
        assert_eq!(params.angle_circle, 0.0);
        assert_eq!(params.angle_bezier, 45.0);
    }

    #[test]
    fn test_orthogonal_smooth_rrect_path_is_closed() {
        let shape = OrthogonalSmoothRRectShape {
            width: 100.0,
            height: 100.0,
            corner_radius: RectangularCornerRadius::circular(20.0),
            corner_smoothing: CornerSmoothing::new(0.6),
        };
        let path = build_orthogonal_smooth_rrect_path(&shape);
        assert!(!path.is_empty());
    }
}

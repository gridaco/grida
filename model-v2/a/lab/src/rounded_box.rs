//! Pure point containment for the rounded-box geometry shared by clips and
//! the proving renderer.

use crate::model::{CornerSmoothing, Radius, RectangularCornerRadius};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SmoothCornerParams {
    pub radius: f32,
    pub extent: f32,
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub bezier_angle: f32,
}

pub fn smooth_corner_params(radius: f32, smoothing: f32, shortest_side: f32) -> SmoothCornerParams {
    let smoothing = smoothing.clamp(0.0, 1.0);
    let radius = radius.min(shortest_side / 2.0).max(0.0);
    let extent = ((1.0 + smoothing) * radius).min(shortest_side / 2.0);
    let (circle_angle, bezier_angle) = if radius > shortest_side / 4.0 {
        let change = (radius - shortest_side / 4.0) / (shortest_side / 4.0);
        (
            90.0 * (1.0 - smoothing * (1.0 - change)),
            45.0 * smoothing * (1.0 - change),
        )
    } else {
        (90.0 * (1.0 - smoothing), 45.0 * smoothing)
    };
    let bezier_radians = bezier_angle.to_radians();
    let circle_radians = circle_angle.to_radians();
    let tangent = bezier_radians.tan();
    let longest = radius * (bezier_radians / 2.0).tan();
    let arc_chord = (circle_radians / 2.0).sin() * radius * 2.0_f32.sqrt();
    let c = longest * bezier_radians.cos();
    let d = c * tangent;
    let b = ((extent - arc_chord) - (1.0 + tangent) * c) / 3.0;
    SmoothCornerParams {
        radius,
        extent,
        a: 2.0 * b,
        b,
        c,
        d,
        bezier_angle,
    }
}

/// Normalize ordinary elliptical radii with Skia's `SkRRect` discipline.
///
/// This is the backend-independent geometry used by hit testing. Raster code
/// should pass authored radii directly to `SkRRect` so the backend performs
/// the same normalization exactly once rather than re-normalizing this result.
pub fn normalize_radii(
    width: f32,
    height: f32,
    mut radius: RectangularCornerRadius,
) -> RectangularCornerRadius {
    if !width.is_finite()
        || !height.is_finite()
        || width <= 0.0
        || height <= 0.0
        || ![
            radius.tl.rx,
            radius.tl.ry,
            radius.tr.rx,
            radius.tr.ry,
            radius.br.rx,
            radius.br.ry,
            radius.bl.rx,
            radius.bl.ry,
        ]
        .into_iter()
        .all(f32::is_finite)
    {
        return RectangularCornerRadius::default();
    }

    // SkRRect makes a corner square when either component is non-positive.
    // Do this before computing the global W3 overlap scale: a surviving axis
    // of a square corner must not influence the other corners.
    for corner in [
        &mut radius.tl,
        &mut radius.tr,
        &mut radius.br,
        &mut radius.bl,
    ] {
        if corner.rx <= 0.0 || corner.ry <= 0.0 {
            *corner = Radius::default();
        }
    }

    // Skia intentionally performs these sums and ratios in double precision.
    // In f32, two finite extreme radii can overflow their sum and collapse the
    // scale to zero (crbug.com/463920).
    let width = f64::from(width);
    let height = f64::from(height);
    let mut scale = 1.0_f64;
    for (limit, first, second) in [
        (width, radius.tl.rx, radius.tr.rx),
        (height, radius.tr.ry, radius.br.ry),
        (width, radius.br.rx, radius.bl.rx),
        (height, radius.bl.ry, radius.tl.ry),
    ] {
        let sum = f64::from(first) + f64::from(second);
        if sum > limit {
            scale = scale.min(limit / sum);
        }
    }

    // If float addition cannot distinguish the smaller radius, Skia flushes
    // it before applying the already-computed global scale.
    flush_swallowed_radius(&mut radius.tl.rx, &mut radius.tr.rx);
    flush_swallowed_radius(&mut radius.tr.ry, &mut radius.br.ry);
    flush_swallowed_radius(&mut radius.br.rx, &mut radius.bl.rx);
    flush_swallowed_radius(&mut radius.bl.ry, &mut radius.tl.ry);

    if scale < 1.0 {
        adjust_side(width, scale, &mut radius.tl.rx, &mut radius.tr.rx);
        adjust_side(height, scale, &mut radius.tr.ry, &mut radius.br.ry);
        adjust_side(width, scale, &mut radius.br.rx, &mut radius.bl.rx);
        adjust_side(height, scale, &mut radius.bl.ry, &mut radius.tl.ry);
    }

    // A zero x or y radius is a square corner in Skia; its companion cannot
    // remain active after flushing or side adjustment.
    for corner in [
        &mut radius.tl,
        &mut radius.tr,
        &mut radius.br,
        &mut radius.bl,
    ] {
        if corner.rx <= 0.0 || corner.ry <= 0.0 {
            *corner = Radius::default();
        }
    }

    radius
}

fn flush_swallowed_radius(a: &mut f32, b: &mut f32) {
    if *a + *b == *a {
        *b = 0.0;
    } else if *a + *b == *b {
        *a = 0.0;
    }
}

fn adjust_side(limit: f64, scale: f64, a: &mut f32, b: &mut f32) {
    *a = (f64::from(*a) * scale) as f32;
    *b = (f64::from(*b) * scale) as f32;

    if f64::from(*a + *b) <= limit {
        return;
    }

    let (smaller, larger) = if *a <= *b { (a, b) } else { (b, a) };
    let smaller_value = *smaller;
    let mut larger_value = (limit - f64::from(smaller_value)) as f32;
    while f64::from(larger_value + smaller_value) > limit {
        larger_value = next_down_nonnegative(larger_value);
    }
    *larger = larger_value;
}

fn next_down_nonnegative(value: f32) -> f32 {
    if value > 0.0 {
        f32::from_bits(value.to_bits() - 1)
    } else {
        0.0
    }
}

fn ordinary_corner_contains(x: f32, y: f32, radius: Radius) -> bool {
    if radius.rx == 0.0 || radius.ry == 0.0 || x >= radius.rx || y >= radius.ry {
        return true;
    }
    let nx = (x - radius.rx) / radius.rx;
    let ny = (y - radius.ry) / radius.ry;
    nx * nx + ny * ny <= 1.0
}

fn cubic(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    let u = 1.0 - t;
    u * u * u * p0 + 3.0 * u * u * t * p1 + 3.0 * u * t * t * p2 + t * t * t * p3
}

fn smooth_corner_contains(mut x: f32, mut y: f32, corner: SmoothCornerParams) -> bool {
    if corner.radius == 0.0 || x >= corner.extent || y >= corner.extent {
        return true;
    }
    if y > x {
        std::mem::swap(&mut x, &mut y);
    }
    let diagonal = corner.radius * (1.0 - std::f32::consts::FRAC_1_SQRT_2);
    if y >= diagonal {
        return true;
    }
    let boundary = if corner.d > 0.0 && y <= corner.d {
        let t = (y / corner.d).cbrt();
        cubic(
            corner.extent,
            corner.extent - corner.a,
            corner.extent - corner.a - corner.b,
            corner.extent - corner.a - corner.b - corner.c,
            t,
        )
    } else {
        let dy = y - corner.radius;
        corner.radius - (corner.radius * corner.radius - dy * dy).max(0.0).sqrt()
    };
    x >= boundary
}

/// Test a local-space point against the renderer's ordinary elliptical
/// rounded rectangle or its production circular smooth-corner path. Boundary
/// points are contained; no curve flattening or surrogate superellipse is
/// used.
pub fn contains(
    width: f32,
    height: f32,
    corner_radius: RectangularCornerRadius,
    corner_smoothing: CornerSmoothing,
    point: (f32, f32),
) -> bool {
    let (x, y) = point;
    if ![width, height, x, y].iter().all(|value| value.is_finite())
        || width <= 0.0
        || height <= 0.0
        || x < 0.0
        || x > width
        || y < 0.0
        || y > height
    {
        return false;
    }
    if corner_radius.is_zero() {
        return true;
    }
    if corner_smoothing.is_zero() {
        let radius = normalize_radii(width, height, corner_radius);
        return ordinary_corner_contains(x, y, radius.tl)
            && ordinary_corner_contains(width - x, y, radius.tr)
            && ordinary_corner_contains(width - x, height - y, radius.br)
            && ordinary_corner_contains(x, height - y, radius.bl);
    }

    let shortest_side = width.min(height);
    let smoothing = corner_smoothing.value();
    [
        (x, y, corner_radius.tl),
        (width - x, y, corner_radius.tr),
        (width - x, height - y, corner_radius.br),
        (x, height - y, corner_radius.bl),
    ]
    .into_iter()
    .all(|(x, y, radius)| {
        smooth_corner_contains(
            x,
            y,
            smooth_corner_params(radius.rx.min(radius.ry), smoothing, shortest_side),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordinary_corner_uses_true_ellipse_geometry() {
        let radius = RectangularCornerRadius::circular(30.0);
        assert!(!contains(
            100.0,
            80.0,
            radius,
            CornerSmoothing::default(),
            (1.0, 1.0)
        ));
        assert!(contains(
            100.0,
            80.0,
            radius,
            CornerSmoothing::default(),
            (50.0, 1.0)
        ));
        assert!(contains(
            100.0,
            80.0,
            radius,
            CornerSmoothing::default(),
            (50.0, 40.0)
        ));
    }

    #[test]
    fn degenerate_rounded_box_has_no_clip_coverage() {
        for radius in [
            RectangularCornerRadius::default(),
            RectangularCornerRadius::circular(12.0),
        ] {
            assert!(!contains(
                0.0,
                40.0,
                radius,
                CornerSmoothing::default(),
                (0.0, 20.0)
            ));
            assert!(!contains(
                40.0,
                0.0,
                radius,
                CornerSmoothing::default(),
                (20.0, 0.0)
            ));
        }
    }

    #[test]
    fn ordinary_radii_use_skia_proportional_overlap_normalization() {
        assert_eq!(
            normalize_radii(100.0, 60.0, RectangularCornerRadius::circular(80.0)),
            RectangularCornerRadius::circular(30.0)
        );
        let elliptical = RectangularCornerRadius {
            tl: Radius { rx: 80.0, ry: 20.0 },
            tr: Radius { rx: 40.0, ry: 10.0 },
            br: Radius { rx: 20.0, ry: 30.0 },
            bl: Radius { rx: 10.0, ry: 40.0 },
        };
        let normalized = normalize_radii(60.0, 60.0, elliptical);
        assert_eq!(normalized.tl, Radius { rx: 40.0, ry: 10.0 });
        assert_eq!(normalized.tr, Radius { rx: 20.0, ry: 5.0 });
        assert_eq!(normalized.br, Radius { rx: 10.0, ry: 15.0 });
        assert_eq!(normalized.bl, Radius { rx: 5.0, ry: 20.0 });
    }

    #[test]
    fn ordinary_radii_match_skia_for_extreme_finite_values() {
        assert_eq!(
            normalize_radii(100.0, 60.0, RectangularCornerRadius::circular(f32::MAX)),
            RectangularCornerRadius::circular(30.0)
        );

        let extreme = RectangularCornerRadius {
            tl: Radius {
                rx: f32::MAX,
                ry: 48.0,
            },
            tr: Radius { rx: 1.0, ry: 7.0 },
            br: Radius {
                rx: f32::MAX,
                ry: 29.0,
            },
            bl: Radius { rx: 3.0, ry: 9.0 },
        };
        let normalized = normalize_radii(100.0, 60.0, extreme);
        assert!(
            normalized.tl.rx > 0.0,
            "finite extremes must not overflow to zero"
        );
        assert!(
            normalized.br.rx > 0.0,
            "finite extremes must not overflow to zero"
        );
        assert!(normalized.tl.rx + normalized.tr.rx <= 100.0);
        assert!(normalized.br.rx + normalized.bl.rx <= 100.0);
        assert!(normalized.tr.ry + normalized.br.ry <= 60.0);
        assert!(normalized.bl.ry + normalized.tl.ry <= 60.0);
        assert_eq!(normalize_radii(100.0, 60.0, normalized), normalized);
    }

    #[test]
    fn ordinary_radii_square_a_corner_when_either_axis_is_zero() {
        let radius = RectangularCornerRadius {
            tl: Radius { rx: 30.0, ry: 0.0 },
            tr: Radius { rx: 8.0, ry: 9.0 },
            br: Radius { rx: 7.0, ry: 6.0 },
            bl: Radius { rx: 5.0, ry: 4.0 },
        };
        let normalized = normalize_radii(100.0, 60.0, radius);
        assert_eq!(normalized.tl, Radius::default());
        assert_eq!(normalized.tr, radius.tr);
        assert_eq!(normalized.br, radius.br);
        assert_eq!(normalized.bl, radius.bl);
    }

    #[test]
    fn smooth_corner_params_apply_the_production_half_short_side_cap() {
        assert_eq!(
            smooth_corner_params(80.0, 0.6, 100.0),
            smooth_corner_params(50.0, 0.6, 100.0)
        );
    }
}

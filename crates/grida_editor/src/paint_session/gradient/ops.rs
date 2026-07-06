//! Pure value edits on a gradient's stops, and the ramp
//! parametrization that places a stop on the frame
//! (`docs/wg/canvas/paint-session/gradient.md`, `GRAD-6/7`). No editor,
//! no rendering — the machine ([`super::mode`]) and the panel call
//! these and own what the results mean.

use grida::cg::prelude::{CGColor, GradientStop};
use math2::vector2::{self, Vector2};

use super::frame::{Frame, GradientType};

/// The minimum stop count a gradient keeps (`GRAD-6`).
pub const MIN_STOPS: usize = 2;

/// Insert a stop at `offset` (clamped `[0,1]`), keeping the list ordered
/// by offset. Ties break **just after** any equal-offset stops (the
/// insert lands before the first strictly-greater one), so equal offsets
/// are ordered deterministically (`GRAD-7`). Returns the inserted index.
pub fn insert_stop(stops: &mut Vec<GradientStop>, offset: f32, color: CGColor) -> usize {
    let offset = offset.clamp(0.0, 1.0);
    let at = stops
        .iter()
        .position(|s| s.offset > offset)
        .unwrap_or(stops.len());
    stops.insert(at, GradientStop { offset, color });
    at
}

/// Remove the stop at `index`, refusing the removal that would leave
/// fewer than [`MIN_STOPS`] (`GRAD-6`). Returns whether it was removed.
pub fn remove_stop(stops: &mut Vec<GradientStop>, index: usize) -> bool {
    if stops.len() <= MIN_STOPS || index >= stops.len() {
        return false;
    }
    stops.remove(index);
    true
}

/// Move the stop at `index` to `offset` (clamped `[0,1]`), re-sorting by
/// offset. Returns the stop's new index (it may cross a neighbour).
pub fn move_stop(stops: &mut Vec<GradientStop>, index: usize, offset: f32) -> usize {
    if index >= stops.len() {
        return index;
    }
    let color = stops.remove(index).color;
    insert_stop(stops, offset, color)
}

/// The interpolated color of the ramp at `offset` — the natural color
/// for a stop inserted there (`GRAD-7`). Stops are assumed ordered;
/// clamps to the ends, linear between neighbours. Empty → transparent.
pub fn color_at(stops: &[GradientStop], offset: f32) -> CGColor {
    match stops.first() {
        None => CGColor::TRANSPARENT,
        Some(first) if offset <= first.offset => first.color,
        Some(_) => {
            let last = stops.last().unwrap();
            if offset >= last.offset {
                return last.color;
            }
            let hi = stops.iter().position(|s| s.offset >= offset).unwrap();
            let (a, b) = (&stops[hi - 1], &stops[hi]);
            let span = b.offset - a.offset;
            let t = if span <= f32::EPSILON {
                0.0
            } else {
                (offset - a.offset) / span
            };
            lerp_color(a.color, b.color, t)
        }
    }
}

fn lerp_color(a: CGColor, b: CGColor, t: f32) -> CGColor {
    let mix = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * t).round() as u8;
    CGColor {
        r: mix(a.r, b.r),
        g: mix(a.g, b.g),
        b: mix(a.b, b.b),
        a: mix(a.a, b.a),
    }
}

/// The unit-space point on the ramp path at position `t` (`GRAD-7`):
/// along the `origin→primary` axis for linear/radial/diamond; on the
/// ellipse (`origin + cos·(primary−origin) + sin·(secondary−origin)`,
/// `φ = 2π·t`) for sweep, so the stops ride the actual ring, not a
/// plain-radius circle.
pub fn offset_to_point(ty: GradientType, frame: &Frame, t: f32) -> Vector2 {
    let o = frame.origin;
    let p = frame.primary;
    match ty {
        GradientType::Sweep => {
            let s = frame.secondary.unwrap_or(p);
            let (sin, cos) = (t * std::f32::consts::TAU).sin_cos();
            [
                o[0] + cos * (p[0] - o[0]) + sin * (s[0] - o[0]),
                o[1] + cos * (p[1] - o[1]) + sin * (s[1] - o[1]),
            ]
        }
        _ => [o[0] + (p[0] - o[0]) * t, o[1] + (p[1] - o[1]) * t],
    }
}

/// The unit-space tangent of the ramp path at `t` (not normalized) —
/// used to orient a stop chip along the track. Constant along the axis
/// for linear/radial/diamond; the ellipse derivative for sweep.
pub fn tangent_at(ty: GradientType, frame: &Frame, t: f32) -> Vector2 {
    let o = frame.origin;
    let p = frame.primary;
    match ty {
        GradientType::Sweep => {
            let s = frame.secondary.unwrap_or(p);
            let (sin, cos) = (t * std::f32::consts::TAU).sin_cos();
            [
                -sin * (p[0] - o[0]) + cos * (s[0] - o[0]),
                -sin * (p[1] - o[1]) + cos * (s[1] - o[1]),
            ]
        }
        _ => [p[0] - o[0], p[1] - o[1]],
    }
}

/// The ramp position of a unit-space point — the inverse of
/// [`offset_to_point`], clamped to `[0,1]` (`GRAD-7`).
pub fn point_to_offset(ty: GradientType, frame: &Frame, point: Vector2) -> f32 {
    let o = frame.origin;
    let p = frame.primary;
    match ty {
        GradientType::Sweep => {
            // Angle from the primary direction to the point (same sense
            // as the parametric `φ = 2π·t`), normalized to `[0,1]`.
            let ar = vector2::angle(o, p);
            let aq = vector2::angle(o, point);
            (((aq - ar + 360.0) % 360.0) / 360.0).clamp(0.0, 1.0)
        }
        _ => {
            let axis = [p[0] - o[0], p[1] - o[1]];
            let len2 = axis[0] * axis[0] + axis[1] * axis[1];
            if len2 <= f32::EPSILON {
                return 0.0;
            }
            let rel = [point[0] - o[0], point[1] - o[1]];
            ((rel[0] * axis[0] + rel[1] * axis[1]) / len2).clamp(0.0, 1.0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stop(offset: f32, rgba: u32) -> GradientStop {
        GradientStop {
            offset,
            color: CGColor::from_u32(rgba),
        }
    }

    fn two() -> Vec<GradientStop> {
        vec![stop(0.0, 0x000000FF), stop(1.0, 0xFFFFFFFF)]
    }

    // -- GRAD-6: ordered, ≥2 stops ---------------------------------------------

    #[test]
    fn grad_6_insert_keeps_offset_order_and_returns_index() {
        let mut s = two();
        let at = insert_stop(&mut s, 0.5, CGColor::RED);
        assert_eq!(at, 1);
        assert_eq!(
            s.iter().map(|s| s.offset).collect::<Vec<_>>(),
            [0.0, 0.5, 1.0]
        );
    }

    #[test]
    fn grad_6_insert_clamps_out_of_range() {
        let mut s = two();
        insert_stop(&mut s, 5.0, CGColor::RED);
        assert_eq!(s.last().unwrap().offset, 1.0);
    }

    #[test]
    fn grad_6_remove_refuses_below_two() {
        let mut s = two();
        assert!(!remove_stop(&mut s, 0), "must not drop below two stops");
        assert_eq!(s.len(), 2);
        s.push(stop(0.5, 0x808080FF));
        assert!(remove_stop(&mut s, 1));
        assert_eq!(s.len(), 2);
    }

    // -- GRAD-7: move + ramp mapping -------------------------------------------

    #[test]
    fn grad_7_move_clamps_reorders_and_reports_new_index() {
        let mut s = vec![
            stop(0.0, 0x000000FF),
            stop(0.3, 0x808080FF),
            stop(1.0, 0xFFFFFFFF),
        ];
        // Drag the first stop past the middle one: index 0 → 1.
        let at = move_stop(&mut s, 0, 0.5);
        assert_eq!(at, 1);
        assert_eq!(
            s.iter().map(|s| s.offset).collect::<Vec<_>>(),
            [0.3, 0.5, 1.0]
        );
    }

    #[test]
    fn grad_7_axis_offset_point_round_trip() {
        let frame = super::super::frame::frame_from_transform(
            GradientType::Linear,
            &math2::transform::AffineTransform::identity(),
        );
        for t in [0.0, 0.25, 0.5, 1.0] {
            let p = offset_to_point(GradientType::Linear, &frame, t);
            assert!((point_to_offset(GradientType::Linear, &frame, p) - t).abs() < 1e-4);
        }
    }

    #[test]
    fn grad_7_sweep_angle_round_trip() {
        let frame = super::super::frame::frame_from_transform(
            GradientType::Sweep,
            &math2::transform::AffineTransform::identity(),
        );
        for t in [0.1, 0.25, 0.5, 0.75] {
            let p = offset_to_point(GradientType::Sweep, &frame, t);
            assert!(
                (point_to_offset(GradientType::Sweep, &frame, p) - t).abs() < 1e-3,
                "sweep offset {t} did not round-trip"
            );
        }
    }

    #[test]
    fn color_at_interpolates_between_stops() {
        let s = two(); // black → white
        let mid = color_at(&s, 0.5);
        assert!((mid.r as i32 - 128).abs() <= 1);
    }
}

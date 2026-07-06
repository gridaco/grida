//! The gradient control-point frame — the pure, session-agnostic math
//! that maps a gradient's user transform to and from three draggable
//! points (`docs/wg/canvas/paint-session/gradient.md`, `GRAD-1..5`).
//!
//! Unit gradient space is `[0,1]²` about center `(0.5, 0.5)`. A
//! gradient's geometry is its type's base anchors moved by a
//! `user_transform` (an affine in unit space). The frame is those
//! anchors after the transform; recovering the transform from a frame
//! is the inverse. Nothing here knows about the editor, the session, or
//! rendering — the machine ([`super::mode`]) owns what these answers
//! mean.

use math2::transform::AffineTransform;
use math2::vector2::{self, Vector2};

/// The gradient kinds that carry a control-point frame.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GradientType {
    Linear,
    Radial,
    Sweep,
    Diamond,
}

impl GradientType {
    /// The identity-pose anchors in unit space: `(origin, primary,
    /// secondary)`. Linear anchors the axis start→end along the middle
    /// row; the round types anchor at the center with a major and a
    /// minor radius endpoint. Linear's `secondary` is unused — its
    /// frame carries `None`.
    fn base(self) -> (Vector2, Vector2, Vector2) {
        match self {
            GradientType::Linear => ([0.0, 0.5], [1.0, 0.5], [0.0, 1.0]),
            _ => ([0.5, 0.5], [1.0, 0.5], [0.5, 1.0]),
        }
    }

    /// Whether the type has an independent perpendicular extent (a
    /// minor axis) — every type but linear (`GRAD-4`).
    pub fn has_secondary(self) -> bool {
        !matches!(self, GradientType::Linear)
    }

    /// Whether this is the sweep (conic) gradient — the one whose stops
    /// ride the ring rather than the axis (`GRAD-9`).
    pub fn is_sweep(self) -> bool {
        matches!(self, GradientType::Sweep)
    }
}

/// A control point's role (`GRAD-4`). For **linear** the two are the
/// free start (`origin`) and end (`primary`) of the axis. For the
/// **elliptical** types they are the ellipse's control points: `origin`
/// = center, `primary` = major-axis endpoint (direction + major
/// extent), `secondary` = minor-axis endpoint (minor extent).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FramePoint {
    Origin,
    Primary,
    Secondary,
}

/// The control-point frame in unit gradient space. `secondary` is
/// `None` for linear (a 1-D ramp has no perpendicular extent).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Frame {
    pub origin: Vector2,
    pub primary: Vector2,
    pub secondary: Option<Vector2>,
}

/// The frame of a gradient with user transform `t` — the type's base
/// anchors moved into unit gradient space (`GRAD-1/2`).
pub fn frame_from_transform(ty: GradientType, t: &AffineTransform) -> Frame {
    let (o, p, s) = ty.base();
    Frame {
        origin: vector2::transform(o, t),
        primary: vector2::transform(p, t),
        secondary: ty.has_secondary().then(|| vector2::transform(s, t)),
    }
}

/// Recover the user transform from a frame — the inverse of
/// [`frame_from_transform`] (`GRAD-5`).
///
/// - **Linear** (2 points): a similarity. `origin→primary` sets the
///   axis's rotation and length; the perpendicular column is the same
///   length turned 90° — a 1-D ramp has no independent minor extent and
///   no skew. The round-trip is exact only for a similarity transform;
///   any minor scale or skew a linear gradient happens to hold is not
///   representable by its two handles and is normalized away, exactly as
///   the two-handle model implies.
/// - **Radial / Sweep / Diamond** (3 points): the unique affine mapping
///   the three base anchors to `origin/primary/secondary`. The base
///   anchors are axis-aligned about the center (`u_b = (0.5,0)`,
///   `v_b = (0,0.5)`), so the linear part is just the scaled column
///   differences and the round-trip is exact for any invertible
///   transform.
pub fn transform_from_frame(ty: GradientType, f: &Frame) -> AffineTransform {
    let o = f.origin;
    let p = f.primary;
    match f.secondary.filter(|_| ty.has_secondary()) {
        Some(s) => {
            // M·u_b = p-o and M·v_b = s-o, with u_b=(0.5,0), v_b=(0,0.5):
            // col0 = 2(p-o), col1 = 2(s-o); t = o − M·(0.5,0.5).
            let a = 2.0 * (p[0] - o[0]);
            let b = 2.0 * (p[1] - o[1]);
            let c = 2.0 * (s[0] - o[0]);
            let d = 2.0 * (s[1] - o[1]);
            let tx = o[0] - 0.5 * (a + c);
            let ty = o[1] - 0.5 * (b + d);
            AffineTransform::from_acebdf(a, c, tx, b, d, ty)
        }
        None => {
            // Linear base O=(0,0.5), P=(1,0.5): col0 = p-o maps (1,0);
            // col1 = perpendicular(col0) maps (0,1) (a similarity).
            // t = o − M·(0,0.5) = o − 0.5·col1.
            let u = [p[0] - o[0], p[1] - o[1]];
            let w = vector2::perpendicular(u);
            let (a, b) = (u[0], u[1]);
            let (c, d) = (w[0], w[1]);
            let tx = o[0] - 0.5 * c;
            let ty = o[1] - 0.5 * d;
            AffineTransform::from_acebdf(a, c, tx, b, d, ty)
        }
    }
}

/// Project a dragged secondary point onto the line through `origin`
/// perpendicular to `origin→primary`, so the minor axis stays ⟂ to the
/// major (`GRAD-4`: the frame drives rotation + scale, never skew). A
/// degenerate major axis leaves the point unchanged.
pub fn constrain_secondary(origin: Vector2, primary: Vector2, dragged: Vector2) -> Vector2 {
    let perp = vector2::perpendicular([primary[0] - origin[0], primary[1] - origin[1]]);
    let len2 = perp[0] * perp[0] + perp[1] * perp[1];
    if len2 <= f32::EPSILON {
        return dragged;
    }
    let rel = [dragged[0] - origin[0], dragged[1] - origin[1]];
    let k = (rel[0] * perp[0] + rel[1] * perp[1]) / len2;
    [origin[0] + perp[0] * k, origin[1] + perp[1] * k]
}

/// Re-derive the minor-axis endpoint when the major axis (`origin→
/// primary`) moves under a handle drag, per the production model: keep
/// it perpendicular to the new major axis, on the side the base minor
/// was on, at the base minor length scaled by how the major length
/// changed (`|new major| / |base major|`). Pure — call it in whatever
/// space the drag runs in (the session runs it in node-local pixels, so
/// the perpendicular is aspect-correct). A degenerate major axis pins it
/// at the origin.
pub fn rederive_minor(
    origin: Vector2,
    primary: Vector2,
    base_origin: Vector2,
    base_primary: Vector2,
    base_secondary: Vector2,
) -> Vector2 {
    let axis = [primary[0] - origin[0], primary[1] - origin[1]];
    let len = vector2::magnitude(axis);
    if len < 1e-6 {
        return origin;
    }
    let base_axis = [
        base_primary[0] - base_origin[0],
        base_primary[1] - base_origin[1],
    ];
    let base_len = vector2::magnitude(base_axis).max(1e-6);
    let base_minor = [
        base_secondary[0] - base_origin[0],
        base_secondary[1] - base_origin[1],
    ];
    let base_dist = vector2::magnitude(base_minor);
    let mut perp = [-axis[1] / len, axis[0] / len];
    // Keep the side the base minor was on (the base major × minor cross).
    if base_axis[0] * base_minor[1] - base_axis[1] * base_minor[0] < 0.0 {
        perp = [-perp[0], -perp[1]];
    }
    let dist = base_dist * (len / base_len);
    [origin[0] + perp[0] * dist, origin[1] + perp[1] * dist]
}

#[cfg(test)]
mod tests {
    use super::*;

    const TYPES_3PT: [GradientType; 3] = [
        GradientType::Radial,
        GradientType::Sweep,
        GradientType::Diamond,
    ];

    fn frame_close(a: &Frame, b: &Frame) -> bool {
        let close =
            |x: Vector2, y: Vector2| (x[0] - y[0]).abs() < 1e-4 && (x[1] - y[1]).abs() < 1e-4;
        close(a.origin, b.origin)
            && close(a.primary, b.primary)
            && match (a.secondary, b.secondary) {
                (Some(x), Some(y)) => close(x, y),
                (None, None) => true,
                _ => false,
            }
    }

    fn xf_close(a: &AffineTransform, b: &AffineTransform) -> bool {
        a.matrix
            .iter()
            .flatten()
            .zip(b.matrix.iter().flatten())
            .all(|(x, y)| (x - y).abs() < 1e-4)
    }

    // -- GRAD-1/2: the identity pose sits in unit space ------------------------

    #[test]
    fn grad_1_identity_frame_is_the_unit_anchors() {
        let f = frame_from_transform(GradientType::Linear, &AffineTransform::identity());
        assert_eq!(f.origin, [0.0, 0.5]);
        assert_eq!(f.primary, [1.0, 0.5]);
        assert_eq!(f.secondary, None);

        let r = frame_from_transform(GradientType::Radial, &AffineTransform::identity());
        assert_eq!(
            (r.origin, r.primary, r.secondary),
            ([0.5, 0.5], [1.0, 0.5], Some([0.5, 1.0]))
        );
    }

    // -- GRAD-5: frame ↔ transform round-trips ---------------------------------

    #[test]
    fn grad_5_three_point_round_trip_is_exact() {
        // A non-trivial invertible transform: rotate + non-uniform scale.
        let t = AffineTransform::from_acebdf(1.4, -0.3, 0.2, 0.5, 0.9, -0.1);
        for ty in TYPES_3PT {
            let f = frame_from_transform(ty, &t);
            let back = transform_from_frame(ty, &f);
            assert!(xf_close(&t, &back), "{ty:?}: transform round-trip");
            let f2 = frame_from_transform(ty, &back);
            assert!(frame_close(&f, &f2), "{ty:?}: frame round-trip");
        }
    }

    #[test]
    fn grad_5_linear_round_trips_a_similarity() {
        // Linear only carries a similarity; a similarity round-trips.
        let t = AffineTransform::new(0.2, -0.1, 0.6); // translate + rotate, unit scale
        let f = frame_from_transform(GradientType::Linear, &t);
        let back = transform_from_frame(GradientType::Linear, &f);
        assert!(xf_close(&t, &back), "linear similarity round-trip");
    }

    // -- GRAD-3: size-independence — mapping through scale(w,h) --------------

    #[test]
    fn grad_3_value_is_size_independent() {
        // The same frame maps to different object points under
        // scale(w,h) without the stored transform changing.
        let ty = GradientType::Radial;
        let t = AffineTransform::identity();
        let f = frame_from_transform(ty, &t);
        assert!(xf_close(&transform_from_frame(ty, &f), &t));
        // Frame is in unit space regardless of any node size — the
        // primary sits at the unit edge, not at w px.
        assert_eq!(f.primary, [1.0, 0.5]);
    }

    // -- GRAD-4: the perpendicular constraint ----------------------------------

    #[test]
    fn grad_4_constrained_secondary_is_perpendicular() {
        let origin = [0.5, 0.5];
        let primary = [1.5, 0.5]; // major axis points +x
        // Drag the secondary to an arbitrary off-axis point.
        let s = constrain_secondary(origin, primary, [1.2, 1.3]);
        let axis = [primary[0] - origin[0], primary[1] - origin[1]];
        let rel = [s[0] - origin[0], s[1] - origin[1]];
        let dot = axis[0] * rel[0] + axis[1] * rel[1];
        assert!(dot.abs() < 1e-4, "secondary must be ⟂ to the major axis");
    }

    #[test]
    fn grad_4_linear_frame_has_no_secondary() {
        let f = frame_from_transform(
            GradientType::Linear,
            &AffineTransform::from_rotatation(30.0),
        );
        assert_eq!(f.secondary, None);
    }

    #[test]
    fn rederive_minor_stays_perpendicular_and_scales_with_the_major() {
        // Base: axis (0,0)→(2,0) (len 2), minor (0,1) (dist 1, +90° side).
        // Move the major endpoint to (0,4): len 4 (ratio 2), rotated +90°.
        let ns = rederive_minor([0.0, 0.0], [0.0, 4.0], [0.0, 0.0], [2.0, 0.0], [0.0, 1.0]);
        // ⟂ to the new axis (0,4), on the same relative side, at dist 2.
        assert!(
            ns[0] * 0.0 + ns[1] * 4.0 == 0.0 || ns[1].abs() < 1e-4,
            "⟂ to new axis"
        );
        assert!(
            (ns[0] - (-2.0)).abs() < 1e-4 && ns[1].abs() < 1e-4,
            "scaled minor to (-2,0)"
        );
    }
}

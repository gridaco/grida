//! Minimal 2D affine math for the anchor lab.
//!
//! Row-major 2x3: [[a c e], [b d f]] applied as
//! `x' = a*x + c*y + e ; y' = b*x + d*y + f` (SVG matrix order a b c d e f).

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Affine {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub e: f32,
    pub f: f32,
}

impl Affine {
    pub const IDENTITY: Affine = Affine {
        a: 1.0,
        b: 0.0,
        c: 0.0,
        d: 1.0,
        e: 0.0,
        f: 0.0,
    };

    pub fn translate(tx: f32, ty: f32) -> Self {
        Affine {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            e: tx,
            f: ty,
        }
    }

    pub fn rotate_deg(deg: f32) -> Self {
        // Exact matrices at quadrant angles (R-E1: 90° multiples bit-clean).
        let r = deg.rem_euclid(360.0);
        let (sin, cos) = if r == 0.0 {
            (0.0, 1.0)
        } else if r == 90.0 {
            (1.0, 0.0)
        } else if r == 180.0 {
            (0.0, -1.0)
        } else if r == 270.0 {
            (-1.0, 0.0)
        } else {
            deg.to_radians().sin_cos()
        };
        Affine {
            a: cos,
            b: sin,
            c: -sin,
            d: cos,
            e: 0.0,
            f: 0.0,
        }
    }

    pub fn scale(sx: f32, sy: f32) -> Self {
        Affine {
            a: sx,
            b: 0.0,
            c: 0.0,
            d: sy,
            e: 0.0,
            f: 0.0,
        }
    }

    /// Axis mirror as a matrix (E-A2 native flip). `true` mirrors that axis.
    pub fn flip(fx: bool, fy: bool) -> Self {
        Affine::scale(if fx { -1.0 } else { 1.0 }, if fy { -1.0 } else { 1.0 })
    }

    pub fn skew_deg(x_deg: f32, y_deg: f32) -> Self {
        Affine {
            a: 1.0,
            b: y_deg.to_radians().tan(),
            c: x_deg.to_radians().tan(),
            d: 1.0,
            e: 0.0,
            f: 0.0,
        }
    }

    /// Inverse affine; None when singular (degenerate resolved matrices
    /// are representable — pick and hit-chrome must not panic on them).
    pub fn invert(&self) -> Option<Affine> {
        let det = self.a * self.d - self.b * self.c;
        if det == 0.0 || !det.is_finite() {
            return None;
        }
        let inv = 1.0 / det;
        Some(Affine {
            a: self.d * inv,
            b: -self.b * inv,
            c: -self.c * inv,
            d: self.a * inv,
            e: (self.c * self.f - self.d * self.e) * inv,
            f: (self.b * self.e - self.a * self.f) * inv,
        })
    }

    /// self ∘ other (apply `other` first, then `self`).
    pub fn then(&self, other: &Affine) -> Affine {
        Affine {
            a: self.a * other.a + self.c * other.b,
            b: self.b * other.a + self.d * other.b,
            c: self.a * other.c + self.c * other.d,
            d: self.b * other.c + self.d * other.d,
            e: self.a * other.e + self.c * other.f + self.e,
            f: self.b * other.e + self.d * other.f + self.f,
        }
    }

    pub fn apply(&self, p: (f32, f32)) -> (f32, f32) {
        (
            self.a * p.0 + self.c * p.1 + self.e,
            self.b * p.0 + self.d * p.1 + self.f,
        )
    }

    /// The model's one transform constructor for boxed kinds:
    /// T(x0,y0) · T(c) · R(θ) · T(−c), c = box center (models/a.md §6 Phase T).
    pub fn from_box_center(x0: f32, y0: f32, w: f32, h: f32, deg: f32) -> Affine {
        Affine::from_box_center_flip(x0, y0, w, h, deg, false, false)
    }

    /// Boxed-kind transform with native flip (E-A2 + B1 pivot rule):
    /// T(x0,y0) · T(c) · R(θ) · F · T(−c) — flip composes INNERMOST (local
    /// space, then rotation), both about the box center. Declared order:
    /// mirror first, then turn — a flipped card rotates the way its mirrored
    /// content faces, which is also what a baked negative-scale matrix does.
    pub fn from_box_center_flip(
        x0: f32,
        y0: f32,
        w: f32,
        h: f32,
        deg: f32,
        fx: bool,
        fy: bool,
    ) -> Affine {
        let (cx, cy) = (w / 2.0, h / 2.0);
        Affine::translate(x0 + cx, y0 + cy)
            .then(&Affine::rotate_deg(deg))
            .then(&Affine::flip(fx, fy))
            .then(&Affine::translate(-cx, -cy))
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RectF {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl RectF {
    pub const EMPTY: RectF = RectF {
        x: 0.0,
        y: 0.0,
        w: 0.0,
        h: 0.0,
    };

    pub fn corners(&self) -> [(f32, f32); 4] {
        [
            (self.x, self.y),
            (self.x + self.w, self.y),
            (self.x + self.w, self.y + self.h),
            (self.x, self.y + self.h),
        ]
    }

    /// AABB of this rect's corners transformed by `t` (R-2 oriented envelope).
    pub fn transformed_aabb(&self, t: &Affine) -> RectF {
        let pts = self.corners().map(|p| t.apply(p));
        aabb_of(&pts)
    }

    pub fn union(&self, o: &RectF) -> RectF {
        let x0 = self.x.min(o.x);
        let y0 = self.y.min(o.y);
        let x1 = (self.x + self.w).max(o.x + o.w);
        let y1 = (self.y + self.h).max(o.y + o.h);
        RectF {
            x: x0,
            y: y0,
            w: x1 - x0,
            h: y1 - y0,
        }
    }

    pub fn intersection_area(&self, o: &RectF) -> f32 {
        let x0 = self.x.max(o.x);
        let y0 = self.y.max(o.y);
        let x1 = (self.x + self.w).min(o.x + o.w);
        let y1 = (self.y + self.h).min(o.y + o.h);
        ((x1 - x0).max(0.0)) * ((y1 - y0).max(0.0))
    }

    pub fn center(&self) -> (f32, f32) {
        (self.x + self.w / 2.0, self.y + self.h / 2.0)
    }
}

pub fn aabb_of(pts: &[(f32, f32)]) -> RectF {
    let mut x0 = f32::INFINITY;
    let mut y0 = f32::INFINITY;
    let mut x1 = f32::NEG_INFINITY;
    let mut y1 = f32::NEG_INFINITY;
    for (x, y) in pts {
        x0 = x0.min(*x);
        y0 = y0.min(*y);
        x1 = x1.max(*x);
        y1 = y1.max(*y);
    }
    RectF {
        x: x0,
        y: y0,
        w: x1 - x0,
        h: y1 - y0,
    }
}

/// Oriented AABB contribution of a rotated w×h box (models/a.md §5):
/// `w' = |w·cosθ| + |h·sinθ|`, `h' = |w·sinθ| + |h·cosθ|`.
/// Computed from resolved size only — never position (single-pass safe).
pub fn rotated_aabb_size(w: f32, h: f32, deg: f32) -> (f32, f32) {
    let r = Affine::rotate_deg(deg);
    // |cos|/|sin| extracted from the same matrix used for rendering, so the
    // layout contribution and the painted envelope can never disagree.
    let (cos, sin) = (r.a.abs(), r.b.abs());
    (w * cos + h * sin, w * sin + h * cos)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quadrant_rotations_are_exact() {
        for (deg, exp) in [
            (0.0, (1.0, 0.0)),
            (90.0, (0.0, 1.0)),
            (180.0, (-1.0, 0.0)),
            (270.0, (0.0, -1.0)),
            (360.0, (1.0, 0.0)),
            (-90.0, (0.0, -1.0)),
        ] {
            let r = Affine::rotate_deg(deg);
            assert_eq!((r.a, r.b), exp, "deg={deg}");
        }
    }

    #[test]
    fn from_box_center_preserves_center() {
        let t = Affine::from_box_center(10.0, 20.0, 120.0, 80.0, 33.0);
        let c = t.apply((60.0, 40.0));
        assert!((c.0 - 70.0).abs() < 1e-4 && (c.1 - 60.0).abs() < 1e-4);
    }

    #[test]
    fn rotated_aabb_matches_corner_transform() {
        let (w, h, deg) = (120.0, 80.0, 37.0);
        let t = Affine::from_box_center(0.0, 0.0, w, h, deg);
        let aabb = RectF {
            x: 0.0,
            y: 0.0,
            w,
            h,
        }
        .transformed_aabb(&t);
        let (we, he) = rotated_aabb_size(w, h, deg);
        assert!((aabb.w - we).abs() < 1e-3);
        assert!((aabb.h - he).abs() < 1e-3);
    }
}

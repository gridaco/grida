use super::rect::Rectangle;
use super::vector2::Vector2;

/// Approximation constant used to convert a circular arc into a cubic Bézier
/// curve. Commonly known as KAPPA, defined as `4 * (sqrt(2) - 1) / 3`.
pub const KAPPA: f32 = 4.0 * (std::f32::consts::SQRT_2 - 1.0) / 3.0;

/// Represents a cubic Bézier curve segment with absolute control points.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CubicBezier {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub x: f32,
    pub y: f32,
}

/// A cubic Bézier segment expressed with tangents relative to the start/end vertices.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CubicBezierWithTangents {
    pub a: Vector2,
    pub b: Vector2,
    pub ta: Vector2,
    pub tb: Vector2,
}

fn solve_quad(a: f32, b: f32, c: f32) -> Vec<f32> {
    if a == 0.0 {
        // Degenerate to linear `bt + c = 0` (symmetric curves hit this:
        // the derivative's t² coefficient vanishes).
        if b == 0.0 {
            return Vec::new();
        }
        return vec![-c / b];
    }
    let d = b * b - 4.0 * a * c;
    if d < 0.0 {
        Vec::new()
    } else if d == 0.0 {
        vec![-b / (2.0 * a)]
    } else {
        let sqrt_d = d.sqrt();
        vec![(-b + sqrt_d) / (2.0 * a), (-b - sqrt_d) / (2.0 * a)]
    }
}

fn cubic_deriv_coeffs(p0: f32, p1: f32, p2: f32, p3: f32) -> (f32, f32, f32) {
    let c0 = -p0 + 3.0 * p1 - 3.0 * p2 + p3; // t^3
    let c1 = 3.0 * p0 - 6.0 * p1 + 3.0 * p2; // t^2
    let c2 = -3.0 * p0 + 3.0 * p1; // t^1
    (3.0 * c0, 2.0 * c1, c2)
}

fn cubic_eval(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    let mt = 1.0 - t;
    mt * mt * mt * p0 + 3.0 * mt * mt * t * p1 + 3.0 * mt * t * t * p2 + t * t * t * p3
}

/// Calculates the bounding box of a cubic Bézier segment expressed with tangents.
pub fn get_bbox(segment: &CubicBezierWithTangents) -> Rectangle {
    let CubicBezierWithTangents { a, b, ta, tb } = *segment;
    if ta[0] == 0.0 && ta[1] == 0.0 && tb[0] == 0.0 && tb[1] == 0.0 {
        return Rectangle::from_points(&[a, b]);
    }
    let c1: Vector2 = [a[0] + ta[0], a[1] + ta[1]];
    let c2: Vector2 = [b[0] + tb[0], b[1] + tb[1]];

    let (dx0, dx1, dx2) = cubic_deriv_coeffs(a[0], c1[0], c2[0], b[0]);
    let (dy0, dy1, dy2) = cubic_deriv_coeffs(a[1], c1[1], c2[1], b[1]);
    let tx = solve_quad(dx0, dx1, dx2);
    let ty = solve_quad(dy0, dy1, dy2);

    let mut candidates = vec![0.0f32, 1.0f32];
    for t in tx {
        if (0.0..=1.0).contains(&t) {
            candidates.push(t);
        }
    }
    for t in ty {
        if (0.0..=1.0).contains(&t) {
            candidates.push(t);
        }
    }

    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;

    for t in candidates {
        let x = cubic_eval(a[0], c1[0], c2[0], b[0], t);
        let y = cubic_eval(a[1], c1[1], c2[1], b[1], t);
        if x < min_x {
            min_x = x;
        }
        if x > max_x {
            max_x = x;
        }
        if y < min_y {
            min_y = y;
        }
        if y > max_y {
            max_y = y;
        }
    }

    Rectangle {
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
    }
}

/// Evaluates a cubic Bézier segment (tangent form) at parameter `t`.
///
/// The curve is `B(t) = (1−t)³·a + 3(1−t)²t·(a+ta) + 3(1−t)t²·(b+tb) + t³·b`.
/// `t` is clamped to `[0, 1]`; `NaN` evaluates at `0`.
pub fn evaluate(segment: &CubicBezierWithTangents, t: f32) -> Vector2 {
    let CubicBezierWithTangents { a, b, ta, tb } = *segment;
    let t = if t.is_nan() { 0.0 } else { t.clamp(0.0, 1.0) };
    let c1: Vector2 = [a[0] + ta[0], a[1] + ta[1]];
    let c2: Vector2 = [b[0] + tb[0], b[1] + tb[1]];
    [
        cubic_eval(a[0], c1[0], c2[0], b[0], t),
        cubic_eval(a[1], c1[1], c2[1], b[1], t),
    ]
}

/// Splits a cubic Bézier segment at parameter `t` by de Casteljau
/// subdivision, returning the `(left, right)` halves in tangent form.
///
/// The halves reproduce the original curve exactly (`left.b == right.a`
/// is the split point). Note that subdividing a straight segment (both
/// tangents zero) yields collinear but *nonzero* tangents — callers
/// that must keep straight segments handle-free preserve zeros
/// themselves.
pub fn subdivide(
    segment: &CubicBezierWithTangents,
    t: f32,
) -> (CubicBezierWithTangents, CubicBezierWithTangents) {
    let CubicBezierWithTangents { a, b, ta, tb } = *segment;
    let t = t.clamp(0.0, 1.0);
    let mt = 1.0 - t;

    let p0 = a;
    let p1: Vector2 = [a[0] + ta[0], a[1] + ta[1]];
    let p2: Vector2 = [b[0] + tb[0], b[1] + tb[1]];
    let p3 = b;

    let lerp = |u: Vector2, v: Vector2| -> Vector2 { [mt * u[0] + t * v[0], mt * u[1] + t * v[1]] };

    let q0 = lerp(p0, p1);
    let q1 = lerp(p1, p2);
    let q2 = lerp(p2, p3);
    let r0 = lerp(q0, q1);
    let r1 = lerp(q1, q2);
    let s = lerp(r0, r1);

    (
        CubicBezierWithTangents {
            a: p0,
            b: s,
            ta: [q0[0] - p0[0], q0[1] - p0[1]],
            tb: [r0[0] - s[0], r0[1] - s[1]],
        },
        CubicBezierWithTangents {
            a: s,
            b: p3,
            ta: [r1[0] - s[0], r1[1] - s[1]],
            tb: [q2[0] - p3[0], q2[1] - p3[1]],
        },
    )
}

/// Finds the parameter of the closest point on a cubic Bézier segment
/// to `point`, returning `(t, dist_sq)`.
///
/// Coarse scan over 20 uniform samples followed by up to 5
/// Newton–Raphson refinements of the perpendicularity condition
/// `f(t) = (B(t) − p) · B′(t) = 0`; `t` stays clamped to `[0, 1]`.
pub fn project(segment: &CubicBezierWithTangents, point: Vector2) -> (f32, f32) {
    let CubicBezierWithTangents { a, b, ta, tb } = *segment;
    let p0 = a;
    let p1: Vector2 = [a[0] + ta[0], a[1] + ta[1]];
    let p2: Vector2 = [b[0] + tb[0], b[1] + tb[1]];
    let p3 = b;

    let eval = |t: f32| -> Vector2 {
        [
            cubic_eval(p0[0], p1[0], p2[0], p3[0], t),
            cubic_eval(p0[1], p1[1], p2[1], p3[1], t),
        ]
    };
    let deriv = |t: f32| -> Vector2 {
        let mt = 1.0 - t;
        [
            3.0 * mt * mt * (p1[0] - p0[0])
                + 6.0 * mt * t * (p2[0] - p1[0])
                + 3.0 * t * t * (p3[0] - p2[0]),
            3.0 * mt * mt * (p1[1] - p0[1])
                + 6.0 * mt * t * (p2[1] - p1[1])
                + 3.0 * t * t * (p3[1] - p2[1]),
        ]
    };
    let deriv2 = |t: f32| -> Vector2 {
        let mt = 1.0 - t;
        [
            6.0 * mt * (p2[0] - 2.0 * p1[0] + p0[0]) + 6.0 * t * (p3[0] - 2.0 * p2[0] + p1[0]),
            6.0 * mt * (p2[1] - 2.0 * p1[1] + p0[1]) + 6.0 * t * (p3[1] - 2.0 * p2[1] + p1[1]),
        ]
    };

    let mut best_t = 0.0f32;
    let mut best_dist = f32::INFINITY;
    for i in 0..=20 {
        let t = i as f32 / 20.0;
        let [x, y] = eval(t);
        let dx = x - point[0];
        let dy = y - point[1];
        let dist = dx * dx + dy * dy;
        if dist < best_dist {
            best_dist = dist;
            best_t = t;
        }
    }

    let mut t = best_t;
    for _ in 0..5 {
        let pt = eval(t);
        let d1 = deriv(t);
        let d2 = deriv2(t);
        let rx = pt[0] - point[0];
        let ry = pt[1] - point[1];
        let f = rx * d1[0] + ry * d1[1];
        let df = d1[0] * d1[0] + d1[1] * d1[1] + rx * d2[0] + ry * d2[1];
        if df == 0.0 {
            break;
        }
        t = (t - f / df).clamp(0.0, 1.0);
    }

    let [x, y] = eval(t);
    let dx = x - point[0];
    let dy = y - point[1];
    (t, dx * dx + dy * dy)
}

/// Solves for the tangent pair that makes the segment pass through
/// `target` at parameter `t`, moving as little as possible from the
/// current tangents (least-squares via a Lagrange multiplier on the
/// single-point constraint).
///
/// At `t == 0`/`t == 1` only the touched endpoint's tangent changes.
/// A target within `0.1` units of the chord's linear interpolation
/// collapses both tangents to zero (the segment snaps back straight).
pub fn solve_tangents_for_point(
    segment: &CubicBezierWithTangents,
    t: f32,
    target: Vector2,
) -> (Vector2, Vector2) {
    let CubicBezierWithTangents { a, b, ta, tb } = *segment;

    if t == 0.0 {
        return ([target[0] - a[0], target[1] - a[1]], tb);
    }
    if t == 1.0 {
        return (ta, [target[0] - b[0], target[1] - b[1]]);
    }

    let linear: Vector2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (target[0] - linear[0]).hypot(target[1] - linear[1]) < 0.1 {
        return ([0.0, 0.0], [0.0, 0.0]);
    }

    let s = 1.0 - t;
    let (s2, t2) = (s * s, t * t);
    let (s3, t3) = (s2 * s, t2 * t);
    let coef_ta = 3.0 * s2 * t;
    let coef_tb = 3.0 * s * t2;

    // B(t) with zero tangents contributes the endpoint mix; the tangent
    // pair must supply the remainder.
    let rhs: Vector2 = [
        target[0] - (s3 * a[0] + 3.0 * s2 * t * a[0] + 3.0 * s * t2 * b[0] + t3 * b[0]),
        target[1] - (s3 * a[1] + 3.0 * s2 * t * a[1] + 3.0 * s * t2 * b[1] + t3 * b[1]),
    ];

    let denominator = coef_ta * coef_ta + coef_tb * coef_tb;
    if denominator.abs() <= 1e-10 {
        return (ta, tb);
    }

    let current: Vector2 = [
        coef_ta * ta[0] + coef_tb * tb[0],
        coef_ta * ta[1] + coef_tb * tb[1],
    ];
    let lambda = [
        (rhs[0] - current[0]) / denominator,
        (rhs[1] - current[1]) / denominator,
    ];
    (
        [ta[0] + lambda[0] * coef_ta, ta[1] + lambda[1] * coef_ta],
        [tb[0] + lambda[0] * coef_tb, tb[1] + lambda[1] * coef_tb],
    )
}

/// Converts an SVG elliptical arc to cubic Bézier curve segments.
///
/// Returned vector is flattened as `[c1x, c1y, c2x, c2y, x, y, ...]`.
#[allow(clippy::many_single_char_names)]
pub fn a2c(
    mut x1: f32,
    mut y1: f32,
    mut rx: f32,
    mut ry: f32,
    angle: f32,
    large_arc_flag: bool,
    sweep_flag: bool,
    mut x2: f32,
    mut y2: f32,
    recursive: Option<(f32, f32, f32, f32)>,
) -> Vec<f32> {
    let pi = std::f32::consts::PI;
    let angle_120_rad = pi * 120.0 / 180.0;
    let rad = pi / 180.0 * angle;

    let rotate = |x: f32, y: f32, r: f32| -> (f32, f32) {
        (x * r.cos() - y * r.sin(), x * r.sin() + y * r.cos())
    };

    if rx == 0.0 || ry == 0.0 {
        return vec![x1, y1, x2, y2, x2, y2];
    }

    let (f1, mut f2, cx, cy) = if let Some((rf1, rf2, rcx, rcy)) = recursive {
        (rf1, rf2, rcx, rcy)
    } else {
        let (rx1, ry1) = rotate(x1, y1, -rad);
        x1 = rx1;
        y1 = ry1;
        let (rx2, ry2) = rotate(x2, y2, -rad);
        x2 = rx2;
        y2 = ry2;

        let x = (x1 - x2) / 2.0;
        let y = (y1 - y2) / 2.0;

        let h = x * x / (rx * rx) + y * y / (ry * ry);
        if h > 1.0 {
            let h_sqrt = h.sqrt();
            rx *= h_sqrt;
            ry *= h_sqrt;
        }

        let rx2s = rx * rx;
        let ry2s = ry * ry;
        let k_sign = if large_arc_flag == sweep_flag {
            -1.0
        } else {
            1.0
        };
        let k = k_sign
            * ((rx2s * ry2s - rx2s * y * y - ry2s * x * x) / (rx2s * y * y + ry2s * x * x))
                .abs()
                .sqrt();
        let cx = k * rx * y / ry + (x1 + x2) / 2.0;
        let cy = k * -ry * x / rx + (y1 + y2) / 2.0;
        let mut f1 = ((y1 - cy) / ry).clamp(-1.0, 1.0).asin();
        let mut f2 = ((y2 - cy) / ry).clamp(-1.0, 1.0).asin();
        if x1 < cx {
            f1 = pi - f1;
        }
        if x2 < cx {
            f2 = pi - f2;
        }
        if f1 < 0.0 {
            f1 += pi * 2.0;
        }
        if f2 < 0.0 {
            f2 += pi * 2.0;
        }
        if sweep_flag && f1 > f2 {
            f1 -= pi * 2.0;
        }
        if !sweep_flag && f2 > f1 {
            f2 -= pi * 2.0;
        }
        (f1, f2, cx, cy)
    };

    let mut df = f2 - f1;
    let mut res: Vec<f32> = Vec::new();

    if df.abs() > angle_120_rad {
        let f2old = f2;
        let x2old = x2;
        let y2old = y2;
        f2 = f1 + angle_120_rad * if sweep_flag && f2 > f1 { 1.0 } else { -1.0 };
        x2 = cx + rx * f2.cos();
        y2 = cy + ry * f2.sin();
        res = a2c(
            x2,
            y2,
            rx,
            ry,
            angle,
            false,
            sweep_flag,
            x2old,
            y2old,
            Some((f2, f2old, cx, cy)),
        );
    }

    df = f2 - f1;
    let c1 = f1.cos();
    let s1 = f1.sin();
    let c2 = f2.cos();
    let s2 = f2.sin();
    let t = (df / 4.0).tan();
    let hx = (4.0 / 3.0) * rx * t;
    let hy = (4.0 / 3.0) * ry * t;

    let m1 = [x1, y1];
    let mut m2 = [x1 + hx * s1, y1 - hy * c1];
    let m3 = [x2 + hx * s2, y2 - hy * c2];
    let m4 = [x2, y2];
    m2[0] = 2.0 * m1[0] - m2[0];
    m2[1] = 2.0 * m1[1] - m2[1];

    let mut points: Vec<[f32; 2]> = vec![m2, m3, m4];
    for chunk in res.chunks(2) {
        if let [x, y] = chunk {
            points.push([*x, *y]);
        }
    }

    let mut flat = Vec::with_capacity(points.len() * 2);
    if recursive.is_some() {
        for p in points {
            flat.push(p[0]);
            flat.push(p[1]);
        }
    } else {
        for p in points {
            let (x, y) = rotate(p[0], p[1], rad);
            flat.push(x);
            flat.push(y);
        }
    }

    flat
}

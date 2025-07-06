use super::rect::{from_points, Rectangle};
use super::vector2::Vector2;

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
        return from_points(&[a, b]);
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
    let _120 = pi * 120.0 / 180.0;
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

    if df.abs() > _120 {
        let f2old = f2;
        let x2old = x2;
        let y2old = y2;
        f2 = f1 + _120 * if sweep_flag && f2 > f1 { 1.0 } else { -1.0 };
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

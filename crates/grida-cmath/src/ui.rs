use crate::{vector2, transform::AffineTransform};

/// `['x', 100.0]` will draw a y-axis line at x=100.
pub type Rule = (vector2::Axis, f32);

#[derive(Debug, Clone, PartialEq)]
pub struct Point {
    pub label: Option<String>,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub label: Option<String>,
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
}

/// Applies an affine transform to a UI point.
pub fn transform_point(point: &Point, transform: &AffineTransform) -> Point {
    let [x, y] = vector2::transform([point.x, point.y], transform);
    Point { label: point.label.clone(), x, y }
}

/// Applies an affine transform to a UI line.
pub fn transform_line(line: &Line, transform: &AffineTransform) -> Line {
    let [x1, y1] = vector2::transform([line.x1, line.y1], transform);
    let [x2, y2] = vector2::transform([line.x2, line.y2], transform);
    Line { label: line.label.clone(), x1, y1, x2, y2 }
}

/// Ensures `(x1, y1) <= (x2, y2)` lexicographically.
pub fn normalize_line(line: &Line) -> Line {
    let mut x1 = line.x1;
    let mut y1 = line.y1;
    let mut x2 = line.x2;
    let mut y2 = line.y2;

    if x1 > x2 || (x1 == x2 && y1 > y2) {
        std::mem::swap(&mut x1, &mut x2);
        std::mem::swap(&mut y1, &mut y2);
    }

    Line { label: line.label.clone(), x1, y1, x2, y2 }
}

/// Formats `num` to the given precision only when necessary.
/// If the rounded value has no fractional part, it is returned without decimals.
pub fn format_number(num: f32, precision: usize) -> String {
    let factor = 10_f32.powi(precision as i32);
    let rounded = (num * factor).round() / factor;
    if rounded.fract() == 0.0 {
        format!("{:.0}", rounded)
    } else {
        format!("{:.*}", precision, rounded)
    }
}



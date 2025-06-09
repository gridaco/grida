use super::transform::AffineTransform;

/// A 2-dimensional vector represented as `[x, y]`.
pub type Vector2 = [f32; 2];

/// The zero vector `[0, 0]`.
pub const ZERO: Vector2 = [0.0, 0.0];

/// Axis in 2D space.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Axis {
    X,
    Y,
}

impl Axis {
    /// Returns the opposite axis.
    pub fn counter(self) -> Self {
        match self {
            Axis::X => Axis::Y,
            Axis::Y => Axis::X,
        }
    }
}

/// Constructs a vector assigning `a` to the main axis and `b` to the other.
pub fn axis_oriented(a: f32, b: f32, main_axis: Axis) -> Vector2 {
    match main_axis {
        Axis::X => [a, b],
        Axis::Y => [b, a],
    }
}

/// Returns true if the vector is `[0, 0]`.
pub fn is_zero(v: Vector2) -> bool {
    v[0] == 0.0 && v[1] == 0.0
}

/// Adds multiple vectors component-wise.
pub fn add(vectors: &[Vector2]) -> Vector2 {
    let mut result = [0.0f32, 0.0f32];
    for v in vectors {
        result[0] += v[0];
        result[1] += v[1];
    }
    result
}

/// Subtracts vectors sequentially. If only one vector is provided it is returned.
pub fn sub(vectors: &[Vector2]) -> Vector2 {
    if vectors.is_empty() {
        return [0.0, 0.0];
    }
    let mut iter = vectors.iter();
    let mut result = *iter.next().unwrap();
    for v in iter {
        result[0] -= v[0];
        result[1] -= v[1];
    }
    result
}

/// Quantizes a vector using the provided step or per-axis steps.
pub fn quantize(vector: Vector2, step: impl Into<Vector2>) -> Vector2 {
    let step = step.into();
    [crate::quantize(vector[0], step[0]), crate::quantize(vector[1], step[1])]
}

impl From<f32> for Vector2 {
    fn from(v: f32) -> Self {
        [v, v]
    }
}

impl From<(f32, f32)> for Vector2 {
    fn from(v: (f32, f32)) -> Self {
        [v.0, v.1]
    }
}

/// Multiplies vectors component-wise.
pub fn multiply(vectors: &[Vector2]) -> Vector2 {
    if vectors.is_empty() {
        return [1.0, 1.0];
    }
    let mut result = [1.0f32, 1.0f32];
    for v in vectors {
        result[0] *= v[0];
        result[1] *= v[1];
    }
    result
}

/// Inverts a vector by negating both components.
pub fn invert(v: Vector2) -> Vector2 {
    [-v[0], -v[1]]
}

/// Returns the angle in degrees from `a` to `b` measured counter-clockwise.
pub fn angle(a: Vector2, b: Vector2) -> f32 {
    let radians = (b[1] - a[1]).atan2(b[0] - a[0]);
    let degrees = radians.to_degrees();
    (degrees + 360.0) % 360.0
}

/// Rotates a vector by `angle` degrees counter-clockwise.
pub fn rotate(v: Vector2, angle: f32) -> Vector2 {
    let rad = angle.to_radians();
    let (sin, cos) = rad.sin_cos();
    [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos]
}

/// Returns true if two segments intersect or overlap.
pub fn intersects(a: Vector2, b: Vector2) -> bool {
    a[1] >= b[0] && b[1] >= a[0]
}

/// Returns the intersection of two segments if they intersect.
pub fn intersection(a: Vector2, b: Vector2) -> Option<Vector2> {
    let start = a[0].max(b[0]);
    let end = a[1].min(b[1]);
    if start > end {
        None
    } else {
        Some([start, end])
    }
}

/// Component-wise minimum of vectors.
pub fn min(vectors: &[Vector2]) -> Vector2 {
    let mut result = [f32::INFINITY, f32::INFINITY];
    for v in vectors {
        if v[0] < result[0] { result[0] = v[0]; }
        if v[1] < result[1] { result[1] = v[1]; }
    }
    result
}

/// Component-wise maximum of vectors.
pub fn max(vectors: &[Vector2]) -> Vector2 {
    let mut result = [f32::NEG_INFINITY, f32::NEG_INFINITY];
    for v in vectors {
        if v[0] > result[0] { result[0] = v[0]; }
        if v[1] > result[1] { result[1] = v[1]; }
    }
    result
}

/// Clamps vector components between min and max.
pub fn clamp(v: Vector2, min: Vector2, max: Vector2) -> Vector2 {
    [
        v[0].max(min[0]).min(max[0]),
        v[1].max(min[1]).min(max[1]),
    ]
}

/// Euclidean distance between two vectors.
pub fn distance(a: Vector2, b: Vector2) -> f32 {
    ((b[0] - a[0]).powi(2) + (b[1] - a[1]).powi(2)).sqrt()
}

/// Applies an affine transform to a vector.
pub fn transform(v: Vector2, t: &AffineTransform) -> Vector2 {
    let [[a, c, tx], [b, d, ty]] = t.matrix;
    [a * v[0] + c * v[1] + tx, b * v[0] + d * v[1] + ty]
}

/// Returns true if two vectors are identical.
pub fn identical(a: Vector2, b: Vector2) -> bool {
    a[0] == b[0] && a[1] == b[1]
}


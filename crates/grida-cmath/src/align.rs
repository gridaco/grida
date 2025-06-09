use super::vector2::{Vector2, distance};

/// Aligns a scalar value to the nearest value in `targets` if it is within
/// `threshold`.
///
/// Returns a tuple `(value, distance, indices)` where:
/// - `value` is the snapped scalar or the original `point` if no target is
///   within `threshold`.
/// - `distance` is the signed distance `point - value` (or `Infinity` if not
///   snapped).
/// - `indices` contains all indices of `targets` that are equally close.
///
/// # Panics
/// Panics if `threshold` is negative or `targets` is empty.
///
/// # Example
/// ```
/// let (value, dist, idx) = grida_cmath::align_scalar(22.0, &[10.0,20.0,20.0,40.0], 5.0);
/// assert_eq!(value, 20.0);
/// assert_eq!(dist, 2.0);
/// assert_eq!(idx, vec![1,2]);
/// ```
pub fn scalar(point: f32, targets: &[f32], threshold: f32) -> (f32, f32, Vec<usize>) {
    assert!(threshold >= 0.0, "threshold must be non-negative");
    assert!(!targets.is_empty(), "at least one target is required");

    let mut min_abs = f32::INFINITY;
    let mut best_value = point;
    let mut best_signed = 0.0;
    let mut indices = Vec::new();

    for (i, &t) in targets.iter().enumerate() {
        let signed = point - t;
        let abs = signed.abs();
        if abs < min_abs {
            min_abs = abs;
            best_value = t;
            best_signed = signed;
            indices.clear();
            indices.push(i);
        } else if abs == min_abs {
            indices.push(i);
        }
    }

    if min_abs > threshold {
        return (point, f32::INFINITY, Vec::new());
    }

    (best_value, best_signed, indices)
}

/// Aligns a 2D point to the nearest vector within `threshold` using Euclidean
/// distance.
///
/// Returns `(value, distance, indices)` where `value` is the snapped vector (or
/// the original `point` if no target is within `threshold`), `distance` is the
/// Euclidean distance, and `indices` lists all targets tied for the minimum
/// distance.
///
/// # Panics
/// Panics if `threshold` is negative or `targets` is empty.
///
/// # Example
/// ```
/// let (val, dist, idx) = grida_cmath::align_vector2([6.0,6.0], &[[0.0,0.0],[5.0,5.0],[5.0,5.0],[10.0,10.0]], 3.0);
/// assert_eq!(val, [5.0,5.0]);
/// assert_eq!(idx, vec![1,2]);
/// ```
pub fn vector2(point: Vector2, targets: &[Vector2], threshold: f32) -> (Vector2, f32, Vec<usize>) {
    assert!(threshold >= 0.0, "threshold must be non-negative");
    assert!(!targets.is_empty(), "at least one target is required");

    let mut min_dist = f32::INFINITY;
    let mut best_value = point;
    let mut indices = Vec::new();

    for (i, &t) in targets.iter().enumerate() {
        let dist = distance(point, t);
        if dist < min_dist {
            min_dist = dist;
            best_value = t;
            indices.clear();
            indices.push(i);
        } else if dist == min_dist {
            indices.push(i);
        }
    }

    if min_dist > threshold {
        return (point, f32::INFINITY, Vec::new());
    }

    (best_value, min_dist, indices)
}


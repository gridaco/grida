use super::vector2::{Vector2, distance};

/// Aligns a scalar to the nearest target within `threshold`.
/// Returns `(value, distance, indices)` where distance is signed `point - value`.
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

/// Aligns a 2D point to the nearest target within `threshold` using Euclidean distance.
/// Returns `(value, distance, indices)` where distance is the Euclidean distance.
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


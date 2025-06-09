/// Quantizes `value` to the nearest multiple of `step`.
///
/// Useful for rounding or grid alignment of continuous values.
///
/// # Panics
/// Panics if `step` is not positive.
///
/// # Example
/// ```rust
/// use math2::quantize;
/// assert_eq!(quantize(15.0, 10.0), 20.0);
/// ```
pub fn quantize(value: f32, step: f32) -> f32 {
    assert!(step > 0.0, "step must be positive");
    let factor = 1.0 / step;
    (value * factor).round() / factor
}

/// Clamps `value` between `min` and `max`.
pub fn clamp(value: f32, min: f32, max: f32) -> f32 {
    value.max(min).min(max)
}

/// Finds the nearest value to `value` from `points`.
/// Returns `f32::INFINITY` if `points` is empty.
pub fn nearest(value: f32, points: &[f32]) -> f32 {
    points
        .iter()
        .map(|&p| (p, (p - value).abs()))
        .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
        .map(|(p, _)| p)
        .unwrap_or(f32::INFINITY)
}

/// Converts an angle to its principal representation within `[-180, 180)`.
pub fn principal_angle(angle: f32) -> f32 {
    ((angle + 180.0) % 360.0) - 180.0
}

/// Determines whether an angle is closer to the X or Y axis.
pub fn angle_to_axis(angle: f32) -> super::vector2::Axis {
    let a = ((angle % 360.0) + 360.0) % 360.0;
    let dist_horizontal = (a - 0.0)
        .abs()
        .min((a - 180.0).abs())
        .min((a - 360.0).abs());
    let dist_vertical = (a - 90.0).abs().min((a - 270.0).abs());
    if dist_horizontal <= dist_vertical {
        super::vector2::Axis::X
    } else {
        super::vector2::Axis::Y
    }
}

/// Checks if all numbers in `arr` are equal within `tolerance`.
pub fn is_uniform(arr: &[f32], tolerance: f32) -> bool {
    if arr.len() <= 1 {
        return true;
    }
    let first = arr[0];
    if tolerance == 0.0 {
        arr.iter().all(|&v| v == first)
    } else {
        arr.iter().all(|&v| (v - first).abs() <= tolerance)
    }
}

/// Computes the mean (average) of the provided values.
pub fn mean(values: &[f32]) -> f32 {
    assert!(!values.is_empty(), "cannot compute mean of empty slice");
    let sum: f32 = values.iter().sum();
    sum / values.len() as f32
}

/// Generates all combinations of size `k` from the slice.
pub fn combinations<T: Clone>(arr: &[T], k: usize) -> Vec<Vec<T>> {
    if k == 0 {
        return vec![vec![]];
    }
    if arr.is_empty() {
        return vec![];
    }
    let (first, rest) = arr.split_first().unwrap();
    let mut with_first: Vec<Vec<T>> = combinations(rest, k - 1)
        .into_iter()
        .map(|mut combo| {
            combo.insert(0, first.clone());
            combo
        })
        .collect();
    let mut without_first = combinations(rest, k);
    with_first.append(&mut without_first);
    with_first
}

/// Generates all permutations of size `k` from the slice.
pub fn permutations<T: Clone>(arr: &[T], k: usize) -> Vec<Vec<T>> {
    if k == 0 {
        return vec![vec![]];
    }
    if arr.is_empty() {
        return vec![];
    }
    let mut result = Vec::new();
    for (idx, item) in arr.iter().enumerate() {
        let mut rest = arr.to_vec();
        rest.remove(idx);
        for mut perm in permutations(&rest, k - 1) {
            perm.insert(0, item.clone());
            result.push(perm);
        }
    }
    result
}

/// Generates the power set of `arr` or subsets of a given size.
pub fn powerset<T: Clone>(arr: &[T], k: Option<usize>) -> Vec<Vec<T>> {
    match k {
        None => {
            let mut result = vec![vec![]];
            for size in 1..=arr.len() {
                result.extend(combinations(arr, size));
            }
            result
        }
        Some(size) => {
            if size > arr.len() {
                vec![]
            } else {
                combinations(arr, size)
            }
        }
    }
}

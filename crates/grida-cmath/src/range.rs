use super::rect::Rectangle;
use super::vector2::Axis;
use super::utils::{is_uniform, powerset, mean as mean_scalar};

/// A 1D range represented as `[start, end]` where start <= end.
pub type Range = [f32; 2];

/// Returns the average center of multiple ranges.
pub fn mean(ranges: &[Range]) -> f32 {
    let centers: Vec<f32> = ranges.iter().map(|r| (r[0] + r[1]) / 2.0).collect();
    mean_scalar(&centers)
}

/// Creates a range from a rectangle along the given axis.
pub fn from_rectangle(rect: &Rectangle, axis: Axis) -> Range {
    match axis {
        Axis::X => [rect.x, rect.x + rect.width],
        Axis::Y => [rect.y, rect.y + rect.height],
    }
}

/// Length of the range.
pub fn length(range: Range) -> f32 {
    range[1] - range[0]
}

/// Returns `[start, mid, end]` of the range.
pub fn to_3points_chunk(range: Range) -> [f32; 3] {
    [range[0], (range[0] + range[1]) / 2.0, range[1]]
}

/// Result of grouping ranges by uniform gaps.
#[derive(Debug, Clone, PartialEq)]
pub struct UniformGapGroup {
    pub loop_indices: Vec<usize>,
    pub min: f32,
    pub max: f32,
    pub gap: f32,
}

/// Groups ranges whose gaps are uniform within `tolerance`.
///
/// `k` limits the subset size examined (`None` for all combinations). The
/// returned list contains the indices of the ranges in each group, the
/// minimum/maximum positions and the uniform gap value.
///
/// This uses a power-set search and thus has exponential complexity.
///
/// # Example
/// ```rust
/// use grida_cmath::group_ranges_by_uniform_gap;
/// let ranges = vec![[0.0,10.0],[15.0,25.0],[30.0,40.0]];
/// let groups = group_ranges_by_uniform_gap(&ranges, None, 0.0);
/// assert!(!groups.is_empty());
/// ```
pub fn group_ranges_by_uniform_gap(
    ranges: &[Range],
    k: Option<usize>,
    tolerance: f32,
) -> Vec<UniformGapGroup> {
    let subsets = powerset(ranges, k);
    let mut result = Vec::new();

    'outer: for subset in subsets {
        if subset.is_empty() {
            continue;
        }
        if subset.len() == 1 {
            let idx = ranges
                .iter()
                .position(|r| r == &subset[0])
                .unwrap();
            result.push(UniformGapGroup {
                loop_indices: vec![idx],
                min: subset[0][0],
                max: subset[0][1],
                gap: 0.0,
            });
            continue;
        }

        let subset_indices: Vec<usize> = ranges
            .iter()
            .enumerate()
            .filter_map(|(i, r)| if subset.contains(r) { Some(i) } else { None })
            .collect();

        let mut sorted = subset_indices.clone();
        sorted.sort_by(|&a, &b| ranges[a][0].partial_cmp(&ranges[b][0]).unwrap());

        let mut distances = Vec::new();
        for i in 1..sorted.len() {
            let p0 = ranges[sorted[i - 1]];
            let p1 = ranges[sorted[i]];
            let dist = p1[0] - p0[1];
            if dist < 0.0 {
                continue 'outer;
            }
            distances.push(dist);
        }

        if is_uniform(&distances, tolerance) {
            let starts: Vec<f32> = sorted.iter().map(|&i| ranges[i][0]).collect();
            let ends: Vec<f32> = sorted.iter().map(|&i| ranges[i][1]).collect();
            result.push(UniformGapGroup {
                loop_indices: sorted,
                min: starts.iter().cloned().fold(f32::INFINITY, f32::min),
                max: ends.iter().cloned().fold(f32::NEG_INFINITY, f32::max),
                gap: distances.get(0).cloned().unwrap_or(0.0),
            });
        }
    }

    result
}


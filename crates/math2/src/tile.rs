use crate::rect::Rectangle;
use crate::region;

/// Computes the visible (non-occluded) regions of a sequence of 2D rectangles,
/// simulating a Z-buffer-like visibility pass in 2D space.
///
/// Each rectangle is clipped by the union of all previously processed rectangles,
/// returning only the parts that remain visible. This mimics Z-buffer behavior
/// for 2D tile/layer systems.
///
/// **Note:** The input must be pre-sorted in priority order — e.g., from
/// highest to lowest resolution, or front to back — for correct results.
///
/// Returns a vector where each entry corresponds to the visible fragments
/// of the input rectangle at the same index. Fully occluded rectangles return empty fragments.
///
/// # Arguments
/// * `rects` - A list of rectangles sorted in visibility priority order
///
/// # Returns
/// * A `Vec<Vec<Rectangle>>` where each inner vector contains the visible fragments
///   of the corresponding input rectangle.
///
/// # Example
/// ```
/// // Input: [R0, R1, R2] where R0 is topmost
/// // Output: [visible(R0), visible(R1 \ R0), visible(R2 \ (R0 ∪ R1))]
/// ```
pub fn z_punch_tiles(rects: &[Rectangle]) -> Vec<Vec<Rectangle>> {
    let mut seen: Vec<Rectangle> = Vec::new();
    let mut result: Vec<Vec<Rectangle>> = Vec::new();

    for rect in rects.iter() {
        let visible = region::difference(*rect, &seen);
        result.push(visible.clone());
        seen.push(*rect);
    }

    result
}

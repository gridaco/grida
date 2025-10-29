/// Defines a dash pattern for stroked paths.
///
/// `StrokeDashArray` specifies alternating lengths of dashes and gaps used when
/// stroking a path. The pattern is repeated cyclically along the path's length.
///
/// # Pattern Interpretation
///
/// The array values are interpreted as:
/// - **Even indices (0, 2, 4, ...)**: Dash lengths (visible stroke segments)
/// - **Odd indices (1, 3, 5, ...)**: Gap lengths (transparent segments)
///
/// If the array has an **odd number of values**, it is implicitly concatenated
/// with itself to form an even-length pattern. For example:
/// - `[5.0]` becomes `[5.0, 5.0]` (5px dash, 5px gap)
/// - `[10.0, 5.0, 2.0]` becomes `[10.0, 5.0, 2.0, 10.0, 5.0, 2.0]`
///
/// # Common Patterns
///
/// ```rust
/// use cg::cg::types::StrokeDashArray;
///
/// // Solid line (empty array = no dashing)
/// let solid = StrokeDashArray(vec![]);
///
/// // Simple dashed line: 10px dash, 5px gap
/// let dashed = StrokeDashArray(vec![10.0, 5.0]);
///
/// // Dotted line: 2px dash, 3px gap
/// let dotted = StrokeDashArray(vec![2.0, 3.0]);
///
/// // Dash-dot pattern: 10px dash, 5px gap, 2px dot, 5px gap
/// let dash_dot = StrokeDashArray(vec![10.0, 5.0, 2.0, 5.0]);
///
/// // Equal dash and gap (odd-length array)
/// let equal = StrokeDashArray(vec![8.0]); // Equivalent to [8.0, 8.0]
/// ```
///
/// # Behavior
///
/// - **Empty array**: No dashing is applied (solid stroke)
/// - **Single value**: Treated as equal dash and gap lengths
/// - **Zero values**: A zero-length dash or gap is valid but produces no visible
///   stroke segment (useful for complex patterns)
///
/// # CSS & SVG Equivalents
///
/// This corresponds to:
/// - **SVG**: [`stroke-dasharray`](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dasharray) attribute
/// - **CSS**: Not directly supported in standard CSS, but can be achieved via SVG or canvas
///
/// # Units
///
/// All values are in **logical pixels** and are scaled by the stroke width
/// during rendering in some systems, though in Skia they are typically
/// interpreted as absolute pixel values.
///
/// # Example: Complex Pattern
///
/// ```rust
/// use cg::cg::types::StrokeDashArray;
///
/// // Railroad track pattern: long-short-long with gaps
/// let railroad = StrokeDashArray(vec![
///     20.0,  // Long dash
///     5.0,   // Short gap
///     5.0,   // Short dash
///     5.0,   // Short gap
/// ]);
/// ```
///
/// # See Also
///
/// - [`StrokeAlign`] - Controls stroke positioning relative to path
/// - [SVG stroke-dasharray](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dasharray)
/// - [Skia SkPathEffect](https://skia.org/docs/user/api/skpaint_overview/#patheffect)
#[derive(Debug, Clone)]
pub struct StrokeDashArray(pub Vec<f32>);

impl StrokeDashArray {
    /// Creates a new `StrokeDashArray` from a vector of floats.
    pub fn new(values: Vec<f32>) -> Self {
        Self(values)
    }

    /// Returns an **SVG-compatible, render-ready** dash pattern derived from this array.
    ///
    /// This method normalizes the dash array following SVG `stroke-dasharray` rules,
    /// producing a pattern safe to pass to Skia's `PathEffect::dash` or similar APIs.
    ///
    /// # Normalization Rules
    ///
    /// 1. **Invalid input → empty (solid)**: If any value is negative, returns `[]` (renders as solid).
    ///    - Rationale: Per SVG spec, negative values are invalid and disable dashing.
    ///
    /// 2. **Empty input → empty output**: `[]` → `[]` (solid stroke, no dashing).
    ///
    /// 3. **All-zero dashes → empty (invisible)**: If all dash lengths (even indices) are zero,
    ///    returns `[]` (no visible segments).
    ///    - Example: `[0, 4]` → `[]` (0-length dashes = invisible)
    ///    - Example: `[0, 2, 0]` → `[]` after odd-duplication would be `[0, 2, 0, 0, 2, 0]`, all dashes zero
    ///
    /// 4. **Odd-length → duplicate**: Odd-length arrays are concatenated with themselves.
    ///    - Example: `[5]` → `[5, 5]` (5px dash, 5px gap)
    ///    - Example: `[10, 5, 2]` → `[10, 5, 2, 10, 5, 2]`
    ///    - Rationale: SVG/Canvas require even-length patterns for dash/gap alternation.
    ///
    /// # Zero Handling (SVG-compliant)
    ///
    /// Zeros are **valid** per SVG specification:
    /// - **Zero dash length** (even index): Invisible segment, contributes to pattern rhythm
    /// - **Zero gap length** (odd index): No gap between dashes (effectively solid in that region)
    ///
    /// Examples:
    /// - `[4, 0]` → `[4, 0]` = solid stroke (4px dash, no gap)
    /// - `[0, 4]` → `[]` = invisible (all dashes are zero-length)
    /// - `[10, 0, 2, 5]` → `[10, 0, 2, 5]` = 10px dash, no gap, 2px dash, 5px gap
    ///
    /// # Performance Notes
    ///
    /// - Does not modify the original `StrokeDashArray`
    /// - Allocates a new `Vec<f32>` for the normalized pattern
    /// - Typically called once per stroke during rendering
    ///
    /// # Examples
    ///
    /// ```
    /// # use cg::cg::types::StrokeDashArray;
    /// // Empty → solid
    /// assert_eq!(StrokeDashArray(vec![]).normalized(), vec![]);
    ///
    /// // Even-length pattern → unchanged
    /// assert_eq!(StrokeDashArray(vec![10.0, 5.0]).normalized(), vec![10.0, 5.0]);
    ///
    /// // Odd-length → duplicate
    /// assert_eq!(StrokeDashArray(vec![8.0]).normalized(), vec![8.0, 8.0]);
    /// assert_eq!(
    ///     StrokeDashArray(vec![10.0, 5.0, 2.0]).normalized(),
    ///     vec![10.0, 5.0, 2.0, 10.0, 5.0, 2.0]
    /// );
    ///
    /// // Invalid (negative) → empty
    /// assert_eq!(StrokeDashArray(vec![-1.0, 4.0]).normalized(), vec![]);
    /// assert_eq!(StrokeDashArray(vec![4.0, -1.0]).normalized(), vec![]);
    ///
    /// // All-zero dashes → invisible (empty)
    /// assert_eq!(StrokeDashArray(vec![0.0, 4.0]).normalized(), vec![]);
    /// assert_eq!(StrokeDashArray(vec![0.0, 2.0, 0.0]).normalized(), vec![]);
    ///
    /// // Zero gaps → valid (solid regions)
    /// assert_eq!(StrokeDashArray(vec![4.0, 0.0]).normalized(), vec![4.0, 0.0]);
    /// ```
    ///
    /// # See Also
    ///
    /// - [SVG stroke-dasharray specification](https://www.w3.org/TR/SVG2/painting.html#StrokeDashing)
    /// - [MDN stroke-dasharray](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dasharray)
    pub fn normalized(&self) -> Vec<f32> {
        // 1) Reject any negative values (invalid per SVG spec)
        if self.0.iter().any(|&x| x < 0.0) {
            return vec![]; // Invalid input → solid stroke
        }

        let mut v = self.0.clone();

        // 2) Empty → solid stroke
        if v.is_empty() {
            return v;
        }

        // 3) If all dash lengths (even indices) are zero → invisible (empty)
        if v.iter().step_by(2).all(|&x| x == 0.0) {
            return vec![];
        }

        // 4) Odd-length → duplicate to make even
        if v.len() % 2 == 1 {
            let clone = v.clone();
            v.extend_from_slice(&clone);
        }

        v
    }

    /// Returns a reference to the inner vector.
    pub fn as_slice(&self) -> &[f32] {
        &self.0
    }

    /// Returns a mutable reference to the inner vector.
    pub fn as_mut_slice(&mut self) -> &mut [f32] {
        &mut self.0
    }

    /// Returns true if the dash array is empty (solid stroke).
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Returns the number of dash/gap values in the pattern.
    pub fn len(&self) -> usize {
        self.0.len()
    }
}

impl Default for StrokeDashArray {
    /// Returns an empty dash array (solid stroke).
    fn default() -> Self {
        Self(Vec::new())
    }
}

impl FromIterator<f32> for StrokeDashArray {
    fn from_iter<I: IntoIterator<Item = f32>>(iter: I) -> Self {
        Self(iter.into_iter().collect())
    }
}

impl From<Vec<f32>> for StrokeDashArray {
    fn from(vec: Vec<f32>) -> Self {
        Self(vec)
    }
}

impl<const N: usize> From<[f32; N]> for StrokeDashArray {
    fn from(array: [f32; N]) -> Self {
        Self(array.to_vec())
    }
}

impl From<StrokeDashArray> for Vec<f32> {
    fn from(dash_array: StrokeDashArray) -> Self {
        dash_array.0
    }
}

impl AsRef<[f32]> for StrokeDashArray {
    fn as_ref(&self) -> &[f32] {
        &self.0
    }
}

impl std::ops::Deref for StrokeDashArray {
    type Target = [f32];

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::DerefMut for StrokeDashArray {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_array() {
        // Empty array → solid stroke (no normalization needed)
        assert_eq!(StrokeDashArray(vec![]).normalized(), Vec::<f32>::new());
    }

    #[test]
    fn test_even_length_positive_values() {
        // Even-length arrays with positive values pass through unchanged
        assert_eq!(
            StrokeDashArray(vec![10.0, 5.0]).normalized(),
            vec![10.0, 5.0]
        );
        assert_eq!(
            StrokeDashArray(vec![4.0, 2.0, 8.0, 3.0]).normalized(),
            vec![4.0, 2.0, 8.0, 3.0]
        );
    }

    #[test]
    fn test_odd_length_duplication() {
        // Single value → duplicate to [value, value]
        assert_eq!(StrokeDashArray(vec![5.0]).normalized(), vec![5.0, 5.0]);
        assert_eq!(StrokeDashArray(vec![8.0]).normalized(), vec![8.0, 8.0]);

        // Odd-length (3) → duplicate to (6)
        assert_eq!(
            StrokeDashArray(vec![10.0, 5.0, 2.0]).normalized(),
            vec![10.0, 5.0, 2.0, 10.0, 5.0, 2.0]
        );

        // Odd-length (5) → duplicate to (10)
        assert_eq!(
            StrokeDashArray(vec![1.0, 2.0, 3.0, 4.0, 5.0]).normalized(),
            vec![1.0, 2.0, 3.0, 4.0, 5.0, 1.0, 2.0, 3.0, 4.0, 5.0]
        );
    }

    #[test]
    fn test_negative_values_invalid() {
        // Any negative value → invalid → empty (solid)
        let empty: Vec<f32> = vec![];
        assert_eq!(StrokeDashArray(vec![-1.0]).normalized(), empty);
        assert_eq!(StrokeDashArray(vec![-1.0, 4.0]).normalized(), empty);
        assert_eq!(StrokeDashArray(vec![4.0, -1.0]).normalized(), empty);
        assert_eq!(StrokeDashArray(vec![10.0, 5.0, -2.0]).normalized(), empty);
        assert_eq!(StrokeDashArray(vec![-1.0, -2.0, -3.0]).normalized(), empty);
    }

    #[test]
    fn test_zero_dash_lengths_invisible() {
        // All dash lengths (even indices) are zero → invisible → empty
        let empty: Vec<f32> = vec![];
        assert_eq!(StrokeDashArray(vec![0.0, 4.0]).normalized(), empty);
        assert_eq!(StrokeDashArray(vec![0.0, 10.0]).normalized(), empty);

        // Odd-length: [0, 2, 0] would duplicate to [0, 2, 0, 0, 2, 0]
        // All even indices (0, 2, 4) are zero → invisible
        assert_eq!(StrokeDashArray(vec![0.0, 2.0, 0.0]).normalized(), empty);

        // Even all zeros → invisible
        assert_eq!(StrokeDashArray(vec![0.0, 0.0]).normalized(), empty);
        assert_eq!(
            StrokeDashArray(vec![0.0, 5.0, 0.0, 10.0]).normalized(),
            empty
        );
    }

    #[test]
    fn test_zero_gaps_valid() {
        // Zero gaps (odd indices) are valid → creates solid regions
        // [4, 0] is even-length, stays as-is (no duplication)
        assert_eq!(StrokeDashArray(vec![4.0, 0.0]).normalized(), vec![4.0, 0.0]);
        assert_eq!(
            StrokeDashArray(vec![10.0, 0.0, 2.0, 5.0]).normalized(),
            vec![10.0, 0.0, 2.0, 5.0]
        );

        // Mixed: some gaps zero, some not
        assert_eq!(
            StrokeDashArray(vec![8.0, 0.0, 4.0, 2.0]).normalized(),
            vec![8.0, 0.0, 4.0, 2.0]
        );

        // Odd-length with zero gap → duplicates
        assert_eq!(
            StrokeDashArray(vec![5.0, 0.0, 3.0]).normalized(),
            vec![5.0, 0.0, 3.0, 5.0, 0.0, 3.0]
        );
    }

    #[test]
    fn test_mixed_zeros_and_positives() {
        // Zero as first gap (odd index after duplication)
        assert_eq!(
            StrokeDashArray(vec![5.0, 0.0, 3.0]).normalized(),
            vec![5.0, 0.0, 3.0, 5.0, 0.0, 3.0]
        );

        // Some dashes zero, some positive → as long as ANY dash > 0, it's visible
        assert_eq!(
            StrokeDashArray(vec![0.0, 4.0, 8.0, 2.0]).normalized(),
            vec![0.0, 4.0, 8.0, 2.0]
        );
    }

    #[test]
    fn test_ui_common_patterns() {
        // UI sends single value → duplicate for dash-gap pair
        assert_eq!(StrokeDashArray(vec![5.0]).normalized(), vec![5.0, 5.0]);

        // UI sends dash and gap separately
        assert_eq!(
            StrokeDashArray(vec![10.0, 5.0]).normalized(),
            vec![10.0, 5.0]
        );

        // User clears dash → invalid/empty
        assert_eq!(StrokeDashArray(vec![]).normalized(), Vec::<f32>::new());
    }

    #[test]
    fn test_svg_spec_edge_cases() {
        let empty: Vec<f32> = vec![];

        // SVG spec: "0 0" → all dashes zero → invisible
        assert_eq!(StrokeDashArray(vec![0.0, 0.0]).normalized(), empty);

        // SVG spec: "5 0" → solid (no gaps), even-length stays as-is
        assert_eq!(StrokeDashArray(vec![5.0, 0.0]).normalized(), vec![5.0, 0.0]);

        // SVG spec: "0 5" → invisible (zero-length dashes)
        assert_eq!(StrokeDashArray(vec![0.0, 5.0]).normalized(), empty);

        // SVG spec: "5" → "5 5" (odd-length duplicates)
        assert_eq!(StrokeDashArray(vec![5.0]).normalized(), vec![5.0, 5.0]);
    }
}

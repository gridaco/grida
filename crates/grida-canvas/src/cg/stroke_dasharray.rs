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
    /// The returned vector is safe to pass to low-level stroke dash APIs (e.g. Skia's
    /// `PathEffect::dash`) and follows SVG's normalization rules:
    ///
    /// ### Normalization rules
    /// 1. **Filter negative values**: Only negative values are removed (zeros are valid).
    ///    - Rationale: Negative lengths are invalid; zeros represent invisible dashes or no gaps per SVG spec.
    /// 2. **Empty after filtering ⇒ solid**: If no values remain, returns an empty
    ///    vector (`[]`), which conventionally means "no dashing" (solid stroke).
    /// 3. **All-zero dashes ⇒ invisible**: If all dash lengths (even indices) are zero, returns `[]` (no visible stroke).
    /// 4. **Odd-length duplication**: If the resulting list has an **odd** count, it is
    ///    **concatenated with itself once** to make the count **even**.
    ///    - Examples:
    ///      - `[5.0]` → `[5.0, 5.0]` (5 on, 5 off)
    ///      - `[10.0, 5.0, 2.0]` → `[10.0, 5.0, 2.0, 10.0, 5.0, 2.0]`
    ///
    /// These rules mirror the SVG `stroke-dasharray` behavior and produce a pattern with
    /// a stable **on/off alternation**, which many rasterizers (including Skia) require.
    ///
    /// ### Notes
    /// - This method **does not modify** the original `StrokeDashArray`.
    /// - The returned values are **absolute logical pixels**. If your renderer expects a
    ///   different unit system (e.g., scaled by stroke width), convert accordingly.
    /// - If you also manage a *dash offset / phase*, normalize it separately with the sum
    ///   of this returned pattern's values.
    ///
    /// ### Examples
    /// ```
    /// # use cg::cg::types::StrokeDashArray;
    /// // Solid stroke: empty input stays empty
    /// assert_eq!(StrokeDashArray(vec![]).normalized(), vec![]);
    ///
    /// // Positive even-length pattern passes through
    /// assert_eq!(StrokeDashArray(vec![10.0, 5.0]).normalized(), vec![10.0, 5.0]);
    ///
    /// // Single value duplicates to make an even on/off pair
    /// assert_eq!(StrokeDashArray(vec![8.0]).normalized(), vec![8.0, 8.0]);
    ///
    /// // Odd-length list is duplicated once
    /// assert_eq!(
    ///     StrokeDashArray(vec![10.0, 5.0, 2.0]).normalized(),
    ///     vec![10.0, 5.0, 2.0, 10.0, 5.0, 2.0]
    /// );
    ///
    /// // Negatives are dropped; all-zero dashes → invisible
    /// assert_eq!(StrokeDashArray(vec![0.0, -1.0]).normalized(), vec![]);
    ///
    /// // Zeros with positive values → kept and normalized
    /// assert_eq!(StrokeDashArray(vec![0.0, 2.0, 0.0]).normalized(), vec![]);
    /// ```
    pub fn normalized(&self) -> Vec<f32> {
        // 1) Filter only negatives (zeros are valid per SVG spec)
        let mut v: Vec<f32> = self.0.iter().copied().filter(|x| *x >= 0.0).collect();

        // 2) Empty → solid stroke
        if v.is_empty() {
            return v;
        }

        // 3) Optimization: if all dash lengths (even indices) are zero, return empty (invisible)
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

//! Per-side stroke width support with flexible resolution.
//!
//! This module provides data structures for managing stroke widths that can vary
//! per side (top, right, bottom, left) on rectangular shapes, similar to CSS border widths.
//!
//! # Three-Stage Design
//!
//! The module uses a three-stage design pattern:
//!
//! 1. **[`UnknownStrokeWidth`]** - Universal input format (CSS-like)
//!    - Used for serialization/deserialization (e.g., loading from .grida files)
//!    - Allows partial specification where some sides can be undefined
//!    - Mirrors the schema structure with optional fields
//!    - Can be resolved to different variants based on node type
//!
//! 2. **Type-specific wrappers**:
//!    - **[`StrokeWidth`]** - For rectangular nodes (containers, rectangles, images)
//!      - Enum with `None`, `Uniform(f32)`, or `Rectangular(RectangularStrokeWidth)`
//!    - **[`SingularStrokeWidth`]** - For simple nodes (circles, polygons, SVG paths)
//!      - Simple `Option<f32>` wrapper, ignores per-side values
//!
//! 3. **[`RectangularStrokeWidth`]** - Concrete per-side values
//!    - Used for rendering rectangular shapes with per-side strokes
//!    - All values are resolved to concrete f32 values
//!    - Provides utility methods like `is_uniform()` and `is_none()`
//!
//! # Resolution Strategy
//!
//! The `UnknownStrokeWidth` input format is resolved based on node type:
//!
//! - **Rectangles, Containers, Images**: `UnknownStrokeWidth` → `StrokeWidth`
//! - **Circles, Polygons, SVG Paths**: `UnknownStrokeWidth` → `SingularStrokeWidth` (only uses base `stroke_width`)
//! - **Lines, Vectors, Text**: Direct `f32` usage (special handling)
//!
//! # Example
//!
//! ```ignore
//! // From file/schema (CSS-like input)
//! let unknown = UnknownStrokeWidth {
//!     stroke_width: Some(2.0),
//!     stroke_top_width: Some(4.0),
//!     stroke_right_width: None,
//!     stroke_bottom_width: None,
//!     stroke_left_width: None,
//! };
//!
//! // For a rectangle: resolve to StrokeWidth enum
//! let rect_stroke: StrokeWidth = unknown.clone().into();
//! // rect_stroke = Rectangular(top=4.0, right=2.0, bottom=2.0, left=2.0)
//!
//! // For a circle: resolve to singular (ignores per-side values)
//! let circle_stroke: SingularStrokeWidth = unknown.clone().into();
//! // circle_stroke = SingularStrokeWidth(Some(2.0))
//! ```

/// Resolved stroke width representation after processing [`UnknownStrokeWidth`].
///
/// This enum provides a type-safe way to represent different stroke width configurations
/// based on the node type being rendered. It's the intermediate format between the
/// CSS-like input ([`UnknownStrokeWidth`]) and actual rendering.
///
/// # Variants
///
/// * `None` - No stroke should be rendered (all widths are 0 or undefined)
/// * `Uniform(f32)` - Single stroke width for all sides (used for lines, circles, simple shapes)
/// * `Rectangular(RectangularStrokeWidth)` - Per-side stroke widths (used for rectangles, containers)
///
/// # Resolution Rules
///
/// When resolving from [`UnknownStrokeWidth`]:
///
/// - If all values are 0 or undefined → `StrokeWidth::None`
/// - For node types that support per-side strokes (rectangles, containers):
///   - If per-side values are defined → `StrokeWidth::Rectangular`
///   - If only uniform width is defined → `StrokeWidth::Uniform`
/// - For node types that only support uniform strokes (lines, circles):
///   - Always resolves to `StrokeWidth::Uniform` (using base `stroke_width`)
///
/// # Example
///
/// ```ignore
/// match stroke_width {
///     StrokeWidth::None => {
///         // Skip stroke rendering
///     }
///     StrokeWidth::Uniform(width) => {
///         // Render with uniform stroke width
///         paint.set_stroke_width(width);
///     }
///     StrokeWidth::Rectangular(rect) => {
///         // Render with per-side stroke widths
///         render_rectangular_stroke(rect);
///     }
/// }
/// ```
#[derive(Debug, Clone)]
pub enum StrokeWidth {
    /// No stroke (all widths are 0)
    None,
    /// Uniform stroke width for all sides
    Uniform(f32),
    /// Per-side stroke widths for rectangular shapes
    Rectangular(RectangularStrokeWidth),
}

impl StrokeWidth {
    /// Checks if the stroke width is effectively none (zero or absent).
    ///
    /// Returns `true` if:
    /// - The variant is `None`
    /// - The variant is `Uniform(0.0)`
    /// - The variant is `Rectangular` with all sides at 0.0
    ///
    /// # Example
    ///
    /// ```ignore
    /// assert!(StrokeWidth::None.is_none());
    /// assert!(StrokeWidth::Uniform(0.0).is_none());
    /// assert!(!StrokeWidth::Uniform(2.0).is_none());
    /// ```
    pub fn is_none(&self) -> bool {
        match self {
            StrokeWidth::None => true,
            StrokeWidth::Uniform(width) => *width == 0.0,
            StrokeWidth::Rectangular(rect) => rect.is_none(),
        }
    }

    /// Returns the maximum stroke width value.
    ///
    /// For `Uniform`, returns the single width value.
    /// For `Rectangular`, returns the maximum of all four sides.
    /// For `None`, returns 0.0.
    ///
    /// This is useful for calculating bounding boxes and layout calculations
    /// where you need to account for the thickest stroke.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let uniform = StrokeWidth::Uniform(3.0);
    /// assert_eq!(uniform.max(), 3.0);
    ///
    /// let rect = StrokeWidth::Rectangular(RectangularStrokeWidth {
    ///     stroke_top_width: 1.0,
    ///     stroke_right_width: 4.0,
    ///     stroke_bottom_width: 2.0,
    ///     stroke_left_width: 3.0,
    /// });
    /// assert_eq!(rect.max(), 4.0);
    /// ```
    pub fn max(&self) -> f32 {
        match self {
            StrokeWidth::None => 0.0,
            StrokeWidth::Uniform(width) => *width,
            StrokeWidth::Rectangular(rect) => rect.max(),
        }
    }
}

impl From<f32> for StrokeWidth {
    fn from(val: f32) -> Self {
        StrokeWidth::Uniform(val)
    }
}

impl Default for StrokeWidth {
    fn default() -> Self {
        StrokeWidth::None
    }
}

/// Universal input format for stroke width values (CSS-like).
///
/// This is the storage/serialization format that serves as the universal input
/// for all stroke width configurations. It mirrors the schema structure with
/// optional fields, allowing flexible specification similar to CSS border widths.
///
/// Use this when:
/// - Loading from .grida files or other serialization formats
/// - Accepting user input from the editor
/// - Representing partial stroke width data where some sides may be undefined
///
/// This format is **resolution-agnostic** - it doesn't know or care what type of
/// node it will be applied to. The resolution to [`StrokeWidth`] happens later
/// based on the target node type.
///
/// # Fields
///
/// * `stroke_width` - The base/default stroke width for all sides
/// * `stroke_top_width` - Optional override for top side stroke width
/// * `stroke_right_width` - Optional override for right side stroke width
/// * `stroke_bottom_width` - Optional override for bottom side stroke width
/// * `stroke_left_width` - Optional override for left side stroke width
///
/// # Resolution Strategy
///
/// When converting to concrete formats:
///
/// - **To [`RectangularStrokeWidth`]**: Individual side values take precedence
///   over the base `stroke_width`. If a side value is `None`, it falls back
///   to `stroke_width` (or 0.0 if that's also `None`).
///
/// - **To [`StrokeWidth::Uniform`]**: Only the base `stroke_width` is used,
///   individual side values are ignored.
///
/// # Example
///
/// ```ignore
/// // CSS-like: "2px 4px" (vertical=2px, horizontal=4px)
/// let input = UnknownStrokeWidth {
///     stroke_width: Some(2.0),       // base
///     stroke_top_width: None,         // falls back to base (2.0)
///     stroke_right_width: Some(4.0),  // override
///     stroke_bottom_width: None,      // falls back to base (2.0)
///     stroke_left_width: Some(4.0),   // override
/// };
///
/// // For rectangle → Rectangular(top=2, right=4, bottom=2, left=4)
/// // For line → Uniform(2.0)
/// ```
#[derive(Debug, Clone, Default)]
pub struct UnknownStrokeWidth {
    pub stroke_width: Option<f32>,
    pub stroke_top_width: Option<f32>,
    pub stroke_right_width: Option<f32>,
    pub stroke_bottom_width: Option<f32>,
    pub stroke_left_width: Option<f32>,
}

/// Converts from the universal input format to the concrete rectangular stroke width format.
///
/// This implementation resolves all optional values to concrete f32 values by:
/// 1. Using the base `stroke_width` (or 0.0 if `None`) as the fallback
/// 2. Using individual side values if present, otherwise falling back to base
///
/// This conversion is used when the target node type supports per-side stroke widths
/// (rectangles, containers, etc.).
///
/// # Example
///
/// ```ignore
/// let unknown = UnknownStrokeWidth {
///     stroke_width: Some(2.0),
///     stroke_top_width: Some(4.0),  // Override top
///     stroke_right_width: None,      // Will use base (2.0)
///     stroke_bottom_width: None,     // Will use base (2.0)
///     stroke_left_width: None,       // Will use base (2.0)
/// };
/// let rect: RectangularStrokeWidth = unknown.into();
/// // Result: top=4.0, right=2.0, bottom=2.0, left=2.0
/// ```
impl From<UnknownStrokeWidth> for RectangularStrokeWidth {
    fn from(val: UnknownStrokeWidth) -> Self {
        let base = val.stroke_width.unwrap_or(0.0);
        RectangularStrokeWidth {
            stroke_top_width: val.stroke_top_width.unwrap_or(base),
            stroke_right_width: val.stroke_right_width.unwrap_or(base),
            stroke_bottom_width: val.stroke_bottom_width.unwrap_or(base),
            stroke_left_width: val.stroke_left_width.unwrap_or(base),
        }
    }
}

/// Simple singular stroke width wrapper for node types that only support single-value strokes.
///
/// This is a newtype wrapper around `Option<f32>` used internally in the schema for
/// node types that don't support per-side stroke widths (circles, polygons, SVG paths, etc.).
///
/// Unlike [`UnknownStrokeWidth`] which can have per-side values, this explicitly
/// represents only a single uniform stroke width.
///
/// # Conversion from UnknownStrokeWidth
///
/// When converting from `UnknownStrokeWidth`, only the base `stroke_width` field is used.
/// All per-side width fields (top, right, bottom, left) are ignored.
///
/// # Example
///
/// ```ignore
/// // Direct construction
/// let stroke = SingularStrokeWidth(Some(2.0));
/// assert!(!stroke.is_none());
/// assert_eq!(stroke.value_or_zero(), 2.0);
///
/// // From unknown (ignores per-side values)
/// let unknown = UnknownStrokeWidth {
///     stroke_width: Some(2.0),
///     stroke_top_width: Some(5.0),  // Ignored
///     ..Default::default()
/// };
/// let singular: SingularStrokeWidth = unknown.into();
/// assert_eq!(singular.value_or_zero(), 2.0);  // Uses base width only
///
/// // No stroke
/// let no_stroke = SingularStrokeWidth(None);
/// assert!(no_stroke.is_none());
/// assert_eq!(no_stroke.value_or_zero(), 0.0);
/// ```
#[derive(Debug, Clone)]
pub struct SingularStrokeWidth(pub Option<f32>);

impl SingularStrokeWidth {
    /// Returns `true` if the stroke width is absent or zero.
    pub fn is_none(&self) -> bool {
        self.0.is_none() || self.0.unwrap() == 0.0
    }

    /// Returns the stroke width value, or 0.0 if absent.
    pub fn value_or_zero(&self) -> f32 {
        self.0.unwrap_or_default()
    }
}

impl From<f32> for SingularStrokeWidth {
    fn from(val: f32) -> Self {
        SingularStrokeWidth(Some(val))
    }
}

impl From<Option<f32>> for SingularStrokeWidth {
    fn from(val: Option<f32>) -> Self {
        SingularStrokeWidth(val)
    }
}

impl From<Option<f64>> for SingularStrokeWidth {
    fn from(val: Option<f64>) -> Self {
        SingularStrokeWidth(val.map(|v| v as f32))
    }
}

/// Converts from universal input format to singular stroke width, ignoring per-side values.
///
/// Only the base `stroke_width` field is used. All per-side width fields are ignored.
/// This is the expected behavior for node types that don't support per-side strokes.
///
/// # Example
///
/// ```ignore
/// let unknown = UnknownStrokeWidth {
///     stroke_width: Some(3.0),
///     stroke_top_width: Some(10.0),  // Ignored
///     stroke_right_width: Some(5.0), // Ignored
///     ..Default::default()
/// };
/// let singular: SingularStrokeWidth = unknown.into();
/// assert_eq!(singular.value_or_zero(), 3.0);
/// ```
impl From<UnknownStrokeWidth> for SingularStrokeWidth {
    fn from(val: UnknownStrokeWidth) -> Self {
        SingularStrokeWidth(val.stroke_width)
    }
}

/// Converts a singular stroke width to the resolved [`StrokeWidth`] enum.
///
/// Maps `Some(width)` to `StrokeWidth::Uniform(width)` and `None` to `StrokeWidth::None`.
impl From<SingularStrokeWidth> for StrokeWidth {
    fn from(val: SingularStrokeWidth) -> Self {
        if let Some(width) = val.0 {
            StrokeWidth::Uniform(width)
        } else {
            StrokeWidth::None
        }
    }
}

/// Converts from universal input format to the resolved stroke width enum.
///
/// This conversion handles both uniform and per-side stroke widths:
/// - If any per-side values are defined, converts to `StrokeWidth::Rectangular`
/// - Otherwise, converts base `stroke_width` to `StrokeWidth::Uniform` or `StrokeWidth::None`
///
/// # Example
///
/// ```ignore
/// // Uniform stroke
/// let uniform = UnknownStrokeWidth {
///     stroke_width: Some(2.0),
///     ..Default::default()
/// };
/// let stroke: StrokeWidth = uniform.into();
/// // stroke = StrokeWidth::Uniform(2.0)
///
/// // Per-side stroke
/// let per_side = UnknownStrokeWidth {
///     stroke_width: Some(2.0),
///     stroke_top_width: Some(4.0),
///     ..Default::default()
/// };
/// let stroke: StrokeWidth = per_side.into();
/// // stroke = StrokeWidth::Rectangular(...)
/// ```
impl From<UnknownStrokeWidth> for StrokeWidth {
    fn from(val: UnknownStrokeWidth) -> Self {
        // Check if any per-side values are defined
        let has_per_side = val.stroke_top_width.is_some()
            || val.stroke_right_width.is_some()
            || val.stroke_bottom_width.is_some()
            || val.stroke_left_width.is_some();

        if has_per_side {
            // Convert to rectangular (handles fallback to base width)
            StrokeWidth::Rectangular(val.into())
        } else {
            // Use base width only
            match val.stroke_width {
                Some(width) if width > 0.0 => StrokeWidth::Uniform(width),
                _ => StrokeWidth::None,
            }
        }
    }
}

/// Resolved stroke width values for a rectangular shape with concrete per-side widths.
///
/// This is the runtime/rendering format with all values resolved to concrete f32 values.
/// Use this structure when performing actual rendering operations where you need
/// definite stroke width values for each side of a rectangle.
///
/// Unlike [`UnknownStrokeWidth`], all fields here are non-optional and ready
/// for immediate use in rendering calculations.
///
/// # Fields
///
/// * `stroke_top_width` - Stroke width for the top edge
/// * `stroke_right_width` - Stroke width for the right edge
/// * `stroke_bottom_width` - Stroke width for the bottom edge
/// * `stroke_left_width` - Stroke width for the left edge
#[derive(Debug, Clone)]
pub struct RectangularStrokeWidth {
    pub stroke_top_width: f32,
    pub stroke_right_width: f32,
    pub stroke_bottom_width: f32,
    pub stroke_left_width: f32,
}

impl RectangularStrokeWidth {
    /// Checks if all four sides have the same stroke width.
    ///
    /// Returns `true` if top, right, bottom, and left stroke widths are all equal,
    /// indicating that this could be represented as a single uniform stroke width.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let uniform = RectangularStrokeWidth {
    ///     stroke_top_width: 2.0,
    ///     stroke_right_width: 2.0,
    ///     stroke_bottom_width: 2.0,
    ///     stroke_left_width: 2.0,
    /// };
    /// assert!(uniform.is_uniform());
    ///
    /// let varied = RectangularStrokeWidth {
    ///     stroke_top_width: 2.0,
    ///     stroke_right_width: 4.0,
    ///     stroke_bottom_width: 2.0,
    ///     stroke_left_width: 2.0,
    /// };
    /// assert!(!varied.is_uniform());
    /// ```
    pub fn is_uniform(&self) -> bool {
        self.stroke_top_width == self.stroke_right_width
            && self.stroke_right_width == self.stroke_bottom_width
            && self.stroke_bottom_width == self.stroke_left_width
    }

    /// Checks if there is no stroke width on any side.
    ///
    /// Returns `true` if all four sides have a stroke width of 0.0,
    /// indicating that effectively no stroke should be rendered.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let no_stroke = RectangularStrokeWidth {
    ///     stroke_top_width: 0.0,
    ///     stroke_right_width: 0.0,
    ///     stroke_bottom_width: 0.0,
    ///     stroke_left_width: 0.0,
    /// };
    /// assert!(no_stroke.is_none());
    ///
    /// let has_stroke = RectangularStrokeWidth {
    ///     stroke_top_width: 2.0,
    ///     stroke_right_width: 0.0,
    ///     stroke_bottom_width: 0.0,
    ///     stroke_left_width: 0.0,
    /// };
    /// assert!(!has_stroke.is_none());
    /// ```
    pub fn is_none(&self) -> bool {
        self.stroke_top_width == 0.0
            && self.stroke_right_width == 0.0
            && self.stroke_bottom_width == 0.0
            && self.stroke_left_width == 0.0
    }

    /// Returns the maximum stroke width among all four sides.
    ///
    /// This is useful for calculating bounding boxes, determining the maximum
    /// stroke extent, or finding the thickest stroke side for layout calculations.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let rect = RectangularStrokeWidth {
    ///     stroke_top_width: 1.0,
    ///     stroke_right_width: 4.0,
    ///     stroke_bottom_width: 2.0,
    ///     stroke_left_width: 3.0,
    /// };
    /// assert_eq!(rect.max(), 4.0);
    ///
    /// let uniform = RectangularStrokeWidth {
    ///     stroke_top_width: 2.5,
    ///     stroke_right_width: 2.5,
    ///     stroke_bottom_width: 2.5,
    ///     stroke_left_width: 2.5,
    /// };
    /// assert_eq!(uniform.max(), 2.5);
    /// ```
    pub fn max(&self) -> f32 {
        self.stroke_top_width
            .max(self.stroke_right_width)
            .max(self.stroke_bottom_width)
            .max(self.stroke_left_width)
    }
}

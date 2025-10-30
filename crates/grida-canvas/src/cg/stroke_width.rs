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
//! 2. **[`StrokeWidth`]** - Resolved stroke width enum
//!    - Type-safe representation of stroke width after resolution
//!    - `None` - No stroke
//!    - `Uniform(f32)` - Same width on all sides (for lines, circles, etc.)
//!    - `Rectangular(RectangularStrokeWidth)` - Per-side widths (for rectangles, containers)
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
//! - **Rectangles, Containers**: Resolved to `StrokeWidth::Rectangular`
//! - **Lines, Vectors**: Resolved to `StrokeWidth::Uniform`
//! - **No stroke**: Resolved to `StrokeWidth::None`
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
//! // For a rectangle: resolve to per-side variant
//! let rect_stroke = StrokeWidth::Rectangular(unknown.clone().into());
//! // rect_stroke has: top=4.0, right=2.0, bottom=2.0, left=2.0
//!
//! // For a line: resolve to uniform variant (use base width)
//! let line_stroke = StrokeWidth::Uniform(unknown.stroke_width.unwrap_or(0.0));
//! // line_stroke has: 2.0
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
#[derive(Debug, Clone)]
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
}

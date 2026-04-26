use serde::{Deserialize, Serialize};

/// A rectangle defined by its origin `(x, y)` and size `(width, height)`.
///
/// The rectangle is represented in a coordinate system where:
/// - `x` and `y` represent the top-left corner position
/// - `width` and `height` represent the dimensions
///
/// # Constraints
///
/// - `width` and `height` must be non-negative (can be zero, but not negative)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CGRect {
    /// The x-coordinate of the rectangle's origin (left edge).
    pub x: f32,
    /// The y-coordinate of the rectangle's origin (top edge).
    pub y: f32,
    /// The width of the rectangle. Must be non-negative (can be zero, but not negative).
    pub width: f32,
    /// The height of the rectangle. Must be non-negative (can be zero, but not negative).
    pub height: f32,
}

impl CGRect {
    /// Creates a rectangle at the origin with zero width and height.
    pub fn zero() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        }
    }

    /// Creates a rectangle from x, y, width, and height values.
    ///
    /// # Arguments
    ///
    /// * `x` - The x-coordinate of the rectangle's origin
    /// * `y` - The y-coordinate of the rectangle's origin
    /// * `width` - The width of the rectangle. Must be non-negative (can be zero, but not negative)
    /// * `height` - The height of the rectangle. Must be non-negative (can be zero, but not negative)
    ///
    /// # Returns
    ///
    /// A new `CGRect` instance with the specified parameters.
    pub fn from_xywh(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }
}

impl Default for CGRect {
    fn default() -> Self {
        Self::zero()
    }
}

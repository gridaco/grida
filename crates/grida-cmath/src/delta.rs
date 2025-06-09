/// Delta transformations for affine matrices.
///
/// Provides helpers for projecting a scalar delta through a 2D affine
/// transformation matrix.
use super::{transform::AffineTransform, vector2::Axis};

/// Projects a scalar delta along a given axis through a 2D affine transform.
///
/// # Parameters
/// - `offset`: The delta along the X or Y axis.
/// - `axis`:   Which axis the delta corresponds to.
/// - `transform`: The 2×3 affine transform matrix.
///
/// # Returns
/// The transformed scalar offset in surface space.
pub fn transform(offset: f32, axis: Axis, transform: &AffineTransform) -> f32 {
    let i = match axis {
        Axis::X => 0,
        Axis::Y => 1,
    };
    let row = transform.matrix[i];
    row[i] * offset + row[2]
}

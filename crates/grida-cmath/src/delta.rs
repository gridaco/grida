/// Delta transformations for affine matrices.
///
/// Provides helpers for projecting a scalar delta through a 2D affine
/// transformation matrix.
use super::{transform::AffineTransform, vector2::Axis};

/// Projects a scalar offset along `axis` through the given transform.
///
/// The returned value is the transformed delta in surface space.
pub fn transform(offset: f32, axis: Axis, transform: &AffineTransform) -> f32 {
    let i = match axis {
        Axis::X => 0,
        Axis::Y => 1,
    };
    let row = transform.matrix[i];
    row[i] * offset + row[2]
}

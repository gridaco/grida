/// A 4-dimensional vector.
pub type Vector4 = [f32; 4];

/// Returns true if two vectors are identical.
pub fn identical(a: Vector4, b: Vector4) -> bool {
    a[0] == b[0] && a[1] == b[1] && a[2] == b[2] && a[3] == b[3]
}

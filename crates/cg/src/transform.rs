/// Represents a 2D affine transformation matrix.
///
/// The matrix is a 2x3 transformation:
/// [ [a, c, tx],
///   [b, d, ty] ]
///
/// It supports translation and rotation, and can be composed or inverted.
#[derive(Debug, Clone, Copy)]
pub struct AffineTransform {
    /// The 2x3 transformation matrix: [ [a, c, tx], [b, d, ty] ]
    pub matrix: [[f32; 3]; 2],
}

impl AffineTransform {
    /// Returns the identity transform.
    ///
    /// This is equivalent to no transformation.
    pub fn identity() -> Self {
        Self {
            matrix: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        }
    }

    /// Creates a translation transform by (tx, ty).
    pub fn translate(tx: f32, ty: f32) -> Self {
        Self {
            matrix: [[1.0, 0.0, tx], [0.0, 1.0, ty]],
        }
    }

    /// Creates a rotation transform in degrees, counter-clockwise.
    pub fn rotate(degrees: f32) -> Self {
        let rad = degrees.to_radians();
        let (sin, cos) = rad.sin_cos();

        Self {
            matrix: [[cos, -sin, 0.0], [sin, cos, 0.0]],
        }
    }

    /// Creates a combined transform of translation followed by rotation.
    pub fn new(tx: f32, ty: f32, rotation: f32) -> Self {
        Self::translate(tx, ty).compose(&Self::rotate(rotation))
    }

    pub fn x(&self) -> f32 {
        self.matrix[0][2]
    }
    pub fn y(&self) -> f32 {
        self.matrix[1][2]
    }

    /// Composes this transform with another.
    ///
    /// This is equivalent to applying `other` after `self`.
    pub fn compose(&self, other: &Self) -> Self {
        let a = self.matrix;
        let b = other.matrix;

        Self {
            matrix: [
                [
                    a[0][0] * b[0][0] + a[0][1] * b[1][0],
                    a[0][0] * b[0][1] + a[0][1] * b[1][1],
                    a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2],
                ],
                [
                    a[1][0] * b[0][0] + a[1][1] * b[1][0],
                    a[1][0] * b[0][1] + a[1][1] * b[1][1],
                    a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2],
                ],
            ],
        }
    }

    /// Returns the inverse of this affine transform, if it exists.
    ///
    /// Returns `None` if the matrix is singular (i.e. non-invertible).
    pub fn inverse(&self) -> Option<Self> {
        let [[a, c, tx], [b, d, ty]] = self.matrix;

        let det = a * d - b * c;
        if det.abs() < std::f32::EPSILON {
            return None;
        }

        let inv_det = 1.0 / det;

        let a_inv = d * inv_det;
        let b_inv = -b * inv_det;
        let c_inv = -c * inv_det;
        let d_inv = a * inv_det;

        let tx_inv = -(a_inv * tx + c_inv * ty);
        let ty_inv = -(b_inv * tx + d_inv * ty);

        Some(Self {
            matrix: [[a_inv, c_inv, tx_inv], [b_inv, d_inv, ty_inv]],
        })
    }
}

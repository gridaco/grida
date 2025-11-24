use math2::transform::AffineTransform;
use serde::{Deserialize, Serialize};

/// ```txt
/// | m00  m01  m02 |
/// | m10  m11  m12 |
/// | 0    0    1   |
/// ```
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(into = "[[f32; 3]; 2]", from = "[[f32; 3]; 2]")]

pub struct CGTransform2D {
    pub m00: f32,
    pub m01: f32,
    pub m02: f32,
    pub m10: f32,
    pub m11: f32,
    pub m12: f32,
}

impl CGTransform2D {
    #[rustfmt::skip]
    pub fn identity() -> Self {
        Self {
            m00: 1.0, m01: 0.0, m02: 0.0,
            m10: 0.0, m11: 1.0, m12: 0.0,
        }
    }

    #[rustfmt::skip]
    pub fn new(m00: f32, m01: f32, m02: f32, m10: f32, m11: f32, m12: f32) -> Self {
        Self {
            m00, m01, m02,
            m10, m11, m12,
        }
    }

    /// Returns the matrix representation as a 2x3 array
    pub fn matrix(&self) -> [[f32; 3]; 2] {
        [
            [self.m00, self.m01, self.m02],
            [self.m10, self.m11, self.m12],
        ]
    }
}

impl Default for CGTransform2D {
    fn default() -> Self {
        Self::identity()
    }
}

impl From<CGTransform2D> for [[f32; 3]; 2] {
    fn from(m: CGTransform2D) -> Self {
        [[m.m00, m.m01, m.m02], [m.m10, m.m11, m.m12]]
    }
}

impl From<[[f32; 3]; 2]> for CGTransform2D {
    fn from(m: [[f32; 3]; 2]) -> Self {
        Self {
            m00: m[0][0],
            m01: m[0][1],
            m02: m[0][2],
            m10: m[1][0],
            m11: m[1][1],
            m12: m[1][2],
        }
    }
}

impl From<CGTransform2D> for AffineTransform {
    fn from(transform: CGTransform2D) -> Self {
        AffineTransform::from_acebdf(
            transform.m00,
            transform.m01,
            transform.m02,
            transform.m10,
            transform.m11,
            transform.m12,
        )
    }
}

impl From<&CGTransform2D> for AffineTransform {
    fn from(transform: &CGTransform2D) -> Self {
        (*transform).into()
    }
}

impl From<AffineTransform> for CGTransform2D {
    fn from(transform: AffineTransform) -> Self {
        let [[m00, m01, m02], [m10, m11, m12]] = transform.matrix;
        CGTransform2D::new(m00, m01, m02, m10, m11, m12)
    }
}

impl From<&AffineTransform> for CGTransform2D {
    fn from(transform: &AffineTransform) -> Self {
        (*transform).into()
    }
}

#[cfg(test)]
mod tests {
    use super::CGTransform2D;
    use math2::transform::AffineTransform;

    #[test]
    fn deserialize_json_transform2d() {
        // Test CGTransform2D deserialization (flattened structure)
        let json_transform = r#"[[1.0, 0.0, 10.0], [0.0, 1.0, 20.0]]"#;
        let transform: CGTransform2D =
            serde_json::from_str(json_transform).expect("Failed to parse transform");
        assert_eq!(transform.matrix()[0], [1.0, 0.0, 10.0]);
        assert_eq!(transform.matrix()[1], [0.0, 1.0, 20.0]);

        // Test default value
        let default_transform = CGTransform2D::default();
        assert_eq!(default_transform.matrix()[0], [1.0, 0.0, 0.0]);
        assert_eq!(default_transform.matrix()[1], [0.0, 1.0, 0.0]);
    }

    #[test]
    fn json_transform2d_conversion() {
        // Test conversion to AffineTransform
        let json_transform = CGTransform2D::from([[2.0, 0.0, 5.0], [0.0, 2.0, 10.0]]);
        let affine: AffineTransform = json_transform.into();
        assert_eq!(affine.matrix[0], [2.0, 0.0, 5.0]);
        assert_eq!(affine.matrix[1], [0.0, 2.0, 10.0]);

        // Test conversion from AffineTransform
        let affine_transform = AffineTransform {
            matrix: [[3.0, 0.0, 15.0], [0.0, 3.0, 30.0]],
        };
        let json_transform: CGTransform2D = affine_transform.into();
        assert_eq!(json_transform.matrix()[0], [3.0, 0.0, 15.0]);
        assert_eq!(json_transform.matrix()[1], [0.0, 3.0, 30.0]);
    }
}

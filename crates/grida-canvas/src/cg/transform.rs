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

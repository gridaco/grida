pub mod mappings;

pub fn sk_matrix(m: [[f32; 3]; 2]) -> skia_safe::Matrix {
    let [[a, c, tx], [b, d, ty]] = m;
    skia_safe::Matrix::from_affine(&[a, b, c, d, tx, ty])
}

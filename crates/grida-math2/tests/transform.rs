use math2::transform::AffineTransform;

fn transforms_close(a: &AffineTransform, b: &AffineTransform) {
    for i in 0..2 {
        for j in 0..3 {
            assert!((a.matrix[i][j] - b.matrix[i][j]).abs() < 1e-6);
        }
    }
}

#[test]
fn invert_translation() {
    let t = AffineTransform::translate(5.0, -3.0);
    let inv = t.inverse().unwrap();
    let res = inv.compose(&t);
    transforms_close(&res, &AffineTransform::identity());
}

#[test]
fn invert_rotation() {
    let t = AffineTransform::rotate(45.0);
    let inv = t.inverse().unwrap();
    let res = inv.compose(&t);
    transforms_close(&res, &AffineTransform::identity());
}

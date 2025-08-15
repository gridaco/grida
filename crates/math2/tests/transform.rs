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
    let t = AffineTransform::new(5.0, -3.0, 0.0);
    let inv = t.inverse().unwrap();
    let res = inv.compose(&t);
    transforms_close(&res, &AffineTransform::identity());
}

#[test]
fn invert_rotation() {
    let t = AffineTransform::from_rotatation(45.0);
    let inv = t.inverse().unwrap();
    let res = inv.compose(&t);
    transforms_close(&res, &AffineTransform::identity());
}

#[test]
fn from_box_center_no_rotation() {
    // Test with no rotation - should be equivalent to just translation
    let t1 = AffineTransform::new(10.0, 20.0, 0.0);
    let t2 = AffineTransform::from_box_center(10.0, 20.0, 100.0, 50.0, 0.0);
    transforms_close(&t1, &t2);
}

#[test]
fn from_box_center_with_rotation() {
    // Test with 90 degree rotation around center
    let t = AffineTransform::from_box_center(10.0, 20.0, 100.0, 50.0, 90.0);

    // For 90 degree rotation around center:
    // - cos(90°) = 0, sin(90°) = 1
    // - center is at (10 + 50, 20 + 25) = (60, 45)
    // - tx = x + ox * (1.0 - c) + s * oy = 10 + 50 * (1.0 - 0) + 1 * 25 = 85
    // - ty = y + oy * (1.0 - c) - s * ox = 20 + 25 * (1.0 - 0) - 1 * 50 = -5
    let expected = AffineTransform {
        matrix: [[0.0, -1.0, 85.0], [1.0, 0.0, -5.0]],
    };

    transforms_close(&t, &expected);
}

#[test]
fn from_box_custom_origin() {
    // Test with custom origin (top-left corner)
    let t = AffineTransform::from_box(10.0, 20.0, 100.0, 50.0, 90.0, 0.0, 0.0);

    // For 90 degree rotation around top-left:
    // - cos(90°) = 0, sin(90°) = 1
    // - origin is at (10, 20)
    // - final translation should be (10, 20) + rotation of (0, 0) = (10, 20)
    let expected = AffineTransform {
        matrix: [[0.0, -1.0, 10.0], [1.0, 0.0, 20.0]],
    };
    transforms_close(&t, &expected);
}

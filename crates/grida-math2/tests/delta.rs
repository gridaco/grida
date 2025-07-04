use math2::vector2::Axis;
use math2::{delta_transform, transform::AffineTransform};

#[test]
fn identity() {
    let t = AffineTransform::identity();
    assert_eq!(delta_transform(5.0, Axis::X, &t), 5.0);
    assert_eq!(delta_transform(7.0, Axis::Y, &t), 7.0);
}

#[test]
fn translation() {
    let t = AffineTransform::new(10.0, 20.0, 0.0);
    assert_eq!(delta_transform(5.0, Axis::X, &t), 15.0);
    assert_eq!(delta_transform(7.0, Axis::Y, &t), 27.0);
}

#[test]
fn scaling() {
    let t = AffineTransform {
        matrix: [[2.0, 0.0, 0.0], [0.0, 3.0, 0.0]],
    };
    assert_eq!(delta_transform(4.0, Axis::X, &t), 8.0);
    assert_eq!(delta_transform(4.0, Axis::Y, &t), 12.0);
}

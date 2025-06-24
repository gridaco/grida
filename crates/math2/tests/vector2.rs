use math2::vector2::{Vector2, add, angle, intersection, intersects, multiply, rotate, sub};

#[test]
fn add_multiple() {
    let v1: Vector2 = [1.0, 2.0];
    let v2: Vector2 = [3.0, 4.0];
    let v3: Vector2 = [-1.0, -1.0];
    assert_eq!(add(&[v1, v2, v3]), [3.0, 5.0]);
}

#[test]
fn sub_two() {
    let v1: Vector2 = [5.0, 7.0];
    let v2: Vector2 = [2.0, 3.0];
    assert_eq!(sub(&[v1, v2]), [3.0, 4.0]);
}

#[test]
fn multiply_two() {
    let v1: Vector2 = [2.0, 3.0];
    let v2: Vector2 = [4.0, 5.0];
    assert_eq!(multiply(&[v1, v2]), [8.0, 15.0]);
}

#[test]
fn angle_first_quadrant() {
    let origin: Vector2 = [0.0, 0.0];
    let p: Vector2 = [1.0, 1.0];
    let a = angle(origin, p);
    assert!((a - 45.0).abs() < 0.001);
}

#[test]
fn rotate_90() {
    let v: Vector2 = [1.0, 0.0];
    let r = rotate(v, 90.0);
    assert!((r[0]).abs() < 1e-6 && (r[1] - 1.0).abs() < 1e-6);
}

#[test]
fn segment_intersection() {
    let a: Vector2 = [1.0, 5.0];
    let b: Vector2 = [4.0, 8.0];
    assert!(intersects(a, b));
    assert_eq!(intersection(a, b), Some([4.0, 5.0]));
}

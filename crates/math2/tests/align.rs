use math2::{align_scalar, align_vector2};

#[test]
fn scalar_snaps_to_nearest_within_threshold() {
    let (value, dist, idx) = align_scalar(15.0, &[10.0, 20.0, 25.0], 6.0);
    assert_eq!(value, 10.0);
    assert_eq!(dist, 5.0);
    assert_eq!(idx, vec![0, 1]);
}

#[test]
fn scalar_returns_original_when_out_of_threshold() {
    let (value, dist, idx) = align_scalar(15.0, &[1.0, 2.0, 3.0], 5.0);
    assert_eq!(value, 15.0);
    assert!(dist.is_infinite());
    assert!(idx.is_empty());
}

#[test]
fn vector2_snaps_to_nearest_within_threshold() {
    let point = [5.0, 5.0];
    let targets = &[[0.0, 0.0], [10.0, 10.0], [6.0, 7.0]];
    let (value, dist, idx) = align_vector2(point, targets, 5.0);
    assert_eq!(value, [6.0, 7.0]);
    assert!((dist - 2.236).abs() < 0.01);
    assert_eq!(idx, vec![2]);
}

#[test]
fn vector2_returns_original_when_out_of_threshold() {
    let point = [5.0, 5.0];
    let targets = &[[10.0, 10.0], [20.0, 20.0]];
    let (value, dist, idx) = align_vector2(point, targets, 4.0);
    assert_eq!(value, point);
    assert!(dist.is_infinite());
    assert!(idx.is_empty());
}

use grida_cmath::{quantize, nearest};

#[test]
fn quantize_basic() {
    assert_eq!(quantize(15.0, 10.0), 20.0);
    assert_eq!(quantize(14.0, 10.0), 10.0);
    assert_eq!(quantize(0.1123, 0.1), 0.1);
}

#[test]
#[should_panic]
fn quantize_invalid_step() {
    quantize(15.0, 0.0);
}

#[test]
fn nearest_value() {
    let vals = [10.0, 20.0, 30.0];
    assert_eq!(nearest(18.0, &vals), 20.0);
    assert_eq!(nearest(-5.0, &vals), 10.0);
}

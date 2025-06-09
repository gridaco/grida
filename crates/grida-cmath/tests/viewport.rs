use grida_cmath::{Rectangle, viewport_transform_to_fit};

fn rect(x: f32, y: f32, w: f32, h: f32) -> Rectangle {
    Rectangle { x, y, width: w, height: h }
}

#[test]
fn identity_when_target_zero_sized() {
    let viewport = rect(0.0, 0.0, 800.0, 600.0);
    let zero = rect(100.0, 100.0, 0.0, 0.0);
    let t = viewport_transform_to_fit(viewport, zero, 0.0);
    assert_eq!(t.matrix, [[1.0, 0.0, viewport.x], [0.0, 1.0, viewport.y]]);
}

#[test]
fn identity_when_effective_viewport_negative() {
    let viewport = rect(0.0, 0.0, 100.0, 100.0);
    let target = rect(0.0, 0.0, 50.0, 50.0);
    let t = viewport_transform_to_fit(viewport, target, 200.0);
    assert_eq!(t.matrix, [[1.0, 0.0, viewport.x], [0.0, 1.0, viewport.y]]);
}

#[test]
fn fits_larger_target_scale_lt_one() {
    let viewport = rect(0.0, 0.0, 400.0, 300.0);
    let target = rect(10.0, 20.0, 600.0, 400.0);
    let t = viewport_transform_to_fit(viewport, target, 0.0);
    assert!((t.matrix[0][0] - 0.666).abs() < 0.01);
    assert!((t.matrix[1][1] - 0.666).abs() < 0.01);
    let tx = t.matrix[0][2];
    let ty = t.matrix[1][2];
    assert!(!tx.is_nan());
    assert!(!ty.is_nan());
}

#[test]
fn fits_smaller_target_scale_ge_one() {
    let viewport = rect(0.0, 0.0, 400.0, 300.0);
    let target = rect(10.0, 10.0, 200.0, 100.0);
    let t = viewport_transform_to_fit(viewport, target, 0.0);
    assert!(t.matrix[0][0] >= 1.0);
}

#[test]
fn applies_uniform_margin() {
    let viewport = rect(0.0, 0.0, 800.0, 600.0);
    let target = rect(0.0, 0.0, 400.0, 300.0);
    let t = viewport_transform_to_fit(viewport, target, 50.0);
    assert!((t.matrix[0][0] - 1.6667).abs() < 0.01);
    assert!((t.matrix[1][1] - 1.6667).abs() < 0.01);
}

#[test]
fn applies_per_side_margin() {
    let viewport = rect(0.0, 0.0, 800.0, 600.0);
    let target = rect(100.0, 100.0, 600.0, 300.0);
    let t = viewport_transform_to_fit(viewport, target, [50.0, 20.0, 50.0, 20.0]);
    assert!((t.matrix[0][0] - 1.2667).abs() < 0.01);
    assert!((t.matrix[1][1] - 1.2667).abs() < 0.01);
}

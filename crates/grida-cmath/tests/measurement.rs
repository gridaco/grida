use grida_cmath::{Rectangle, RectangleSide, auxiliary_line_xylr, guide_line_xylr, measure};

fn rect(x: f32, y: f32, w: f32, h: f32) -> Rectangle {
    Rectangle {
        x,
        y,
        width: w,
        height: h,
    }
}

#[test]
fn measure_non_intersecting() {
    let a = rect(0.0, 0.0, 50.0, 50.0);
    let b = rect(100.0, 0.0, 20.0, 20.0);
    let m = measure(a, b).unwrap();
    assert_eq!(m.box_rect, a);
    assert_eq!(m.distance, [0.0, 50.0, 0.0, 0.0]);
}

#[test]
fn guide_line_top() {
    let r = rect(10.0, 20.0, 40.0, 30.0);
    let line = guide_line_xylr(r, RectangleSide::Top, 10.0, 1.0);
    assert_eq!(line, [30.0, 20.0, 30.0, 10.0, 10.0, 180.0]);
}

#[test]
fn auxiliary_line_left_outside() {
    let p = [0.0, 40.0];
    let r = rect(10.0, 20.0, 40.0, 30.0);
    let line = auxiliary_line_xylr(p, r, RectangleSide::Top, 1.0);
    assert!(line[4] > 0.0); // length positive
}

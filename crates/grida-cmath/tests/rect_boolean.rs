use grida_cmath::{Rectangle, rect_boolean_subtract};

fn rect(x: f32, y: f32, w: f32, h: f32) -> Rectangle {
    Rectangle {
        x,
        y,
        width: w,
        height: h,
    }
}

#[test]
fn subtract_no_intersection() {
    let a = rect(10.0, 10.0, 30.0, 30.0);
    let b = rect(50.0, 50.0, 10.0, 10.0);
    assert_eq!(rect_boolean_subtract(a, b), vec![a]);
}

#[test]
fn subtract_full_cover() {
    let a = rect(10.0, 10.0, 30.0, 30.0);
    let b = rect(5.0, 5.0, 40.0, 40.0);
    let result: Vec<Rectangle> = vec![];
    assert_eq!(rect_boolean_subtract(a, b), result);
}

#[test]
fn subtract_full_inner_intersection() {
    let a = rect(10.0, 10.0, 30.0, 30.0);
    let b = rect(20.0, 20.0, 10.0, 10.0);
    let expected = vec![
        rect(10.0, 10.0, 30.0, 10.0),
        rect(10.0, 30.0, 30.0, 10.0),
        rect(10.0, 20.0, 10.0, 10.0),
        rect(30.0, 20.0, 10.0, 10.0),
    ];
    assert_eq!(rect_boolean_subtract(a, b), expected);
}

#[test]
fn subtract_partial_overlap() {
    let a = rect(10.0, 10.0, 30.0, 30.0);
    let b = rect(25.0, 5.0, 20.0, 20.0);
    let expected = vec![rect(10.0, 25.0, 30.0, 15.0), rect(10.0, 10.0, 15.0, 15.0)];
    assert_eq!(rect_boolean_subtract(a, b), expected);
}

#[test]
fn subtract_zero_area() {
    let a = rect(10.0, 10.0, 30.0, 30.0);
    let b = rect(20.0, 20.0, 0.0, 0.0);
    assert_eq!(rect_boolean_subtract(a, b), vec![a]);
}

#[test]
fn subtract_touching_edges() {
    let a = rect(10.0, 10.0, 30.0, 30.0);
    let b = rect(40.0, 10.0, 20.0, 30.0);
    assert_eq!(rect_boolean_subtract(a, b), vec![a]);
}

use math2::{region_difference, region_subtract, Rectangle, Region};

fn rect(x: f32, y: f32, w: f32, h: f32) -> Rectangle {
    Rectangle {
        x,
        y,
        width: w,
        height: h,
    }
}

#[test]
fn difference_multiple_holes() {
    let base = rect(0.0, 0.0, 30.0, 30.0);
    let holes = [rect(10.0, 10.0, 10.0, 10.0), rect(0.0, 0.0, 5.0, 30.0)];
    let result = region_difference(base, &holes);
    let expected = vec![
        rect(5.0, 0.0, 25.0, 10.0),
        rect(5.0, 20.0, 25.0, 10.0),
        rect(5.0, 10.0, 5.0, 10.0),
        rect(20.0, 10.0, 10.0, 10.0),
    ];
    assert_eq!(result, expected);
}

#[test]
fn region_subtract_multiple() {
    let r1 = rect(0.0, 0.0, 10.0, 10.0);
    let r2 = rect(15.0, 0.0, 10.0, 10.0);
    let hole = rect(5.0, 0.0, 10.0, 10.0);

    let a = Region::from_rectangles(vec![r1, r2]);
    let b = Region::from_rectangles(vec![hole]);

    let result = region_subtract(a, b);

    assert_eq!(result.rectangles, vec![rect(0.0, 0.0, 5.0, 10.0), r2]);
}

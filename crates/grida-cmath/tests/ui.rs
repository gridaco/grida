use grida_cmath::{ui::{Point, Line}, transform::AffineTransform, transform_point, transform_line, normalize_line, format_number};

#[test]
fn transform_point_translation() {
    let p = Point { label: None, x: 1.0, y: 2.0 };
    let t = AffineTransform::translate(3.0, 4.0);
    let res = transform_point(&p, &t);
    assert_eq!(res.x, 4.0);
    assert_eq!(res.y, 6.0);
}

#[test]
fn transform_line_translation() {
    let line = Line { label: None, x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 };
    let t = AffineTransform::translate(1.0, 2.0);
    let res = transform_line(&line, &t);
    assert_eq!((res.x1, res.y1, res.x2, res.y2), (1.0, 2.0, 2.0, 3.0));
}

#[test]
fn normalize_line_swaps_when_needed() {
    let line = Line { label: None, x1: 5.0, y1: 0.0, x2: 3.0, y2: 1.0 };
    let res = normalize_line(&line);
    assert_eq!((res.x1, res.y1, res.x2, res.y2), (3.0, 1.0, 5.0, 0.0));
}

#[test]
fn format_number_examples() {
    assert_eq!(format_number(1.0, 1), "1");
    assert_eq!(format_number(1.2222, 1), "1.2");
    assert_eq!(format_number(9.0001, 2), "9");
    assert_eq!(format_number(9.1234, 2), "9.12");
}


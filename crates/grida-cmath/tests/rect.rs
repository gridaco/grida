use grida_cmath::vector2::{self, Axis};
use grida_cmath::{
    AlignKind, Alignment, CardinalDirection, Rectangle, axis_projection_intersection, contains,
    from_points, get_cardinal_point, get_relative_transform, intersection, offset,
    rect_align as align, rect_inset as inset, rect_pad as pad, rect_rotate, to_9points_chunk,
    union,
};

fn rect(x: f32, y: f32, w: f32, h: f32) -> Rectangle {
    Rectangle {
        x,
        y,
        width: w,
        height: h,
    }
}

#[test]
fn from_points_basic() {
    let pts = [[10.0, 20.0], [30.0, 40.0], [5.0, 25.0]];
    let r = from_points(&pts);
    assert_eq!(r, rect(5.0, 20.0, 25.0, 20.0));
}

#[test]
fn to_9points_chunk_order() {
    let r = rect(10.0, 20.0, 30.0, 40.0);
    let pts = to_9points_chunk(&r);
    assert_eq!(pts[0], [10.0, 20.0]);
    assert_eq!(pts[8], [25.0, 40.0]);
}

#[test]
fn contains_true() {
    let a = rect(20.0, 20.0, 30.0, 30.0);
    let b = rect(10.0, 10.0, 100.0, 100.0);
    assert!(contains(&a, &b));
}

#[test]
fn offset_top_left() {
    let r = rect(10.0, 10.0, 100.0, 50.0);
    assert_eq!(offset(&r, [5.0, 5.0]), [-5.0, -5.0]);
}

#[test]
fn intersection_partial() {
    let a = rect(10.0, 10.0, 30.0, 30.0);
    let b = rect(25.0, 25.0, 20.0, 20.0);
    assert_eq!(intersection(&a, &b), Some(rect(25.0, 25.0, 15.0, 15.0)));
}

#[test]
fn union_multiple() {
    let rects = [rect(10.0, 10.0, 30.0, 40.0), rect(50.0, 20.0, 20.0, 30.0)];
    assert_eq!(union(&rects), rect(10.0, 10.0, 60.0, 40.0));
}

#[test]
fn pad_uniform() {
    let r = rect(50.0, 50.0, 100.0, 80.0);
    let padded = pad(r, 10.0);
    assert_eq!(padded, rect(40.0, 40.0, 120.0, 100.0));
}

#[test]
fn inset_uniform() {
    let r = rect(50.0, 50.0, 100.0, 80.0);
    let inset_r = inset(r, 10.0);
    assert_eq!(inset_r, rect(60.0, 60.0, 80.0, 60.0));
}

#[test]
fn align_center() {
    let rects = [rect(10.0, 10.0, 30.0, 40.0), rect(50.0, 20.0, 20.0, 30.0)];
    let out = align(
        &rects,
        Alignment {
            horizontal: AlignKind::Center,
            vertical: AlignKind::Center,
        },
    );
    assert_eq!(out[0].x, 25.0);
    assert_eq!(out[1].y, 15.0);
}

#[test]
fn relative_transform_maps_corners() {
    let a = rect(0.0, 0.0, 100.0, 50.0);
    let b = rect(200.0, 300.0, 400.0, 200.0);
    let t = get_relative_transform(a, b);
    assert_eq!(vector2::transform([0.0, 0.0], &t), [200.0, 300.0]);
    assert_eq!(vector2::transform([100.0, 50.0], &t), [600.0, 500.0]);
}

#[test]
fn rotate_45() {
    let r = rect(10.0, 10.0, 50.0, 30.0);
    let rotated = rect_rotate(r, 45.0);
    assert!(rotated.width > r.width);
}

#[test]
fn cardinal_point_sw() {
    let r = rect(0.0, 0.0, 10.0, 10.0);
    assert_eq!(get_cardinal_point(r, CardinalDirection::SW), [0.0, 10.0]);
}

#[test]
fn axis_projection_intersection_overlaps() {
    let rects = [rect(10.0, 10.0, 30.0, 30.0), rect(20.0, 15.0, 40.0, 10.0)];
    let inter = axis_projection_intersection(&rects, Axis::X);
    assert_eq!(inter, Some([15.0, 25.0]));
}

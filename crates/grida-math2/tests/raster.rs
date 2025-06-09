use grida_cmath::{Rectangle, raster_bresenham, raster_rectangle};

#[test]
fn bresenham_single_point() {
    let res = raster_bresenham([0.0, 0.0], [0.0, 0.0]);
    assert_eq!(res, vec![[0.0, 0.0]]);
}

#[test]
fn bresenham_horizontal() {
    let res = raster_bresenham([0.0, 0.0], [3.0, 0.0]);
    assert_eq!(res, vec![[0.0, 0.0], [1.0, 0.0], [2.0, 0.0], [3.0, 0.0]]);
}

#[test]
fn raster_rectangle_points() {
    let rect = Rectangle {
        x: 0.0,
        y: 0.0,
        width: 1.0,
        height: 1.0,
    };
    let pts = raster_rectangle(&rect);
    assert!(pts.contains(&[0.0, 0.0]));
    assert!(pts.contains(&[1.0, 1.0]));
}

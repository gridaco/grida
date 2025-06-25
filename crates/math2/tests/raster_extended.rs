use math2::{
    raster_circle, raster_ellipse, raster_floodfill, raster_gaussian, raster_pad,
    raster_pascaltriangle, raster_resize, raster_scale, raster_smoothstep, raster_tile, Bitmap,
};

fn bmp(w: usize, h: usize, color: [u8; 4]) -> Bitmap {
    let mut data = Vec::new();
    for _ in 0..w * h {
        data.extend_from_slice(&color);
    }
    Bitmap {
        width: w,
        height: h,
        data,
    }
}

#[test]
fn tile_dimensions() {
    let src = bmp(1, 1, [1, 2, 3, 4]);
    let out = raster_tile(&src, 2, 2);
    assert_eq!(out.width, 2);
    assert_eq!(out.height, 2);
    assert_eq!(
        out.data,
        vec![1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]
    );
}

#[test]
fn scale_up_size() {
    let src = bmp(2, 2, [1, 0, 0, 255]);
    let out = raster_scale(&src, [2.0, 2.0]);
    assert_eq!(out.width, 4);
    assert_eq!(out.height, 4);
}

#[test]
fn resize_changes_dimensions() {
    let src = bmp(2, 2, [0, 0, 0, 0]);
    let out = raster_resize(&src, [3.0, 1.0]);
    assert_eq!(out.width, 3);
    assert_eq!(out.height, 1);
}

#[test]
fn pad_centers_bitmap() {
    let src = bmp(1, 1, [5, 5, 5, 5]);
    let out = raster_pad(&src, [3.0, 3.0], [0.0, 0.0, 0.0, 0.0]);
    // center pixel should be original color
    let idx = (1 * 3 + 1) * 4;
    assert_eq!(&out.data[idx..idx + 4], &[5, 5, 5, 5]);
}

#[test]
fn circle_contains_center() {
    let pts = raster_circle([0.0, 0.0], 1.0, None);
    assert!(pts.contains(&[0.0, 0.0]));
}

#[test]
fn ellipse_contains_center() {
    let pts = raster_ellipse([0.0, 0.0], [2.0, 1.0]);
    assert!(pts.contains(&[0.0, 0.0]));
}

#[test]
fn floodfill_changes_color() {
    let mut bmp = bmp(2, 2, [0, 0, 0, 255]);
    raster_floodfill(&mut bmp, [0.0, 0.0], [255.0, 0.0, 0.0, 255.0]);
    assert_eq!(bmp.data[..4], [255, 0, 0, 255]);
}

#[test]
fn gaussian_bounds() {
    let v = raster_gaussian(0.5, 0.5);
    assert!(v > 0.0 && v <= 1.0);
}

#[test]
fn smoothstep_basic() {
    let v = raster_smoothstep(2, 0.5);
    assert!(v > 0.0 && v < 1.0);
}

#[test]
fn pascaltriangle_known() {
    let v = raster_pascaltriangle(5.0, 2);
    assert!((v - 10.0).abs() < 1e-6);
}

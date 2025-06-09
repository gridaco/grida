use super::{rect::Rectangle, vector2::Vector2};

/// Returns the fractional part of a number.
///
/// # Arguments
/// * `x` - The input value.
///
/// # Example
/// ```rust
/// # use grida_cmath::fract;
/// let frac = fract(3.14);
/// assert!((frac - 0.14).abs() < 1e-2);
/// ```
pub fn fract(x: f32) -> f32 {
    x - x.floor()
}

/// Computes a pseudo-random noise value for the given 2D coordinate.
///
/// This follows a GLSL-style hash using "magic" constants to produce a
/// nicely distributed value. While fast for grain generation, it's not
/// intended for high quality noise.
///
/// The calculation performed is:
/// `noise(x, y) = fract(sin(x * 12.9898 + y * 78.233) * 43758.5453)`.
///
/// # Parameters
/// - `x`: X coordinate.
/// - `y`: Y coordinate.
///
/// # Returns
/// A pseudo-random value in `[0, 1]`.
///
/// # Example
/// ```rust
/// # use grida_cmath::noise;
/// let v = noise(12.34, 56.78);
/// assert!(v >= 0.0 && v <= 1.0);
/// ```
pub fn noise(x: f32, y: f32) -> f32 {
    fract(((x * 12.9898 + y * 78.233).sin()) * 43758.5453)
}

/// Returns all integer pixel coordinates along a straight line between
/// `a` and `b` using Bresenham's algorithm.
///
/// # Parameters
/// - `a`: Start point in pixel coordinates.
/// - `b`: End point in pixel coordinates.
///
/// # Example
/// ```rust
/// # use grida_cmath::raster_bresenham;
/// let pts = raster_bresenham([10.0, 10.0], [15.0, 20.0]);
/// assert_eq!(pts.first(), Some(&[10.0, 10.0]));
/// ```
pub fn bresenham(a: Vector2, b: Vector2) -> Vec<Vector2> {
    let (mut x0, mut y0) = (a[0] as i32, a[1] as i32);
    let (x1, y1) = (b[0] as i32, b[1] as i32);
    let mut pixels = Vec::new();

    let dx = (x1 - x0).abs();
    let sx = if x0 < x1 { 1 } else { -1 };
    let dy = -(y1 - y0).abs();
    let sy = if y0 < y1 { 1 } else { -1 };
    let mut err = dx + dy;

    loop {
        pixels.push([x0 as f32, y0 as f32]);
        if x0 == x1 && y0 == y1 { break; }
        let e2 = 2 * err;
        if e2 >= dy {
            err += dy;
            x0 += sx;
        }
        if e2 <= dx {
            err += dx;
            y0 += sy;
        }
    }

    pixels
}

/// Generates all integer pixel coordinates contained within a rectangle.
///
/// The rectangle is defined by its top-left corner and dimensions, and
/// the output includes all pixels from `x` to `x + width` and `y` to
/// `y + height` inclusively.
///
/// # Example
/// ```rust
/// # use grida_cmath::{Rectangle, raster_rectangle};
/// let rect = Rectangle { x: 40.0, y: 35.0, width: 20.0, height: 30.0 };
/// let points = raster_rectangle(&rect);
/// assert!(points.contains(&[40.0, 35.0]));
/// ```
pub fn rectangle(rect: &Rectangle) -> Vec<Vector2> {
    let start_x = rect.x.ceil() as i32;
    let end_x = (rect.x + rect.width).floor() as i32;
    let start_y = rect.y.ceil() as i32;
    let end_y = (rect.y + rect.height).floor() as i32;
    let mut points = Vec::new();
    for y in start_y..=end_y {
        for x in start_x..=end_x {
            points.push([x as f32, y as f32]);
        }
    }
    points
}

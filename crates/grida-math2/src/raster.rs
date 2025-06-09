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
        if x0 == x1 && y0 == y1 {
            break;
        }
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

/// A raw bitmap represented by width, height and RGBA data.
#[derive(Clone, Debug, PartialEq)]
pub struct Bitmap {
    pub width: usize,
    pub height: usize,
    pub data: Vec<u8>,
}

/// Tiles a source bitmap to cover the given `width` and `height`.
pub fn tile(source: &Bitmap, width: usize, height: usize) -> Bitmap {
    let mut out = vec![0u8; width * height * 4];
    for y in 0..height {
        for x in 0..width {
            let sx = x % source.width;
            let sy = y % source.height;
            let src = (sy * source.width + sx) * 4;
            let dst = (y * width + x) * 4;
            out[dst..dst + 4].copy_from_slice(&source.data[src..src + 4]);
        }
    }
    Bitmap {
        width,
        height,
        data: out,
    }
}

/// Scales a bitmap by `[factor_x, factor_y]` using nearest neighbour sampling.
pub fn scale(bitmap: &Bitmap, factor: Vector2) -> Bitmap {
    let (factor_x, factor_y) = (factor[0], factor[1]);
    assert!(factor_x > 0.0 && factor_y > 0.0, "factors must be positive");
    let width = ((bitmap.width as f32 * factor_x).floor().max(1.0)) as usize;
    let height = ((bitmap.height as f32 * factor_y).floor().max(1.0)) as usize;
    let mut out = vec![0u8; width * height * 4];
    for y in 0..height {
        for x in 0..width {
            let sx = ((x as f32) / factor_x).floor() as usize;
            let sy = ((y as f32) / factor_y).floor() as usize;
            let src = (sy * bitmap.width + sx) * 4;
            let dst = (y * width + x) * 4;
            out[dst..dst + 4].copy_from_slice(&bitmap.data[src..src + 4]);
        }
    }
    Bitmap {
        width,
        height,
        data: out,
    }
}

/// Resizes a bitmap to the specified `[width, height]`.
pub fn resize(bitmap: &Bitmap, dst: Vector2) -> Bitmap {
    let (w2, h2) = (dst[0] as f32, dst[1] as f32);
    let fx = w2 / bitmap.width as f32;
    let fy = h2 / bitmap.height as f32;
    scale(bitmap, [fx, fy])
}

/// Pads a bitmap to the given `[width, height]` filling empty space with `bg`.
pub fn pad(bitmap: &Bitmap, dst: Vector2, bg: super::vector4::Vector4) -> Bitmap {
    let width = dst[0] as usize;
    let height = dst[1] as usize;
    let mut out = vec![0u8; width * height * 4];
    for i in 0..width * height {
        let idx = i * 4;
        out[idx] = bg[0] as u8;
        out[idx + 1] = bg[1] as u8;
        out[idx + 2] = bg[2] as u8;
        out[idx + 3] = bg[3] as u8;
    }
    let offset_x = ((width as i32 - bitmap.width as i32) / 2) as isize;
    let offset_y = ((height as i32 - bitmap.height as i32) / 2) as isize;
    for y in 0..bitmap.height {
        for x in 0..bitmap.width {
            let dst_x = x as isize + offset_x;
            let dst_y = y as isize + offset_y;
            if dst_x < 0 || dst_y < 0 || dst_x >= width as isize || dst_y >= height as isize {
                continue;
            }
            let src = (y * bitmap.width + x) * 4;
            let dst = (dst_y as usize * width + dst_x as usize) * 4;
            out[dst..dst + 4].copy_from_slice(&bitmap.data[src..src + 4]);
        }
    }
    Bitmap {
        width,
        height,
        data: out,
    }
}

/// Flood fills starting at `pos` with `fill` color.
pub fn floodfill(bitmap: &mut Bitmap, pos: Vector2, fill: super::vector4::Vector4) {
    let x = pos[0] as i32;
    let y = pos[1] as i32;
    if x < 0 || y < 0 || x >= bitmap.width as i32 || y >= bitmap.height as i32 {
        return;
    }
    let idx = (y as usize * bitmap.width + x as usize) * 4;
    let target = [
        bitmap.data[idx],
        bitmap.data[idx + 1],
        bitmap.data[idx + 2],
        bitmap.data[idx + 3],
    ];
    if target == [fill[0] as u8, fill[1] as u8, fill[2] as u8, fill[3] as u8] {
        return;
    }
    let mut stack = vec![(x, y)];
    while let Some((cx, cy)) = stack.pop() {
        if cx < 0 || cy < 0 || cx >= bitmap.width as i32 || cy >= bitmap.height as i32 {
            continue;
        }
        let i = (cy as usize * bitmap.width + cx as usize) * 4;
        let cur = [
            bitmap.data[i],
            bitmap.data[i + 1],
            bitmap.data[i + 2],
            bitmap.data[i + 3],
        ];
        if cur != target {
            continue;
        }
        bitmap.data[i..i + 4].copy_from_slice(&[
            fill[0] as u8,
            fill[1] as u8,
            fill[2] as u8,
            fill[3] as u8,
        ]);
        stack.push((cx - 1, cy));
        stack.push((cx + 1, cy));
        stack.push((cx, cy - 1));
        stack.push((cx, cy + 1));
    }
}

/// Generates integer pixel coordinates within a circle with optional clipping.
pub fn circle(center: Vector2, radius: f32, clip: Option<Rectangle>) -> Vec<Vector2> {
    let (cx, cy) = (center[0], center[1]);
    let r_sq = radius * radius;
    let mut results = Vec::new();
    let (min_x, min_y, max_x, max_y) = if let Some(c) = clip {
        (c.x, c.y, c.x + c.width - 1.0, c.y + c.height - 1.0)
    } else {
        (
            f32::NEG_INFINITY,
            f32::NEG_INFINITY,
            f32::INFINITY,
            f32::INFINITY,
        )
    };
    let y_start = (cy - radius).floor() as i32;
    let y_end = (cy + radius).floor() as i32;
    for y in y_start..=y_end {
        let dy = y as f32 - cy;
        let span = (r_sq - dy * dy).sqrt();
        if span.is_nan() {
            continue;
        }
        let left = (cx - span).floor() as i32;
        let right = (cx + span).floor() as i32;
        for x in left..=right {
            let xf = x as f32;
            let yf = y as f32;
            if xf < min_x || xf > max_x || yf < min_y || yf > max_y {
                continue;
            }
            results.push([xf, yf]);
        }
    }
    results
}

/// Returns pixel coordinates for an ellipse.
pub fn ellipse(center: Vector2, radius: Vector2) -> Vec<Vector2> {
    let (cx, cy) = (center[0], center[1]);
    let (rx, ry) = (radius[0], radius[1]);
    let mut pts = Vec::new();
    let start_x = (cx - rx).ceil() as i32;
    let end_x = (cx + rx).floor() as i32;
    let start_y = (cy - ry).ceil() as i32;
    let end_y = (cy + ry).floor() as i32;
    for y in start_y..=end_y {
        for x in start_x..=end_x {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            if (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.0 {
                pts.push([x as f32, y as f32]);
            }
        }
    }
    pts
}

/// Gaussian weight with `hardness` controlling the falloff steepness.
pub fn gaussian(norm_dist: f32, hardness: f32) -> f32 {
    let k_hard = 2.0_f32;
    let k_soft = 10.0_f32;
    let k = hardness * k_hard + (1.0 - hardness) * k_soft;
    (-k * norm_dist * norm_dist).exp()
}

/// Generalized smoothstep function of order `n`.
pub fn smoothstep(n: i32, mut x: f32) -> f32 {
    use super::utils::clamp;
    x = clamp(x, 0.0, 1.0);
    let mut result = 0.0;
    for i in 0..=n {
        result += pascaltriangle(-(n as f32) - 1.0, i)
            * pascaltriangle(2.0 * n as f32 + 1.0, n - i)
            * x.powf(n as f32 + i as f32 + 1.0);
    }
    result
}

/// Binomial coefficient using generalized Pascal's triangle.
pub fn pascaltriangle(a: f32, b: i32) -> f32 {
    let mut result = 1.0;
    for i in 0..b {
        result *= (a - i as f32) / (i as f32 + 1.0);
    }
    result
}

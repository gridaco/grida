use super::{rect::Rectangle, vector2::Vector2};

/// Returns the fractional part of `x`.
pub fn fract(x: f32) -> f32 {
    x - x.floor()
}

/// Simple pseudo-random noise for a 2D coordinate.
pub fn noise(x: f32, y: f32) -> f32 {
    fract(((x * 12.9898 + y * 78.233).sin()) * 43758.5453)
}

/// Bresenham's line algorithm returning integer pixel coordinates.
pub fn bresenham(a: Vector2, b: Vector2) -> Vec<Vector2> {
    let (mut x0, mut y0) = (a[0] as i32, a[1] as i32);
    let (x1, y1) = (b[0] as i32, b[1] as i32);
    let mut pixels = Vec::new();

    let mut dx = (x1 - x0).abs();
    let sx = if x0 < x1 { 1 } else { -1 };
    let mut dy = -(y1 - y0).abs();
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

/// Generates all pixel coordinates within the given rectangle.
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

use crate::{Rectangle, RectangleSide, rect, vector2::Vector2};

/// Result returned by [`measure`].
///
/// `a` and `b` are the input rectangles. `box_rect` is the rectangle used as
/// the reference when computing the spacing values. `distance` contains the
/// offsets to the nearest top, right, bottom and left edges in that order.

#[derive(Debug, Clone, PartialEq)]
pub struct Measurement {
    pub a: Rectangle,
    pub b: Rectangle,
    pub box_rect: Rectangle,
    /// top, right, bottom, left distances
    pub distance: [f32; 4],
}

/// Calculates the spacing between two rectangles along with the reference box.
///
/// See the module-level documentation for the exact behaviour. Returns `None`
/// when `a` and `b` are identical.
pub fn measure(a: Rectangle, b: Rectangle) -> Option<Measurement> {
    if a == b {
        return None;
    }
    let intersection = rect::intersection(&a, &b);

    if intersection.is_none() {
        let spacing = calculate_non_intersecting_spacing(&a, &b);
        return Some(Measurement {
            a,
            b,
            box_rect: a,
            distance: spacing,
        });
    }

    let intersection = intersection.unwrap();

    if rect::contains(&b, &a) {
        return Some(Measurement {
            a,
            b,
            box_rect: a,
            distance: calculate_container_spacing(&b, &a),
        });
    }

    if rect::contains(&a, &b) {
        return Some(Measurement {
            a,
            b,
            box_rect: b,
            distance: calculate_container_spacing(&a, &b),
        });
    }

    let spacing = calculate_intersecting_spacing(&a, &b, &intersection);
    Some(Measurement {
        a,
        b,
        box_rect: intersection,
        distance: spacing,
    })
}

fn calculate_intersecting_spacing(a: &Rectangle, b: &Rectangle, inter: &Rectangle) -> [f32; 4] {
    [
        (inter.y - a.y.min(b.y)).abs(),
        ((a.x + a.width).max(b.x + b.width) - (inter.x + inter.width)).abs(),
        ((a.y + a.height).max(b.y + b.height) - (inter.y + inter.height)).abs(),
        (inter.x - a.x.min(b.x)).abs(),
    ]
}

fn calculate_non_intersecting_spacing(a: &Rectangle, b: &Rectangle) -> [f32; 4] {
    let mut top = 0.0;
    let mut right = 0.0;
    let mut bottom = 0.0;
    let mut left = 0.0;
    if a.x + a.width <= b.x {
        right = b.x - (a.x + a.width);
    } else if b.x + b.width <= a.x {
        left = a.x - (b.x + b.width);
    }
    if a.y + a.height <= b.y {
        bottom = b.y - (a.y + a.height);
    } else if b.y + b.height <= a.y {
        top = a.y - (b.y + b.height);
    }
    [top, right, bottom, left]
}

fn calculate_container_spacing(outer: &Rectangle, inner: &Rectangle) -> [f32; 4] {
    [
        (outer.y - inner.y).abs(),
        (outer.x + outer.width - (inner.x + inner.width)).abs(),
        (outer.y + outer.height - (inner.y + inner.height)).abs(),
        (outer.x - inner.x).abs(),
    ]
}

type LineXYXYLR = [f32; 6];

/// Generates guide line coordinates from the center of `rect` toward a side.
///
/// The returned array is `[x1, y1, x2, y2, length, rotation]` scaled by
/// `zoom` where `(x1, y1)` is the anchor on the rectangle and `(x2, y2)` the
/// outer end.
pub fn guide_line_xylr(rect: Rectangle, side: RectangleSide, length: f32, zoom: f32) -> LineXYXYLR {
    let Rectangle {
        x,
        y,
        width,
        height,
    } = rect;
    let mid_x = x + width / 2.0;
    let mid_y = y + height / 2.0;
    let scaled = length * zoom;

    let (x1, y1, x2, y2, rotation) = match side {
        RectangleSide::Top => {
            let x1 = mid_x * zoom;
            let y1 = y * zoom;
            (x1, y1, x1, y1 - scaled, 180.0)
        }
        RectangleSide::Right => {
            let x1 = (x + width) * zoom;
            let y1 = mid_y * zoom;
            (x1, y1, x1 + scaled, y1, 270.0)
        }
        RectangleSide::Bottom => {
            let x1 = mid_x * zoom;
            let y1 = (y + height) * zoom;
            (x1, y1, x1, y1 + scaled, 0.0)
        }
        RectangleSide::Left => {
            let x1 = x * zoom;
            let y1 = mid_y * zoom;
            (x1, y1, x1 - scaled, y1, 90.0)
        }
    };
    [x1, y1, x2, y2, scaled, rotation]
}

/// Generates an auxiliary guide line from `point` toward the closest side of
/// `rect`.
///
/// Returns `[x1, y1, x2, y2, length, rotation]` scaled by `zoom`. When the
/// point lies inside the rectangle, `x2`/`y2` are `NaN` and length is zero.
pub fn auxiliary_line_xylr(
    point: Vector2,
    rect: Rectangle,
    side: RectangleSide,
    zoom: f32,
) -> LineXYXYLR {
    let [px, py] = point;
    let Rectangle {
        x,
        y,
        width,
        height,
    } = rect;
    let rect_right = x + width;
    let rect_bottom = y + height;

    let x1 = px * zoom;
    let y1 = py * zoom;
    let (x2, y2, length, rotation);

    if rect::contains_point(&rect, point) {
        return [x1, y1, f32::NAN, f32::NAN, 0.0, 0.0];
    }

    match side {
        RectangleSide::Top | RectangleSide::Bottom => {
            if px < x {
                let length_v = (x - px) * zoom;
                (x2, y2, length, rotation) = (x1 + length_v, y1, length_v, -90.0);
            } else {
                let length_v = (px - rect_right) * zoom;
                (x2, y2, length, rotation) = (x1 - length_v, y1, length_v, 90.0);
            }
        }
        RectangleSide::Left | RectangleSide::Right => {
            if py > rect_bottom {
                let length_v = (py - rect_bottom) * zoom;
                (x2, y2, length, rotation) = (x1, y1 - length_v, length_v, 180.0);
            } else {
                let length_v = (y - py) * zoom;
                (x2, y2, length, rotation) = (x1, y1 + length_v, length_v, 0.0);
            }
        }
    }

    [x1, y1, x2, y2, length, rotation]
}

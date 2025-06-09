use super::vector2::Vector2;

/// Represents a side of a rectangle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RectangleSide {
    Top,
    Right,
    Bottom,
    Left,
}

/// Cardinal directions including diagonals.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CardinalDirection {
    N,
    E,
    S,
    W,
    NE,
    SE,
    SW,
    NW,
}

/// A rectangle defined by its top-left corner `(x, y)` and `width` and `height`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rectangle {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl Rectangle {
    /// Returns the center point of the rectangle.
    pub fn center(&self) -> Vector2 {
        [self.x + self.width / 2.0, self.y + self.height / 2.0]
    }

    /// Returns a new rectangle translated by the given vector.
    pub fn translate(&self, delta: Vector2) -> Self {
        Self { x: self.x + delta[0], y: self.y + delta[1], ..*self }
    }

    /// Scales the rectangle relative to the given origin.
    pub fn scale(&self, origin: Vector2, scale: Vector2) -> Self {
        let [sx, sy] = scale;
        let [ox, oy] = origin;
        Self {
            x: ox + (self.x - ox) * sx,
            y: oy + (self.y - oy) * sy,
            width: self.width * sx,
            height: self.height * sy,
        }
    }

    /// Returns the dimension (`width` or `height`) for the given axis.
    pub fn axis_dimension(&self, axis: super::vector2::Axis) -> f32 {
        match axis {
            super::vector2::Axis::X => self.width,
            super::vector2::Axis::Y => self.height,
        }
    }

    /// Returns true if `self` fully contains `other`.
    pub fn contains(&self, other: &Rectangle) -> bool {
        self.x <= other.x
            && self.y <= other.y
            && self.x + self.width >= other.x + other.width
            && self.y + self.height >= other.y + other.height
    }

    /// Returns true if the point is inside the rectangle (inclusive).
    pub fn contains_point(&self, point: Vector2) -> bool {
        let [px, py] = point;
        px >= self.x && px <= self.x + self.width && py >= self.y && py <= self.y + self.height
    }

    /// Returns the signed offset from the point to the nearest edge.
    pub fn offset_to(&self, point: Vector2) -> Vector2 {
        let clamped_x = point[0].max(self.x).min(self.x + self.width);
        let clamped_y = point[1].max(self.y).min(self.y + self.height);
        [point[0] - clamped_x, point[1] - clamped_y]
    }

    /// Returns `true` if two rectangles intersect or touch at the edges.
    pub fn intersects(&self, other: &Rectangle) -> bool {
        let a_right = self.x + self.width;
        let a_bottom = self.y + self.height;
        let b_right = other.x + other.width;
        let b_bottom = other.y + other.height;

        !(self.x > b_right || self.y > b_bottom || a_right < other.x || a_bottom < other.y)
    }

    /// Returns the intersection of two rectangles, or `None` if they do not overlap.
    pub fn intersection(&self, other: &Rectangle) -> Option<Rectangle> {
        let x1 = self.x.max(other.x);
        let y1 = self.y.max(other.y);
        let x2 = (self.x + self.width).min(other.x + other.width);
        let y2 = (self.y + self.height).min(other.y + other.height);

        if x2 <= x1 || y2 <= y1 {
            return None;
        }

        Some(Rectangle {
            x: x1,
            y: y1,
            width: x2 - x1,
            height: y2 - y1,
        })
    }

    /// Subtracts `other` from this rectangle, returning the remaining subregions.
    pub fn subtract(&self, other: Rectangle) -> Vec<Rectangle> {
        boolean::subtract(*self, other)
    }
}

/// Computes the smallest rectangle that encloses all provided points.
pub fn from_points(points: &[Vector2]) -> Rectangle {
    assert!(!points.is_empty(), "at least one point is required");
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for &[x, y] in points {
        if x < min_x { min_x = x; }
        if y < min_y { min_y = y; }
        if x > max_x { max_x = x; }
        if y > max_y { max_y = y; }
    }
    Rectangle { x: min_x, y: min_y, width: max_x - min_x, height: max_y - min_y }
}

/// Returns an object containing the nine control points of a rectangle.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect9Points {
    pub top_left: Vector2,
    pub top_right: Vector2,
    pub bottom_right: Vector2,
    pub bottom_left: Vector2,
    pub top_center: Vector2,
    pub right_center: Vector2,
    pub bottom_center: Vector2,
    pub left_center: Vector2,
    pub center: Vector2,
}

/// Computes the nine control points of the rectangle.
pub fn to_9points(rect: &Rectangle) -> Rect9Points {
    let Rectangle { x, y, width, height } = *rect;
    let center_x = x + width / 2.0;
    let center_y = y + height / 2.0;
    Rect9Points {
        top_left: [x, y],
        top_right: [x + width, y],
        bottom_right: [x + width, y + height],
        bottom_left: [x, y + height],
        top_center: [center_x, y],
        right_center: [x + width, center_y],
        bottom_center: [center_x, y + height],
        left_center: [x, center_y],
        center: [center_x, center_y],
    }
}

/// Same as [`to_9points`] but returns the points in an array ordered as:
/// topLeft, topRight, bottomRight, bottomLeft, topCenter, rightCenter,
/// bottomCenter, leftCenter, center.
pub fn to_9points_chunk(rect: &Rectangle) -> [Vector2; 9] {
    let p = to_9points(rect);
    [
        p.top_left,
        p.top_right,
        p.bottom_right,
        p.bottom_left,
        p.top_center,
        p.right_center,
        p.bottom_center,
        p.left_center,
        p.center,
    ]
}

/// Returns true if rectangle `a` fully contains rectangle `b`.
pub fn contains(a: &Rectangle, b: &Rectangle) -> bool {
    a.contains(b)
}

/// Returns true if the point is inside the rectangle (inclusive).
pub fn contains_point(rect: &Rectangle, point: Vector2) -> bool {
    rect.contains_point(point)
}

/// Returns the signed offset from the point to the nearest edge of the rectangle.
pub fn offset(rect: &Rectangle, point: Vector2) -> Vector2 {
    rect.offset_to(point)
}

/// Returns `true` if two rectangles intersect or touch at the edges.
pub fn intersects(a: &Rectangle, b: &Rectangle) -> bool {
    a.intersects(b)
}

/// Returns the intersection of two rectangles, or `None` if they do not overlap.
pub fn intersection(a: &Rectangle, b: &Rectangle) -> Option<Rectangle> {
    a.intersection(b)
}

/// Computes the bounding rectangle of all input rectangles.
pub fn union(rects: &[Rectangle]) -> Rectangle {
    assert!(!rects.is_empty(), "rectangles array cannot be empty");
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for r in rects {
        if r.x < min_x { min_x = r.x; }
        if r.y < min_y { min_y = r.y; }
        if r.x + r.width > max_x { max_x = r.x + r.width; }
        if r.y + r.height > max_y { max_y = r.y + r.height; }
    }
    Rectangle { x: min_x, y: min_y, width: max_x - min_x, height: max_y - min_y }
}

/// Boolean operations on rectangles.
pub mod boolean {
    use super::{intersection, Rectangle};

    /// Subtracts rectangle `b` from rectangle `a`, returning the remaining subregions.
    pub fn subtract(a: Rectangle, b: Rectangle) -> Vec<Rectangle> {
        let inter = match intersection(&a, &b) {
            Some(i) if i.width > 0.0 && i.height > 0.0 => i,
            _ => return vec![a],
        };

        let mut result = Vec::new();

        // Top region
        if a.y < inter.y {
            result.push(Rectangle {
                x: a.x,
                y: a.y,
                width: a.width,
                height: inter.y - a.y,
            });
        }

        // Bottom region
        if a.y + a.height > inter.y + inter.height {
            result.push(Rectangle {
                x: a.x,
                y: inter.y + inter.height,
                width: a.width,
                height: a.y + a.height - (inter.y + inter.height),
            });
        }

        // Left region
        if a.x < inter.x {
            result.push(Rectangle {
                x: a.x,
                y: inter.y,
                width: inter.x - a.x,
                height: inter.height,
            });
        }

        // Right region
        if a.x + a.width > inter.x + inter.width {
            result.push(Rectangle {
                x: inter.x + inter.width,
                y: inter.y,
                width: a.x + a.width - (inter.x + inter.width),
                height: inter.height,
            });
        }

        result
    }
}

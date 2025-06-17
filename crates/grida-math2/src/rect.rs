use std::fmt;

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
        Self {
            x: self.x + delta[0],
            y: self.y + delta[1],
            ..*self
        }
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
        if x < min_x {
            min_x = x;
        }
        if y < min_y {
            min_y = y;
        }
        if x > max_x {
            max_x = x;
        }
        if y > max_y {
            max_y = y;
        }
    }
    Rectangle {
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
    }
}

impl fmt::Display for Rectangle {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "x: {}, y: {}, width: {}, height: {}",
            self.x, self.y, self.width, self.height
        )
    }
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
    let Rectangle {
        x,
        y,
        width,
        height,
    } = *rect;
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
        if r.x < min_x {
            min_x = r.x;
        }
        if r.y < min_y {
            min_y = r.y;
        }
        if r.x + r.width > max_x {
            max_x = r.x + r.width;
        }
        if r.y + r.height > max_y {
            max_y = r.y + r.height;
        }
    }
    Rectangle {
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
    }
}

/// Boolean operations on rectangles.
pub mod boolean {
    use super::{Rectangle, intersection};

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

/// Calculates the gaps between adjacent rectangles along an axis.
///
/// The rectangles are first sorted by their starting position on the
/// given axis. The returned vector contains the spacing between the end
/// of each rectangle and the start of the next one.
pub fn get_gaps(rectangles: &[Rectangle], axis: super::vector2::Axis) -> Vec<f32> {
    if rectangles.len() < 2 {
        return Vec::new();
    }

    let mut sorted: Vec<&Rectangle> = rectangles.iter().collect();
    sorted.sort_by(|a, b| {
        if axis == super::vector2::Axis::X {
            a.x.partial_cmp(&b.x).unwrap()
        } else {
            a.y.partial_cmp(&b.y).unwrap()
        }
    });

    let mut gaps = Vec::new();
    for i in 0..sorted.len() - 1 {
        let end = if axis == super::vector2::Axis::X {
            sorted[i].x + sorted[i].width
        } else {
            sorted[i].y + sorted[i].height
        };
        let next_start = if axis == super::vector2::Axis::X {
            sorted[i + 1].x
        } else {
            sorted[i + 1].y
        };
        gaps.push(next_start - end);
    }
    gaps
}

/// Calculates the uniform gap between rectangles if present.
/// Returns `(Some(gap), gaps)` if all gaps are equal within `tolerance`.
pub fn get_uniform_gap(
    rectangles: &[Rectangle],
    axis: super::vector2::Axis,
    tolerance: f32,
) -> (Option<f32>, Vec<f32>) {
    let gaps = get_gaps(rectangles, axis);
    if gaps.is_empty() {
        return (None, gaps);
    }

    if crate::utils::is_uniform(&gaps, tolerance) {
        let mut best_val = gaps[0];
        let mut best_count = 0;
        for &g in &gaps {
            let count = gaps.iter().filter(|&&x| x == g).count();
            if count > best_count {
                best_count = count;
                best_val = g;
            }
        }
        let most = best_val;
        (Some(most), gaps)
    } else {
        (None, gaps)
    }
}

/// Repositions rectangles so they are evenly distributed along the axis while
/// preserving the original ordering.
pub fn distribute_evenly(rectangles: &[Rectangle], axis: super::vector2::Axis) -> Vec<Rectangle> {
    if rectangles.len() < 2 {
        return rectangles.to_vec();
    }

    let bbox = union(rectangles);
    let start = if axis == super::vector2::Axis::X {
        bbox.x
    } else {
        bbox.y
    };
    let total_size = if axis == super::vector2::Axis::X {
        bbox.width
    } else {
        bbox.height
    };
    let total_rect_size: f32 = rectangles
        .iter()
        .map(|r| {
            if axis == super::vector2::Axis::X {
                r.width
            } else {
                r.height
            }
        })
        .sum();

    let gap_size = (total_size - total_rect_size) / (rectangles.len() as f32 - 1.0);

    let mut sorted_indices: Vec<usize> = (0..rectangles.len()).collect();
    sorted_indices.sort_by(|&a, &b| {
        if axis == super::vector2::Axis::X {
            rectangles[a].x.partial_cmp(&rectangles[b].x).unwrap()
        } else {
            rectangles[a].y.partial_cmp(&rectangles[b].y).unwrap()
        }
    });

    let mut current = start;
    let mut distributed = vec![
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0
        };
        rectangles.len()
    ];
    for idx in sorted_indices {
        let r = rectangles[idx];
        let mut new_r = r;
        if axis == super::vector2::Axis::X {
            new_r.x = current;
            current += r.width + gap_size;
        } else {
            new_r.y = current;
            current += r.height + gap_size;
        }
        distributed[idx] = new_r;
    }

    distributed
}

/// Padding or margin values for each side of a rectangle.
#[derive(Debug, Clone, Copy)]
pub struct Sides {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

impl From<f32> for Sides {
    fn from(all: f32) -> Self {
        Self {
            top: all,
            right: all,
            bottom: all,
            left: all,
        }
    }
}

impl From<[f32; 4]> for Sides {
    fn from(v: [f32; 4]) -> Self {
        Self {
            top: v[0],
            right: v[1],
            bottom: v[2],
            left: v[3],
        }
    }
}

/// Quantizes the rectangle position and size by the given step.
pub fn quantize(rect: Rectangle, step: impl super::vector2::IntoVector2) -> Rectangle {
    let s = step.into_vector2();
    Rectangle {
        x: crate::quantize(rect.x, s[0]),
        y: crate::quantize(rect.y, s[1]),
        width: crate::quantize(rect.width, s[0]),
        height: crate::quantize(rect.height, s[1]),
    }
}

/// Normalizes the rectangle so width and height are positive.
pub fn positive(rect: Rectangle) -> Rectangle {
    Rectangle {
        x: rect.x.min(rect.x + rect.width),
        y: rect.y.min(rect.y + rect.height),
        width: rect.width.abs(),
        height: rect.height.abs(),
    }
}

/// Returns the aspect ratio `width / height`.
pub fn aspect_ratio(rect: Rectangle) -> f32 {
    rect.width / rect.height
}

/// Returns `[scale_x, scale_y]` required to scale `a` to match `b`.
pub fn get_scale_factors(a: Rectangle, b: Rectangle) -> Vector2 {
    [b.width / a.width, b.height / a.height]
}

use super::transform::AffineTransform;

/// Returns the transform mapping rectangle `a` onto rectangle `b`.
pub fn get_relative_transform(a: Rectangle, b: Rectangle) -> AffineTransform {
    let sx = if a.width == 0.0 {
        1.0
    } else {
        b.width / a.width
    };
    let sy = if a.height == 0.0 {
        1.0
    } else {
        b.height / a.height
    };

    let t1 = AffineTransform::new(-a.x, -a.y, 0.0);
    let t2 = AffineTransform {
        matrix: [[sx, 0.0, 0.0], [0.0, sy, 0.0]],
    };
    let t3 = AffineTransform::new(b.x, b.y, 0.0);

    t3.compose(&t2.compose(&t1))
}

/// Applies an affine transform to the rectangle and returns the bounding box.
pub fn transform(rect: Rectangle, t: &AffineTransform) -> Rectangle {
    let corners = [
        [rect.x, rect.y],
        [rect.x + rect.width, rect.y],
        [rect.x, rect.y + rect.height],
        [rect.x + rect.width, rect.y + rect.height],
    ];
    let transformed: Vec<Vector2> = corners
        .iter()
        .map(|&p| super::vector2::transform(p, t))
        .collect();
    from_points(&transformed)
}

/// Rotates the rectangle around its center and returns the bounding box.
pub fn rotate(rect: Rectangle, degrees: f32) -> Rectangle {
    let center = rect.center();
    let rad = degrees.to_radians();
    let (sin, cos) = rad.sin_cos();
    let rotate_point = |p: Vector2| -> Vector2 {
        let dx = p[0] - center[0];
        let dy = p[1] - center[1];
        [
            center[0] + dx * cos - dy * sin,
            center[1] + dx * sin + dy * cos,
        ]
    };
    let pts = [
        rotate_point([rect.x, rect.y]),
        rotate_point([rect.x + rect.width, rect.y]),
        rotate_point([rect.x, rect.y + rect.height]),
        rotate_point([rect.x + rect.width, rect.y + rect.height]),
    ];
    from_points(&pts)
}

/// Returns the requested cardinal point of the rectangle.
pub fn get_cardinal_point(rect: Rectangle, dir: CardinalDirection) -> Vector2 {
    match dir {
        CardinalDirection::N => [rect.x + rect.width / 2.0, rect.y],
        CardinalDirection::E => [rect.x + rect.width, rect.y + rect.height / 2.0],
        CardinalDirection::S => [rect.x + rect.width / 2.0, rect.y + rect.height],
        CardinalDirection::W => [rect.x, rect.y + rect.height / 2.0],
        CardinalDirection::NE => [rect.x + rect.width, rect.y],
        CardinalDirection::SE => [rect.x + rect.width, rect.y + rect.height],
        CardinalDirection::SW => [rect.x, rect.y + rect.height],
        CardinalDirection::NW => [rect.x, rect.y],
    }
}

/// Returns the center of the rectangle.
pub fn get_center(rect: Rectangle) -> Vector2 {
    rect.center()
}

/// Returns the overlapping projection range of rectangles along the counter axis.
pub fn axis_projection_intersection(
    rects: &[Rectangle],
    axis: super::vector2::Axis,
) -> Option<Vector2> {
    assert!(rects.len() >= 2, "At least two rectangles are required");
    let projections: Vec<Vector2> = rects
        .iter()
        .map(|r| {
            if axis == super::vector2::Axis::X {
                [r.y, r.y + r.height]
            } else {
                [r.x, r.x + r.width]
            }
        })
        .collect();

    projections
        .iter()
        .skip(1)
        .fold(Some(projections[0]), |acc, p| {
            acc.and_then(|cur| super::vector2::intersection(cur, *p))
        })
}

/// Returns true if two rectangles are exactly equal.
pub fn is_identical(a: Rectangle, b: Rectangle) -> bool {
    a.x == b.x && a.y == b.y && a.width == b.width && a.height == b.height
}

/// Returns true if all rectangles in the slice are identical.
pub fn is_uniform(rects: &[Rectangle]) -> bool {
    rects.windows(2).all(|w| is_identical(w[0], w[1]))
}

/// Expands the rectangle by the given padding while keeping its center.
pub fn pad(rect: Rectangle, padding: impl Into<Sides>) -> Rectangle {
    let p = padding.into();
    let cx = rect.x + rect.width / 2.0;
    let cy = rect.y + rect.height / 2.0;
    let w = rect.width + p.left + p.right;
    let h = rect.height + p.top + p.bottom;
    Rectangle {
        x: cx - w / 2.0,
        y: cy - h / 2.0,
        width: w,
        height: h,
    }
}

/// Insets the rectangle by the given margin while keeping its center.
pub fn inset(rect: Rectangle, margin: impl Into<Sides>) -> Rectangle {
    let m = margin.into();
    let cx = rect.x + rect.width / 2.0;
    let cy = rect.y + rect.height / 2.0;
    let mut w = rect.width - (m.left + m.right);
    let mut h = rect.height - (m.top + m.bottom);
    if w < 0.0 {
        w = 0.0;
    }
    if h < 0.0 {
        h = 0.0;
    }
    Rectangle {
        x: cx - w / 2.0,
        y: cy - h / 2.0,
        width: w,
        height: h,
    }
}

/// Alignment kind for rectangle positioning.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AlignKind {
    None,
    Min,
    Max,
    Center,
}

/// Horizontal/vertical alignment options.
#[derive(Clone, Copy, Debug)]
pub struct Alignment {
    pub horizontal: AlignKind,
    pub vertical: AlignKind,
}

impl Default for Alignment {
    fn default() -> Self {
        Self {
            horizontal: AlignKind::None,
            vertical: AlignKind::None,
        }
    }
}

/// Aligns rectangles within their bounding box.
pub fn align(rects: &[Rectangle], options: Alignment) -> Vec<Rectangle> {
    if rects.len() < 2 {
        return rects.to_vec();
    }
    let bbox = union(rects);
    rects
        .iter()
        .map(|r| {
            let mut n = *r;
            match options.horizontal {
                AlignKind::Min => n.x = bbox.x,
                AlignKind::Max => n.x = bbox.x + bbox.width - r.width,
                AlignKind::Center => n.x = bbox.x + (bbox.width - r.width) / 2.0,
                AlignKind::None => {}
            }
            match options.vertical {
                AlignKind::Min => n.y = bbox.y,
                AlignKind::Max => n.y = bbox.y + bbox.height - r.height,
                AlignKind::Center => n.y = bbox.y + (bbox.height - r.height) / 2.0,
                AlignKind::None => {}
            }
            n
        })
        .collect()
}

/// Aligns rectangle `a` relative to rectangle `b`.
pub fn align_a(a: Rectangle, b: Rectangle, options: Alignment) -> Rectangle {
    let mut r = a;
    match options.horizontal {
        AlignKind::Min => r.x = b.x,
        AlignKind::Max => r.x = b.x + b.width - a.width,
        AlignKind::Center => r.x = b.x + (b.width - a.width) / 2.0,
        AlignKind::None => {}
    }
    match options.vertical {
        AlignKind::Min => r.y = b.y,
        AlignKind::Max => r.y = b.y + b.height - a.height,
        AlignKind::Center => r.y = b.y + (b.height - a.height) / 2.0,
        AlignKind::None => {}
    }
    r
}

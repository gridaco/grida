use crate::schema::Point;
use skia_safe;

// Helper function to handle vector operations
fn vector_ops(a: Point, b: Point, scale: f32) -> Point {
    Point {
        x: a.x - b.x * scale,
        y: a.y - b.y * scale,
    }
}

// Given:
//   - `pts`: Vec<Point> with your polygon's vertices in order
//   - `r`: the corner‐radius
//
// Build a Path that walks each edge but rounds each "sharp" corner:
pub fn sk_polygon_path(pts: &[Point], r: f32) -> skia_safe::Path {
    let n = pts.len();
    assert!(n >= 3);

    let mut path = skia_safe::Path::new();

    // Start at the first vertex, but moveTo a point
    // that's `r` away from the first corner along the first edge.
    // (We'll compute those "offset" points below.)

    // Compute the "offset" point on the last edge that leads into pts[0]:
    let last = pts[n - 1];
    let first = pts[0];

    // 1) Find direction from last→first, then move `r` along that:
    let dir_a = Point {
        x: (first.x - last.x) / ((first.x - last.x).powi(2) + (first.y - last.y).powi(2)).sqrt(),
        y: (first.y - last.y) / ((first.x - last.x).powi(2) + (first.y - last.y).powi(2)).sqrt(),
    };
    let move_into_first = vector_ops(first, dir_a, r);

    path.move_to(skia_safe::Point::new(move_into_first.x, move_into_first.y));

    for i in 0..n {
        // Current "corner" is pts[i],
        // "incoming" edge is (pts[i−1] → pts[i]),
        // "outgoing" edge is (pts[i] → pts[i+1]).
        let curr = pts[i];
        let prev = pts[(i + n - 1) % n];
        let next = pts[(i + 1) % n];

        // Compute offset along incoming edge (to where arc starts):
        let dir_in = Point {
            x: (curr.x - prev.x) / ((curr.x - prev.x).powi(2) + (curr.y - prev.y).powi(2)).sqrt(),
            y: (curr.y - prev.y) / ((curr.x - prev.x).powi(2) + (curr.y - prev.y).powi(2)).sqrt(),
        };
        let start_arc = vector_ops(curr, dir_in, r);

        // Compute offset along outgoing edge (to where arc ends):
        let dir_out = Point {
            x: (next.x - curr.x) / ((next.x - curr.x).powi(2) + (next.y - curr.y).powi(2)).sqrt(),
            y: (next.y - curr.y) / ((next.x - curr.x).powi(2) + (next.y - curr.y).powi(2)).sqrt(),
        };
        let end_arc = Point {
            x: curr.x + dir_out.x * r,
            y: curr.y + dir_out.y * r,
        };

        // Line from previous offset → start_arc
        path.line_to(skia_safe::Point::new(start_arc.x, start_arc.y));

        // Add the rounded corner (arc) from start_arc → end_arc, tangent at curr:
        path.quad_to(
            skia_safe::Point::new(curr.x, curr.y),
            skia_safe::Point::new(end_arc.x, end_arc.y),
        );
    }

    path.close();
    path
}

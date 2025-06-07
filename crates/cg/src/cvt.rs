use crate::schema::*;
use skia_safe;

fn cg_build_gradient_stops(
    stops: &[GradientStop],
    opacity: f32,
) -> (Vec<skia_safe::Color>, Vec<f32>) {
    let mut colors = Vec::with_capacity(stops.len());
    let mut positions = Vec::with_capacity(stops.len());

    for stop in stops {
        let Color(r, g, b, a) = stop.color;
        let alpha = (a as f32 * opacity).round().clamp(0.0, 255.0) as u8;
        colors.push(skia_safe::Color::from_argb(alpha, r, g, b));
        positions.push(stop.offset);
    }

    (colors, positions)
}

pub fn sk_matrix(m: [[f32; 3]; 2]) -> skia_safe::Matrix {
    let [[a, c, tx], [b, d, ty]] = m;
    skia_safe::Matrix::from_affine(&[a, b, c, d, tx, ty])
}

pub fn sk_paint(paint: &Paint, opacity: f32, size: (f32, f32)) -> skia_safe::Paint {
    let mut skia_paint = skia_safe::Paint::default();
    skia_paint.set_anti_alias(true);
    let (width, height) = size;
    match paint {
        Paint::Solid(solid) => {
            let Color(r, g, b, a) = solid.color;
            let final_alpha = (a as f32 * opacity * solid.opacity) as u8;
            skia_paint.set_color(skia_safe::Color::from_argb(final_alpha, r, g, b));
        }
        Paint::LinearGradient(gradient) => {
            let (colors, positions) =
                cg_build_gradient_stops(&gradient.stops, opacity * gradient.opacity);
            let shader = skia_safe::Shader::linear_gradient(
                (
                    skia_safe::Point::new(0.0, 0.0),
                    skia_safe::Point::new(width, 0.0),
                ),
                &colors[..],
                Some(&positions[..]),
                skia_safe::TileMode::Clamp,
                None,
                Some(&sk_matrix(gradient.transform.matrix)),
            )
            .unwrap();
            skia_paint.set_shader(shader);
        }
        Paint::RadialGradient(gradient) => {
            let (colors, positions) =
                cg_build_gradient_stops(&gradient.stops, opacity * gradient.opacity);
            let center = skia_safe::Point::new(width / 2.0, height / 2.0);
            let radius = width.min(height) / 2.0;
            let shader = skia_safe::Shader::radial_gradient(
                center,
                radius,
                &colors[..],
                Some(&positions[..]),
                skia_safe::TileMode::Clamp,
                None,
                Some(&sk_matrix(gradient.transform.matrix)),
            )
            .unwrap();
            skia_paint.set_shader(shader);
        }
    }
    skia_paint
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
    let move_into_first = first.subtract_scaled(dir_a, r);

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
        let start_arc = curr.subtract_scaled(dir_in, r);

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

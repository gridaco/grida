use skia_safe::{surfaces, Color, Paint, PaintStyle, Path};

// Compute a smooth path representing a variable width stroke along a center path.
// `sample` returns the center position at t in [0,1].
// `tangent` returns the derivative at t.
// `width` returns the stroke width at t.
fn variable_width_stroke<FS, FT, FW>(sample: FS, tangent: FT, width: FW, samples: usize) -> Path
where
    FS: Fn(f32) -> (f32, f32),
    FT: Fn(f32) -> (f32, f32),
    FW: Fn(f32) -> f32,
{
    let mut left = Vec::with_capacity(samples + 1);
    let mut right = Vec::with_capacity(samples + 1);
    for i in 0..=samples {
        let t = i as f32 / samples as f32;
        let (x, y) = sample(t);
        let (dx, dy) = tangent(t);
        let len = (dx * dx + dy * dy).sqrt().max(1e-6);
        let nx = -dy / len;
        let ny = dx / len;
        let w = width(t) * 0.5;
        left.push((x + nx * w, y + ny * w));
        right.push((x - nx * w, y - ny * w));
    }

    // Build outline path using Catmull-Rom spline converted to cubic Beziers
    let mut path = Path::new();
    add_catmull_segments(&mut path, &left, false);
    right.reverse();
    add_catmull_segments(&mut path, &right, true);
    path.close();
    path
}

fn add_catmull_segments(path: &mut Path, pts: &[(f32, f32)], continue_path: bool) {
    if pts.is_empty() {
        return;
    }
    if !continue_path {
        path.move_to(pts[0]);
    }
    for i in 0..pts.len() - 1 {
        let p0 = if i == 0 { pts[0] } else { pts[i - 1] };
        let p1 = pts[i];
        let p2 = pts[i + 1];
        let p3 = if i + 2 < pts.len() {
            pts[i + 2]
        } else {
            pts[i + 1]
        };

        let c1 = (p1.0 + (p2.0 - p0.0) / 6.0, p1.1 + (p2.1 - p0.1) / 6.0);
        let c2 = (p2.0 - (p3.0 - p1.0) / 6.0, p2.1 - (p3.1 - p1.1) / 6.0);
        path.cubic_to(c1, c2, p2);
    }
}

fn width_profile(t: f32) -> f32 {
    // Parabolic pressure profile: thin at ends, thick in the middle
    let base = 6.0;
    let peak = 40.0;
    base + (peak - base) * (1.0 - (2.0 * t - 1.0).powi(2))
}

fn main() {
    let samples = 40;

    // Curved stroke using cubic Bezier
    let curve_sample = |t: f32| {
        let p0 = (50.0, 200.0);
        let p1 = (150.0, 50.0);
        let p2 = (250.0, 350.0);
        let p3 = (350.0, 200.0);
        let mt = 1.0 - t;
        let mt2 = mt * mt;
        let t2 = t * t;
        (
            p0.0 * mt2 * mt + 3.0 * p1.0 * mt2 * t + 3.0 * p2.0 * mt * t2 + p3.0 * t2 * t,
            p0.1 * mt2 * mt + 3.0 * p1.1 * mt2 * t + 3.0 * p2.1 * mt * t2 + p3.1 * t2 * t,
        )
    };
    let curve_tangent = |t: f32| {
        let p0 = (50.0, 200.0);
        let p1 = (150.0, 50.0);
        let p2 = (250.0, 350.0);
        let p3 = (350.0, 200.0);
        let mt = 1.0 - t;
        let mt2 = mt * mt;
        let t2 = t * t;
        (
            3.0 * (p1.0 - p0.0) * mt2 + 6.0 * (p2.0 - p1.0) * mt * t + 3.0 * (p3.0 - p2.0) * t2,
            3.0 * (p1.1 - p0.1) * mt2 + 6.0 * (p2.1 - p1.1) * mt * t + 3.0 * (p3.1 - p2.1) * t2,
        )
    };
    let curve_path = variable_width_stroke(curve_sample, curve_tangent, width_profile, samples);

    let mut surface = surfaces::raster_n32_premul((400, 400)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);
    paint.set_style(PaintStyle::Fill);
    canvas.draw_path(&curve_path, &paint);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/vector_variable_width.png", data.as_bytes()).unwrap();
}

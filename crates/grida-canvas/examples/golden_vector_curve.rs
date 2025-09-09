use cg::vectornetwork::*;
use skia_safe::{surfaces, Color, Paint};

fn main() {
    // Create a simple wave curve using VectorNetwork with cubic Bezier curves
    let curve = VectorNetwork {
        vertices: vec![
            (100.0, 200.0), // Start point (centered)
            (300.0, 200.0), // End point (centered)
        ],
        segments: vec![VectorNetworkSegment {
            a: 0,
            b: 1,
            ta: Some((100.0, -100.0)), // Tangent handle from start point
            tb: Some((-100.0, 100.0)), // Tangent handle to end point
        }],
        regions: vec![],
    };

    let mut surface = surfaces::raster_n32_premul((400, 400)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Convert VectorNetwork to Skia Path using the Into trait
    let path: skia_safe::Path = curve.into();

    let mut stroke_paint = Paint::default();
    stroke_paint.set_anti_alias(true);
    stroke_paint.set_color(Color::GREEN);
    stroke_paint.set_style(skia_safe::PaintStyle::Stroke);
    stroke_paint.set_stroke_width(4.0);
    canvas.draw_path(&path, &stroke_paint);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/vector_curve.png"),
        data.as_bytes(),
    )
    .unwrap();
}

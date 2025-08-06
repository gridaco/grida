use cg::shape::*;
use skia_safe::{surfaces, Color, Paint};

fn main() {
    // Create a simple line using VectorNetwork
    let line = VectorNetwork {
        vertices: vec![(100.0, 100.0), (300.0, 300.0)],
        segments: vec![VectorNetworkSegment {
            a: 0,
            b: 1,
            ta: None,
            tb: None,
        }],
        regions: vec![],
    };

    let mut surface = surfaces::raster_n32_premul((400, 400)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Convert VectorNetwork to Skia Path using the Into trait
    let path: skia_safe::Path = line.into();

    let mut stroke_paint = Paint::default();
    stroke_paint.set_anti_alias(true);
    stroke_paint.set_color(Color::RED);
    stroke_paint.set_style(skia_safe::PaintStyle::Stroke);
    stroke_paint.set_stroke_width(3.0);
    canvas.draw_path(&path, &stroke_paint);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/vector_line.png", data.as_bytes()).unwrap();
}

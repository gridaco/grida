use cg::vectornetwork::*;
use skia_safe::{surfaces, Color, Paint};

fn main() {
    // Create a simple triangle using VectorNetwork
    let triangle = VectorNetwork {
        vertices: vec![(200.0, 100.0), (300.0, 200.0), (100.0, 200.0)],
        segments: vec![
            VectorNetworkSegment {
                a: 0,
                b: 1,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 1,
                b: 2,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 2,
                b: 0,
                ta: None,
                tb: None,
            },
        ],
        regions: vec![],
    };

    let mut surface = surfaces::raster_n32_premul((400, 400)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Convert VectorNetwork to Skia Path using the Into trait
    let path: skia_safe::Path = triangle.into();

    let mut fill_paint = Paint::default();
    fill_paint.set_anti_alias(true);
    fill_paint.set_color(Color::BLUE);
    fill_paint.set_style(skia_safe::PaintStyle::Fill);
    canvas.draw_path(&path, &fill_paint);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/vector_triangle.png", data.as_bytes()).unwrap();
}

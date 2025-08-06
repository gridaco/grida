use cg::vectornetwork::*;
use skia_safe::{surfaces, Color, Paint};

fn main() {
    // Create a VectorNetwork with 4 overlapping rectangles forming a "+" shape
    // The rectangles overlap in the center to create a cross pattern

    let network = VectorNetwork {
        vertices: vec![
            // Horizontal bar (left to right)
            (100.0, 175.0), // 0
            (300.0, 175.0), // 1
            (300.0, 225.0), // 2
            (100.0, 225.0), // 3
            // Vertical bar (top to bottom)
            (175.0, 100.0), // 4
            (225.0, 100.0), // 5
            (225.0, 300.0), // 6
            (175.0, 300.0), // 7
        ],
        segments: vec![
            // Horizontal rectangle
            segment(0, 1),
            segment(1, 2),
            segment(2, 3),
            segment(3, 0),
            // Vertical rectangle
            segment(4, 5),
            segment(5, 6),
            segment(6, 7),
            segment(7, 4),
        ],
        regions: vec![],
    };

    // Helper
    fn segment(a: usize, b: usize) -> VectorNetworkSegment {
        VectorNetworkSegment {
            a,
            b,
            ta: None,
            tb: None,
        }
    }

    let mut surface = surfaces::raster_n32_premul((400, 400)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Convert VectorNetwork to a single Skia Path and apply even-odd fill rule
    let mut path = network.to_path();
    path.set_fill_type(skia_safe::PathFillType::EvenOdd);

    let mut fill_paint = Paint::default();
    fill_paint.set_anti_alias(true);
    fill_paint.set_color(Color::BLACK);
    fill_paint.set_style(skia_safe::PaintStyle::Fill);
    canvas.draw_path(&path, &fill_paint);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/vector_fillrule_evenodd.png", data.as_bytes()).unwrap();
}

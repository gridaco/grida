use cg::shape::*;
use skia_safe::{surfaces, Color, Paint};

fn main() {
    // Create a VectorNetwork with 4 isolated rectangles
    // Each rectangle is defined by 4 vertices and 4 segments
    // The rectangles are positioned at different locations to show they're isolated

    let network = VectorNetwork {
        vertices: vec![
            // Rectangle 1: (50, 50) to (150, 150)
            (50.0, 50.0),   // 0: top-left
            (150.0, 50.0),  // 1: top-right
            (150.0, 150.0), // 2: bottom-right
            (50.0, 150.0),  // 3: bottom-left
            // Rectangle 2: (250, 50) to (350, 150)
            (250.0, 50.0),  // 4: top-left
            (350.0, 50.0),  // 5: top-right
            (350.0, 150.0), // 6: bottom-right
            (250.0, 150.0), // 7: bottom-left
            // Rectangle 3: (50, 250) to (150, 350)
            (50.0, 250.0),  // 8: top-left
            (150.0, 250.0), // 9: top-right
            (150.0, 350.0), // 10: bottom-right
            (50.0, 350.0),  // 11: bottom-left
            // Rectangle 4: (250, 250) to (350, 350)
            (250.0, 250.0), // 12: top-left
            (350.0, 250.0), // 13: top-right
            (350.0, 350.0), // 14: bottom-right
            (250.0, 350.0), // 15: bottom-left
        ],
        segments: vec![
            // Rectangle 1 segments
            VectorNetworkSegment {
                a: 0,
                b: 1,
                ta: None,
                tb: None,
            }, // top edge
            VectorNetworkSegment {
                a: 1,
                b: 2,
                ta: None,
                tb: None,
            }, // right edge
            VectorNetworkSegment {
                a: 2,
                b: 3,
                ta: None,
                tb: None,
            }, // bottom edge
            VectorNetworkSegment {
                a: 3,
                b: 0,
                ta: None,
                tb: None,
            }, // left edge (closes)
            // Rectangle 2 segments
            VectorNetworkSegment {
                a: 4,
                b: 5,
                ta: None,
                tb: None,
            }, // top edge
            VectorNetworkSegment {
                a: 5,
                b: 6,
                ta: None,
                tb: None,
            }, // right edge
            VectorNetworkSegment {
                a: 6,
                b: 7,
                ta: None,
                tb: None,
            }, // bottom edge
            VectorNetworkSegment {
                a: 7,
                b: 4,
                ta: None,
                tb: None,
            }, // left edge (closes)
            // Rectangle 3 segments
            VectorNetworkSegment {
                a: 8,
                b: 9,
                ta: None,
                tb: None,
            }, // top edge
            VectorNetworkSegment {
                a: 9,
                b: 10,
                ta: None,
                tb: None,
            }, // right edge
            VectorNetworkSegment {
                a: 10,
                b: 11,
                ta: None,
                tb: None,
            }, // bottom edge
            VectorNetworkSegment {
                a: 11,
                b: 8,
                ta: None,
                tb: None,
            }, // left edge (closes)
            // Rectangle 4 segments
            VectorNetworkSegment {
                a: 12,
                b: 13,
                ta: None,
                tb: None,
            }, // top edge
            VectorNetworkSegment {
                a: 13,
                b: 14,
                ta: None,
                tb: None,
            }, // right edge
            VectorNetworkSegment {
                a: 14,
                b: 15,
                ta: None,
                tb: None,
            }, // bottom edge
            VectorNetworkSegment {
                a: 15,
                b: 12,
                ta: None,
                tb: None,
            }, // left edge (closes)
        ],
    };

    let mut surface = surfaces::raster_n32_premul((400, 400)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Convert VectorNetwork to Skia Path using the Into trait
    // The implementation automatically handles multiple disconnected shapes
    let path: skia_safe::Path = network.into();

    let mut fill_paint = Paint::default();
    fill_paint.set_anti_alias(true);
    fill_paint.set_color(Color::BLACK);
    fill_paint.set_style(skia_safe::PaintStyle::Fill);
    canvas.draw_path(&path, &fill_paint);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/vector_regions.png", data.as_bytes()).unwrap();
}

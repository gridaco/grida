use cg::vectornetwork::*;
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
            VectorNetworkSegment::ab(0, 1), // top edge
            VectorNetworkSegment::ab(1, 2), // right edge
            VectorNetworkSegment::ab(2, 3), // bottom edge
            VectorNetworkSegment::ab(3, 0), // left edge (closes)
            // Rectangle 2 segments
            VectorNetworkSegment::ab(4, 5), // top edge
            VectorNetworkSegment::ab(5, 6), // right edge
            VectorNetworkSegment::ab(6, 7), // bottom edge
            VectorNetworkSegment::ab(7, 4), // left edge (closes)
            // Rectangle 3 segments
            VectorNetworkSegment::ab(8, 9),   // top edge
            VectorNetworkSegment::ab(9, 10),  // right edge
            VectorNetworkSegment::ab(10, 11), // bottom edge
            VectorNetworkSegment::ab(11, 8),  // left edge (closes)
            // Rectangle 4 segments
            VectorNetworkSegment::ab(12, 13), // top edge
            VectorNetworkSegment::ab(13, 14), // right edge
            VectorNetworkSegment::ab(14, 15), // bottom edge
            VectorNetworkSegment::ab(15, 12), // left edge (closes)
        ],
        regions: vec![],
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
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/vector_regions.png"),
        data.as_bytes(),
    )
    .unwrap();
}

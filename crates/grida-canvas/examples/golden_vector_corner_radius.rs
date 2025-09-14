use cg::shape::*;
use cg::vectornetwork::*;
use skia_safe::{surfaces, Color, Paint};

fn main() {
    // Create a diamond shape using VectorNetwork
    let diamond = VectorNetwork {
        vertices: vec![
            (200.0, 100.0), // top
            (300.0, 200.0), // right
            (200.0, 300.0), // bottom
            (100.0, 200.0), // left
        ],
        segments: vec![
            VectorNetworkSegment {
                a: 0,
                b: 1,
                // demonstrate that the zero-tangents should behave as a corner
                ta: (0.0, 0.0),
                tb: (0.0, 0.0),
            },
            VectorNetworkSegment::ab(1, 2),
            VectorNetworkSegment::ab(2, 3),
            VectorNetworkSegment::ab(3, 0),
        ],
        regions: vec![],
    };

    let mut surface = surfaces::raster_n32_premul((400, 400)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Convert VectorNetwork to Skia Path using the Into trait
    let path: skia_safe::Path = diamond.into();
    let path = build_corner_radius_path(&path, 10.0);

    let mut fill_paint = Paint::default();
    fill_paint.set_anti_alias(true);
    fill_paint.set_color(Color::BLUE);
    fill_paint.set_style(skia_safe::PaintStyle::Fill);
    canvas.draw_path(&path, &fill_paint);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/vector_corner_radius.png"
        ),
        data.as_bytes(),
    )
    .unwrap();
}

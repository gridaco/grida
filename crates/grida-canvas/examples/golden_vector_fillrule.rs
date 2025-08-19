use cg::cg::types::*;
use cg::vectornetwork::*;
use skia_safe::{surfaces, Color, Paint, PaintStyle};

fn main() {
    // Helper to create a segment without tangents
    fn segment(a: usize, b: usize) -> VectorNetworkSegment {
        VectorNetworkSegment {
            a,
            b,
            ta: None,
            tb: None,
        }
    }

    // VectorNetwork representing a square with a square hole (donut shape)
    // Outer square is clockwise, inner square is counter-clockwise
    let network = VectorNetwork {
        vertices: vec![
            // outer square
            (50.0, 50.0),   // 0
            (150.0, 50.0),  // 1
            (150.0, 150.0), // 2
            (50.0, 150.0),  // 3
            // inner square (hole)
            (80.0, 80.0),   // 4
            (80.0, 120.0),  // 5
            (120.0, 120.0), // 6
            (120.0, 80.0),  // 7
        ],
        segments: vec![
            // outer loop (clockwise)
            segment(0, 1),
            segment(1, 2),
            segment(2, 3),
            segment(3, 0),
            // this will result both fill rule to have hollow square
            // // inner loop (counter-clockwise)
            // segment(4, 5),
            // segment(5, 6),
            // segment(6, 7),
            // segment(7, 4),
            // inner loop (clockwise)
            // this is what we want to demonstrate
            segment(4, 7),
            segment(7, 6),
            segment(6, 5),
            segment(5, 4),
        ],
        regions: vec![VectorNetworkRegion {
            loops: vec![
                VectorNetworkLoop(vec![0, 1, 2, 3]), // outer
                VectorNetworkLoop(vec![4, 5, 6, 7]), // inner hole
            ],
            fill_rule: FillRule::NonZero,
            fills: None,
        }],
    };

    // Prepare a copy with even-odd fill rule for comparison
    let mut network_evenodd = network.clone();
    network_evenodd.regions[0].fill_rule = FillRule::EvenOdd;

    let mut surface = surfaces::raster_n32_premul((400, 200)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let mut fill_paint = Paint::default();
    fill_paint.set_anti_alias(true);
    fill_paint.set_color(Color::BLACK);
    fill_paint.set_style(PaintStyle::Fill);

    // Draw with non-zero (winding) fill rule on the left
    for path in network.to_paths() {
        canvas.draw_path(&path, &fill_paint);
    }

    // Draw with even-odd fill rule on the right
    canvas.translate((200.0, 0.0));
    for path in network_evenodd.to_paths() {
        canvas.draw_path(&path, &fill_paint);
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/vector_fillrule.png", data.as_bytes()).unwrap();
}

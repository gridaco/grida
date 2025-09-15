use cg::cg::types::*;
use cg::vectornetwork::*;
use skia_safe::{surfaces, Color};

fn main() {
    // Define two overlapping squares in a 400x400 space
    let network = VectorNetwork {
        vertices: vec![
            // Square 1 (top-left)
            (50.0, 50.0),
            (250.0, 50.0),
            (250.0, 250.0),
            (50.0, 250.0),
            // Square 2 (bottom-right)
            (150.0, 150.0),
            (350.0, 150.0),
            (350.0, 350.0),
            (150.0, 350.0),
        ],
        segments: vec![
            VectorNetworkSegment::ab(0, 1),
            VectorNetworkSegment::ab(1, 2),
            VectorNetworkSegment::ab(2, 3),
            VectorNetworkSegment::ab(3, 0),
            VectorNetworkSegment::ab(4, 5),
            VectorNetworkSegment::ab(5, 6),
            VectorNetworkSegment::ab(6, 7),
            VectorNetworkSegment::ab(7, 4),
        ],
        regions: vec![
            VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::from(CGColor(200, 200, 200, 255))]),
            },
            VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![4, 5, 6, 7])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::from(CGColor(200, 200, 200, 255))]),
            },
        ],
    };

    let mut surface = surfaces::raster_n32_premul((400, 1200)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let painter = VNPainter::new(canvas);

    let stroke_color = CGColor(0, 0, 0, 255); // black stroke
    let stroke_width = 40.0;
    let aligns = [
        StrokeAlign::Inside,
        StrokeAlign::Center,
        StrokeAlign::Outside,
    ];

    for (i, align) in aligns.iter().enumerate() {
        canvas.save();
        canvas.translate((0.0, (i as f32) * 400.0));
        let options = StrokeOptions {
            width: stroke_width,
            align: *align,
            paints: vec![Paint::from(stroke_color)],
            width_profile: None,
        };
        painter.draw(&network, &[], Some(&options), 0.0);
        canvas.restore();
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/vector_regions_strokes.png"
        ),
        data.as_bytes(),
    )
    .unwrap();
}

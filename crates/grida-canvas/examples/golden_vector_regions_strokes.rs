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
                b: 3,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 3,
                b: 0,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 4,
                b: 5,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 5,
                b: 6,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 6,
                b: 7,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 7,
                b: 4,
                ta: None,
                tb: None,
            },
        ],
        regions: vec![
            VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::Solid(SolidPaint {
                    color: CGColor(200, 200, 200, 255), // grey fill
                    opacity: 1.0,
                })]),
            },
            VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![4, 5, 6, 7])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::Solid(SolidPaint {
                    color: CGColor(200, 200, 200, 255), // grey fill
                    opacity: 1.0,
                })]),
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
            color: stroke_color,
        };
        painter.draw(&network, Some(&options));
        canvas.restore();
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/vector_regions_strokes.png", data.as_bytes()).unwrap();
}

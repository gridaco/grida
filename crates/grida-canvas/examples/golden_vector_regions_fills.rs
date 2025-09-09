use cg::cg::types::*;
use cg::vectornetwork::*;
use skia_safe::{surfaces, Color};

fn main() {
    // Create a vector network with four separate rectangles forming a Microsoft logo,
    // each region having its own fill color matching Microsoft's brand colors.
    // Canvas is 500x500, so we'll use 400x400 for the logo with 50px padding on each side.
    let padding = 50.0;
    let logo_size = 400.0;
    let gap = 20.0; // Space between rectangles
    let rect_size = (logo_size - gap) / 2.0;

    let network = VectorNetwork {
        vertices: vec![
            // Rectangle 1 (Red - top left)
            (padding, padding),
            (padding + rect_size, padding),
            (padding + rect_size, padding + rect_size),
            (padding, padding + rect_size),
            // Rectangle 2 (Green - top right)
            (padding + rect_size + gap, padding),
            (padding + rect_size + gap + rect_size, padding),
            (padding + rect_size + gap + rect_size, padding + rect_size),
            (padding + rect_size + gap, padding + rect_size),
            // Rectangle 3 (Blue - bottom left)
            (padding, padding + rect_size + gap),
            (padding + rect_size, padding + rect_size + gap),
            (padding + rect_size, padding + rect_size + gap + rect_size),
            (padding, padding + rect_size + gap + rect_size),
            // Rectangle 4 (Yellow - bottom right)
            (padding + rect_size + gap, padding + rect_size + gap),
            (
                padding + rect_size + gap + rect_size,
                padding + rect_size + gap,
            ),
            (
                padding + rect_size + gap + rect_size,
                padding + rect_size + gap + rect_size,
            ),
            (
                padding + rect_size + gap,
                padding + rect_size + gap + rect_size,
            ),
        ],
        segments: vec![
            // Rect 1 (Red)
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
            // Rect 2 (Green)
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
            // Rect 3 (Blue)
            VectorNetworkSegment {
                a: 8,
                b: 9,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 9,
                b: 10,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 10,
                b: 11,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 11,
                b: 8,
                ta: None,
                tb: None,
            },
            // Rect 4 (Yellow)
            VectorNetworkSegment {
                a: 12,
                b: 13,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 13,
                b: 14,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 14,
                b: 15,
                ta: None,
                tb: None,
            },
            VectorNetworkSegment {
                a: 15,
                b: 12,
                ta: None,
                tb: None,
            },
        ],
        regions: vec![
            VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::Solid(SolidPaint {
                    color: CGColor(242, 80, 34, 255), // Microsoft Red #F25022
                    opacity: 1.0,
                })]),
            },
            VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![4, 5, 6, 7])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::Solid(SolidPaint {
                    color: CGColor(127, 186, 0, 255), // Microsoft Green #7FBA00
                    opacity: 1.0,
                })]),
            },
            VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![8, 9, 10, 11])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::Solid(SolidPaint {
                    color: CGColor(0, 164, 239, 255), // Microsoft Blue #00A4EF
                    opacity: 1.0,
                })]),
            },
            VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![12, 13, 14, 15])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::Solid(SolidPaint {
                    color: CGColor(255, 185, 0, 255), // Microsoft Yellow #FFB900
                    opacity: 1.0,
                })]),
            },
        ],
    };

    let mut surface = surfaces::raster_n32_premul((500, 500)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let painter = VNPainter::new(canvas);
    painter.draw(&network, &[], None);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/vector_regions_fills.png"
        ),
        data.as_bytes(),
    )
    .unwrap();
}

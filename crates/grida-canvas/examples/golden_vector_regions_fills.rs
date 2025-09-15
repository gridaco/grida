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
            VectorNetworkSegment::ab(0, 1),
            VectorNetworkSegment::ab(1, 2),
            VectorNetworkSegment::ab(2, 3),
            VectorNetworkSegment::ab(3, 0),
            // Rect 2 (Green)
            VectorNetworkSegment::ab(4, 5),
            VectorNetworkSegment::ab(5, 6),
            VectorNetworkSegment::ab(6, 7),
            VectorNetworkSegment::ab(7, 4),
            // Rect 3 (Blue)
            VectorNetworkSegment::ab(8, 9),
            VectorNetworkSegment::ab(9, 10),
            VectorNetworkSegment::ab(10, 11),
            VectorNetworkSegment::ab(11, 8),
            // Rect 4 (Yellow)
            VectorNetworkSegment::ab(12, 13),
            VectorNetworkSegment::ab(13, 14),
            VectorNetworkSegment::ab(14, 15),
            VectorNetworkSegment::ab(15, 12),
        ],
        regions: vec![
            VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::from(CGColor(242, 80, 34, 255))]),
            },
            VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![4, 5, 6, 7])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::from(CGColor(127, 186, 0, 255))]),
            },
            VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![8, 9, 10, 11])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::from(CGColor(0, 164, 239, 255))]),
            },
            VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![12, 13, 14, 15])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::from(CGColor(255, 185, 0, 255))]),
            },
        ],
    };

    let mut surface = surfaces::raster_n32_premul((500, 500)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let painter = VNPainter::new(canvas);
    painter.draw(&network, &[], None, 0.0);

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

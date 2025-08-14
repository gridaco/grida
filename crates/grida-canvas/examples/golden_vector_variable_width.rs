use cg::cg::types::{CGColor, StrokeAlign};
use cg::cg::varwidth::*;
use cg::vectornetwork::vn::{PiecewiseVectorNetworkGeometry, VectorNetwork, VectorNetworkSegment};
use cg::vectornetwork::vn_painter::{StrokeOptions, VNPainter};
use skia_safe::{surfaces, Color};

fn main() {
    let samples = 40;

    // Define the variable width profile
    let width_profile = VarWidthProfile {
        base: 2.0,
        stops: vec![
            WidthStop { u: 0.00, r: 0.0 },
            WidthStop { u: 0.15, r: 20.0 },
            WidthStop { u: 0.5, r: 40.0 },
            WidthStop { u: 0.85, r: 20.0 },
            WidthStop { u: 1.00, r: 0.0 },
        ],
    };

    // Create a piecewise geometry with a single cubic Bezier curve segment
    // This represents the original single smooth curve
    let geometry = PiecewiseVectorNetworkGeometry::new(
        vec![
            (50.0, 200.0),  // p0 (start point)
            (350.0, 200.0), // p3 (end point)
        ],
        vec![
            // Single cubic Bezier curve segment
            VectorNetworkSegment {
                a: 0,
                b: 1,
                ta: Some((100.0, -150.0)), // p1 - p0 (first control point)
                tb: Some((-100.0, 150.0)), // p3 - p2 (second control point)
            },
        ],
    )
    .expect("Valid geometry");

    // Create a VectorNetwork from the geometry
    let vn = VectorNetwork {
        vertices: geometry.vertices,
        segments: geometry.segments,
        regions: vec![], // No fill regions, just stroke
    };

    // Create stroke options with variable width
    let stroke_options = StrokeOptions {
        width: 1.0, // Not used for variable width
        align: StrokeAlign::Center,
        color: CGColor(0, 0, 0, 255),
        width_profile: Some(width_profile),
    };

    // Render using VNPainter
    let mut surface = surfaces::raster_n32_premul((400, 400)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let painter = VNPainter::new(canvas);
    painter.draw(&vn, Some(&stroke_options));

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/vector_variable_width.png", data.as_bytes()).unwrap();
}

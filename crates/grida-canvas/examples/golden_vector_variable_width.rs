use cg::cg::types::CGColor;
use cg::cg::varwidth::*;
use cg::vectornetwork::vn::{PiecewiseVectorNetworkGeometry, VectorNetworkSegment};
use cg::vectornetwork::vn_painter::VNPainter;
use skia_safe::{surfaces, Color};

fn main() {
    // Define the variable width profile
    let width_profile_1 = VarWidthProfile {
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
    let curve_1 = PiecewiseVectorNetworkGeometry::new(
        vec![
            (50.0, 200.0),   // p0 (start point)
            (2500.0, 200.0), // p3 (end point)
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

    // Create a straight line geometry (zero tangent values)
    let curve_2 = PiecewiseVectorNetworkGeometry::new(
        vec![
            (50.0, 500.0),   // p0 (start point)
            (2500.0, 500.0), // p3 (end point)
        ],
        vec![
            // Single straight line segment (zero tangent values)
            VectorNetworkSegment {
                a: 0,
                b: 1,
                ta: None, // Zero tangent = straight line
                tb: None, // Zero tangent = straight line
            },
        ],
    )
    .expect("Valid geometry");

    // Create a zig-zag line geometry with 6 vertices and 5 segments
    let curve_3 = PiecewiseVectorNetworkGeometry::new(
        vec![
            (50.0, 800.0),   // p0 (start point)
            (450.0, 700.0),  // p1 (first zig)
            (850.0, 900.0),  // p2 (second zag)
            (1250.0, 700.0), // p3 (third zig)
            (1650.0, 900.0), // p4 (fourth zag)
            (2500.0, 800.0), // p5 (end point)
        ],
        vec![
            // First segment: straight line
            VectorNetworkSegment {
                a: 0,
                b: 1,
                ta: None,
                tb: None,
            },
            // Second segment: straight line
            VectorNetworkSegment {
                a: 1,
                b: 2,
                ta: None,
                tb: None,
            },
            // Third segment: straight line
            VectorNetworkSegment {
                a: 2,
                b: 3,
                ta: None,
                tb: None,
            },
            // Fourth segment: straight line
            VectorNetworkSegment {
                a: 3,
                b: 4,
                ta: None,
                tb: None,
            },
            // Fifth segment: straight line
            VectorNetworkSegment {
                a: 4,
                b: 5,
                ta: None,
                tb: None,
            },
        ],
    )
    .expect("Valid geometry");

    // Render using VNPainter with direct variable width stroke
    let mut surface = surfaces::raster_n32_premul((2550, 3300)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let painter = VNPainter::new(canvas);
    painter.draw_stroke_variable_width(&curve_1, CGColor::BLACK, &width_profile_1);
    painter.draw_stroke_variable_width(&curve_2, CGColor::BLACK, &width_profile_1);
    painter.draw_stroke_variable_width(&curve_3, CGColor::BLACK, &width_profile_1);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/vector_variable_width.png", data.as_bytes()).unwrap();
}

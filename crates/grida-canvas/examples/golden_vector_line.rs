use cg::cg::prelude::*;
use cg::vectornetwork::vn_painter::*;
use cg::vectornetwork::*;
use skia_safe::{surfaces, Color};
use std::f32::consts::PI;

fn main() {
    let mut surface = surfaces::raster_n32_premul((600, 600)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Create multiple lines with different angles
    let num_lines = 10;
    let line_length = 400.0; // Even longer lines
    let start_x = 50.0; // Moved to top-left
    let start_y = 50.0; // Moved to top-left
    let y_spacing = 15.0; // Much tighter vertical spacing

    for i in 0..num_lines {
        let angle_degrees = (i as f32) * 90.0 / ((num_lines - 1) as f32); // 0 to exactly 90 degrees
        let angle_radians = angle_degrees * PI / 180.0;

        // Calculate line endpoints
        let x1 = start_x;
        let y1 = start_y + (i as f32) * y_spacing;
        let x2 = x1 + angle_radians.cos() * line_length;
        let y2 = y1 + angle_radians.sin() * line_length;

        // Create a VectorNetwork for this line
        let line = VectorNetwork {
            vertices: vec![(x1, y1), (x2, y2)],
            segments: vec![VectorNetworkSegment::ab(0, 1)],
            regions: vec![],
        };

        // Use different colors based on angle - create RGB color from angle
        let normalized_angle = angle_degrees / 90.0; // 0.0 to 1.0
        let red = (255.0 * (1.0 - normalized_angle)) as u8;
        let green = (255.0 * normalized_angle) as u8;
        let blue = 0u8;
        let color = CGColor::from_rgba(red, green, blue, 255);

        // Create stroke options for VNPainter
        // Every 2nd line gets a dash pattern
        let dash_array = if i % 2 == 1 {
            Some(StrokeDashArray::from(vec![10.0, 5.0]))
        } else {
            None
        };

        let stroke_options = StrokeOptions {
            stroke_width: 2.0,
            stroke_align: StrokeAlign::Center,
            stroke_cap: StrokeCap::Round,
            stroke_join: StrokeJoin::Round,
            stroke_miter_limit: StrokeMiterLimit::default(),
            paints: Paints::new([Paint::from(color)]),
            width_profile: None,
            stroke_dash_array: dash_array,
        };

        // Use VNPainter to render the line
        let painter = VNPainter::new(canvas);
        painter.draw(&line, &[], Some(&stroke_options), 0.0);
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/vector_line.png"),
        data.as_bytes(),
    )
    .unwrap();
    println!("Image saved with {} lines and a test rectangle", num_lines);
}

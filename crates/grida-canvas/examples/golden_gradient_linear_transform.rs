use cg::cg::prelude::*;
use cg::painter::gradient::*;
use math2::transform::AffineTransform;
use skia_safe::{surfaces, Color, Rect};

/// Draw a rectangle filled with a linear gradient at the specified position and size.
///
/// # Arguments
/// * `canvas` - The Skia canvas to draw on
/// * `x` - X coordinate of the top-left corner
/// * `y` - Y coordinate of the top-left corner  
/// * `size` - Tuple of (width, height) for the rectangle
/// * `gradient` - The linear gradient paint to fill the rectangle with
fn draw_rect(
    canvas: &skia_safe::Canvas,
    x: f32,
    y: f32,
    size: (f32, f32),
    gradient: &LinearGradientPaint,
) {
    // Save canvas state
    canvas.save();

    // Translate canvas to position the container
    canvas.translate((x, y));

    // Create paint with gradient relative to container (0,0)
    let paint = linear_gradient_paint(gradient, size);

    // Draw rectangle at origin (0,0) since we translated the canvas
    canvas.draw_rect(Rect::from_xywh(0.0, 0.0, size.0, size.1), &paint);

    // Restore canvas state
    canvas.restore();
}

fn main() {
    let (width, height) = (1400, 750);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Create a base linear gradient
    let linear_gradient =
        LinearGradientPaint::from_colors(vec![CGColor::RED, CGColor::GREEN, CGColor::BLUE]);

    // Draw rectangles with varying widths in a single row
    let start_x = 50.0;
    let y = 100.0;
    let y2 = 250.0; // Second row
    let y3 = 400.0; // Third row
    let y4 = 550.0; // Fourth row (different begin/end)
    let spacing = 20.0;
    let rect_height = 100.0;

    // Create 8 rectangles with varying widths in first row (no transform)
    let mut current_x = start_x;
    for i in 0..8 {
        let rect_width = 50.0 + i as f32 * 25.0; // Width increases from 50 to 225

        draw_rect(
            canvas,
            current_x,
            y,
            (rect_width, rect_height),
            &linear_gradient,
        );

        // Move to next position: current rectangle width + spacing
        current_x += rect_width + spacing;
    }

    // Create 8 rectangles with varying widths in second row (with translation transform)
    let linear_gradient_translated = LinearGradientPaint {
        stops: linear_gradient.stops.clone(),
        opacity: linear_gradient.opacity,
        transform: AffineTransform::new(-0.5, -0.5, 0.0), // Move gradient center to top-left
        ..Default::default()
    };

    let mut current_x = start_x;
    for i in 0..8 {
        let rect_width = 50.0 + i as f32 * 25.0; // Width increases from 50 to 225

        draw_rect(
            canvas,
            current_x,
            y2,
            (rect_width, rect_height),
            &linear_gradient_translated,
        );

        // Move to next position: current rectangle width + spacing
        current_x += rect_width + spacing;
    }

    // Create 8 rectangles with varying widths in third row (with rotation transform)
    let linear_gradient_rotated = LinearGradientPaint {
        stops: linear_gradient.stops.clone(),
        opacity: linear_gradient.opacity,
        transform: AffineTransform::new(0.0, 0.0, 45.0), // Rotate the gradient by 45 degrees
        ..Default::default()
    };

    let mut current_x = start_x;
    for i in 0..8 {
        let rect_width = 50.0 + i as f32 * 25.0; // Width increases from 50 to 225

        draw_rect(
            canvas,
            current_x,
            y3,
            (rect_width, rect_height),
            &linear_gradient_rotated,
        );

        // Move to next position: current rectangle width + spacing
        current_x += rect_width + spacing;
    }

    // Create 8 rectangles in the fourth row with varying gradient anchors.
    let begin_end_variants = [
        (Alignment::CENTER_LEFT, Alignment::CENTER_RIGHT),
        (Alignment::TOP_LEFT, Alignment::BOTTOM_RIGHT),
        (Alignment::BOTTOM_LEFT, Alignment::TOP_RIGHT),
        (Alignment::TOP_CENTER, Alignment::BOTTOM_CENTER),
        (Alignment::CENTER_RIGHT, Alignment::CENTER_LEFT),
        (Alignment::BOTTOM_CENTER, Alignment::TOP_CENTER),
        (Alignment::TOP_RIGHT, Alignment::BOTTOM_LEFT),
        (Alignment::CENTER_LEFT, Alignment::BOTTOM_RIGHT),
    ];

    let mut current_x = start_x;
    for (i, &(xy1, xy2)) in begin_end_variants.iter().enumerate() {
        let rect_width = 50.0 + i as f32 * 25.0;
        let mut gradient_variant = linear_gradient.clone();
        gradient_variant.xy1 = xy1;
        gradient_variant.xy2 = xy2;
        gradient_variant.transform = AffineTransform::identity();

        draw_rect(
            canvas,
            current_x,
            y4,
            (rect_width, rect_height),
            &gradient_variant,
        );

        current_x += rect_width + spacing;
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/gradient_linear_transform.png"
        ),
        data.as_bytes(),
    )
    .unwrap();
}

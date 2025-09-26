use cg::cg::types::*;
use cg::painter::gradient::*;
use math2::transform::AffineTransform;
use skia_safe::{surfaces, Color, Rect};

/// Draw a rectangle filled with a diamond gradient at the specified position and size.
///
/// # Arguments
/// * `canvas` - The Skia canvas to draw on
/// * `x` - X coordinate of the top-left corner
/// * `y` - Y coordinate of the top-left corner  
/// * `size` - Tuple of (width, height) for the rectangle
/// * `gradient` - The diamond gradient paint to fill the rectangle with
fn draw_rect(
    canvas: &skia_safe::Canvas,
    x: f32,
    y: f32,
    size: (f32, f32),
    gradient: &DiamondGradientPaint,
) {
    // Save canvas state
    canvas.save();

    // Translate canvas to position the container
    canvas.translate((x, y));

    // Create paint with gradient relative to container (0,0)
    let paint = diamond_gradient_paint(gradient, size);

    // Draw rectangle at origin (0,0) since we translated the canvas
    canvas.draw_rect(Rect::from_xywh(0.0, 0.0, size.0, size.1), &paint);

    // Restore canvas state
    canvas.restore();
}

fn main() {
    let (width, height) = (1400, 600);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Create a base diamond gradient
    let diamond_gradient = DiamondGradientPaint {
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: CGColor(255, 0, 0, 255),
            },
            GradientStop {
                offset: 0.5,
                color: CGColor(0, 255, 0, 255),
            },
            GradientStop {
                offset: 1.0,
                color: CGColor(0, 0, 255, 255),
            },
        ],
        opacity: 1.0,
        transform: AffineTransform::identity(),
        blend_mode: BlendMode::Normal,
        active: true,
    };

    // Draw rectangles with varying widths in a single row
    let start_x = 50.0;
    let y = 100.0;
    let y2 = 250.0; // Second row
    let y3 = 400.0; // Third row
    let spacing = 20.0;
    let height = 100.0;

    // Create 8 rectangles with varying widths in first row (no transform)
    let mut current_x = start_x;
    for i in 0..8 {
        let rect_width = 50.0 + i as f32 * 25.0; // Width increases from 50 to 225

        draw_rect(
            canvas,
            current_x,
            y,
            (rect_width, height),
            &diamond_gradient,
        );

        // Move to next position: current rectangle width + spacing
        current_x += rect_width + spacing;
    }

    // Create 8 rectangles with varying widths in second row (with translation transform)
    let diamond_gradient_translated = DiamondGradientPaint {
        stops: diamond_gradient.stops.clone(),
        opacity: diamond_gradient.opacity,
        transform: AffineTransform::new(-0.25, -0.25, 0.0), // Move gradient center to top-left
        blend_mode: BlendMode::Normal,
        active: true,
    };

    let mut current_x = start_x;
    for i in 0..8 {
        let rect_width = 50.0 + i as f32 * 25.0; // Width increases from 50 to 225

        draw_rect(
            canvas,
            current_x,
            y2,
            (rect_width, height),
            &diamond_gradient_translated,
        );

        // Move to next position: current rectangle width + spacing
        current_x += rect_width + spacing;
    }

    // Create 8 rectangles with varying widths in third row (with rotation transform)
    let diamond_gradient_rotated = DiamondGradientPaint {
        stops: diamond_gradient.stops.clone(),
        opacity: diamond_gradient.opacity,
        transform: AffineTransform::new(0.0, 0.0, 45.0), // Rotate the gradient by 45 degrees
        blend_mode: BlendMode::Normal,
        active: true,
    };

    let mut current_x = start_x;
    for i in 0..8 {
        let rect_width = 50.0 + i as f32 * 25.0; // Width increases from 50 to 225

        draw_rect(
            canvas,
            current_x,
            y3,
            (rect_width, height),
            &diamond_gradient_rotated,
        );

        // Move to next position: current rectangle width + spacing
        current_x += rect_width + spacing;
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/gradient_diamond_transform.png"
        ),
        data.as_bytes(),
    )
    .unwrap();
}

use cg::cg::prelude::*;
use cg::painter::effects::create_progressive_blur_image_filter;
use skia_safe::{self as sk, canvas::SaveLayerRec, surfaces, Color, ImageFilter, Paint, Rect};

static BLUR_EFFECT: FeProgressiveBlur = FeProgressiveBlur {
    start: Alignment(0.0, -1.0), // Top edge center (node-local)
    end: Alignment(0.0, 1.0),    // Bottom edge center (node-local)
    radius: 0.0,
    radius2: 100.0,
};

/// Create ImageFilter for progressive blur effect using two-pass separable blur
fn create_progressive_blur_filter(effect: &FeProgressiveBlur, bounds: Rect) -> ImageFilter {
    create_progressive_blur_image_filter(effect, bounds)
}

/// Draw a rectangle node with progressive blur effect bounded to it
/// This demonstrates how effects are applied per-node in the graphics system
fn draw_rect_with_progressive_blur(
    canvas: &sk::Canvas,
    rect: Rect,
    color: Color,
    effect: &FeProgressiveBlur,
    _canvas_size: (f32, f32),
) {
    let filter = create_progressive_blur_filter(effect, rect);

    // Use SaveLayer with bounds to isolate the effect to just this rectangle
    let mut layer_paint = Paint::default();
    layer_paint.set_image_filter(filter);

    let save_layer_rec = SaveLayerRec::default().bounds(&rect).paint(&layer_paint);

    // Start a new layer with the blur filter
    canvas.save_layer(&save_layer_rec);

    // Draw the rectangle content within the bounded layer
    let mut rect_paint = Paint::default();
    rect_paint.set_color(color);
    rect_paint.set_anti_alias(true);
    canvas.draw_rect(rect, &rect_paint);

    // Restore the layer, applying the progressive blur effect
    // only to the content within the bounds
    canvas.restore();
}

fn main() {
    let (width, height) = (400, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();

    // Draw solid black background
    canvas.clear(Color::BLACK);

    // Define the rectangle bounds (1:2 ratio - width:height)
    // With 50px margin on top and bottom
    let rect_bounds = Rect::from_xywh(125.0, 50.0, 150.0, 300.0);

    // Draw the blue rectangle with progressive blur effect
    // The effect is bounded to just this rectangle, not the entire canvas
    draw_rect_with_progressive_blur(
        canvas,
        rect_bounds,
        Color::BLUE,
        &BLUR_EFFECT,
        (width as f32, height as f32),
    );

    // Save the result to a file
    let image_snapshot = surface.image_snapshot();
    let data = image_snapshot
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("Failed to encode image");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/progressive_blur.png"),
        data.as_bytes(),
    )
    .expect("Failed to write output file");

    println!("Progressive blur example saved to goldens/progressive_blur.png");
}

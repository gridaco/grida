use cg::cg::prelude::*;
use cg::painter::effects::create_progressive_blur_image_filter;
use skia_safe::{
    self as sk, canvas::SaveLayerRec, surfaces, Color, Data, ImageFilter, Paint, Rect,
};

// Include 8K background image
const BACKGROUND_IMAGE: &[u8] = include_bytes!("../../../fixtures/images/8k.jpg");

// Progressive blur with node-local Alignment coordinates
// Will be converted to pixel coordinates based on panel bounds
static BLUR_EFFECT: FeProgressiveBlur = FeProgressiveBlur {
    start: Alignment(0.0, -1.0), // Top edge center (node-local)
    end: Alignment(0.0, 1.0),    // Bottom edge center (node-local)
    radius: 0.0,
    radius2: 80.0, // Stronger blur for backdrop effect
};

/// Create ImageFilter for progressive blur effect using two-pass separable blur
fn create_progressive_blur_filter(effect: &FeProgressiveBlur, bounds: Rect) -> ImageFilter {
    create_progressive_blur_image_filter(effect, bounds)
}

/// Draw a glass panel with progressive backdrop blur
/// This demonstrates backdrop blur where the effect blurs the content behind the panel
/// Follows the same pattern as draw_glass_effect in painter.rs
fn draw_glass_panel_with_progressive_backdrop_blur(
    canvas: &sk::Canvas,
    rect: Rect,
    effect: &FeProgressiveBlur,
    _canvas_size: (f32, f32),
) {
    // Step 1: Translate to panel origin (like draw_glass_effect does)
    // This makes the backdrop use global coordinates still
    canvas.save();
    canvas.translate((rect.x(), rect.y()));

    // Step 2: Clip to the panel region in local coords (0,0,width,height)
    let local_rect = Rect::from_wh(rect.width(), rect.height());

    // Create filter with the original rect bounds (global coordinates)
    // Backdrop filters evaluate in global canvas coordinates, not local
    let filter = create_progressive_blur_filter(effect, rect);
    let rrect = sk::RRect::new_rect_radii(
        local_rect,
        &[
            sk::Vector::new(20.0, 20.0), // top-left
            sk::Vector::new(20.0, 20.0), // top-right
            sk::Vector::new(20.0, 20.0), // bottom-right
            sk::Vector::new(20.0, 20.0), // bottom-left
        ],
    );
    canvas.clip_rrect(rrect, None, true);

    // Step 3: Use SaveLayer with backdrop filter
    // This captures what's already drawn behind the clip and applies progressive blur
    let layer_rec = SaveLayerRec::default().backdrop(&filter);
    canvas.save_layer(&layer_rec);

    // We don't draw any content here - just push and pop the layer
    // This applies the backdrop blur to what's behind
    canvas.restore(); // pop the SaveLayer
    canvas.restore(); // pop the translate

    // Step 4: Draw the glass panel content on top of the blurred backdrop
    let mut panel_paint = Paint::default();
    panel_paint.set_color(Color::from_argb(80, 255, 255, 255)); // Semi-transparent white
    panel_paint.set_anti_alias(true);
    canvas.draw_round_rect(rect, 20.0, 20.0, &panel_paint);
}

fn main() {
    let (width, height) = (400, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();

    // Load and draw the 4K background image
    let background = sk::Image::from_encoded(Data::new_copy(BACKGROUND_IMAGE))
        .expect("Failed to decode background image");

    // Scale and draw the background to fill the canvas
    let src_rect = Rect::from_wh(background.width() as f32, background.height() as f32);
    let dst_rect = Rect::from_wh(width as f32, height as f32);
    canvas.draw_image_rect(
        background,
        Some((&src_rect, sk::canvas::SrcRectConstraint::Fast)),
        dst_rect,
        &Paint::default(),
    );

    // Define the glass panel bounds
    let panel_bounds = Rect::from_xywh(100.0, 100.0, 200.0, 200.0);

    // Draw the glass panel with progressive backdrop blur
    // The progressive blur will blur the background image behind the panel
    // with varying intensity from top (sharp) to bottom (blurred)
    draw_glass_panel_with_progressive_backdrop_blur(
        canvas,
        panel_bounds,
        &BLUR_EFFECT,
        (width as f32, height as f32),
    );

    // Save the result to a file
    let image_snapshot = surface.image_snapshot();
    let data = image_snapshot
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("Failed to encode image");
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/progressive_blur_backdrop.png"
        ),
        data.as_bytes(),
    )
    .expect("Failed to write output file");

    println!("Progressive backdrop blur example saved to goldens/progressive_blur_backdrop.png");
}

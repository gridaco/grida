use cg::cg::types::FeProgressiveBlur;
use skia_safe::{
    self as sk, image_filters, surfaces, BlendMode, Color, Data, Paint, Point, Rect, Shader,
    TileMode,
};

static BLUR_EFFECT: FeProgressiveBlur = FeProgressiveBlur {
    x1: 0.0,
    y1: 0.0,
    x2: 0.0,
    y2: 400.0,
    radius: 0.0,
    radius2: 32.0,
};

fn apply_progressive_blur(canvas: &sk::Canvas, base: &sk::Image, pb: &FeProgressiveBlur) {
    // Step 1: Create two pre-blurred images with start and end radius
    let start_sigma = pb.radius;
    let end_sigma = pb.radius2;
    
    // Create blur filters for both start and end blur levels
    let start_blur_filter = if start_sigma > 0.0 {
        Some(image_filters::blur((start_sigma, start_sigma), None, None, None).unwrap())
    } else {
        None
    };
    
    let end_blur_filter = image_filters::blur((end_sigma, end_sigma), None, None, None).unwrap();
    
    // Step 2: Create alpha gradient mask for blending
    // The gradient controls the blend between start blur and end blur:
    // - At start position: transparent (start blur level shows)
    // - At end position: opaque (end blur level shows)
    let gradient_colors = [
        Color::from_argb(0, 0, 0, 0),     // Transparent at start (start blur)
        Color::from_argb(255, 0, 0, 0),  // Opaque at end (end blur)
    ];
    let gradient_positions = [0.0, 1.0];
    
    let mask_shader = Shader::linear_gradient(
        (Point::new(pb.x1, pb.y1), Point::new(pb.x2, pb.y2)),
        &gradient_colors[..],
        Some(&gradient_positions[..]),
        TileMode::Clamp,
        None,
        None,
    ).unwrap();
    
    // Step 3: Apply progressive blur using save_layer technique
    canvas.save_layer(&Default::default());
    
    // First, draw the start blur level (or original image if radius is 0)
    if let Some(start_filter) = start_blur_filter {
        let mut start_blur_paint = Paint::default();
        start_blur_paint.set_image_filter(start_filter);
        canvas.draw_image(base, (0, 0), Some(&start_blur_paint));
    } else {
        // If start radius is 0, draw the original image
        canvas.draw_image(base, (0, 0), None);
    }
    
    // Then, draw the end blur level on top with the gradient mask
    canvas.save_layer(&Default::default());
    
    let mut end_blur_paint = Paint::default();
    end_blur_paint.set_image_filter(end_blur_filter);
    canvas.draw_image(base, (0, 0), Some(&end_blur_paint));
    
    // Apply the gradient mask using DstIn blend mode
    // DstIn: keeps the destination (end blur) where the source (mask) is opaque
    let mut mask_paint = Paint::default();
    mask_paint.set_shader(mask_shader);
    mask_paint.set_blend_mode(BlendMode::DstIn);
    canvas.draw_paint(&mask_paint);
    
    canvas.restore(); // Restore end blur layer
    canvas.restore(); // Restore main layer
}

fn main() {
    let (width, height) = (400, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    {
        let canvas = surface.canvas();
        canvas.clear(Color::WHITE);

        // Draw background gradient for visual effect
        let bg_shader = Shader::linear_gradient(
            (Point::new(0.0, 0.0), Point::new(0.0, height as f32)),
            &[Color::RED, Color::BLUE][..],
            Some(&[0.0, 1.0][..]),
            TileMode::Clamp,
            None,
            None,
        ).unwrap();
        let mut bg_paint = Paint::default();
        bg_paint.set_shader(bg_shader);
        canvas.draw_rect(Rect::from_wh(width as f32, height as f32), &bg_paint);

        // Draw some foreground content
        let mut fg_paint = Paint::default();
        fg_paint.set_color(Color::from_argb(200, 255, 255, 255));
        canvas.draw_rect(Rect::from_xywh(50.0, 50.0, 300.0, 300.0), &fg_paint);
        
        // Add some text for better visual testing
        let mut text_paint = Paint::default();
        text_paint.set_color(Color::BLACK);
        text_paint.set_anti_alias(true);
        // Note: In a real implementation, you'd want to set up a typeface and text size
        // canvas.draw_str("Progressive Blur Test", Point::new(60.0, 100.0), &text_paint);
    }

    // Capture the base image
    let base_image = surface.image_snapshot();
    
    {
        let canvas = surface.canvas();
        // Apply the progressive blur effect
        apply_progressive_blur(canvas, &base_image, &BLUR_EFFECT);
    }

    // Save the result to a file
    let image_snapshot = surface.image_snapshot();
    let data = image_snapshot
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("Failed to encode image");
    std::fs::write("goldens/progressive_blur.png", data.as_bytes())
        .expect("Failed to write output file");
}

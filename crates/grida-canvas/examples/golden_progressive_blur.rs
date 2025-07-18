use cg::cg::types::FeProgressiveBlur;
use skia_safe::{
    self as sk, image_filters, surfaces, BlendMode, Color, Data, Paint, Point, Rect, Shader,
    TileMode,
};

static BLUR_EFFECT: FeProgressiveBlur = FeProgressiveBlur {
    x1: 0.0,
    y1: 0.0,
    x2: 400.0,
    y2: 400.0,
    radius: 0.0,
    radius2: 200.0,
};

fn apply_accurate_progressive_blur(canvas: &sk::Canvas, base: &sk::Image, pb: &FeProgressiveBlur) {
    // Use many fine segments for smooth, accurate progressive blur
    let segments = 64;
    let gradient_length = ((pb.x2 - pb.x1).powi(2) + (pb.y2 - pb.y1).powi(2)).sqrt();
    
    if gradient_length == 0.0 {
        // No gradient, just apply uniform blur
        let mut paint = Paint::default();
        paint.set_image_filter(
            image_filters::blur((pb.radius, pb.radius), None, None, None).unwrap()
        );
        canvas.draw_image(base, (0, 0), Some(&paint));
        return;
    }

    // Clear canvas
    canvas.clear(Color::TRANSPARENT);
    
    for i in 0..segments {
        let t_start = i as f32 / segments as f32;
        let t_end = (i + 1) as f32 / segments as f32;
        let t_mid = (t_start + t_end) * 0.5;
        
        // Calculate blur radius at the middle of this segment
        let blur_radius = pb.radius + (pb.radius2 - pb.radius) * t_mid;
        
        // Skip if blur radius is very small
        if blur_radius < 0.1 {
            continue;
        }
        
        // Calculate segment width for smooth blending
        let segment_width = 1.0 / segments as f32;
        let blend_overlap = segment_width * 0.5; // 50% overlap for smooth blending
        
        // Create mask positions with smooth falloff
        let mask_start = t_start - blend_overlap * 0.5;
        let mask_fade_in = t_start + blend_overlap * 0.5;
        let mask_fade_out = t_end - blend_overlap * 0.5;
        let mask_end = t_end + blend_overlap * 0.5;
        
        // Clamp positions to [0, 1]
        let positions = [
            mask_start.max(0.0),
            mask_fade_in.max(0.0),
            mask_fade_out.min(1.0),
            mask_end.min(1.0),
        ];
        
        // Create smooth alpha gradient for this segment
        let alpha_peak = if i == 0 || i == segments - 1 { 255 } else { 128 }; // Reduce overlap intensity
        let colors = [
            Color::from_argb(0, 255, 255, 255),
            Color::from_argb(alpha_peak, 255, 255, 255),
            Color::from_argb(alpha_peak, 255, 255, 255),
            Color::from_argb(0, 255, 255, 255),
        ];

        let shader = Shader::linear_gradient(
            (Point::new(pb.x1, pb.y1), Point::new(pb.x2, pb.y2)),
            &colors[..],
            Some(&positions[..]),
            TileMode::Clamp,
            None,
            None,
        ).unwrap();

        // Apply blur for this segment
        canvas.save_layer(&Default::default());
        
        let mut blur_paint = Paint::default();
        blur_paint.set_image_filter(
            image_filters::blur((blur_radius, blur_radius), None, None, None).unwrap()
        );
        canvas.draw_image(base, (0, 0), Some(&blur_paint));

        // Apply mask with smooth blending
        let mut mask_paint = Paint::default();
        mask_paint.set_shader(shader);
        mask_paint.set_blend_mode(BlendMode::DstIn);
        canvas.draw_paint(&mask_paint);
        
        canvas.restore();
    }
}

fn main() {
    let (width, height) = (400, 400);
    
    // Test 1: Horizontal progressive blur (left to right)
    {
        let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
        
        // Create test content
        {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);

            // Load the checker image
            let image_path = "../fixtures/images/checker.png";
            let image_data = std::fs::read(image_path).expect("Failed to read image file");
            let image = sk::Image::from_encoded(Data::new_copy(&image_data))
                .expect("Failed to decode image");
            
            // Scale and center the image
            let image_rect = Rect::from_xywh(50.0, 50.0, 300.0, 300.0);
            canvas.draw_image_rect(image, None, image_rect, &Paint::default());
            
            // Add some text for testing
            let mut text_paint = Paint::default();
            text_paint.set_color(Color::BLACK);
            text_paint.set_anti_alias(true);
            
            let font = sk::Font::default();
            canvas.draw_str("Horizontal Progressive Blur", Point::new(10.0, 30.0), &font, &text_paint);
            
            // Add some colored shapes
            let mut shape_paint = Paint::default();
            shape_paint.set_color(Color::from_rgb(255, 100, 100));
            canvas.draw_circle(Point::new(100.0, 350.0), 30.0, &shape_paint);
            
            shape_paint.set_color(Color::from_rgb(100, 255, 100));
            canvas.draw_rect(Rect::from_xywh(200.0, 320.0, 60.0, 60.0), &shape_paint);
            
            shape_paint.set_color(Color::from_rgb(100, 100, 255));
            canvas.draw_circle(Point::new(320.0, 350.0), 30.0, &shape_paint);
        }

        // Capture the base image
        let base_image = surface.image_snapshot();
        
        // Apply horizontal progressive blur (left to right)
        {
            let canvas = surface.canvas();
            let horizontal_blur = FeProgressiveBlur {
                x1: 0.0,
                y1: 0.0,
                x2: width as f32,
                y2: 0.0,
                radius: 0.0,
                radius2: 50.0,
            };
            apply_accurate_progressive_blur(canvas, &base_image, &horizontal_blur);
        }

        // Save the result
        let image_snapshot = surface.image_snapshot();
        let data = image_snapshot
            .encode(None, skia_safe::EncodedImageFormat::PNG, None)
            .expect("Failed to encode image");
        std::fs::write("goldens/progressive_blur_horizontal.png", data.as_bytes())
            .expect("Failed to write output file");
    }
    
    // Test 2: Vertical progressive blur (top to bottom)
    {
        let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
        
        // Create test content
        {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);

            // Load the checker image
            let image_path = "../fixtures/images/checker.png";
            let image_data = std::fs::read(image_path).expect("Failed to read image file");
            let image = sk::Image::from_encoded(Data::new_copy(&image_data))
                .expect("Failed to decode image");
            
            // Scale and center the image
            let image_rect = Rect::from_xywh(50.0, 50.0, 300.0, 300.0);
            canvas.draw_image_rect(image, None, image_rect, &Paint::default());
            
            // Add some text for testing
            let mut text_paint = Paint::default();
            text_paint.set_color(Color::BLACK);
            text_paint.set_anti_alias(true);
            
            let font = sk::Font::default();
            canvas.draw_str("Vertical Progressive Blur", Point::new(10.0, 30.0), &font, &text_paint);
            
            // Add some colored shapes
            let mut shape_paint = Paint::default();
            shape_paint.set_color(Color::from_rgb(255, 100, 100));
            canvas.draw_circle(Point::new(100.0, 350.0), 30.0, &shape_paint);
            
            shape_paint.set_color(Color::from_rgb(100, 255, 100));
            canvas.draw_rect(Rect::from_xywh(200.0, 320.0, 60.0, 60.0), &shape_paint);
            
            shape_paint.set_color(Color::from_rgb(100, 100, 255));
            canvas.draw_circle(Point::new(320.0, 350.0), 30.0, &shape_paint);
        }

        // Capture the base image
        let base_image = surface.image_snapshot();
        
        // Apply vertical progressive blur (top to bottom)
        {
            let canvas = surface.canvas();
            let vertical_blur = FeProgressiveBlur {
                x1: 0.0,
                y1: 0.0,
                x2: 0.0,
                y2: height as f32,
                radius: 0.0,
                radius2: 80.0,
            };
            apply_accurate_progressive_blur(canvas, &base_image, &vertical_blur);
        }

        // Save the result
        let image_snapshot = surface.image_snapshot();
        let data = image_snapshot
            .encode(None, skia_safe::EncodedImageFormat::PNG, None)
            .expect("Failed to encode image");
        std::fs::write("goldens/progressive_blur_vertical.png", data.as_bytes())
            .expect("Failed to write output file");
    }
    
    // Test 3: Diagonal progressive blur (corner to corner)
    {
        let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
        
        // Create test content
        {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);

            // Load the checker image
            let image_path = "../fixtures/images/checker.png";
            let image_data = std::fs::read(image_path).expect("Failed to read image file");
            let image = sk::Image::from_encoded(Data::new_copy(&image_data))
                .expect("Failed to decode image");
            
            // Scale and center the image
            let image_rect = Rect::from_xywh(50.0, 50.0, 300.0, 300.0);
            canvas.draw_image_rect(image, None, image_rect, &Paint::default());
            
            // Add some text for testing
            let mut text_paint = Paint::default();
            text_paint.set_color(Color::BLACK);
            text_paint.set_anti_alias(true);
            
            let font = sk::Font::default();
            canvas.draw_str("Diagonal Progressive Blur", Point::new(10.0, 30.0), &font, &text_paint);
            
            // Add some colored shapes
            let mut shape_paint = Paint::default();
            shape_paint.set_color(Color::from_rgb(255, 100, 100));
            canvas.draw_circle(Point::new(100.0, 350.0), 30.0, &shape_paint);
            
            shape_paint.set_color(Color::from_rgb(100, 255, 100));
            canvas.draw_rect(Rect::from_xywh(200.0, 320.0, 60.0, 60.0), &shape_paint);
            
            shape_paint.set_color(Color::from_rgb(100, 100, 255));
            canvas.draw_circle(Point::new(320.0, 350.0), 30.0, &shape_paint);
        }

        // Capture the base image
        let base_image = surface.image_snapshot();
        
        // Apply diagonal progressive blur (top-left to bottom-right)
        {
            let canvas = surface.canvas();
            apply_accurate_progressive_blur(canvas, &base_image, &BLUR_EFFECT);
        }

        // Save the result
        let image_snapshot = surface.image_snapshot();
        let data = image_snapshot
            .encode(None, skia_safe::EncodedImageFormat::PNG, None)
            .expect("Failed to encode image");
        std::fs::write("goldens/progressive_blur.png", data.as_bytes())
            .expect("Failed to write output file");
    }
    
    println!("Progressive blur tests completed!");
    println!("  - Horizontal: goldens/progressive_blur_horizontal.png");
    println!("  - Vertical: goldens/progressive_blur_vertical.png");  
    println!("  - Diagonal: goldens/progressive_blur.png");
}

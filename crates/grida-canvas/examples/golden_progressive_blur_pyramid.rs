//! Example: Passing Multiple Children to Runtime Shader
//!
//! This demonstrates how to pass multiple child shaders to a RuntimeEffect
//! using the RuntimeEffect::make_shader() API directly.
//!
//! ## Key Technique: Pre-Blurred Images as Shaders
//!
//! Since you cannot pass ImageFilters as children to runtime shaders, the solution is to:
//! 1. Apply the blur filter to the image using `image.with_filter()`
//! 2. Convert the blurred image result to a shader using `image.to_shader()`
//! 3. Pass these shaders as `ChildPtr::Shader()` children
//!
//! This example creates a progressive blur effect (pyramid blur) by:
//! - Pre-blurring an image at 8 different levels (0, 3, 8, 15, 25, 40, 60, 85px)
//! - Passing all 8 as shader children
//! - Blending between them in the shader based on Y coordinate
//!
//! This is the solution to the pyramid blur optimization problem!

use skia_safe::{
    self as sk, image_filters,
    runtime_effect::{ChildPtr, RuntimeEffect},
    surfaces, Color, Data, Image, Paint, Rect, Shader, TileMode,
};

fn main() {
    let (width, height) = (400, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();

    // Draw background
    canvas.clear(Color::BLACK);

    // Create a simple test image (blue rectangle)
    let mut test_surface = surfaces::raster_n32_premul((width, height)).expect("test surface");
    {
        let test_canvas = test_surface.canvas();
        test_canvas.clear(Color::TRANSPARENT);
        let mut paint = Paint::default();
        paint.set_color(Color::BLUE);
        test_canvas.draw_rect(Rect::from_xywh(125.0, 50.0, 150.0, 300.0), &paint);
    }
    let test_image = test_surface.image_snapshot();

    // Create 8 blur levels from the test image (pyramid approach)
    // Each level has progressively more blur applied with exponential distribution
    let blur_level_0 = create_blurred_shader(&test_image, 0.0); // Original, no blur
    let blur_level_1 = create_blurred_shader(&test_image, 3.0);
    let blur_level_2 = create_blurred_shader(&test_image, 8.0);
    let blur_level_3 = create_blurred_shader(&test_image, 15.0);
    let blur_level_4 = create_blurred_shader(&test_image, 25.0);
    let blur_level_5 = create_blurred_shader(&test_image, 40.0);
    let blur_level_6 = create_blurred_shader(&test_image, 60.0);
    let blur_level_7 = create_blurred_shader(&test_image, 85.0); // Maximum blur

    // Create a runtime shader that blends between 8 blur levels based on Y coordinate
    // This creates a progressive blur effect from top (no blur) to bottom (heavy blur)
    let shader_code = r#"
        uniform shader child0;  // 0px - No blur
        uniform shader child1;  // 3px
        uniform shader child2;  // 8px
        uniform shader child3;  // 15px
        uniform shader child4;  // 25px
        uniform shader child5;  // 40px
        uniform shader child6;  // 60px
        uniform shader child7;  // 85px - Maximum blur
        
        uniform float2 resolution;
        
        half4 main(float2 coord) {
            // Calculate blend factor based on vertical position (0 at top, 1 at bottom)
            float t = coord.y / resolution.y;
            
            // Sample all 8 blur levels
            half4 c0 = child0.eval(coord);
            half4 c1 = child1.eval(coord);
            half4 c2 = child2.eval(coord);
            half4 c3 = child3.eval(coord);
            half4 c4 = child4.eval(coord);
            half4 c5 = child5.eval(coord);
            half4 c6 = child6.eval(coord);
            half4 c7 = child7.eval(coord);
            
            // Blend between the 8 levels based on position
            // Each segment is 1/7th of the height (7 transitions between 8 levels)
            float segment = t * 7.0;
            
            if (segment < 1.0) {
                return mix(c0, c1, segment);
            } else if (segment < 2.0) {
                return mix(c1, c2, segment - 1.0);
            } else if (segment < 3.0) {
                return mix(c2, c3, segment - 2.0);
            } else if (segment < 4.0) {
                return mix(c3, c4, segment - 3.0);
            } else if (segment < 5.0) {
                return mix(c4, c5, segment - 4.0);
            } else if (segment < 6.0) {
                return mix(c5, c6, segment - 5.0);
            } else {
                return mix(c6, c7, segment - 6.0);
            }
        }
    "#;

    let runtime_effect =
        RuntimeEffect::make_for_shader(shader_code, None).expect("Failed to compile shader");

    // HERE'S THE KEY: Pass multiple pre-blurred images as shader children!
    // Each child is a post-blur-applied image converted to a shader
    let children = vec![
        ChildPtr::Shader(blur_level_0),
        ChildPtr::Shader(blur_level_1),
        ChildPtr::Shader(blur_level_2),
        ChildPtr::Shader(blur_level_3),
        ChildPtr::Shader(blur_level_4),
        ChildPtr::Shader(blur_level_5),
        ChildPtr::Shader(blur_level_6),
        ChildPtr::Shader(blur_level_7),
    ];

    // Prepare uniforms (resolution)
    let uniforms = {
        let floats: [f32; 2] = [width as f32, height as f32];
        let bytes = unsafe {
            std::slice::from_raw_parts(
                floats.as_ptr() as *const u8,
                floats.len() * std::mem::size_of::<f32>(),
            )
        };
        Data::new_copy(bytes)
    };

    // Create shader with multiple children
    // NOTE: We're using RuntimeEffect::make_shader() directly, not image_filters::runtime_shader()
    let shader = runtime_effect
        .make_shader(
            uniforms,  // Pass resolution uniform
            &children, // Pass all 4 pre-blurred shaders
            None,      // No local matrix
        )
        .expect("Failed to create shader");

    // Draw using the multi-child shader
    let mut paint = Paint::default();
    paint.set_shader(shader);
    canvas.draw_rect(
        Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
        &paint,
    );

    // Save result
    let image_snapshot = surface.image_snapshot();
    let data = image_snapshot
        .encode(None, sk::EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/progressive_blur_pyramid.png"
        ),
        data.as_bytes(),
    )
    .expect("write file");
}

/// Helper: Create a blurred shader from an image
///
/// This renders the image with blur applied, then converts the result to a shader.
/// This is the key technique for passing multiple blur levels to a runtime shader!
fn create_blurred_shader(image: &Image, blur_radius: f32) -> Shader {
    use skia_safe::SamplingOptions;

    if blur_radius < 0.5 {
        // No blur needed, just return the original image as shader
        return image
            .to_shader(
                Some((TileMode::Clamp, TileMode::Clamp)),
                SamplingOptions::default(),
                None,
            )
            .expect("shader");
    }

    // 1. Create a surface to render the blurred image
    let mut surface =
        surfaces::raster_n32_premul((image.width(), image.height())).expect("create blur surface");
    let canvas = surface.canvas();
    canvas.clear(Color::TRANSPARENT);

    // 2. Create a blur filter
    let blur_filter = image_filters::blur((blur_radius, blur_radius), TileMode::Clamp, None, None)
        .expect("blur filter");

    // 3. Draw the image with blur applied
    let mut paint = Paint::default();
    paint.set_image_filter(blur_filter);
    canvas.draw_image(image, (0, 0), Some(&paint));

    // 4. Get the blurred image from the surface
    let blurred_image = surface.image_snapshot();

    // 5. Convert the blurred image to a shader
    blurred_image
        .to_shader(
            Some((TileMode::Clamp, TileMode::Clamp)),
            SamplingOptions::default(),
            None,
        )
        .expect("shader")
}

use cg::cg::types::FeProgressiveBlur;
use skia_safe::{
    self as sk, canvas::SaveLayerRec, image_filters, runtime_effect::RuntimeShaderBuilder,
    surfaces, Color, Data, ImageFilter, Paint, Rect, RuntimeEffect,
};

// Include 8K background image
const BACKGROUND_IMAGE: &[u8] = include_bytes!("../../../fixtures/images/8k.jpg");

// Panel bounds: x=100, y=100, w=200, h=200
// Try global canvas coordinates - backdrop might not use local transform
static BLUR_EFFECT: FeProgressiveBlur = FeProgressiveBlur {
    x1: 200.0, // Center X in canvas coords
    y1: 100.0, // Top in canvas coords - sharp
    x2: 200.0, // Center X in canvas coords
    y2: 300.0, // Bottom in canvas coords - max blur
    radius: 0.0,
    radius2: 80.0, // Stronger blur for backdrop effect
};

/// Create RuntimeEffect for horizontal pass
fn progressive_blur_horizontal_effect() -> RuntimeEffect {
    const SHADER_CODE: &str = include_str!("../src/shaders/progressive_blur_horizontal.sksl");
    RuntimeEffect::make_for_shader(SHADER_CODE, None)
        .expect("Failed to compile horizontal blur shader")
}

/// Create RuntimeEffect for vertical pass
fn progressive_blur_vertical_effect() -> RuntimeEffect {
    const SHADER_CODE: &str = include_str!("../src/shaders/progressive_blur_vertical.sksl");
    RuntimeEffect::make_for_shader(SHADER_CODE, None)
        .expect("Failed to compile vertical blur shader")
}

/// Create ImageFilter for progressive blur effect using two-pass separable blur
/// This approach is ~30x faster than 2D blur while producing identical results
fn create_progressive_blur_filter(
    effect: &FeProgressiveBlur,
    _canvas_size: (f32, f32),
) -> ImageFilter {
    // Horizontal pass
    let h_effect = progressive_blur_horizontal_effect();
    let mut h_builder = RuntimeShaderBuilder::new(h_effect);
    h_builder
        .set_uniform_float("gradientStart", &[effect.x1, effect.y1])
        .expect("set gradientStart");
    h_builder
        .set_uniform_float("gradientEnd", &[effect.x2, effect.y2])
        .expect("set gradientEnd");
    h_builder
        .set_uniform_float("minRadius", &[effect.radius])
        .expect("set minRadius");
    h_builder
        .set_uniform_float("maxRadius", &[effect.radius2])
        .expect("set maxRadius");
    let h_filter = image_filters::runtime_shader(&h_builder, "image", None)
        .expect("Failed to create horizontal blur filter");

    // Vertical pass
    let v_effect = progressive_blur_vertical_effect();
    let mut v_builder = RuntimeShaderBuilder::new(v_effect);
    v_builder
        .set_uniform_float("gradientStart", &[effect.x1, effect.y1])
        .expect("set gradientStart");
    v_builder
        .set_uniform_float("gradientEnd", &[effect.x2, effect.y2])
        .expect("set gradientEnd");
    v_builder
        .set_uniform_float("minRadius", &[effect.radius])
        .expect("set minRadius");
    v_builder
        .set_uniform_float("maxRadius", &[effect.radius2])
        .expect("set maxRadius");
    let v_filter = image_filters::runtime_shader(&v_builder, "image", None)
        .expect("Failed to create vertical blur filter");

    // Compose: vertical(horizontal(image))
    // This chains the two passes together
    image_filters::compose(v_filter, h_filter).expect("Failed to compose blur filters")
}

/// Draw a glass panel with progressive backdrop blur
/// This demonstrates backdrop blur where the effect blurs the content behind the panel
/// Follows the same pattern as draw_glass_effect in painter.rs
fn draw_glass_panel_with_progressive_backdrop_blur(
    canvas: &sk::Canvas,
    rect: Rect,
    effect: &FeProgressiveBlur,
    canvas_size: (f32, f32),
) {
    let filter = create_progressive_blur_filter(effect, canvas_size);

    // Step 1: Translate to panel origin (like draw_glass_effect does)
    // This makes the backdrop use local coordinates
    canvas.save();
    canvas.translate((rect.x(), rect.y()));

    // Step 2: Clip to the panel region in local coords (0,0,width,height)
    let local_rect = Rect::from_wh(rect.width(), rect.height());
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

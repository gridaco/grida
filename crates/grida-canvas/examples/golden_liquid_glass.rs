/*! Shader2 - Ultimate Liquid Glass Effect with Real SKSL Shader
 *
 * Using the exact SKSL shader from React Native Skia examples
 * Features: Physics-based refraction, Fresnel, chromatic aberration, SDF morphing
 */

use skia_safe::{
    image_filters, surfaces, Data, EncodedImageFormat, Image, Paint, Rect, RuntimeEffect, Surface,
    TileMode,
};

const BACKGROUND_IMAGE: &[u8] = include_bytes!("../../../fixtures/images/4k.jpg");

// **Light**
// Adjust the angle and intensity of the light illuminating your glass frames to change where the highlight appears on the frame’s edge.
// **Refraction**
// Control the way light bends along the edge of your glass frame. The higher the refraction value, the more your glass frames will distort the elements around them.
// **Depth**
// Change how thick your glass material appears to provide a more pronounced 3D feel to the edge of the frame.
// **Dispersion**
// Increase dispersion to add a hint of chromatic aberration at the edge of your glass frames. This works best in combination with refraction.
// **Frost**
// Adjust the amount of background blur present on your glass frames to help glass elements stand out on busy backgrounds to provide better contrast.
#[derive(Debug, Clone)]
pub struct LiquidGlassEffect {
    /// The intensity of specular highlights. Must be between 0 and 1. Higher values create brighter highlights.
    pub light_intensity: f32,
    /// The angle of the specular light in degrees. Controls the direction of highlights on the glass surface.
    pub light_angle: f32,
    /// The intensity of the refraction distortion. Must be between 0 and 1. Higher values create more distortion.
    pub refraction: f32,
    /// The depth of the refraction effect. Must be >= 1. Higher values create deeper glass appearance.
    pub depth: f32,
    /// The amount of chromatic aberration (color separation). Must be between 0 and 1. Higher values create more rainbow-like distortion at edges.
    pub dispersion: f32,
    /// The radius of frost on the glass effect.
    pub radius: f32,
}

impl Default for LiquidGlassEffect {
    fn default() -> Self {
        Self {
            light_intensity: 0.9,
            light_angle: 45.0,
            refraction: 1.5,
            depth: 14.0,
            dispersion: 0.03,
            radius: 8.0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct LiquidGlassConfig {
    pub canvas_size: (i32, i32),
    pub shape_radius: f32,
    pub anti_aliasing_samples: u32,
}

impl Default for LiquidGlassConfig {
    fn default() -> Self {
        Self {
            canvas_size: (800, 800),
            shape_radius: 70.0,
            anti_aliasing_samples: 4,
        }
    }
}

#[derive(Debug, Clone)]
struct ShaderUniforms {
    bounds: (f32, f32, f32, f32), // x, y, w, h
    shape_radius: f32,
    transform: [[f32; 3]; 3],
    resolution: (f32, f32),
    glass_position: (f32, f32),
    effect: LiquidGlassEffect,
}

impl ShaderUniforms {
    fn new(
        bounds: (f32, f32, f32, f32),
        shape_radius: f32,
        resolution: (f32, f32),
        glass_position: (f32, f32),
        effect: LiquidGlassEffect,
    ) -> Self {
        Self {
            bounds,
            shape_radius,
            transform: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            resolution,
            glass_position,
            effect,
        }
    }

    fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();

        // box (vec4) - rectangle bounds
        bytes.extend_from_slice(&self.bounds.0.to_le_bytes()); // x
        bytes.extend_from_slice(&self.bounds.1.to_le_bytes()); // y
        bytes.extend_from_slice(&self.bounds.2.to_le_bytes()); // width
        bytes.extend_from_slice(&self.bounds.3.to_le_bytes()); // height

        // r (float) - radius
        bytes.extend_from_slice(&self.shape_radius.to_le_bytes());

        // transform (mat3) - identity matrix
        for row in &self.transform {
            for &val in row {
                bytes.extend_from_slice(&val.to_le_bytes());
            }
        }

        // resolution (vec2)
        bytes.extend_from_slice(&self.resolution.0.to_le_bytes());
        bytes.extend_from_slice(&self.resolution.1.to_le_bytes());

        // LiquidGlassEffect parameters
        bytes.extend_from_slice(&self.effect.light_intensity.to_le_bytes());
        bytes.extend_from_slice(&self.effect.light_angle.to_le_bytes());
        bytes.extend_from_slice(&self.effect.refraction.to_le_bytes());
        bytes.extend_from_slice(&self.effect.depth.to_le_bytes());
        bytes.extend_from_slice(&self.effect.dispersion.to_le_bytes());
        bytes.extend_from_slice(&self.effect.radius.to_le_bytes());

        // glass_position (vec2)
        bytes.extend_from_slice(&self.glass_position.0.to_le_bytes());
        bytes.extend_from_slice(&self.glass_position.1.to_le_bytes());

        bytes
    }
}

/// Create a blurred version of the background image for refraction effects
fn create_blurred_background(
    background: &Image,
    blur_radius: f32,
    canvas_size: (i32, i32),
) -> Image {
    let blur_filter = image_filters::blur((blur_radius, blur_radius), TileMode::Clamp, None, None)
        .expect("create blur filter");

    let mut blur_surface = surfaces::raster_n32_premul(canvas_size).expect("create blur surface");

    let mut blur_paint = Paint::default();
    blur_paint.set_image_filter(blur_filter);
    blur_surface.canvas().draw_image_rect(
        background,
        None,
        Rect::from_xywh(0.0, 0.0, canvas_size.0 as f32, canvas_size.1 as f32),
        &blur_paint,
    );

    blur_surface.image_snapshot()
}

/// Create child shaders from background images
fn create_child_shaders(
    background: &Image,
    blurred_background: &Image,
) -> Vec<skia_safe::runtime_effect::ChildPtr> {
    use skia_safe::{runtime_effect::ChildPtr, FilterMode, SamplingOptions};

    let image_shader = background
        .to_shader(None, SamplingOptions::from(FilterMode::Linear), None)
        .expect("create image shader");

    let blurred_shader = blurred_background
        .to_shader(None, SamplingOptions::from(FilterMode::Linear), None)
        .expect("create blurred shader");

    vec![
        ChildPtr::Shader(image_shader),
        ChildPtr::Shader(blurred_shader),
    ]
}

// Load the liquid glass shader from external file
const SHADER_CODE: &str = include_str!("../src/shaders/liquid_glass_effect.sksl");

fn main() {
    let config = LiquidGlassConfig::default();
    let effect = LiquidGlassEffect {
        light_angle: 45.0,
        ..Default::default()
    };

    // Create surface for final composition
    let mut surface = surfaces::raster_n32_premul(config.canvas_size).expect("surface");

    let canvas = surface.canvas();

    // Load and draw background image
    let background_image =
        Image::from_encoded(Data::new_copy(BACKGROUND_IMAGE)).expect("decode background image");
    canvas.draw_image_rect(
        &background_image,
        None,
        Rect::from_xywh(
            0.0,
            0.0,
            config.canvas_size.0 as f32,
            config.canvas_size.1 as f32,
        ),
        &Paint::default(),
    );

    // Draw custom shapes on top of the background
    let mut shapes_paint = Paint::default();
    shapes_paint.set_color(skia_safe::Color::from_rgb(100, 255, 150));

    // Draw a cross (+) pattern
    let bar_thickness = 40.0;
    let center_y = config.canvas_size.1 as f32 / 2.0;
    let center_x = config.canvas_size.0 as f32 / 2.0;

    // Horizontal bar
    canvas.draw_rect(
        Rect::from_xywh(
            0.0,
            center_y - bar_thickness / 2.0,
            config.canvas_size.0 as f32,
            bar_thickness,
        ),
        &shapes_paint,
    );

    // Vertical bar
    canvas.draw_rect(
        Rect::from_xywh(
            center_x - bar_thickness / 2.0,
            0.0,
            bar_thickness,
            config.canvas_size.1 as f32,
        ),
        &shapes_paint,
    );

    // Draw the ultimate Shader2 liquid glass effect
    let glass_width = 300.0;
    let glass_height = 140.0;
    let glass_x = (config.canvas_size.0 as f32 - glass_width) / 2.0;
    let glass_y = (config.canvas_size.1 as f32 - glass_height) / 2.0;

    draw_shader2_glass(
        &mut surface,
        glass_x,
        glass_y,
        glass_width,
        glass_height,
        &effect,
        &config,
    );

    // Save to PNG
    let image = surface.image_snapshot();
    let data = image
        .encode(None, EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/liquid_glass.png"),
        data.as_bytes(),
    )
    .expect("write png");
}

/// Draw Shader2 - Ultimate liquid glass with real SKSL shader
/// Takes surface snapshot as input - works with whatever is drawn
fn draw_shader2_glass(
    surface: &mut Surface,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    effect: &LiquidGlassEffect,
    config: &LiquidGlassConfig,
) {
    // Take snapshot of current surface state (raw)
    let background = surface.image_snapshot();

    // Create blurred version for refraction effect
    let blurred_background =
        create_blurred_background(&background, effect.radius, config.canvas_size);

    let canvas = surface.canvas();
    canvas.save();
    canvas.translate((x, y));

    // Create shader uniforms
    let uniforms = ShaderUniforms::new(
        (0.0, 0.0, width, height), // bounds (x, y, w, h)
        config.shape_radius,
        (config.canvas_size.0 as f32, config.canvas_size.1 as f32), // resolution
        (x, y),                                                     // glass_position
        effect.clone(),
    );

    // Create the SKSL runtime effect
    let runtime_effect =
        RuntimeEffect::make_for_shader(SHADER_CODE, None).expect("create SKSL runtime effect");

    let uniforms_data = Data::new_copy(&uniforms.to_bytes());

    // Create child shaders
    let child_ptrs = create_child_shaders(&background, &blurred_background);

    // Create shader with uniforms and child shaders
    let shader = runtime_effect
        .make_shader(uniforms_data, &child_ptrs, None)
        .expect("create shader");

    // Position and draw with expanded bounds to allow for distortion effects
    let expansion = 50.0;
    let expanded_bounds = Rect::from_xywh(
        -expansion,
        -expansion,
        width + 2.0 * expansion,
        height + 2.0 * expansion,
    );

    // Draw with expanded bounds to prevent clipping of distortion effects
    let mut paint = Paint::default();
    paint.set_shader(shader);
    canvas.draw_rect(expanded_bounds, &paint);

    canvas.restore();
    canvas.restore();
}

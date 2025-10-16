use crate::cg::types::FeLiquidGlass;
use skia_safe::{
    image_filters, runtime_effect::RuntimeShaderBuilder, ImageFilter, RuntimeEffect, TileMode,
};

// ============================================================================
// MATRIX UTILITIES
// ============================================================================

/// Build a 2D transformation matrix with rotation around center
///
/// The matrix includes:
/// - Translation to center
/// - Rotation
/// - Translation back
///
/// This allows rotating the glass shape geometry in shader space
fn build_transform_matrix(width: f32, height: f32, rotation_degrees: f32) -> [[f32; 3]; 3] {
    if rotation_degrees.abs() < f32::EPSILON {
        // Identity matrix - no rotation
        return [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
    }

    let angle_rad = rotation_degrees.to_radians();
    let cos_a = angle_rad.cos();
    let sin_a = angle_rad.sin();

    let cx = width / 2.0;
    let cy = height / 2.0;

    // The shader applies inverse(transform), so we need to provide the matrix
    // that when inverted gives us the desired rotation.
    //
    // For rotation around center (cx, cy):
    // We want: inverse(T(cx, cy) * R(angle) * T(-cx, -cy))
    // = T(cx, cy) * R(-angle) * T(-cx, -cy)
    //
    // So we build: T(cx, cy) * R(-angle) * T(-cx, -cy)
    let matrix = [
        [cos_a, sin_a, cx - cx * cos_a - cy * sin_a],
        [-sin_a, cos_a, cy + cx * sin_a - cy * cos_a],
        [0.0, 0.0, 1.0],
    ];

    matrix
}

// ============================================================================
// LIQUID GLASS - BACKDROP VERSION (SaveLayer approach)
// ============================================================================

/// Create RuntimeEffect for liquid glass backdrop shader
///
/// This version uses SaveLayer backdrop input instead of manually captured images.
/// The backdrop is automatically provided by Skia's SaveLayer mechanism.
fn liquid_glass_backdrop_runtime_effect() -> RuntimeEffect {
    const SHADER_CODE: &str = include_str!("../shaders/liquid_glass_backdrop.sksl");
    RuntimeEffect::make_for_shader(SHADER_CODE, None)
        .expect("Failed to compile liquid glass backdrop shader")
}

/// Create ImageFilter for liquid glass effect using SaveLayer backdrop
///
/// This creates an ImageFilter that can be used with SaveLayerRec's backdrop parameter.
/// Skia will automatically capture the background and pass it as the 'input' shader.
///
/// # Arguments
/// * `width`, `height` - Size of the glass rectangle
/// * `corner_radii` - Corner radii [top-left, top-right, bottom-right, bottom-left]
/// * `rotation` - Rotation angle in degrees
/// * `canvas_size` - Size of the canvas for coordinate calculations
/// * `effect` - Glass effect parameters
///
/// # Returns
/// An ImageFilter that applies the liquid glass effect to the backdrop
pub fn create_liquid_glass_image_filter(
    width: f32,
    height: f32,
    corner_radii: [f32; 4],
    rotation: f32,
    canvas_size: (f32, f32),
    effect: &FeLiquidGlass,
) -> ImageFilter {
    let runtime_effect = liquid_glass_backdrop_runtime_effect();
    let transform = build_transform_matrix(width, height, rotation);

    // Create shader builder and set all uniforms individually
    let mut builder = RuntimeShaderBuilder::new(runtime_effect);

    // Set uniforms one by one
    // Note: RuntimeShaderBuilder requires setting uniforms by name
    builder
        .set_uniform_float("box", &[0.0, 0.0, width, height])
        .expect("set box");
    builder
        .set_uniform_float("corner_radii", &corner_radii)
        .expect("set corner_radii");

    // Set transform (mat3 = 9 floats, flatten the array)
    let transform_flat: Vec<f32> = transform.iter().flatten().copied().collect();
    builder
        .set_uniform_float("transform", &transform_flat)
        .expect("set transform");

    builder
        .set_uniform_float("resolution", &[canvas_size.0, canvas_size.1])
        .expect("set resolution");
    builder
        .set_uniform_float("light_intensity", &[effect.light_intensity])
        .expect("set light_intensity");
    builder
        .set_uniform_float("light_angle", &[effect.light_angle])
        .expect("set light_angle");
    builder
        .set_uniform_float("refraction", &[effect.refraction])
        .expect("set refraction");
    builder
        .set_uniform_float("depth", &[effect.depth])
        .expect("set depth");
    builder
        .set_uniform_float("dispersion", &[effect.dispersion])
        .expect("set dispersion");

    // Create blur filter first (if blur_radius > 0) for optimal performance
    // Skia's native blur is ~100x faster than inline shader blur
    let blur_filter = if effect.blur_radius > 0.5 {
        image_filters::blur(
            (effect.blur_radius, effect.blur_radius),
            TileMode::Clamp,
            None,
            None,
        )
    } else {
        None
    };

    // Chain runtime shader with blur as input
    // Skia will wire the blurred backdrop to the 'backdrop' shader child
    image_filters::runtime_shader(&builder, "backdrop", blur_filter)
        .expect("Failed to create liquid glass image filter")
}

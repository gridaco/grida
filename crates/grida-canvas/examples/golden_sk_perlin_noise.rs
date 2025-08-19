use skia_safe::{surfaces, Color, Paint, Rect, Shader};

/// Demonstrates the use of SkPerlinNoiseShader with different parameters
///
/// This example shows:
/// - Fractal Perlin noise with different base frequencies and octaves
/// - Turbulence Perlin noise with various settings
/// - Different tile sizes for seamless tiling
fn main() {
    let (width, height) = (800, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Example 1: Fractal Perlin Noise - Basic
    draw_fractal_perlin_noise(canvas, 0.0, 0.0, 200.0, 200.0);

    // Example 2: Fractal Perlin Noise - High Frequency
    draw_high_freq_fractal_noise(canvas, 200.0, 0.0, 200.0, 200.0);

    // Example 3: Fractal Perlin Noise - Many Octaves
    draw_many_octaves_fractal_noise(canvas, 400.0, 0.0, 200.0, 200.0);

    // Example 4: Turbulence Perlin Noise
    draw_turbulence_perlin_noise(canvas, 600.0, 0.0, 200.0, 200.0);

    // Example 5: Tiled Fractal Noise
    draw_tiled_fractal_noise(canvas, 0.0, 200.0, 200.0, 200.0);

    // Example 6: High Frequency Turbulence
    draw_high_freq_turbulence(canvas, 200.0, 200.0, 200.0, 200.0);

    // Example 7: Seamless Tiling
    draw_seamless_tiling(canvas, 400.0, 200.0, 200.0, 200.0);

    // Example 8: Low Frequency Turbulence
    draw_low_freq_turbulence(canvas, 600.0, 200.0, 200.0, 200.0);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write("goldens/sk_perlin_noise.png", data.as_bytes()).unwrap();
}

fn draw_fractal_perlin_noise(canvas: &skia_safe::Canvas, x: f32, y: f32, width: f32, height: f32) {
    // Create fractal Perlin noise shader
    // Parameters: base_frequency, num_octaves, seed, tile_size
    if let Some(shader) = Shader::fractal_perlin_noise(
        (0.1, 0.1), // base_frequency - low frequency for smooth noise
        4,          // num_octaves - number of noise layers
        0.0,        // seed - random seed
        None,       // tile_size - no tiling
    ) {
        let mut paint = Paint::default();
        paint.set_shader(shader);

        let rect = Rect::from_xywh(x, y, width, height);
        canvas.draw_rect(rect, &paint);
    }
}

fn draw_high_freq_fractal_noise(
    canvas: &skia_safe::Canvas,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
) {
    // Create high frequency fractal Perlin noise
    if let Some(shader) = Shader::fractal_perlin_noise(
        (0.5, 0.5), // base_frequency - high frequency
        3,          // num_octaves
        42.0,       // seed - different seed
        None,       // tile_size - no tiling
    ) {
        let mut paint = Paint::default();
        paint.set_shader(shader);

        let rect = Rect::from_xywh(x, y, width, height);
        canvas.draw_rect(rect, &paint);
    }
}

fn draw_many_octaves_fractal_noise(
    canvas: &skia_safe::Canvas,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
) {
    // Create fractal noise with many octaves for detailed texture
    if let Some(shader) = Shader::fractal_perlin_noise(
        (0.05, 0.05), // base_frequency - very low frequency
        8,            // num_octaves - many layers for detail
        123.0,        // seed - different seed
        None,         // tile_size - no tiling
    ) {
        let mut paint = Paint::default();
        paint.set_shader(shader);

        let rect = Rect::from_xywh(x, y, width, height);
        canvas.draw_rect(rect, &paint);
    }
}

fn draw_turbulence_perlin_noise(
    canvas: &skia_safe::Canvas,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
) {
    // Create turbulence Perlin noise shader
    if let Some(shader) = Shader::turbulence_perlin_noise(
        (0.1, 0.1), // base_frequency
        4,          // num_octaves
        456.0,      // seed
        None,       // tile_size - no tiling
    ) {
        let mut paint = Paint::default();
        paint.set_shader(shader);

        let rect = Rect::from_xywh(x, y, width, height);
        canvas.draw_rect(rect, &paint);
    }
}

fn draw_tiled_fractal_noise(canvas: &skia_safe::Canvas, x: f32, y: f32, width: f32, height: f32) {
    // Create tiled fractal noise
    if let Some(shader) = Shader::fractal_perlin_noise(
        (0.2, 0.2),                                               // base_frequency
        3,                                                        // num_octaves
        7.0,                                                      // seed
        Some(skia_safe::ISize::new(width as i32, height as i32)), // tile_size
    ) {
        let mut paint = Paint::default();
        paint.set_shader(shader);

        let rect = Rect::from_xywh(x, y, width, height);
        canvas.draw_rect(rect, &paint);
    }
}

fn draw_high_freq_turbulence(canvas: &skia_safe::Canvas, x: f32, y: f32, width: f32, height: f32) {
    // Create high frequency turbulence
    if let Some(shader) = Shader::turbulence_perlin_noise(
        (0.5, 0.5), // base_frequency - high frequency
        6,          // num_octaves
        789.0,      // seed
        None,       // tile_size - no tiling
    ) {
        let mut paint = Paint::default();
        paint.set_shader(shader);

        let rect = Rect::from_xywh(x, y, width, height);
        canvas.draw_rect(rect, &paint);
    }
}

fn draw_seamless_tiling(canvas: &skia_safe::Canvas, x: f32, y: f32, width: f32, height: f32) {
    // Create seamless tiling noise
    if let Some(shader) = Shader::fractal_perlin_noise(
        (0.3, 0.3),                                               // base_frequency
        4,                                                        // num_octaves
        999.0,                                                    // seed
        Some(skia_safe::ISize::new(width as i32, height as i32)), // exact tile size
    ) {
        let mut paint = Paint::default();
        paint.set_shader(shader);

        let rect = Rect::from_xywh(x, y, width, height);
        canvas.draw_rect(rect, &paint);
    }
}

fn draw_low_freq_turbulence(canvas: &skia_safe::Canvas, x: f32, y: f32, width: f32, height: f32) {
    // Create low frequency turbulence
    if let Some(shader) = Shader::turbulence_perlin_noise(
        (0.05, 0.05), // base_frequency - very low frequency
        5,            // num_octaves
        111.0,        // seed
        None,         // tile_size - no tiling
    ) {
        let mut paint = Paint::default();
        paint.set_shader(shader);

        let rect = Rect::from_xywh(x, y, width, height);
        canvas.draw_rect(rect, &paint);
    }
}

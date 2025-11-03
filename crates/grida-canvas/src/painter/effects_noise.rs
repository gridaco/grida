use super::geometry::PainterShape;
use crate::cg::prelude::*;
use skia_safe::{self as sk, shaders, ColorMatrix, ISize, Paint, Shader};

/// Renders a noise effect to the canvas clipped to the specified shape.
///
/// # Pipeline
///
/// 1. Generate fractal Perlin noise at computed frequency
/// 2. Convert to alpha mask via luminance-to-alpha
/// 3. Apply density-based LUT cutoff
/// 4. Apply type-specific coloring and render to shape path
///
/// # Requirements
///
/// Noise effects render on both shape and vector nodes when fills are visible.
/// This function should be called after fills but before strokes.
pub fn render_noise_effect(effect: &NoiseEffect, canvas: &sk::Canvas, shape: &PainterShape) {
    // Map UX "noise_size" to SVG-ish baseFrequency.
    let size = effect.noise_size.max(0.001);
    let base_fx = (1.0 / (size * 8.0)).clamp(0.005, 2.0);
    let base_fy = base_fx;

    // Stitch like SVG `stitchTiles="stitch"`
    let tile_sz = ISize::new(shape.rect.width() as i32, shape.rect.height() as i32);

    // Create fractal noise shader
    let noise = Shader::fractal_perlin_noise(
        (base_fx, base_fy),
        effect.num_octaves.max(1) as usize,
        effect.seed,
        Some(tile_sz),
    )
    .expect("fractal_perlin_noise failed");

    // === Universal pattern generation ===
    // Convert noise to alpha mask with density-based LUT cutoff
    let noise_alpha = noise.with_color_filter(luminance_to_alpha_cf());
    // Density controls threshold: higher density = lower threshold = more noise visible
    let threshold = ((1.0 - effect.density.clamp(0.0, 1.0)) * 255.0).round() as usize;
    let a_lut = lut_threshold(threshold);
    let ident: [u8; 256] = identity_lut();
    let alpha_cf =
        sk::color_filters::table_argb(&a_lut, &ident, &ident, &ident).expect("table_argb failed");
    let mask = noise_alpha.with_color_filter(alpha_cf);

    // === Type-specific coloring & rendering ===
    let mut p = Paint::default();
    let path = shape.to_path();

    match &effect.coloring {
        NoiseEffectColors::Mono { color } => {
            // Apply solid color to noise texture: use noise_alpha for pattern shape, but color at full intensity
            let colored_noise = apply_solid_color_to_texture(&noise_alpha, *color);
            let shader = shaders::blend(sk::BlendMode::DstIn, colored_noise, mask);
            p.set_shader(shader);
            p.set_blend_mode(sk::BlendMode::SrcOver);
            p.set_anti_alias(true);
            canvas.draw_path(&path, &p);
        }
        NoiseEffectColors::Duo {
            color1: pattern,
            color2: background,
        } => {
            // Draw color2 base layer
            let bg_color: sk::Color = (*background).into();
            p.set_color(bg_color);
            canvas.draw_path(&path, &p);

            // Apply solid color to noise texture: use noise_alpha for pattern shape, but color at full intensity
            let colored_noise = apply_solid_color_to_texture(&noise_alpha, *pattern);
            let shader = shaders::blend(sk::BlendMode::DstIn, colored_noise, mask);
            p.set_shader(shader);
            canvas.draw_path(&path, &p);
        }
        NoiseEffectColors::Multi { opacity } => {
            let shader = shaders::blend(sk::BlendMode::DstIn, noise, mask);
            p.set_shader(shader);
            let alpha = (opacity.clamp(0.0, 1.0) * 255.0) as u8;
            p.set_alpha(alpha);
            canvas.draw_path(&path, &p);
        }
    }
}

/// Helper: Apply solid color to a texture mask
/// Uses the texture's alpha for pattern shape, but applies color at full intensity
fn apply_solid_color_to_texture(texture: &Shader, color: CGColor) -> Shader {
    // Create a solid color shader
    let color_sk: sk::Color = color.into();
    let color_shader = shaders::color(color_sk);

    // Use DstIn blend: keep color where texture has alpha, transparent elsewhere
    // This gives us solid color with the texture's pattern shape
    shaders::blend(sk::BlendMode::DstIn, color_shader, (*texture).clone())
}

/// Create a color filter that converts luminance to alpha
///
/// Maps RGB luminance to alpha channel while zeroing out RGB.
/// Equivalent to SVG `<feColorMatrix type="luminanceToAlpha">`
fn luminance_to_alpha_cf() -> sk::ColorFilter {
    // 4x5 color matrix, row-major (R', G', B', A').
    // R',G',B' = 0; A' = dot(rgb, luma)
    #[rustfmt::skip]
    let m = ColorMatrix::new(
        0.0, 0.0, 0.0, 0.0, 0.0,           // R' = 0
        0.0, 0.0, 0.0, 0.0, 0.0,           // G' = 0
        0.0, 0.0, 0.0, 0.0, 0.0,           // B' = 0
        0.2126, 0.7152, 0.0722, 0.0, 0.0, // A' = luminance
    );
    sk::color_filters::matrix(&m, None)
}

/// Generate an identity LUT (pass-through)
fn identity_lut() -> [u8; 256] {
    let mut t = [0u8; 256];
    for i in 0..256 {
        t[i] = i as u8;
    }
    t
}

/// Generate a LUT that outputs 255 for values >= threshold, 0 otherwise
///
/// Used to control noise density by thresholding the alpha mask.
/// Lower threshold = more noise visible (higher density)
/// Higher threshold = less noise visible (lower density)
fn lut_threshold(threshold: usize) -> [u8; 256] {
    let mut t = [0u8; 256];
    for i in 0..256 {
        t[i] = if i >= threshold { 255 } else { 0 };
    }
    t
}

use super::geometry::PainterShape;
use crate::cg::prelude::*;
use skia_safe::{self as sk, shaders, ColorMatrix, ISize, Paint, Shader};

/// Renders a noise effect to the canvas clipped to the specified shape.
///
/// # Pipeline
///
/// ## Mono & Duo
/// 1. Generate fractal Perlin noise (`feTurbulence`)
/// 2. Convert RGB to alpha via luminance (`feColorMatrix type="luminanceToAlpha"`)
/// 3. Apply density threshold to alpha (`feComponentTransfer`)
/// 4. Clip to shape and apply solid color (`feComposite`, `feFlood`)
/// 5. Merge with fill using blend mode (`feMerge`)
///
/// ## Multi (Different approach)
/// 1. Generate fractal Perlin noise (`feTurbulence`)
/// 2. Apply RGB contrast enhancement: `output = 2*input - 0.5` (`feComponentTransfer`)
/// 3. Apply density threshold to alpha only (`feComponentTransfer`)
/// 4. Merge with fill using blend mode (`feMerge`)
///
/// # SVG Filter Compatibility
///
/// Implements noise effects following SVG filter semantics.
/// Multi noise uses contrast-enhanced RGB (not luminance-to-alpha).
///
/// # Requirements
///
/// Noise effects render on both shape and vector nodes when fills are visible.
/// This function should be called after fills but before strokes.
pub fn render_noise_effect(effect: &FeNoiseEffect, canvas: &sk::Canvas, shape: &PainterShape) {
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

    // === Type-specific coloring & rendering ===
    // Apply blend mode directly to paint, matching SVG feMerge behavior
    let blend_mode: sk::BlendMode = effect.blend_mode.into();
    let mut p = Paint::default();
    let path = shape.to_path();

    match &effect.coloring {
        NoiseEffectColors::Mono { color } => {
            // SVG filter pipeline for Mono:
            // 1. feColorMatrix type="luminanceToAlpha" - convert noise RGB to alpha
            // 2. feComponentTransfer - apply density threshold to alpha
            // 3. feFlood - create solid color
            // 4. feComposite operator="in" - mask solid color with thresholded alpha

            let noise_alpha = noise.with_color_filter(luminance_to_alpha_cf());

            // Density controls threshold: higher density = lower threshold = more noise visible
            let threshold = ((1.0 - effect.density.clamp(0.0, 1.0)) * 255.0).round() as usize;
            let a_lut = lut_threshold(threshold);
            let ident: [u8; 256] = identity_lut();
            let alpha_cf = sk::color_filters::table_argb(&a_lut, &ident, &ident, &ident)
                .expect("table_argb failed");
            let thresholded_alpha = noise_alpha.with_color_filter(alpha_cf);

            // Create solid color shader and mask it with thresholded alpha
            let color_sk: sk::Color = (*color).into();
            let solid_color = shaders::color(color_sk);
            let shader = shaders::blend(sk::BlendMode::DstIn, solid_color, thresholded_alpha);

            p.set_shader(shader);
            p.set_blend_mode(blend_mode);
            p.set_anti_alias(true);
            canvas.draw_path(&path, &p);
        }
        NoiseEffectColors::Duo { color1, color2 } => {
            // SVG filter pipeline for Duo (USES TWO DISTINCT NON-OVERLAPPING PATTERNS):
            // 1. feColorMatrix type="luminanceToAlpha" - convert noise RGB to alpha
            // 2. feComponentTransfer - split into two SEPARATED patterns:
            //    - coloredNoise1: lower alpha range (density-based)
            //    - coloredNoise2: upper alpha range (density-based)
            //    - Background shows through where neither pattern is active
            // 3. feFlood - create solid colors
            // 4. feComposite operator="in" - mask each solid color with its pattern range
            //
            // Universal formula: Patterns are centered around midpoint (127.5)
            // Each pattern width = density × 127.5
            // At low density: patterns separated with gaps (background shows)
            // At high density: patterns nearly meet (minimal background)

            let noise_alpha = noise.with_color_filter(luminance_to_alpha_cf());
            let ident: [u8; 256] = identity_lut();

            // Pattern 1: Lower alpha range [(1-d)/2 × 255, 127]
            let a_lut1 = lut_duo_pattern1(effect.density);
            let alpha_cf1 = sk::color_filters::table_argb(&a_lut1, &ident, &ident, &ident)
                .expect("table_argb failed");
            let thresholded_alpha1 = noise_alpha.with_color_filter(alpha_cf1);

            // Pattern 2: Upper alpha range [128, 127.5 + d/2 × 255]
            let a_lut2 = lut_duo_pattern2(effect.density);
            let alpha_cf2 = sk::color_filters::table_argb(&a_lut2, &ident, &ident, &ident)
                .expect("table_argb failed");
            let thresholded_alpha2 = noise_alpha.with_color_filter(alpha_cf2);

            // Draw color1 pattern (lower alpha range)
            let color1_sk: sk::Color = (*color1).into();
            let solid_color1 = shaders::color(color1_sk);
            let shader1 = shaders::blend(sk::BlendMode::DstIn, solid_color1, thresholded_alpha1);
            p.set_shader(shader1);
            p.set_blend_mode(blend_mode);
            p.set_anti_alias(true);
            canvas.draw_path(&path, &p);

            // Draw color2 pattern (upper alpha range) on top
            let color2_sk: sk::Color = (*color2).into();
            let solid_color2 = shaders::color(color2_sk);
            let shader2 = shaders::blend(sk::BlendMode::DstIn, solid_color2, thresholded_alpha2);
            p.set_shader(shader2);
            p.set_blend_mode(blend_mode);
            p.set_anti_alias(true);
            canvas.draw_path(&path, &p);
        }
        NoiseEffectColors::Multi { opacity } => {
            // SVG filter pipeline for Multi:
            // feComponentTransfer applies SIMULTANEOUSLY to all channels:
            // - RGB: contrast boost (slope=2, intercept=-0.5) using linear transfer
            // - A: density threshold using discrete tableValues
            //
            // Implementation: Apply contrast enhancement first, then threshold alpha

            // Apply contrast enhancement to RGB channels (keeps alpha)
            let enhanced_noise = noise.with_color_filter(multi_contrast_cf());

            // Apply density threshold to alpha channel only (keeps enhanced RGB)
            let threshold = ((1.0 - effect.density.clamp(0.0, 1.0)) * 255.0).round() as usize;
            let a_lut = lut_threshold(threshold);
            let ident: [u8; 256] = identity_lut();
            // table_argb(a, r, g, b) - threshold alpha, pass through RGB
            let alpha_cf = sk::color_filters::table_argb(&a_lut, &ident, &ident, &ident)
                .expect("table_argb failed");
            let final_noise = enhanced_noise.with_color_filter(alpha_cf);

            p.set_shader(final_noise);
            let alpha = (opacity.clamp(0.0, 1.0) * 255.0) as u8;
            p.set_alpha(alpha);
            p.set_blend_mode(blend_mode);
            p.set_anti_alias(true);
            canvas.draw_path(&path, &p);
        }
    }
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

/// Create a color filter that applies contrast enhancement for Multi noise
///
/// Equivalent to SVG `<feComponentTransfer>` with linear functions:
/// - `<feFuncR type="linear" slope="2" intercept="-0.5" />`
/// - `<feFuncG type="linear" slope="2" intercept="-0.5" />`
/// - `<feFuncB type="linear" slope="2" intercept="-0.5" />`
///
/// Formula: output = 2 * input - 0.5 (in normalized 0-1 range)
/// This increases contrast and makes colors more vibrant.
fn multi_contrast_cf() -> sk::ColorFilter {
    // 4x5 color matrix, row-major (R', G', B', A').
    // ColorMatrix values are normalized (0-1 range), not 0-255!
    // Apply contrast boost to RGB, keep alpha unchanged
    // Formula: output = slope * input + intercept
    #[rustfmt::skip]
    let m = ColorMatrix::new(
        2.0, 0.0, 0.0, 0.0, -0.5,  // R' = 2*R - 0.5
        0.0, 2.0, 0.0, 0.0, -0.5,  // G' = 2*G - 0.5
        0.0, 0.0, 2.0, 0.0, -0.5,  // B' = 2*B - 0.5
        0.0, 0.0, 0.0, 1.0, 0.0,   // A' = A (unchanged)
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

/// Generate LUT for Duo pattern 1 (lower alpha range)
///
/// Universal density-based formula that creates distinct non-overlapping patterns.
/// Pattern 1 occupies the lower portion of the alpha range, centered around midpoint.
///
/// Formula: Pattern covers [(1-density)/2 × 255, 127]
///
/// At density=0.4: indices 5-127 (pattern visible, rest is background)
/// At density=0.8: indices 25-127 (denser pattern)
/// At density=1.0: indices 0-127 (full coverage)
fn lut_duo_pattern1(density: f32) -> [u8; 256] {
    let d = density.clamp(0.0, 1.0);
    let start = ((1.0 - d) / 2.0 * 255.0).round() as usize;
    let end = 127; // midpoint

    let mut lut = [0u8; 256];
    for i in start..=end {
        lut[i] = 255;
    }
    lut
}

/// Generate LUT for Duo pattern 2 (upper alpha range)
///
/// Universal density-based formula that creates distinct non-overlapping patterns.
/// Pattern 2 occupies the upper portion of the alpha range, centered around midpoint.
///
/// Formula: Pattern covers [128, 127.5 + density/2 × 255]
///
/// At density=0.4: indices 128-178 (pattern visible, rest is background)
/// At density=0.8: indices 128-229 (denser pattern)
/// At density=1.0: indices 128-255 (full coverage)
fn lut_duo_pattern2(density: f32) -> [u8; 256] {
    let d = density.clamp(0.0, 1.0);
    let start = 128; // midpoint + 1
    let end = (127.5 + d / 2.0 * 255.0).round() as usize;

    let mut lut = [0u8; 256];
    for i in start..=end.min(255) {
        lut[i] = 255;
    }
    lut
}

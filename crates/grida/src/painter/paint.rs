use super::{gradient, image};
use crate::runtime::render_policy::RenderIntent;
use crate::{cg::prelude::*, runtime::image_repository::ImageRepository};
use skia_safe::{self, shaders, Color, Shader};

pub fn sk_solid_paint(paint: impl Into<SolidPaint>, aa: bool) -> skia_safe::Paint {
    let p: SolidPaint = paint.into();
    let mut skia_paint = skia_safe::Paint::default();
    skia_paint.set_anti_alias(aa);
    let CGColor { r, g, b, a } = p.color;
    // A solid paint's effective alpha is its color alpha. Do NOT multiply by
    // `opacity()` — for SolidPaint that method derives opacity from the color
    // alpha (`color.a / 255`), so `a * opacity()` squares the alpha.
    skia_paint.set_color(skia_safe::Color::from_argb(a, r, g, b));
    skia_paint
}

/// Combines multiple paints into a single Skia paint using shader blending.
///
/// This function efficiently stacks multiple paints by blending their shaders together,
/// resulting in a single draw call instead of multiple separate draws.
///
/// # Arguments
/// * `paints` - Array of paints to blend together
/// * `size` - Container size for paint calculations
/// * `images` - Image repository for image paint resolution
///
/// # Returns
/// Combined Skia paint with blended shaders, or `None` if no valid paints
pub fn sk_paint_stack(
    paints: &[Paint],
    size: (f32, f32),
    images: &ImageRepository,
    aa: bool,
    intent: RenderIntent,
) -> Option<skia_safe::Paint> {
    // Fast path: single solid fill — set color directly on the paint,
    // avoiding shader object allocation and giving Skia's GPU backend
    // a simpler code path (no shader program dispatch).
    if paints.len() == 1 {
        if let Paint::Solid(solid) = &paints[0] {
            let CGColor { r, g, b, a } = solid.color;
            // Color alpha is the solid paint's opacity; see `sk_solid_paint`.
            let mut paint = skia_safe::Paint::default();
            paint.set_anti_alias(aa);
            paint.set_color(Color::from_argb(a, r, g, b));
            paint.set_blend_mode(solid.blend_mode.into());
            return Some(paint);
        }
    }

    // Paint stacking semantics:
    // - `paints` is ordered bottom → top (the last entry is visually top-most).
    // - Skia's `shaders::blend(mode, dst, src)` interprets the first shader as the
    //   destination/background, and the second as the source/foreground.
    // - Therefore we must blend with (dst = accumulated background, src = current paint),
    //   so each subsequent paint is composited on top of the previous result.
    let mut iter = paints.iter();
    let first = iter.next()?;
    // Track the base (bottom-most) paint's blend mode so it can apply
    // against the canvas backdrop when the composed paint is drawn.
    let base_blend_mode = first.blend_mode();
    let mut shader = shader_from_paint(first, size, Some(images), intent)?;
    for p in iter {
        if let Some(s) = shader_from_paint(p, size, Some(images), intent) {
            // Compose current paint (src) over the accumulated shader (dst)
            shader = shaders::blend(p.blend_mode(), shader, s);
        }
    }
    let mut paint = skia_safe::Paint::default();
    paint.set_anti_alias(aa);
    paint.set_shader(shader);
    // Apply the base paint's blend mode at the paint level so the first
    // fill can blend with the canvas/background, matching editor semantics.
    paint.set_blend_mode(base_blend_mode.into());
    // Don't set blend mode - defaults to SrcOver, and blending is already handled in shader composition
    Some(paint)
}

/// Combines multiple paints into a single Skia paint without image support.
///
/// Similar to `sk_paint_stack` but optimized for cases where image paints are not needed,
/// avoiding the overhead of image repository handling.
///
/// # Arguments
/// * `paints` - Array of paints to blend together (image paints will be ignored)
/// * `size` - Container size for paint calculations
///
/// # Returns
/// Combined Skia paint with blended shaders, or `None` if no valid paints
pub fn sk_paint_stack_without_images(
    paints: &[Paint],
    size: (f32, f32),
    aa: bool,
) -> Option<skia_safe::Paint> {
    // Fast path: single solid fill — direct color, no shader allocation.
    if paints.len() == 1 {
        if let Paint::Solid(solid) = &paints[0] {
            let CGColor { r, g, b, a } = solid.color;
            // Color alpha is the solid paint's opacity; see `sk_solid_paint`.
            let mut paint = skia_safe::Paint::default();
            paint.set_anti_alias(aa);
            paint.set_color(Color::from_argb(a, r, g, b));
            paint.set_blend_mode(solid.blend_mode.into());
            return Some(paint);
        }
    }

    // Same ordering rules as `sk_paint_stack` (bottom → top).
    let mut iter = paints.iter();
    let first = iter.next()?;
    let base_blend_mode = first.blend_mode();
    // No image repository → image paints resolve to `None`, so the intent never
    // reaches `image_shader`; any value is fine.
    let intent = RenderIntent::Design;
    let mut shader = shader_from_paint(first, size, None, intent)?;
    for p in iter {
        if let Some(s) = shader_from_paint(p, size, None, intent) {
            // Compose current paint (src) over the accumulated shader (dst)
            shader = shaders::blend(p.blend_mode(), shader, s);
        }
    }
    let mut paint = skia_safe::Paint::default();
    paint.set_anti_alias(aa);
    paint.set_shader(shader);
    // Apply the base paint's blend mode at the paint level so the first
    // fill can blend with the canvas/background, matching editor semantics.
    paint.set_blend_mode(base_blend_mode.into());
    Some(paint)
}

pub fn shader_from_paint(
    paint: &Paint,
    size: (f32, f32),
    images: Option<&ImageRepository>,
    intent: RenderIntent,
) -> Option<Shader> {
    match paint {
        Paint::Solid(solid) => {
            let CGColor { r, g, b, a } = solid.color;
            // Color alpha is the solid paint's opacity; see `sk_solid_paint`.
            Some(shaders::color(Color::from_argb(a, r, g, b)))
        }
        Paint::LinearGradient(g) => gradient::linear_gradient_shader(g, size),
        Paint::RadialGradient(g) => gradient::radial_gradient_shader(g, size),
        Paint::SweepGradient(g) => gradient::sweep_gradient_shader(g, size),
        Paint::DiamondGradient(g) => gradient::diamond_gradient_shader(g, size),
        Paint::Image(img) => {
            let repo = images?;
            let key = match &img.image {
                ResourceRef::RID(r) | ResourceRef::HASH(r) => r,
            };
            // Skia's built-in mipmaps handle LOD selection at rasterization
            // time based on the final canvas transform. No zoom needed here.
            let skia_image = repo.get(key)?;
            image::image_shader(img, skia_image, size, intent)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cg::types::BlendMode;

    fn solid(r: u8, g: u8, b: u8, a: u8) -> SolidPaint {
        SolidPaint {
            active: true,
            color: CGColor { r, g, b, a },
            blend_mode: BlendMode::Normal,
        }
    }

    // Regression: a solid paint's color alpha must be used verbatim. Previously
    // `final_alpha = a * solid.opacity()` squared the alpha because
    // `SolidPaint::opacity()` derives opacity from the color alpha (`a / 255`),
    // so a 50%-opaque fill rendered at ~25%.
    #[test]
    fn solid_paint_alpha_is_not_squared() {
        for a in [0u8, 26, 64, 128, 191, 255] {
            let p = sk_solid_paint(solid(255, 255, 255, a), true);
            assert_eq!(p.color().a(), a, "sk_solid_paint dropped/squared alpha");

            let stacked = sk_paint_stack_without_images(
                &[Paint::Solid(solid(255, 255, 255, a))],
                (100.0, 100.0),
                true,
            )
            .expect("single solid fill produces a paint");
            assert_eq!(
                stacked.color().a(),
                a,
                "sk_paint_stack_without_images squared single-solid alpha"
            );
        }
    }

    /// Draw `paint` over an opaque black background and return the center
    /// pixel's gray level. Black + white means all three RGB channels are
    /// equal, so the result is independent of the surface's byte order.
    fn render_center_gray(paint: &skia_safe::Paint) -> u8 {
        use skia_safe::{surfaces, Color, Rect};
        let (w, h) = (40, 40);
        let mut surface = surfaces::raster_n32_premul((w, h)).expect("surface");
        surface.canvas().clear(Color::BLACK);
        surface
            .canvas()
            .draw_rect(Rect::from_xywh(0.0, 0.0, w as f32, h as f32), paint);
        let img = surface.image_snapshot();
        let info = img.image_info();
        let row_bytes = info.min_row_bytes();
        let mut raw = vec![0u8; row_bytes * h as usize];
        img.read_pixels(
            &info,
            &mut raw,
            row_bytes,
            skia_safe::IPoint::new(0, 0),
            skia_safe::image::CachingHint::Allow,
        );
        let off = ((h / 2) as usize * row_bytes) + (w / 2) as usize * 4;
        // R == G == B for gray; read the first channel.
        raw[off]
    }

    // End-to-end: 50% white over opaque black must src-over blend to ~50% gray
    // (≈128), not the squared ~64 (white·0.25) the doubled-alpha bug produced.
    #[test]
    fn solid_half_alpha_blends_at_half() {
        let gray = render_center_gray(&sk_solid_paint(solid(255, 255, 255, 128), false));
        assert!(
            (120..=136).contains(&gray),
            "expected ~50% gray (≈128), got {gray} (squared-alpha bug would be ~64)"
        );
    }
}

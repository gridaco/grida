use super::{gradient, image};
use crate::{cg::prelude::*, runtime::image_repository::ImageRepository};
use skia_safe::{self, shaders, Color, Shader};

pub fn sk_solid_paint(paint: impl Into<SolidPaint>) -> skia_safe::Paint {
    let p: SolidPaint = paint.into();
    let mut skia_paint = skia_safe::Paint::default();
    skia_paint.set_anti_alias(true);
    let CGColor(r, g, b, a) = p.color;
    let final_alpha = (a as f32 * p.opacity()) as u8;
    skia_paint.set_color(skia_safe::Color::from_argb(final_alpha, r, g, b));
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
) -> Option<skia_safe::Paint> {
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
    let mut shader = shader_from_paint(first, size, Some(images))?;
    for p in iter {
        if let Some(s) = shader_from_paint(p, size, Some(images)) {
            // Compose current paint (src) over the accumulated shader (dst)
            shader = shaders::blend(p.blend_mode(), shader, s);
        }
    }
    let mut paint = skia_safe::Paint::default();
    paint.set_anti_alias(true);
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
) -> Option<skia_safe::Paint> {
    // Same ordering rules as `sk_paint_stack` (bottom → top).
    let mut iter = paints.iter();
    let first = iter.next()?;
    let base_blend_mode = first.blend_mode();
    let mut shader = shader_from_paint(first, size, None)?;
    for p in iter {
        if let Some(s) = shader_from_paint(p, size, None) {
            // Compose current paint (src) over the accumulated shader (dst)
            shader = shaders::blend(p.blend_mode(), shader, s);
        }
    }
    let mut paint = skia_safe::Paint::default();
    paint.set_anti_alias(true);
    paint.set_shader(shader);
    // Apply the base paint's blend mode at the paint level so the first
    // fill can blend with the canvas/background, matching editor semantics.
    paint.set_blend_mode(base_blend_mode.into());

    // Don't set blend mode - defaults to SrcOver, and blending is already handled in shader composition
    Some(paint)
}

pub fn shader_from_paint(
    paint: &Paint,
    size: (f32, f32),
    images: Option<&ImageRepository>,
) -> Option<Shader> {
    match paint {
        Paint::Solid(solid) => {
            let CGColor(r, g, b, a) = solid.color;
            let final_alpha = (a as f32 * solid.opacity()).round() as u8;
            Some(shaders::color(Color::from_argb(final_alpha, r, g, b)))
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
            let skia_image = repo.get_by_size(key, size.0, size.1)?;
            image::image_shader(img, skia_image, size)
        }
    }
}

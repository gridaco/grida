use super::{gradient, image_filters};
use crate::{cg::types::*, runtime::image_repository::ImageRepository, sk};
use math2::box_fit::BoxFit;
use skia_safe::{self, shaders, Color, SamplingOptions, Shader, TileMode};

pub fn sk_solid_paint(paint: impl Into<SolidPaint>) -> skia_safe::Paint {
    let p: SolidPaint = paint.into();
    let mut skia_paint = skia_safe::Paint::default();
    skia_paint.set_anti_alias(true);
    let CGColor(r, g, b, a) = p.color;
    let final_alpha = (a as f32 * p.opacity()) as u8;
    skia_paint.set_color(skia_safe::Color::from_argb(final_alpha, r, g, b));
    skia_paint
}

pub fn sk_paint(paint: &Paint, size: (f32, f32)) -> skia_safe::Paint {
    let mut skia_paint = skia_safe::Paint::default();
    skia_paint.set_anti_alias(true);
    if let Some(shader) = shader_from_paint(paint, size, None) {
        skia_paint.set_shader(shader);
    }

    // Apply paint-level opacity for image paints using Skia's built-in alpha property
    if let Paint::Image(img) = paint {
        skia_paint.set_alpha_f(img.opacity);
    }

    skia_paint.set_blend_mode(paint.blend_mode().into());
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
    let mut iter = paints.iter();
    let first = iter.next()?;
    let mut shader = shader_from_paint(first, size, Some(images))?;
    for p in iter {
        if let Some(s) = shader_from_paint(p, size, Some(images)) {
            shader = shaders::blend(p.blend_mode(), s, shader);
        }
    }
    let mut paint = skia_safe::Paint::default();
    paint.set_anti_alias(true);
    paint.set_shader(shader);
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
    let mut iter = paints.iter();
    let first = iter.next()?;
    let mut shader = shader_from_paint(first, size, None)?;
    for p in iter {
        if let Some(s) = shader_from_paint(p, size, None) {
            shader = shaders::blend(p.blend_mode(), s, shader);
        }
    }
    let mut paint = skia_safe::Paint::default();
    paint.set_anti_alias(true);
    paint.set_shader(shader);
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
            let image = repo.get_by_size(key, size.0, size.1)?;
            image_shader(img, image, size)
        }
    }
}

pub fn image_shader(
    img: &ImagePaint,
    image: &skia_safe::Image,
    size: (f32, f32),
) -> Option<Shader> {
    let matrix = sk::sk_matrix(image_paint_matrix(
        img,
        (image.width() as f32, image.height() as f32),
        size,
    ));
    let sampling = SamplingOptions::default();
    let mut shader = image.to_shader(
        // Use `Decal` tile mode so Skia doesn't extend edge pixels
        // when the image is scaled beyond its natural bounds. This
        // prevents the visual artifacts where the last row/column is
        // repeated to fill the remaining area.
        Some((TileMode::Decal, TileMode::Decal)),
        sampling,
        Some(&matrix),
    )?;

    // Apply image filters if any are specified
    if img.filters.has_filters() {
        if let Some(color_filter) = image_filters::create_image_filters_color_filter(&img.filters) {
            shader = shader.with_color_filter(&color_filter);
        }
    }

    // Apply paint-level opacity at the shader level for stacking
    if img.opacity < 1.0 {
        let opacity_color = Color::from_argb((img.opacity * 255.0) as u8, 255, 255, 255);
        let opacity_shader = shaders::color(opacity_color);
        let final_shader = shaders::blend(skia_safe::BlendMode::DstIn, shader, opacity_shader);
        Some(final_shader)
    } else {
        Some(shader)
    }
}

pub fn image_paint_matrix(
    paint: &ImagePaint,
    image_size: (f32, f32),
    container_size: (f32, f32),
) -> [[f32; 3]; 2] {
    match paint.fit {
        BoxFit::None => {
            BoxFit::None
                .calculate_transform(image_size, container_size)
                .compose(&paint.transform)
                .matrix
        }
        _ => {
            paint
                .fit
                .calculate_transform(image_size, container_size)
                .matrix
        }
    }
}

// pub fn sk_paint_with_stroke(
//     paint: &Paint,
//     opacity: f32,
//     size: (f32, f32),
//     stroke_width: f32,
//     _stroke_align: StrokeAlign,
//     stroke_dash_array: Option<&Vec<f32>>,
// ) -> skia_safe::Paint {
//     let mut paint = sk_paint(paint, opacity, size);
//     paint.set_stroke(true);
//     paint.set_stroke_width(stroke_width);

//     // Apply dash pattern if present
//     if let Some(dash_array) = stroke_dash_array {
//         if let Some(path_effect) = skia_safe::dash_path_effect::new(dash_array, 0.0) {
//             paint.set_path_effect(path_effect);
//         }
//     }

//     paint
// }

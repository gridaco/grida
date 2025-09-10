use super::gradient;
use crate::{cg::types::*, runtime::repository::ImageRepository, sk};
use math2::box_fit::BoxFit;
use skia_safe::{self, shaders, BlendMode, Color, SamplingOptions, Shader, TileMode};

pub fn sk_solid_paint(paint: impl Into<SolidPaint>) -> skia_safe::Paint {
    let p: SolidPaint = paint.into();
    let mut skia_paint = skia_safe::Paint::default();
    skia_paint.set_anti_alias(true);
    let CGColor(r, g, b, a) = p.color;
    let final_alpha = (a as f32 * p.opacity) as u8;
    skia_paint.set_color(skia_safe::Color::from_argb(final_alpha, r, g, b));
    skia_paint
}

pub fn sk_paint(paint: &Paint, opacity: f32, size: (f32, f32)) -> skia_safe::Paint {
    let mut skia_paint = skia_safe::Paint::default();
    skia_paint.set_anti_alias(true);
    if let Some(shader) = shader_from_paint(paint, opacity, size, None) {
        skia_paint.set_shader(shader);
    }
    skia_paint.set_blend_mode(paint.blend_mode().into());
    skia_paint
}

pub fn sk_paint_stack(
    paints: &[Paint],
    opacity: f32,
    size: (f32, f32),
    images: &ImageRepository,
) -> Option<skia_safe::Paint> {
    let mut iter = paints.iter();
    let first = iter.next()?;
    let mut shader = shader_from_paint(first, opacity, size, Some(images))?;
    for p in iter {
        if let Some(s) = shader_from_paint(p, opacity, size, Some(images)) {
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
    opacity: f32,
    size: (f32, f32),
    images: Option<&ImageRepository>,
) -> Option<Shader> {
    match paint {
        Paint::Solid(solid) => {
            let CGColor(r, g, b, a) = solid.color;
            let final_alpha = (a as f32 * opacity * solid.opacity).round() as u8;
            Some(shaders::color(Color::from_argb(final_alpha, r, g, b)))
        }
        Paint::LinearGradient(g) => gradient::linear_gradient_paint(g, opacity, size).shader(),
        Paint::RadialGradient(g) => gradient::radial_gradient_paint(g, opacity, size).shader(),
        Paint::SweepGradient(g) => gradient::sweep_gradient_paint(g, opacity, size).shader(),
        Paint::DiamondGradient(g) => gradient::diamond_gradient_paint(g, opacity, size).shader(),
        Paint::Image(img) => {
            let repo = images?;
            let image = repo.get_by_size(&img.hash, size.0, size.1)?;
            let matrix = sk::sk_matrix(image_paint_matrix(
                img,
                (image.width() as f32, image.height() as f32),
                size,
            ));
            let sampling = SamplingOptions::default();
            let shader = image.to_shader(
                Some((TileMode::Clamp, TileMode::Clamp)),
                sampling,
                Some(&matrix),
            )?;
            if img.opacity < 1.0 {
                let opacity_color = Color::from_argb((img.opacity * 255.0) as u8, 255, 255, 255);
                Some(shaders::blend(
                    BlendMode::DstIn,
                    shader,
                    shaders::color(opacity_color),
                ))
            } else {
                Some(shader)
            }
        }
    }
}

pub fn image_paint_matrix(
    paint: &ImagePaint,
    image_size: (f32, f32),
    container_size: (f32, f32),
) -> [[f32; 3]; 2] {
    match paint.fit {
        BoxFit::None => paint.transform.matrix,
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

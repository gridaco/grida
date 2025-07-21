use super::gradient;
use crate::cg::types::*;
use skia_safe;

pub fn sk_paint(paint: &Paint, opacity: f32, size: (f32, f32)) -> skia_safe::Paint {
    let mut skia_paint = skia_safe::Paint::default();
    skia_paint.set_anti_alias(true);
    match paint {
        Paint::Solid(solid) => {
            let CGColor(r, g, b, a) = solid.color;
            let final_alpha = (a as f32 * opacity * solid.opacity) as u8;
            skia_paint.set_color(skia_safe::Color::from_argb(final_alpha, r, g, b));
        }
        Paint::LinearGradient(gradient) => {
            return gradient::gradient_paint(
                &GradientPaint::Linear(gradient.clone()),
                opacity,
                size,
            );
        }
        Paint::RadialGradient(gradient) => {
            return gradient::gradient_paint(
                &GradientPaint::Radial(gradient.clone()),
                opacity,
                size,
            );
        }
        Paint::SweepGradient(gradient) => {
            return gradient::gradient_paint(
                &GradientPaint::Sweep(gradient.clone()),
                opacity,
                size,
            );
        }
        Paint::Image(image_paint) => {
            // For image paints, we just set the opacity since the actual drawing
            // is handled by draw_image_rect in the draw_fill_and_stroke method
            let final_alpha = (opacity * image_paint.opacity * 255.0) as u8;
            skia_paint.set_alpha(final_alpha);
        }
    }
    skia_paint
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

use crate::cg::types::*;
use skia_safe;

fn cg_build_gradient_stops(
    stops: &[GradientStop],
    opacity: f32,
) -> (Vec<skia_safe::Color>, Vec<f32>) {
    let mut colors = Vec::with_capacity(stops.len());
    let mut positions = Vec::with_capacity(stops.len());

    for stop in stops {
        let CGColor(r, g, b, a) = stop.color;
        let alpha = (a as f32 * opacity).round().clamp(0.0, 255.0) as u8;
        colors.push(skia_safe::Color::from_argb(alpha, r, g, b));
        positions.push(stop.offset);
    }

    (colors, positions)
}

pub fn sk_matrix(m: [[f32; 3]; 2]) -> skia_safe::Matrix {
    let [[a, c, tx], [b, d, ty]] = m;
    skia_safe::Matrix::from_affine(&[a, b, c, d, tx, ty])
}

pub fn sk_paint(paint: &Paint, opacity: f32, size: (f32, f32)) -> skia_safe::Paint {
    let mut skia_paint = skia_safe::Paint::default();
    skia_paint.set_anti_alias(true);
    let (width, height) = size;
    match paint {
        Paint::Solid(solid) => {
            let CGColor(r, g, b, a) = solid.color;
            let final_alpha = (a as f32 * opacity * solid.opacity) as u8;
            skia_paint.set_color(skia_safe::Color::from_argb(final_alpha, r, g, b));
        }
        Paint::LinearGradient(gradient) => {
            let (colors, positions) =
                cg_build_gradient_stops(&gradient.stops, opacity * gradient.opacity);
            if let Some(shader) = skia_safe::Shader::linear_gradient(
                (
                    skia_safe::Point::new(0.0, 0.0),
                    skia_safe::Point::new(width, 0.0),
                ),
                &colors[..],
                Some(&positions[..]),
                skia_safe::TileMode::Clamp,
                None,
                Some(&sk_matrix(gradient.transform.matrix)),
            ) {
                skia_paint.set_shader(shader);
            }
        }
        Paint::RadialGradient(gradient) => {
            let (colors, positions) =
                cg_build_gradient_stops(&gradient.stops, opacity * gradient.opacity);
            let center = skia_safe::Point::new(width / 2.0, height / 2.0);
            let radius = width.min(height) / 2.0;
            if let Some(shader) = skia_safe::Shader::radial_gradient(
                center,
                radius,
                &colors[..],
                Some(&positions[..]),
                skia_safe::TileMode::Clamp,
                None,
                Some(&sk_matrix(gradient.transform.matrix)),
            ) {
                skia_paint.set_shader(shader);
            }
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

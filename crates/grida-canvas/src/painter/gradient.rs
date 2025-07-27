use crate::{cg::types::*, sk::sk_matrix};

fn build_gradient_stops(stops: &[GradientStop], opacity: f32) -> (Vec<skia_safe::Color>, Vec<f32>) {
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

pub fn gradient_paint(paint: &GradientPaint, opacity: f32, size: (f32, f32)) -> skia_safe::Paint {
    match paint {
        GradientPaint::Linear(gradient) => linear_gradient_paint(gradient, opacity, size),
        GradientPaint::Radial(gradient) => radial_gradient_paint(gradient, opacity, size),
        GradientPaint::Sweep(gradient) => sweep_gradient_paint(gradient, opacity, size),
    }
}

pub fn linear_gradient_paint(
    gradient: &LinearGradientPaint,
    opacity: f32,
    (x, y): (f32, f32),
) -> skia_safe::Paint {
    let mut paint = skia_safe::Paint::default();
    let (colors, positions) = build_gradient_stops(&gradient.stops, opacity * gradient.opacity);

    let mut matrix = skia_safe::Matrix::scale((x, y));
    matrix.pre_concat(&sk_matrix(gradient.transform.matrix));

    if let Some(shader) = skia_safe::Shader::linear_gradient(
        ((0.0, 0.5), (1.0, 0.5)),
        &colors[..],
        Some(&positions[..]),
        skia_safe::TileMode::Clamp,
        None,
        Some(&matrix),
    ) {
        paint.set_shader(shader);
    }

    paint.set_anti_alias(true);
    paint
}

pub fn radial_gradient_paint(
    gradient: &RadialGradientPaint,
    opacity: f32,
    (x, y): (f32, f32),
) -> skia_safe::Paint {
    let mut paint = skia_safe::Paint::default();
    let (colors, positions) = build_gradient_stops(&gradient.stops, opacity * gradient.opacity);

    let mut matrix = skia_safe::Matrix::scale((x, y));
    matrix.pre_concat(&sk_matrix(gradient.transform.matrix));

    if let Some(shader) = skia_safe::Shader::radial_gradient(
        (0.5, 0.5),
        0.5,
        &colors[..],
        Some(&positions[..]),
        skia_safe::TileMode::Clamp,
        None,
        Some(&matrix),
    ) {
        paint.set_shader(shader);
    }

    paint.set_anti_alias(true);
    paint
}

pub fn sweep_gradient_paint(
    gradient: &SweepGradientPaint,
    opacity: f32,
    (x, y): (f32, f32),
) -> skia_safe::Paint {
    let mut paint = skia_safe::Paint::default();

    let (colors, positions) = build_gradient_stops(&gradient.stops, opacity * gradient.opacity);

    let mut matrix = skia_safe::Matrix::scale((x, y));
    matrix.pre_concat(&sk_matrix(gradient.transform.matrix));

    if let Some(shader) = skia_safe::Shader::sweep_gradient(
        (0.5, 0.5),
        skia_safe::gradient_shader::GradientShaderColors::Colors(&colors),
        Some(&positions[..]),
        skia_safe::TileMode::Clamp,
        Some((0.0, 360.0)),
        None,
        Some(&matrix),
    ) {
        paint.set_shader(shader);
    }

    paint.set_anti_alias(true);
    paint
}

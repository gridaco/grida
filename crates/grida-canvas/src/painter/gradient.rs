use crate::{cg::prelude::*, sk::sk_matrix};

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

pub fn gradient_paint(paint: &GradientPaint, size: (f32, f32)) -> skia_safe::Paint {
    match paint {
        GradientPaint::Linear(gradient) => linear_gradient_paint(gradient, size),
        GradientPaint::Radial(gradient) => radial_gradient_paint(gradient, size),
        GradientPaint::Sweep(gradient) => sweep_gradient_paint(gradient, size),
        GradientPaint::Diamond(gradient) => diamond_gradient_paint(gradient, size),
    }
}

pub fn linear_gradient_paint(
    gradient: &LinearGradientPaint,
    (x, y): (f32, f32),
) -> skia_safe::Paint {
    let mut paint = skia_safe::Paint::default();
    let (colors, positions) = build_gradient_stops(&gradient.stops, 1.0);

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

    // Apply paint-level opacity using Skia's built-in alpha property
    paint.set_alpha_f(gradient.opacity);
    paint.set_anti_alias(true);
    paint
}

pub fn linear_gradient_shader(
    gradient: &LinearGradientPaint,
    (x, y): (f32, f32),
) -> Option<skia_safe::Shader> {
    let (colors, positions) = build_gradient_stops(&gradient.stops, 1.0);

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
        // Apply paint-level opacity at the shader level for stacking
        if gradient.opacity < 1.0 {
            let opacity_color =
                skia_safe::Color::from_argb((gradient.opacity * 255.0) as u8, 255, 255, 255);
            let opacity_shader = skia_safe::shaders::color(opacity_color);
            let final_shader =
                skia_safe::shaders::blend(skia_safe::BlendMode::DstIn, shader, opacity_shader);
            Some(final_shader)
        } else {
            Some(shader)
        }
    } else {
        None
    }
}

pub fn radial_gradient_paint(
    gradient: &RadialGradientPaint,
    (x, y): (f32, f32),
) -> skia_safe::Paint {
    let mut paint = skia_safe::Paint::default();
    let (colors, positions) = build_gradient_stops(&gradient.stops, 1.0);

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

    // Apply paint-level opacity using Skia's built-in alpha property
    paint.set_alpha_f(gradient.opacity);
    paint.set_anti_alias(true);
    paint
}

pub fn radial_gradient_shader(
    gradient: &RadialGradientPaint,
    (x, y): (f32, f32),
) -> Option<skia_safe::Shader> {
    let (colors, positions) = build_gradient_stops(&gradient.stops, 1.0);

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
        // Apply paint-level opacity at the shader level for stacking
        if gradient.opacity < 1.0 {
            let opacity_color =
                skia_safe::Color::from_argb((gradient.opacity * 255.0) as u8, 255, 255, 255);
            let opacity_shader = skia_safe::shaders::color(opacity_color);
            let final_shader =
                skia_safe::shaders::blend(skia_safe::BlendMode::DstIn, shader, opacity_shader);
            Some(final_shader)
        } else {
            Some(shader)
        }
    } else {
        None
    }
}

pub fn sweep_gradient_paint(gradient: &SweepGradientPaint, (x, y): (f32, f32)) -> skia_safe::Paint {
    let mut paint = skia_safe::Paint::default();

    let (colors, positions) = build_gradient_stops(&gradient.stops, 1.0);

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

    // Apply paint-level opacity using Skia's built-in alpha property
    paint.set_alpha_f(gradient.opacity);
    paint.set_anti_alias(true);
    paint
}

pub fn sweep_gradient_shader(
    gradient: &SweepGradientPaint,
    (x, y): (f32, f32),
) -> Option<skia_safe::Shader> {
    let (colors, positions) = build_gradient_stops(&gradient.stops, 1.0);

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
        // Apply paint-level opacity at the shader level for stacking
        if gradient.opacity < 1.0 {
            let opacity_color =
                skia_safe::Color::from_argb((gradient.opacity * 255.0) as u8, 255, 255, 255);
            let opacity_shader = skia_safe::shaders::color(opacity_color);
            let final_shader =
                skia_safe::shaders::blend(skia_safe::BlendMode::DstIn, shader, opacity_shader);
            Some(final_shader)
        } else {
            Some(shader)
        }
    } else {
        None
    }
}

pub fn diamond_gradient_paint(
    gradient: &DiamondGradientPaint,
    (x, y): (f32, f32),
) -> skia_safe::Paint {
    let mut paint = skia_safe::Paint::default();

    let (colors, positions) = build_gradient_stops(&gradient.stops, 1.0);

    let base = skia_safe::Shader::linear_gradient(
        ((0.0, 0.0), (1.0, 0.0)),
        &colors[..],
        Some(&positions[..]),
        skia_safe::TileMode::Clamp,
        None,
        None,
    );

    if let Some(base_shader) = base {
        const SKSL: &str = r#"
            uniform shader gradient;
            half4 main(float2 coord) {
                float2 p = coord - float2(0.5, 0.5);
                float t = (abs(p.x) + abs(p.y)) * 2.0;
                t = clamp(t, 0.0, 1.0);
                return gradient.eval(float2(t, 0.0));
            }
        "#;

        if let Ok(effect) = skia_safe::RuntimeEffect::make_for_shader(SKSL, None) {
            let mut matrix = skia_safe::Matrix::scale((x, y));
            matrix.pre_concat(&sk_matrix(gradient.transform.matrix));

            if let Some(shader) = effect.make_shader(
                skia_safe::Data::new_copy(&[]),
                &[base_shader.into()],
                Some(&matrix),
            ) {
                paint.set_shader(shader);
            }
        }
    }

    // Apply paint-level opacity using Skia's built-in alpha property
    paint.set_alpha_f(gradient.opacity);
    paint.set_anti_alias(true);
    paint
}

pub fn diamond_gradient_shader(
    gradient: &DiamondGradientPaint,
    (x, y): (f32, f32),
) -> Option<skia_safe::Shader> {
    let (colors, positions) = build_gradient_stops(&gradient.stops, 1.0);

    let base = skia_safe::Shader::linear_gradient(
        ((0.0, 0.0), (1.0, 0.0)),
        &colors[..],
        Some(&positions[..]),
        skia_safe::TileMode::Clamp,
        None,
        None,
    );

    if let Some(base_shader) = base {
        const SKSL: &str = r#"
            uniform shader gradient;
            half4 main(float2 coord) {
                float2 p = coord - float2(0.5, 0.5);
                float t = (abs(p.x) + abs(p.y)) * 2.0;
                t = clamp(t, 0.0, 1.0);
                return gradient.eval(float2(t, 0.0));
            }
        "#;

        if let Ok(effect) = skia_safe::RuntimeEffect::make_for_shader(SKSL, None) {
            let mut matrix = skia_safe::Matrix::scale((x, y));
            matrix.pre_concat(&sk_matrix(gradient.transform.matrix));

            if let Some(shader) = effect.make_shader(
                skia_safe::Data::new_copy(&[]),
                &[base_shader.into()],
                Some(&matrix),
            ) {
                // Apply paint-level opacity at the shader level for stacking
                if gradient.opacity < 1.0 {
                    let opacity_color = skia_safe::Color::from_argb(
                        (gradient.opacity * 255.0) as u8,
                        255,
                        255,
                        255,
                    );
                    let opacity_shader = skia_safe::shaders::color(opacity_color);
                    let final_shader = skia_safe::shaders::blend(
                        skia_safe::BlendMode::DstIn,
                        shader,
                        opacity_shader,
                    );
                    Some(final_shader)
                } else {
                    Some(shader)
                }
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    }
}

use crate::{cg::prelude::*, sk::sk_matrix};
use skia_safe::gradient_shader::{Gradient, GradientColors, Interpolation};

fn build_gradient_stops(
    stops: &[GradientStop],
    opacity: f32,
) -> (Vec<skia_safe::Color4f>, Vec<f32>) {
    let mut colors = Vec::with_capacity(stops.len());
    let mut positions = Vec::with_capacity(stops.len());

    for stop in stops {
        let CGColor { r, g, b, a } = stop.color;
        let alpha = (a as f32 * opacity).round().clamp(0.0, 255.0) as u8;
        colors.push(skia_safe::Color4f::from(skia_safe::Color::from_argb(
            alpha, r, g, b,
        )));
        positions.push(stop.offset);
    }

    (colors, positions)
}

fn make_gradient<'a>(
    colors: &'a [skia_safe::Color4f],
    positions: &'a [f32],
    tile_mode: skia_safe::TileMode,
) -> Gradient<'a> {
    Gradient::new(
        GradientColors::new(colors, Some(positions), tile_mode, None),
        Interpolation::default(),
    )
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

    let uv1 = gradient.xy1.to_uv();
    let uv2 = gradient.xy2.to_uv();
    let p1 = skia_safe::Point::new(uv1.u(), uv1.v());
    let p2 = skia_safe::Point::new(uv2.u(), uv2.v());

    let grad = make_gradient(&colors, &positions, gradient.tile_mode.into());
    if let Some(shader) = skia_safe::shaders::linear_gradient((p1, p2), &grad, Some(&matrix)) {
        paint.set_shader(shader);
    }

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

    let start_uv = gradient.xy1.to_uv();
    let end_uv = gradient.xy2.to_uv();
    let start_point = skia_safe::Point::new(start_uv.u(), start_uv.v());
    let end_point = skia_safe::Point::new(end_uv.u(), end_uv.v());

    let grad = make_gradient(&colors, &positions, gradient.tile_mode.into());
    let shader =
        skia_safe::shaders::linear_gradient((start_point, end_point), &grad, Some(&matrix))?;

    if gradient.opacity < 1.0 {
        let opacity_color =
            skia_safe::Color::from_argb((gradient.opacity * 255.0) as u8, 255, 255, 255);
        let opacity_shader = skia_safe::shaders::color(opacity_color);
        Some(skia_safe::shaders::blend(
            skia_safe::BlendMode::DstIn,
            shader,
            opacity_shader,
        ))
    } else {
        Some(shader)
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

    let grad = make_gradient(&colors, &positions, gradient.tile_mode.into());
    if let Some(shader) =
        skia_safe::shaders::radial_gradient(((0.5_f32, 0.5_f32), 0.5_f32), &grad, Some(&matrix))
    {
        paint.set_shader(shader);
    }

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

    let grad = make_gradient(&colors, &positions, gradient.tile_mode.into());
    let shader =
        skia_safe::shaders::radial_gradient(((0.5_f32, 0.5_f32), 0.5_f32), &grad, Some(&matrix))?;

    if gradient.opacity < 1.0 {
        let opacity_color =
            skia_safe::Color::from_argb((gradient.opacity * 255.0) as u8, 255, 255, 255);
        let opacity_shader = skia_safe::shaders::color(opacity_color);
        Some(skia_safe::shaders::blend(
            skia_safe::BlendMode::DstIn,
            shader,
            opacity_shader,
        ))
    } else {
        Some(shader)
    }
}

pub fn sweep_gradient_paint(gradient: &SweepGradientPaint, (x, y): (f32, f32)) -> skia_safe::Paint {
    let mut paint = skia_safe::Paint::default();
    let (colors, positions) = build_gradient_stops(&gradient.stops, 1.0);

    let mut matrix = skia_safe::Matrix::scale((x, y));
    matrix.pre_concat(&sk_matrix(gradient.transform.matrix));

    let grad = make_gradient(&colors, &positions, skia_safe::TileMode::Clamp);
    if let Some(shader) = skia_safe::shaders::sweep_gradient(
        (0.5_f32, 0.5_f32),
        (0.0_f32, 360.0_f32),
        &grad,
        Some(&matrix),
    ) {
        paint.set_shader(shader);
    }

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

    let grad = make_gradient(&colors, &positions, skia_safe::TileMode::Clamp);
    let shader = skia_safe::shaders::sweep_gradient(
        (0.5_f32, 0.5_f32),
        (0.0_f32, 360.0_f32),
        &grad,
        Some(&matrix),
    )?;

    if gradient.opacity < 1.0 {
        let opacity_color =
            skia_safe::Color::from_argb((gradient.opacity * 255.0) as u8, 255, 255, 255);
        let opacity_shader = skia_safe::shaders::color(opacity_color);
        Some(skia_safe::shaders::blend(
            skia_safe::BlendMode::DstIn,
            shader,
            opacity_shader,
        ))
    } else {
        Some(shader)
    }
}

pub fn diamond_gradient_paint(
    gradient: &DiamondGradientPaint,
    (x, y): (f32, f32),
) -> skia_safe::Paint {
    let mut paint = skia_safe::Paint::default();

    let (colors, positions) = build_gradient_stops(&gradient.stops, 1.0);

    let grad = make_gradient(&colors, &positions, skia_safe::TileMode::Clamp);
    let base =
        skia_safe::shaders::linear_gradient(((0.0_f32, 0.0_f32), (1.0_f32, 0.0_f32)), &grad, None);

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

    paint.set_alpha_f(gradient.opacity);
    paint.set_anti_alias(true);
    paint
}

pub fn diamond_gradient_shader(
    gradient: &DiamondGradientPaint,
    (x, y): (f32, f32),
) -> Option<skia_safe::Shader> {
    let (colors, positions) = build_gradient_stops(&gradient.stops, 1.0);

    let grad = make_gradient(&colors, &positions, skia_safe::TileMode::Clamp);
    let base =
        skia_safe::shaders::linear_gradient(((0.0_f32, 0.0_f32), (1.0_f32, 0.0_f32)), &grad, None)?;

    const SKSL: &str = r#"
        uniform shader gradient;
        half4 main(float2 coord) {
            float2 p = coord - float2(0.5, 0.5);
            float t = (abs(p.x) + abs(p.y)) * 2.0;
            t = clamp(t, 0.0, 1.0);
            return gradient.eval(float2(t, 0.0));
        }
    "#;

    let effect = skia_safe::RuntimeEffect::make_for_shader(SKSL, None).ok()?;

    let mut matrix = skia_safe::Matrix::scale((x, y));
    matrix.pre_concat(&sk_matrix(gradient.transform.matrix));

    let shader = effect.make_shader(
        skia_safe::Data::new_copy(&[]),
        &[base.into()],
        Some(&matrix),
    )?;

    if gradient.opacity < 1.0 {
        let opacity_color =
            skia_safe::Color::from_argb((gradient.opacity * 255.0) as u8, 255, 255, 255);
        let opacity_shader = skia_safe::shaders::color(opacity_color);
        Some(skia_safe::shaders::blend(
            skia_safe::BlendMode::DstIn,
            shader,
            opacity_shader,
        ))
    } else {
        Some(shader)
    }
}

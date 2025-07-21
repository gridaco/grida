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
        GradientPaint::Angular(gradient) => angular_gradient_paint(gradient, opacity, size),
    }
}

pub fn linear_gradient_paint(
    gradient: &LinearGradientPaint,
    opacity: f32,
    size: (f32, f32),
) -> skia_safe::Paint {
    let mut paint = skia_safe::Paint::default();
    let (width, _height) = size;
    let (colors, positions) = build_gradient_stops(&gradient.stops, opacity * gradient.opacity);
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
        paint.set_shader(shader);
    }

    paint.set_anti_alias(true);
    paint
}

pub fn radial_gradient_paint(
    gradient: &RadialGradientPaint,
    opacity: f32,
    size: (f32, f32),
) -> skia_safe::Paint {
    let mut paint = skia_safe::Paint::default();
    let (width, height) = size;
    let (colors, positions) = build_gradient_stops(&gradient.stops, opacity * gradient.opacity);
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
        paint.set_shader(shader);
    }

    paint.set_anti_alias(true);
    paint
}

pub fn sweep_gradient_paint(
    gradient: &SweepGradientPaint,
    opacity: f32,
    size: (f32, f32),
) -> skia_safe::Paint {
    let mut paint = skia_safe::Paint::default();

    let (width, height) = size;
    let (colors, positions) = build_gradient_stops(&gradient.stops, opacity * gradient.opacity);
    let center = skia_safe::Point::new(width as f32 / 2.0, height as f32 / 2.0);
    if let Some(shader) = skia_safe::Shader::sweep_gradient(
        center,
        skia_safe::gradient_shader::GradientShaderColors::Colors(&colors),
        Some(&positions[..]),
        skia_safe::TileMode::Clamp,
        Some((0.0, 360.0)),
        None,
        None,
    ) {
        paint.set_shader(shader);
    }

    paint.set_anti_alias(true);
    paint
}

const ANGULAR_GRADIENT_SKSL: &str = r#"
uniform float2 center;
uniform float4 colors[4];
uniform float positions[4];
uniform int stop_count;
uniform float3x3 transform;

half4 main(float2 coord) {
  // Transform coordinate relative to center
  float2 relative_coord = coord - center;
  float3 transformed_coord = transform * float3(relative_coord, 1.0);
  float2 pos = transformed_coord.xy;
  float angle = atan(pos.y, pos.x);
  // Convert from [-π, π] to [0, 1] range
  float t = (angle + 3.14159265) / 6.28318530718;
  
  float4 c = colors[0];
  
  for (int i = 0; i < 3; i++) {
    if (i < stop_count - 1 && t <= positions[i + 1]) {
      float local_t = (t - positions[i]) / (positions[i + 1] - positions[i]);
      c = mix(colors[i], colors[i + 1], local_t);
      break;
    }
  }
  
  return half4(c);
}
"#;

pub fn angular_gradient_paint(
    gradient: &AngularGradientPaint,
    opacity: f32,
    size: (f32, f32),
) -> skia_safe::Paint {
    let (width, height) = size;
    let effect = skia_safe::RuntimeEffect::make_for_shader(ANGULAR_GRADIENT_SKSL, None)
        .expect("runtime effect");
    let mut builder = skia_safe::runtime_effect::RuntimeShaderBuilder::new(effect);
    // Convert gradient stops to arrays
    let mut colors = [0.0; 16]; // 4 colors * 4 components
    let mut positions = [0.0; 4];

    for (i, stop) in gradient.stops.iter().take(4).enumerate() {
        colors[i * 4] = stop.color.0 as f32 / 255.0;
        colors[i * 4 + 1] = stop.color.1 as f32 / 255.0;
        colors[i * 4 + 2] = stop.color.2 as f32 / 255.0;
        colors[i * 4 + 3] = stop.color.3 as f32 / 255.0;
        positions[i] = stop.offset;
    }

    // Convert AffineTransform to 3x3 matrix (column-major order for Skia)
    let [[a, b, tx], [d, e, ty]] = gradient.transform.matrix;
    let transform_matrix = [
        a, d, 0.0, // First column
        b, e, 0.0, // Second column
        tx, ty, 1.0, // Third column
    ];

    builder
        .set_uniform_float("center", &[width / 2.0, height / 2.0])
        .unwrap();
    builder.set_uniform_float("colors", &colors).unwrap();
    builder.set_uniform_float("positions", &positions).unwrap();
    builder
        .set_uniform_int("stop_count", &[gradient.stops.len().min(4) as i32])
        .unwrap();
    builder
        .set_uniform_float("transform", &transform_matrix)
        .unwrap();

    let shader = builder
        .make_shader(&skia_safe::Matrix::default())
        .expect("shader");

    let mut paint = skia_safe::Paint::default();
    paint.set_shader(shader);
    paint.set_anti_alias(true);
    paint.set_alpha((gradient.opacity * 255.0) as u8);

    paint
}

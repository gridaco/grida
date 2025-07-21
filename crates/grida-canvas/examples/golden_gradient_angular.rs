use cg::cg::types::*;
use math2::transform::AffineTransform;
use skia_safe::{
    runtime_effect::RuntimeShaderBuilder, surfaces, Color, Matrix, Paint, Rect, RuntimeEffect,
};

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

struct AngularGradientPaint {
    pub transform: AffineTransform,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
}

fn angular_gradient_paint(
    gradient: &AngularGradientPaint,
    width: f32,
    height: f32,
) -> skia_safe::Paint {
    let effect =
        RuntimeEffect::make_for_shader(ANGULAR_GRADIENT_SKSL, None).expect("runtime effect");
    let mut builder = RuntimeShaderBuilder::new(effect);
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

    let shader = builder.make_shader(&Matrix::default()).expect("shader");

    let mut paint = Paint::default();
    paint.set_shader(shader);
    paint.set_anti_alias(true);
    paint.set_alpha((gradient.opacity * 255.0) as u8);

    paint
}

fn main() {
    let gradient = AngularGradientPaint {
        transform: AffineTransform::new(0.0, 0.0, 45.0),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: CGColor(255, 97, 97, 255),
            },
            GradientStop {
                offset: 0.5,
                color: CGColor(133, 0, 0, 255),
            },
            GradientStop {
                offset: 1.0,
                color: CGColor(255, 0, 0, 255),
            },
        ],
        opacity: 1.0,
    };

    let (width, height) = (400, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let paint = angular_gradient_paint(&gradient, width as f32, height as f32);

    canvas.draw_rect(
        Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
        &paint,
    );

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write("goldens/gradient_angular.png", data.as_bytes()).unwrap();
}

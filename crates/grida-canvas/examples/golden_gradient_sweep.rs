use skia_safe::{gradient_shader, surfaces, Color, Paint, Point, Rect, Shader, TileMode};

fn main() {
    let (width, height) = (400, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let colors = [Color::RED, Color::GREEN, Color::BLUE, Color::RED];
    let positions = [0.0, 0.33, 0.66, 1.0];

    let center = Point::new(width as f32 / 2.0, height as f32 / 2.0);
    let shader = Shader::sweep_gradient(
        center,
        gradient_shader::GradientShaderColors::Colors(&colors),
        Some(&positions[..]),
        TileMode::Clamp,
        Some((0.0, 360.0)),
        None,
        None,
    )
    .expect("shader");

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_shader(shader);

    canvas.draw_rect(
        Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
        &paint,
    );

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::create_dir_all("goldens").unwrap();
    std::fs::write("goldens/gradient_sweep.png", data.as_bytes()).unwrap();
}

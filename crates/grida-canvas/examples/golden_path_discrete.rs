use skia_safe::{path_effect::PathEffect, surfaces, Color, Paint, PaintStyle, Path};

fn main() {
    // Create a circle path
    let mut path = Path::new();
    path.add_circle((200.0, 200.0), 100.0, None);

    // Prepare a surface and clear with white background
    let mut surface = surfaces::raster_n32_premul((400, 400)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Paint with stroke style and apply discrete path effect
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_style(PaintStyle::Stroke);
    paint.set_color(Color::BLACK);
    paint.set_stroke_width(8.0);
    if let Some(effect) = PathEffect::discrete(10.0, 4.0, None) {
        paint.set_path_effect(effect);
    }
    canvas.draw_path(&path, &paint);

    // Write to golden file
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::create_dir_all("goldens").unwrap();
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/path_discrete.png"),
        data.as_bytes(),
    )
    .unwrap();
}

use skia_safe::{path_effect::PathEffect, Color, Paint, PaintStyle, Path};

mod dev_kit;

fn main() {
    // Create a circle path
    let path = Path::circle((200.0, 200.0), 100.0, None);

    // Prepare a surface and clear with white background
    let mut surface = dev_kit::raster_surface(400, 400, Color::WHITE);
    let canvas = surface.canvas();

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
    dev_kit::save_golden(&mut surface, "path_discrete");
}

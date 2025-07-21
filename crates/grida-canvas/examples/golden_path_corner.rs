use cg::shape::*;
use skia_safe::{surfaces, Color, Paint, Path};

fn main() {
    let pathdata = "M50 50 L350 50 L350 150 L250 150 L250 250 L150 250 L150 150 L50 150 Z";

    let mut surface = surfaces::raster_n32_premul((400, 400)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Create path from SVG path data
    let path = Path::from_svg(pathdata).unwrap();

    // Create paint for the path
    let mut paint = Paint::default();
    paint.set_color(Color::BLACK);
    paint.set_anti_alias(true);

    // Apply corner path effect
    let path = build_corner_radius_path(&path, 50.0);
    canvas.draw_path(&path, &paint);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/path_corner.png", data.as_bytes()).unwrap();
}
